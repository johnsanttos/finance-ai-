import { isInternalCoupleIncome } from '@/lib/finance/spreadsheet'

export interface TransactionRecord {
  id: string
  description: string
  merchant?: string | null
  amountCents: number
  type: string // EXPENSE | INCOME | TRANSFER | INVOICE_PAYMENT | REFUND
  date: Date | string
  competenceMonth: string
  categoryId?: string | null
  categoryName?: string | null
  categoryColor?: string | null
  creditCardId?: string | null
  bankAccountName?: string | null
  creditCardName?: string | null
}

export interface CategorySummary {
  name: string
  color: string
  amountCents: number
  percentage: number
  count: number
}

export interface MerchantSummary {
  name: string
  amountCents: number
  count: number
}

export interface DashboardMetrics {
  totalExpenseCents: number
  totalIncomeCents: number
  balanceCents: number
  transactionCount: number
  expenseChangePercent: number | null
  incomeChangePercent: number | null
  topCategory: CategorySummary | null
  monthlyAverageExpenseCents: number
  creditCardExpenseCents: number
  uncategorizedCount: number
  categoryBreakdown: CategorySummary[]
  creditCardBreakdown: CategorySummary[]
  topMerchants: MerchantSummary[]
}

export function calculateNetExpenses(transactions: TransactionRecord[]): number {
  let expenses = 0
  for (const tx of transactions) {
    if (tx.type === 'EXPENSE') {
      expenses += Math.abs(tx.amountCents)
    } else if (tx.type === 'REFUND') {
      expenses -= Math.abs(tx.amountCents)
    }
    // TRANSFER and INVOICE_PAYMENT are intentionally ignored
  }
  return Math.max(0, expenses)
}

export function calculateTotalIncome(transactions: TransactionRecord[]): number {
  let income = 0
  for (const tx of transactions) {
    if (
      tx.type === 'INCOME' &&
      tx.categoryName !== 'Transferências' &&
      !isInternalCoupleIncome(tx.description) &&
      !(tx.merchant && isInternalCoupleIncome(tx.merchant))
    ) {
      income += Math.abs(tx.amountCents)
    }
    // TRANSFER, categoria Transferências e PIX entre John e Viviane nunca entram como receita
  }
  return income
}

