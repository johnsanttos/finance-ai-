import { NextRequest, NextResponse } from 'next/server'
import { ensureSeeded, prisma } from '@/lib/prisma'
import { createTransactionSchema } from '@/lib/validations/finance'
import { buildTransactionFingerprint } from '@/lib/finance/deduplication'
import { generateInstallments } from '@/lib/finance/installments'

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded()
    const { searchParams } = new URL(req.url)
    const month = searchParams.get('month') // YYYY-MM
    const year = searchParams.get('year') // YYYY
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const categoryId = searchParams.get('categoryId')
    const bankAccountId = searchParams.get('bankAccountId')
    const creditCardId = searchParams.get('creditCardId')
    const type = searchParams.get('type')
    const search = searchParams.get('search')
    const uncategorizedOnly = searchParams.get('uncategorized') === 'true'

    const where: Record<string, unknown> = {}

    if (startDate && endDate) {
      where.date = {
        gte: new Date(`${startDate}T00:00:00.000Z`),
        lte: new Date(`${endDate}T23:59:59.999Z`),
      }
    } else if (month) {
      where.competenceMonth = month
    } else if (year) {
      where.competenceMonth = { startsWith: `${year}-` }
    }

    if (categoryId && categoryId !== 'ALL') {
      where.categoryId = categoryId
    }
    if (uncategorizedOnly) {
      where.categoryId = null
    }
    if (bankAccountId && bankAccountId !== 'ALL') {
      where.bankAccountId = bankAccountId
    }
    if (creditCardId && creditCardId !== 'ALL') {
      where.creditCardId = creditCardId
    }
    if (type && type !== 'ALL') {
      where.type = type
    }
    if (search && search.trim()) {
      where.description = {
        contains: search.trim(),
      }
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        category: true,
        bankAccount: true,
        creditCard: true,
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json({ transactions })
  } catch (error) {
    console.error('Erro ao listar transações:', error)
    return NextResponse.json(
      { error: 'Não foi possível carregar as transações.' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded()
    const body = await req.json()
    const parsed = createTransactionSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const data = parsed.data
    const isoDate = data.date.slice(0, 10)
    const totalInstallments = data.totalInstallments ?? 1

    if (totalInstallments > 1 && data.type === 'EXPENSE') {
      const installments = generateInstallments({
        description: data.description,
        totalAmountCents: data.amountCents,
        totalInstallments,
        startDate: isoDate,
      })

      const created = await prisma.$transaction(async (tx) => {
        const group = await tx.installmentGroup.create({
          data: {
            description: data.description,
            totalAmountCents: data.amountCents,
            totalInstallments,
            startDate: new Date(`${isoDate}T12:00:00.000Z`),
            creditCardId: data.creditCardId || null,
            categoryId: data.categoryId || null,
          },
        })

        const records = []
        for (const inst of installments) {
          const fp = buildTransactionFingerprint({
            date: inst.isoDate,
            amountCents: inst.amountCents,
            description: inst.description,
          })

          const item = await tx.transaction.create({
            data: {
              description: inst.description,
              merchant: data.merchant || null,
              amountCents: inst.amountCents,
              type: data.type,
              date: inst.date,
              competenceMonth: inst.competenceMonth,
              categoryId: data.categoryId || null,
              bankAccountId: data.bankAccountId || null,
              creditCardId: data.creditCardId || null,
              installmentGroupId: group.id,
              installmentNumber: inst.installmentNumber,
              totalInstallments: inst.totalInstallments,
              origin: 'INSTALLMENT',
              fingerprint: fp,
              notes: data.notes || null,
            },
            include: {
              category: true,
              bankAccount: true,
              creditCard: true,
            },
          })
          records.push(item)
        }
        return records
      })

      return NextResponse.json({ transaction: created[0], installmentsCreated: created.length }, { status: 201 })
    }

    const competenceMonth = isoDate.slice(0, 7)
    const fingerprint = buildTransactionFingerprint({
      date: isoDate,
      amountCents: data.amountCents,
      description: data.description,
    })

    const transaction = await prisma.transaction.create({
      data: {
        description: data.description,
        merchant: data.merchant || null,
        amountCents: data.amountCents,
        type: data.type,
        date: new Date(`${isoDate}T12:00:00.000Z`),
        competenceMonth,
        categoryId: data.categoryId || null,
        bankAccountId: data.bankAccountId || null,
        creditCardId: data.creditCardId || null,
        origin: 'MANUAL',
        fingerprint,
        notes: data.notes || null,
      },
      include: {
        category: true,
        bankAccount: true,
        creditCard: true,
      },
    })

    return NextResponse.json({ transaction }, { status: 201 })
  } catch (error) {
    console.error('Erro ao criar transação:', error)
    return NextResponse.json(
      { error: 'Erro interno ao salvar transação.' },
      { status: 500 }
    )
  }
}
