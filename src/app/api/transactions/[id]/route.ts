import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { updateTransactionSchema } from '@/lib/validations/finance'
import { buildTransactionFingerprint } from '@/lib/finance/deduplication'
import { extractMerchantPattern } from '@/lib/finance/category-rules'

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const body = await req.json()
    const parsed = updateTransactionSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const existing = await prisma.transaction.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Transação não encontrada' }, { status: 404 })
    }

    const data = parsed.data
    const isoDate = data.date
      ? data.date.slice(0, 10)
      : existing.date.toISOString().slice(0, 10)
    const competenceMonth = isoDate.slice(0, 7)
    const description = data.description ?? existing.description
    const amountCents = data.amountCents ?? existing.amountCents

    const fingerprint = buildTransactionFingerprint({
      date: isoDate,
      amountCents,
      description,
    })

    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        description,
        merchant: data.merchant !== undefined ? data.merchant : existing.merchant,
        amountCents,
        type: data.type ?? existing.type,
        date: new Date(`${isoDate}T12:00:00.000Z`),
        competenceMonth,
        categoryId: data.categoryId !== undefined ? data.categoryId || null : existing.categoryId,
        bankAccountId:
          data.bankAccountId !== undefined ? data.bankAccountId || null : existing.bankAccountId,
        creditCardId:
          data.creditCardId !== undefined ? data.creditCardId || null : existing.creditCardId,
        notes: data.notes !== undefined ? data.notes : existing.notes,
        fingerprint,
      },
      include: {
        category: true,
        bankAccount: true,
        creditCard: true,
      },
    })

    // Aprende automaticamente o padrão quando o usuário edita a categoria de uma transação
    if (updated.categoryId) {
      const pattern = extractMerchantPattern(updated.description)
      if (pattern && pattern.length >= 3) {
        await prisma.categoryRule
          .upsert({
            where: {
              pattern_transactionType: {
                pattern,
                transactionType: updated.type,
              },
            },
            update: {
              categoryId: updated.categoryId,
              rawExample: updated.description.trim(),
            },
            create: {
              pattern,
              rawExample: updated.description.trim(),
              transactionType: updated.type,
              categoryId: updated.categoryId,
            },
          })
          .catch(() => null)
      }
    }

    return NextResponse.json({ transaction: updated })
  } catch (error) {
    console.error('Erro ao atualizar transação:', error)
    return NextResponse.json(
      { error: 'Não foi possível atualizar a transação.' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    await prisma.transaction.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro ao excluir transação:', error)
    return NextResponse.json(
      { error: 'Não foi possível excluir a transação.' },
      { status: 500 }
    )
  }
}
