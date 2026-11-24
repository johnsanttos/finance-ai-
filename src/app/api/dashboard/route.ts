import { NextRequest, NextResponse } from 'next/server'
import { ensureSeeded, prisma } from '@/lib/prisma'
import {
  calculateDashboardMetrics,
  calculateNetExpenses,
  calculateTotalIncome,
  TransactionRecord,
} from '@/lib/finance/metrics'
import { getMonthWeeks, getWeekIndexForDate } from '@/lib/finance/spreadsheet'
import { PT_BR_MONTH_NAMES } from '@/lib/constants/months'

function shiftCompetenceMonth(month: string, delta: number): string {
  const [yStr, mStr] = month.split('-')
  const totalMonths = Number(yStr) * 12 + (Number(mStr) - 1) + delta
  const y = Math.floor(totalMonths / 12)
  const m = ((totalMonths % 12) + 12) % 12
  return `${y}-${String(m + 1).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded()
    const { searchParams } = new URL(req.url)
    const now = new Date()
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const month = searchParams.get('month') || defaultMonth
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const prevMonth = shiftCompetenceMonth(month, -1)

    const allTransactionsRaw = await prisma.transaction.findMany({
      include: {
        category: true,
        bankAccount: true,
        creditCard: true,
      },
      orderBy: { date: 'desc' },
    })

    const mapRecord = (
      tx: (typeof allTransactionsRaw)[number]
    ): TransactionRecord & { expenseName?: string | null } => ({
      id: tx.id,
      description: tx.description,
      merchant: tx.merchant,
      expenseName: tx.expenseName,
      amountCents: tx.amountCents,
      type: tx.type,
      date: tx.date,
      competenceMonth: tx.competenceMonth,
      categoryId: tx.categoryId,
      categoryName: tx.category?.name ?? null,
      categoryColor: tx.category?.color ?? null,
      creditCardId: tx.creditCardId,
      bankAccountName: tx.bankAccount?.name ?? null,
      creditCardName: tx.creditCard?.name ?? null,
    })

    const allRecords = allTransactionsRaw.map(mapRecord)

    const currentPeriodRecords =
      startDate && endDate
        ? allRecords.filter((tx) => {
            const iso = new Date(tx.date).toISOString().slice(0, 10)
            return iso >= startDate && iso <= endDate
          })
        : allRecords.filter((tx) => tx.competenceMonth === month)

    const prevMonthRecords = allRecords.filter(
      (tx) => tx.competenceMonth === prevMonth
    )

    const metrics = calculateDashboardMetrics(
      currentPeriodRecords,
      prevMonthRecords,
      allRecords
    )

    // GRÁFICO 3: Últimos 12 meses reais incluindo o mês selecionado
    const last12Months = Array.from({ length: 12 }, (_, idx) => {
      const mCode = shiftCompetenceMonth(month, idx - 11)
      const [yStr, mStr] = mCode.split('-')
      const monthName = PT_BR_MONTH_NAMES[Number(mStr) - 1] || mStr
      const monthTxs = allRecords.filter((t) => t.competenceMonth === mCode)
      const expensesCents = calculateNetExpenses(monthTxs)
      const incomeCents = calculateTotalIncome(monthTxs)
      return {
        monthCode: mCode,
        monthLabel: `${monthName.slice(0, 3)}/${yStr.slice(2)}`,
        fullMonthLabel: `${monthName} de ${yStr}`,
        expensesCents,
        incomeCents,
        expensesReais: Number((expensesCents / 100).toFixed(2)),
        incomeReais: Number((incomeCents / 100).toFixed(2)),
      }
    })

    // GRÁFICO 2: Entradas e Saídas distribuídas por semanas do mês selecionado
    const weeks = getMonthWeeks(month)
    const weeklyComparison = weeks.map((w) => {
      const wTxs = currentPeriodRecords.filter(
        (tx) => getWeekIndexForDate(tx.date, weeks) === w.index
      )
      const expensesCents = calculateNetExpenses(wTxs)
      const incomeCents = calculateTotalIncome(wTxs)
      return {
        label: `Sem ${w.index + 1}`,
        range: w.shortRange,
        expensesCents,
        incomeCents,
        expensesReais: Number((expensesCents / 100).toFixed(2)),
        incomeReais: Number((incomeCents / 100).toFixed(2)),
      }
    })

    // GRÁFICO 4: Top 10 maiores gastos agrupados pelo nome normalizado do gasto (excluindo INVOICE_PAYMENT e TRANSFER)
    const topExpenseMap = new Map<
      string,
      { name: string; categoryName: string; color: string; amountCents: number; count: number }
    >()
    for (const tx of currentPeriodRecords) {
      if (tx.type !== 'EXPENSE' && tx.type !== 'REFUND') continue
      const displayName = (
        tx.expenseName ||
        tx.merchant ||
        tx.description
      )
        .replace(/\([^)]*\)/g, '')
        .trim()
      if (!displayName) continue
      const key = displayName.toLowerCase()
      const delta = tx.type === 'EXPENSE' ? Math.abs(tx.amountCents) : -Math.abs(tx.amountCents)
      const existing = topExpenseMap.get(key) || {
        name: displayName,
        categoryName: tx.categoryName || 'Sem categoria',
        color: tx.categoryColor || '#6366f1',
        amountCents: 0,
        count: 0,
      }
      existing.amountCents += delta
      if (tx.type === 'EXPENSE') existing.count += 1
      topExpenseMap.set(key, existing)
    }

    const topExpenses = Array.from(topExpenseMap.values())
      .filter((item) => item.amountCents > 0)
      .sort((a, b) => b.amountCents - a.amountCents)
      .slice(0, 10)
      .map((item) => ({
        ...item,
        amountReais: Number((item.amountCents / 100).toFixed(2)),
      }))

    // Alertas de orçamento por categoria
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
    })

    const budgetAlerts = categories
      .filter((c) => c.monthlyBudgetCents && c.monthlyBudgetCents > 0)
      .map((cat) => {
        const spent =
          metrics.categoryBreakdown.find((b) => b.name === cat.name)
            ?.amountCents ?? 0
        const budget = cat.monthlyBudgetCents!
        const ratio = Number(((spent / budget) * 100).toFixed(1))
        return {
          categoryId: cat.id,
          categoryName: cat.name,
          color: cat.color,
          spentCents: spent,
          budgetCents: budget,
          usagePercent: ratio,
          exceeded: spent > budget,
          nearLimit: spent >= budget * 0.85 && spent <= budget,
        }
      })
      .filter((a) => a.spentCents > 0)
      .sort((a, b) => b.usagePercent - a.usagePercent)

    return NextResponse.json({
      month,
      prevMonth,
      metrics,
      last12Months,
      weeklyComparison,
      topExpenses,
      budgetAlerts,
      periodTransactions: currentPeriodRecords,
      recentTransactions: currentPeriodRecords.slice(0, 10),
    })
  } catch (error) {
    console.error('Erro ao calcular dashboard:', error)
    return NextResponse.json(
      { error: 'Não foi possível carregar os dados do dashboard.' },
      { status: 500 }
    )
  }
}