export function calculateDashboardMetrics(
  currentTransactions: TransactionRecord[],
  previousMonthTransactions: TransactionRecord[],
  allHistoricalTransactions: TransactionRecord[]
): DashboardMetrics {
  const totalExpenseCents = calculateNetExpenses(currentTransactions)
  const totalIncomeCents = calculateTotalIncome(currentTransactions)
  const balanceCents = totalIncomeCents - totalExpenseCents
  const transactionCount = currentTransactions.length

  const prevExpenseCents = calculateNetExpenses(previousMonthTransactions)
  const prevIncomeCents = calculateTotalIncome(previousMonthTransactions)

  const expenseChangePercent =
    prevExpenseCents > 0
      ? Number((((totalExpenseCents - prevExpenseCents) / prevExpenseCents) * 100).toFixed(1))
      : null

  const incomeChangePercent =
    prevIncomeCents > 0
      ? Number((((totalIncomeCents - prevIncomeCents) / prevIncomeCents) * 100).toFixed(1))
      : null

  // Credit card expenses (net of refunds on credit cards OR credit card categories like CARTÃO NUBANK, CARTÃO ITAÚ, etc.)
  let creditCardExpenseCents = 0
  let uncategorizedCount = 0

  const categoryMap = new Map<string, { amountCents: number; count: number; color: string }>()
  const creditCardMap = new Map<string, { amountCents: number; count: number; color: string }>()
  const merchantMap = new Map<string, { amountCents: number; count: number }>()

  const isCardCategory = (name?: string | null) =>
    Boolean(name && /cart[aã]o/i.test(name))

  const CARD_COLORS = ['#d946ef', '#c026d3', '#a855f7', '#ec4899', '#8b5cf6', '#f472b6']

  for (const tx of currentTransactions) {
    if (!tx.categoryId && !tx.categoryName && tx.type !== 'TRANSFER' && tx.type !== 'INVOICE_PAYMENT') {
      uncategorizedCount++
    }

    const isCardTx = Boolean(tx.creditCardId || isCardCategory(tx.categoryName))

    if (isCardTx && (tx.type === 'EXPENSE' || tx.type === 'REFUND')) {
      const delta = tx.type === 'EXPENSE' ? Math.abs(tx.amountCents) : -Math.abs(tx.amountCents)
      creditCardExpenseCents += delta

      const cardLabel =
        (isCardCategory(tx.categoryName) ? tx.categoryName : tx.creditCardName) ||
        'Cartão de Crédito'
      const cardColor =
        tx.categoryColor ||
        CARD_COLORS[creditCardMap.size % CARD_COLORS.length]
      const currentCard = creditCardMap.get(cardLabel) || {
        amountCents: 0,
        count: 0,
        color: cardColor,
      }
      currentCard.amountCents += delta
      if (tx.type === 'EXPENSE') currentCard.count += 1
      creditCardMap.set(cardLabel, currentCard)
    }

    if (tx.type === 'EXPENSE' || tx.type === 'REFUND') {
      const catName = tx.categoryName || 'Sem categoria'
      const catColor = tx.categoryColor || '#6366f1'
      const currentCat = categoryMap.get(catName) || { amountCents: 0, count: 0, color: catColor }
      const delta = tx.type === 'EXPENSE' ? Math.abs(tx.amountCents) : -Math.abs(tx.amountCents)

      currentCat.amountCents += delta
      if (tx.type === 'EXPENSE') currentCat.count += 1
      categoryMap.set(catName, currentCat)

      const merchantName = (tx.merchant || tx.description).trim()
      const currentMerchant = merchantMap.get(merchantName) || { amountCents: 0, count: 0 }
      currentMerchant.amountCents += delta
      if (tx.type === 'EXPENSE') currentMerchant.count += 1
      merchantMap.set(merchantName, currentMerchant)
    }
  }

  creditCardExpenseCents = Math.max(0, creditCardExpenseCents)

  const categoryBreakdown: CategorySummary[] = Array.from(categoryMap.entries())
    .filter(([, val]) => val.amountCents > 0)
    .map(([name, val]) => ({
      name,
      color: val.color,
      amountCents: val.amountCents,
      count: val.count,
      percentage:
        totalExpenseCents > 0 ? Number(((val.amountCents / totalExpenseCents) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.amountCents - a.amountCents)

  const creditCardBreakdown: CategorySummary[] = Array.from(creditCardMap.entries())
    .filter(([, val]) => val.amountCents > 0)
    .map(([name, val]) => ({
      name,
      color: val.color,
      amountCents: val.amountCents,
      count: val.count,
      percentage:
        creditCardExpenseCents > 0
          ? Number(((val.amountCents / creditCardExpenseCents) * 100).toFixed(1))
          : 0,
    }))
    .sort((a, b) => b.amountCents - a.amountCents)

  const topCategory = categoryBreakdown.length > 0 ? categoryBreakdown[0] : null

  const topMerchants: MerchantSummary[] = Array.from(merchantMap.entries())
    .filter(([, val]) => val.amountCents > 0)
    .map(([name, val]) => ({
      name,
      amountCents: val.amountCents,
      count: val.count,
    }))
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, 8)

  // Monthly average of expenses across distinct competence months
  const monthsMap = new Map<string, TransactionRecord[]>()
  for (const tx of allHistoricalTransactions) {
    if (tx.type === 'EXPENSE' || tx.type === 'REFUND') {
      const list = monthsMap.get(tx.competenceMonth) || []
      list.push(tx)
      monthsMap.set(tx.competenceMonth, list)
    }
  }

  let totalHistoricalExpense = 0
  let activeMonths = 0
  for (const [, monthTxs] of monthsMap.entries()) {
    const net = calculateNetExpenses(monthTxs)
    if (net > 0) {
      totalHistoricalExpense += net
      activeMonths++
    }
  }

  const monthlyAverageExpenseCents =
    activeMonths > 0 ? Math.round(totalHistoricalExpense / activeMonths) : totalExpenseCents

  return {
    totalExpenseCents,
    totalIncomeCents,
    balanceCents,
    transactionCount,
    expenseChangePercent,
    incomeChangePercent,
    topCategory,
    monthlyAverageExpenseCents,
    creditCardExpenseCents,
    uncategorizedCount,
    categoryBreakdown,
    creditCardBreakdown,
    topMerchants,
  }
}
