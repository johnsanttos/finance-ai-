import { NextRequest, NextResponse } from 'next/server'
import { ensureSeeded, prisma } from '@/lib/prisma'
import {
  buildMonthlySpreadsheet,
  CustomSpreadsheetRowInput,
  SpreadsheetTransactionInput,
} from '@/lib/finance/spreadsheet'

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded()
    const { searchParams } = new URL(req.url)
    const now = new Date()
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const month = searchParams.get('month') || defaultMonth
    const categoryId = searchParams.get('categoryId')
    const bankAccountId = searchParams.get('bankAccountId')

    const txWhere: Record<string, unknown> = { competenceMonth: month }
    if (categoryId && categoryId !== 'ALL') {
      txWhere.categoryId = categoryId
    }
    if (bankAccountId && bankAccountId !== 'ALL') {
      txWhere.bankAccountId = bankAccountId
    }

    const [transactionsRaw, customRowsRaw, categories, bankAccounts, creditCards, reserves] =
      await Promise.all([
        prisma.transaction.findMany({
          where: txWhere,
          include: {
            category: true,
            bankAccount: true,
            creditCard: true,
          },
          orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        }),
        prisma.spreadsheetRow.findMany({
          where: { active: true },
          include: { category: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        }),
        prisma.category.findMany({ orderBy: { name: 'asc' } }),
        prisma.bankAccount.findMany({ orderBy: { name: 'asc' } }),
        prisma.creditCard.findMany({ orderBy: { name: 'asc' } }),
        prisma.financialReserve.findMany({ orderBy: { createdAt: 'asc' } }),
      ])

    const transactions: SpreadsheetTransactionInput[] = transactionsRaw.map((t) => ({
      id: t.id,
      description: t.description,
      merchant: t.merchant,
      expenseName: t.expenseName,
      amountCents: t.amountCents,
      plannedAmountCents: t.plannedAmountCents,
      paidAmountCents: t.paidAmountCents,
      paymentStatus: t.paymentStatus,
      type: t.type,
      date: t.date,
      dueDate: t.dueDate,
      paidAt: t.paidAt,
      competenceMonth: t.competenceMonth,
      categoryId: t.categoryId,
      categoryName: t.category?.name ?? null,
      categoryColor: t.category?.color ?? null,
      bankAccountId: t.bankAccountId,
      bankAccountName: t.bankAccount?.name ?? null,
      creditCardId: t.creditCardId,
      creditCardName: t.creditCard?.name ?? null,
      spreadsheetRowId: t.spreadsheetRowId,
      origin: t.origin,
      notes: t.notes,
    }))

    const customRows: CustomSpreadsheetRowInput[] = customRowsRaw
      .filter((r) => !categoryId || categoryId === 'ALL' || r.categoryId === categoryId)
      .map((r) => ({
        id: r.id,
        name: r.name,
        categoryId: r.categoryId,
        categoryName: r.category?.name ?? null,
        categoryColor: r.category?.color ?? null,
        highlightColor: r.highlightColor ?? null,
        sortOrder: r.sortOrder,
      }))

    const initialAccountsBalanceCents = bankAccounts.reduce(
      (acc, b) => acc + (b.initialBalanceCents || 0),
      0
    )

    const spreadsheet = buildMonthlySpreadsheet({
      month,
      transactions,
      customRows,
      initialAccountsBalanceCents,
    })

    return NextResponse.json({
      spreadsheet,
      categories,
      bankAccounts,
      creditCards,
      reserves,
    })
  } catch (error) {
    console.error('Erro ao carregar planilha financeira:', error)
    return NextResponse.json(
      { error: 'Não foi possível carregar a planilha financeira.' },
      { status: 500 }
    )
  }
}
