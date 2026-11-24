import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildTransactionFingerprint } from '@/lib/finance/deduplication'
import { computePaymentStatus } from '@/lib/finance/spreadsheet'
import { z } from 'zod'

const upsertCellSchema = z.object({
  transactionId: z.string().optional().nullable(),
  expenseName: z.string().min(1),
  description: z.string().optional().nullable(),
  amountCents: z.number().int().nonnegative(),
  plannedAmountCents: z.number().int().nonnegative().optional().nullable(),
  paidAmountCents: z.number().int().nonnegative().optional().nullable(),
  paymentStatus: z.enum(['PENDING', 'PARTIAL', 'PAID', 'OVERDUE']).optional(),
  type: z.enum(['EXPENSE', 'INCOME']).default('EXPENSE'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  dueDate: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  bankAccountId: z.string().optional().nullable(),
  creditCardId: z.string().optional().nullable(),
  spreadsheetRowId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

const paymentSchema = z.object({
  transactionIds: z.array(z.string()).min(1),
  paidAmountCents: z.number().int().nonnegative().optional(),
  markFullPaid: z.boolean().optional(),
  markUnpaid: z.boolean().optional(),
  paidAt: z.string().optional().nullable(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = upsertCellSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados da célula inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const d = parsed.data
    const isoDate = d.date.slice(0, 10)
    const competenceMonth = isoDate.slice(0, 7)
    const desc = (d.description || d.expenseName).trim()

    // Se amountCents === 0 e já existe transactionId, exclui o lançamento (limpar célula estilo Excel)
    if (d.amountCents === 0 && d.transactionId) {
      await prisma.transaction.delete({ where: { id: d.transactionId } })
      return NextResponse.json({ deleted: true, id: d.transactionId })
    }

    if (d.amountCents === 0 && !d.transactionId) {
      return NextResponse.json({ skipped: true })
    }

    const planned = d.plannedAmountCents ?? d.amountCents
    const paid =
      d.paidAmountCents !== undefined && d.paidAmountCents !== null
        ? Math.min(d.amountCents, d.paidAmountCents)
        : d.paymentStatus === 'PENDING' || d.paymentStatus === 'OVERDUE'
          ? 0
          : d.amountCents

    const status =
      d.paymentStatus ??
      computePaymentStatus(d.amountCents, paid, d.dueDate ?? isoDate)

    const fp = buildTransactionFingerprint({
      date: isoDate,
      amountCents: d.amountCents,
      description: desc,
    })

    if (d.transactionId) {
      const updated = await prisma.transaction.update({
        where: { id: d.transactionId },
        data: {
          description: desc,
          expenseName: d.expenseName.trim(),
          amountCents: d.amountCents,
          plannedAmountCents: planned,
          paidAmountCents: paid,
          paymentStatus: status,
          paidAt: paid > 0 ? new Date() : null,
          date: new Date(`${isoDate}T12:00:00.000Z`),
          dueDate: d.dueDate ? new Date(`${d.dueDate.slice(0, 10)}T12:00:00.000Z`) : null,
          competenceMonth,
          categoryId: d.categoryId && d.categoryId !== 'NONE' ? d.categoryId : null,
          bankAccountId: d.bankAccountId && d.bankAccountId !== 'NONE' ? d.bankAccountId : null,
          creditCardId: d.creditCardId && d.creditCardId !== 'NONE' ? d.creditCardId : null,
          spreadsheetRowId: d.spreadsheetRowId || null,
          notes: d.notes || null,
          fingerprint: fp,
        },
        include: { category: true, bankAccount: true, creditCard: true },
      })
      return NextResponse.json({ transaction: updated })
    }

    const created = await prisma.transaction.create({
      data: {
        description: desc,
        expenseName: d.expenseName.trim(),
        amountCents: d.amountCents,
        plannedAmountCents: planned,
        paidAmountCents: paid,
        paymentStatus: status,
        paidAt: paid > 0 ? new Date() : null,
        type: d.type,
        date: new Date(`${isoDate}T12:00:00.000Z`),
        dueDate: d.dueDate ? new Date(`${d.dueDate.slice(0, 10)}T12:00:00.000Z`) : null,
        competenceMonth,
        categoryId: d.categoryId && d.categoryId !== 'NONE' ? d.categoryId : null,
        bankAccountId: d.bankAccountId && d.bankAccountId !== 'NONE' ? d.bankAccountId : null,
        creditCardId: d.creditCardId && d.creditCardId !== 'NONE' ? d.creditCardId : null,
        spreadsheetRowId: d.spreadsheetRowId || null,
        origin: 'SPREADSHEET',
        fingerprint: fp,
        notes: d.notes || null,
      },
      include: { category: true, bankAccount: true, creditCard: true },
    })

    return NextResponse.json({ transaction: created }, { status: 201 })
  } catch (error) {
    console.error('Erro ao salvar célula da planilha:', error)
    return NextResponse.json(
      { error: 'Não foi possível salvar o lançamento na planilha.' },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = paymentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados de pagamento inválidos' }, { status: 400 })
    }

    const { transactionIds, paidAmountCents, markFullPaid, markUnpaid, paidAt } = parsed.data
    const paidDate = paidAt ? new Date(`${paidAt.slice(0, 10)}T12:00:00.000Z`) : new Date()

    const txs = await prisma.transaction.findMany({
      where: { id: { in: transactionIds } },
      orderBy: { date: 'asc' },
    })

    await prisma.$transaction(async (tx) => {
      if (markFullPaid) {
        for (const item of txs) {
          await tx.transaction.update({
            where: { id: item.id },
            data: {
              paidAmountCents: item.amountCents,
              paymentStatus: 'PAID',
              paidAt: paidDate,
            },
          })
        }
        return
      }

      if (markUnpaid) {
        for (const item of txs) {
          const status = computePaymentStatus(item.amountCents, 0, item.dueDate ?? item.date)
          await tx.transaction.update({
            where: { id: item.id },
            data: {
              paidAmountCents: 0,
              paymentStatus: status,
              paidAt: null,
            },
          })
        }
        return
      }

      // Distribui pagamento parcial proporcionalmente/sequencialmente pelos lançamentos da linha
      let remainingToAllocate = paidAmountCents ?? 0
      for (const item of txs) {
        const allocated = Math.min(item.amountCents, Math.max(0, remainingToAllocate))
        remainingToAllocate -= allocated
        const status = computePaymentStatus(item.amountCents, allocated, item.dueDate ?? item.date)
        await tx.transaction.update({
          where: { id: item.id },
          data: {
            paidAmountCents: allocated,
            paymentStatus: status,
            paidAt: allocated > 0 ? paidDate : null,
          },
        })
      }
    })

    return NextResponse.json({ updatedCount: txs.length })
  } catch (error) {
    console.error('Erro ao atualizar pagamento:', error)
    return NextResponse.json(
      { error: 'Não foi possível registrar o pagamento.' },
      { status: 500 }
    )
  }
}
