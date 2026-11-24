import { NextRequest, NextResponse } from 'next/server'
import { ensureSeeded, prisma } from '@/lib/prisma'
import { recurringExpenseSchema } from '@/lib/validations/finance'
import { buildTransactionFingerprint } from '@/lib/finance/deduplication'

export async function GET() {
  try {
    await ensureSeeded()
    const recurring = await prisma.recurringExpense.findMany({
      include: {
        category: true,
        bankAccount: true,
        creditCard: true,
      },
      orderBy: [{ active: 'desc' }, { dayOfMonth: 'asc' }],
    })
    return NextResponse.json({ recurring })
  } catch (error) {
    console.error('Erro ao listar recorrências:', error)
    return NextResponse.json(
      { error: 'Não foi possível listar despesas recorrentes.' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded()
    const body = await req.json()

    // Action: materializar lançamentos recorrentes no mês selecionado
    if (body.action === 'GENERATE_FOR_MONTH') {
      const month: string = body.month // YYYY-MM
      if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        return NextResponse.json({ error: 'Mês inválido' }, { status: 400 })
      }

      const activeRules = await prisma.recurringExpense.findMany({
        where: { active: true },
      })

      const [yearNum, monthNum] = month.split('-').map(Number)
      const maxDay = new Date(Date.UTC(yearNum, monthNum, 0)).getUTCDate()

      let createdCount = 0
      for (const rule of activeRules) {
        const exists = await prisma.transaction.findFirst({
          where: {
            recurringExpenseId: rule.id,
            competenceMonth: month,
          },
        })

        if (!exists) {
          const day = String(Math.min(rule.dayOfMonth, maxDay)).padStart(2, '0')
          const isoDate = `${month}-${day}`
          const fp = buildTransactionFingerprint({
            date: isoDate,
            amountCents: rule.amountCents,
            description: rule.description,
          })

          await prisma.transaction.create({
            data: {
              description: rule.description,
              amountCents: rule.amountCents,
              type: rule.type,
              date: new Date(`${isoDate}T12:00:00.000Z`),
              competenceMonth: month,
              categoryId: rule.categoryId,
              bankAccountId: rule.bankAccountId,
              creditCardId: rule.creditCardId,
              recurringExpenseId: rule.id,
              origin: 'RECURRING',
              fingerprint: fp,
            },
          })
          createdCount++
        }
      }

      return NextResponse.json({ createdCount })
    }

    const parsed = recurringExpenseSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const rule = await prisma.recurringExpense.create({
      data: {
        description: parsed.data.description,
        amountCents: parsed.data.amountCents,
        type: parsed.data.type,
        dayOfMonth: parsed.data.dayOfMonth,
        categoryId: parsed.data.categoryId || null,
        bankAccountId: parsed.data.bankAccountId || null,
        creditCardId: parsed.data.creditCardId || null,
        active: parsed.data.active,
      },
      include: {
        category: true,
        bankAccount: true,
        creditCard: true,
      },
    })

    return NextResponse.json({ recurring: rule }, { status: 201 })
  } catch (error) {
    console.error('Erro em recorrências:', error)
    return NextResponse.json(
      { error: 'Erro ao processar recorrência.' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })
    await prisma.recurringExpense.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro ao excluir recorrência:', error)
    return NextResponse.json({ error: 'Falha ao excluir recorrência.' }, { status: 500 })
  }
}
