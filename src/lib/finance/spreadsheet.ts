export type PaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE'

export interface CalendarWeek {
  index: number
  label: string // "SEMANA 1" .. "SEMANA 5"
  shortRange: string // "01/11–07/11"
  startDay: number
  endDay: number
  defaultIsoDate: string // "YYYY-MM-DD" (primeiro dia útil/inicial da semana)
}

export interface SpreadsheetTransactionInput {
  id: string
  description: string
  merchant?: string | null
  expenseName?: string | null
  amountCents: number
  plannedAmountCents?: number | null
  paidAmountCents?: number | null
  paymentStatus?: string | null
  type: string // EXPENSE | INCOME | TRANSFER | INVOICE_PAYMENT | REFUND
  date: Date | string
  dueDate?: Date | string | null
  paidAt?: Date | string | null
  competenceMonth: string
  categoryId?: string | null
  categoryName?: string | null
  categoryColor?: string | null
  bankAccountId?: string | null
  bankAccountName?: string | null
  creditCardId?: string | null
  creditCardName?: string | null
  spreadsheetRowId?: string | null
  origin?: string | null
  notes?: string | null
}

export interface CustomSpreadsheetRowInput {
  id: string
  name: string
  categoryId?: string | null
  categoryName?: string | null
  categoryColor?: string | null
  highlightColor?: string | null
  sortOrder: number
}

export interface SpreadsheetCardItem {
  name: string
  color: string
  amountCents: number
  count: number
  percentage: number
}

export interface SpreadsheetWeekCell {
  weekIndex: number
  totalCents: number
  paidCents: number
  pendingCents: number
  transactions: SpreadsheetTransactionInput[]
}

export interface SpreadsheetExpenseRow {
  rowKey: string
  spreadsheetRowId: string | null
  name: string // Nome do gasto (ex: Condomínio, Combustível)
  categoryId: string | null
  categoryName: string
  categoryColor: string
  highlightColor: string | null
  sortOrder: number
  weeks: SpreadsheetWeekCell[]
  totalCents: number
  paidCents: number
  pendingCents: number
  paymentStatus: PaymentStatus
  transactions: SpreadsheetTransactionInput[]
}

export interface SpreadsheetIncomeRow {
  id: string
  description: string
  plannedCents: number
  receivedCents: number
  pendingCents: number
  date: string
  paymentStatus: PaymentStatus
  categoryId: string | null
  categoryName: string
  bankAccountId: string | null
  bankAccountName: string | null
  origin: string
}

export interface SpreadsheetSummary {
  totalExpensesCents: number
  totalPaidCents: number
  totalPendingCents: number
  totalPlannedIncomeCents: number
  totalReceivedIncomeCents: number
  totalPendingIncomeCents: number
  monthResultCents: number // Receitas realizadas - Despesas totais do período
  availableBalanceCents: number // Receitas recebidas - Despesas efetivamente pagas (+ saldo inicial contas se fornecido)
  projectedBalanceCents: number // Receitas previstas - Despesas totais do período (sem dupla contagem)
  weeklyTotalsCents: number[]
  weeklyIncomeCents: number[]
}

export interface MonthlySpreadsheetView {
  month: string
  weeks: CalendarWeek[]
  expenseRows: SpreadsheetExpenseRow[]
  incomeRows: SpreadsheetIncomeRow[]
  creditCardBreakdown: SpreadsheetCardItem[]
  totalCreditCardCents: number
  summary: SpreadsheetSummary
}

const INTERNAL_COUPLE_TRANSFER_PATTERNS = [
  /john\s+elton/i,
  /john\s+da\s+silva/i,
  /viviane\s+da\s+cruz/i,
  /viviane\s+santos/i,
]

export function isInternalCoupleIncome(description: string): boolean {
  const norm = description
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return INTERNAL_COUPLE_TRANSFER_PATTERNS.some((p) => p.test(norm))
}

export function getMonthWeeks(competenceMonth: string): CalendarWeek[] {
  const [yearStr, monthStr] = competenceMonth.split('-')
  const year = Number(yearStr) || new Date().getFullYear()
  const monthNum = Number(monthStr) || 1
  const daysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate()
  const mPad = String(monthNum).padStart(2, '0')

  const ranges: Array<[number, number]> = [
    [1, Math.min(7, daysInMonth)],
    [8, Math.min(14, daysInMonth)],
    [15, Math.min(21, daysInMonth)],
    [22, Math.min(28, daysInMonth)],
  ]

  if (daysInMonth > 28) {
    ranges.push([29, daysInMonth])
  }

  return ranges.map(([startDay, endDay], index) => {
    const sPad = String(startDay).padStart(2, '0')
    const ePad = String(endDay).padStart(2, '0')
    return {
      index,
      label: `SEMANA ${index + 1}`,
      shortRange: `${sPad}/${mPad}–${ePad}/${mPad}`,
      startDay,
      endDay,
      defaultIsoDate: `${year}-${mPad}-${sPad}`,
    }
  })
}

export function getWeekIndexForDate(
  date: Date | string,
  weeks: CalendarWeek[]
): number {
  const iso =
    typeof date === 'string'
      ? date.slice(0, 10)
      : date.toISOString().slice(0, 10)
  const day = Number(iso.slice(8, 10)) || 1
  const found = weeks.find((w) => day >= w.startDay && day <= w.endDay)
  return found ? found.index : weeks.length - 1
}

export function computePaymentStatus(
  totalCents: number,
  paidCents: number,
  dueDate?: Date | string | null,
  referenceNow: Date = new Date()
): PaymentStatus {
  if (totalCents <= 0) return 'PENDING'
  if (paidCents >= totalCents) return 'PAID'
  if (paidCents > 0) return 'PARTIAL'

  if (dueDate) {
    const dueIso =
      typeof dueDate === 'string'
        ? dueDate.slice(0, 10)
        : dueDate.toISOString().slice(0, 10)
    const todayIso = referenceNow.toISOString().slice(0, 10)
    if (dueIso < todayIso) {
      return 'OVERDUE'
    }
  }

  return 'PENDING'
}

export function resolveTransactionPaidCents(tx: SpreadsheetTransactionInput): number {
  if (tx.paidAmountCents !== null && tx.paidAmountCents !== undefined) {
    return Math.max(0, Math.min(tx.amountCents, tx.paidAmountCents))
  }
  if (tx.paymentStatus === 'PENDING' || tx.paymentStatus === 'OVERDUE') {
    return 0
  }
  return Math.abs(tx.amountCents)
}

export function buildMonthlySpreadsheet(input: {
  month: string
  transactions: SpreadsheetTransactionInput[]
  customRows: CustomSpreadsheetRowInput[]
  initialAccountsBalanceCents?: number
  referenceNow?: Date
}): MonthlySpreadsheetView {
  const { month, transactions, customRows, initialAccountsBalanceCents = 0 } = input
  const referenceNow = input.referenceNow ?? new Date()
  const weeks = getMonthWeeks(month)

  // Inicializa mapa de linhas de despesa com as linhas personalizadas cadastradas (preservando sortOrder)
  const rowMap = new Map<
    string,
    {
      rowKey: string
      spreadsheetRowId: string | null
      name: string
      categoryId: string | null
      categoryName: string
      categoryColor: string
      highlightColor: string | null
      sortOrder: number
      transactions: SpreadsheetTransactionInput[]
    }
  >()

  const customRowById = new Map<string, CustomSpreadsheetRowInput>()
  const customRowByName = new Map<string, CustomSpreadsheetRowInput>()

  for (const cr of customRows) {
    const key = `row:${cr.id}`
    customRowById.set(cr.id, cr)
    customRowByName.set(cr.name.trim().toLowerCase(), cr)
    rowMap.set(key, {
      rowKey: key,
      spreadsheetRowId: cr.id,
      name: cr.name,
      categoryId: cr.categoryId ?? null,
      categoryName: cr.categoryName || 'Sem categoria',
      categoryColor: cr.categoryColor || '#6366f1',
      highlightColor: cr.highlightColor ?? null,
      sortOrder: cr.sortOrder,
      transactions: [],
    })
  }

  const incomeRows: SpreadsheetIncomeRow[] = []
  const weeklyTotalsCents = weeks.map(() => 0)
  const weeklyIncomeCents = weeks.map(() => 0)

  let dynamicOrderCounter = customRows.length + 100

  for (const tx of transactions) {
    // Regra contábil rigorosa: TRANSFER e INVOICE_PAYMENT nunca entram como despesa nem receita
    if (tx.type === 'TRANSFER' || tx.type === 'INVOICE_PAYMENT') {
      continue
    }

    if (tx.type === 'INCOME') {
      // Entradas de receita aceitam SOMENTE rendas externas (ignora PIX entre John e Viviane ou transferências próprias)
      if (
        tx.categoryName === 'Transferências' ||
        isInternalCoupleIncome(tx.description) ||
        (tx.merchant && isInternalCoupleIncome(tx.merchant))
      ) {
        continue
      }
      const plannedCents = Math.abs(tx.plannedAmountCents ?? tx.amountCents)
      const receivedCents = resolveTransactionPaidCents({
        ...tx,
        amountCents: plannedCents,
      })
      const pendingCents = Math.max(0, plannedCents - receivedCents)
      const status = computePaymentStatus(
        plannedCents,
        receivedCents,
        tx.dueDate ?? tx.date,
        referenceNow
      )

      const wIdx = getWeekIndexForDate(tx.date, weeks)
      weeklyIncomeCents[wIdx] += receivedCents

      incomeRows.push({
        id: tx.id,
        description: tx.expenseName || tx.description,
        plannedCents,
        receivedCents,
        pendingCents,
        date:
          typeof tx.date === 'string'
            ? tx.date.slice(0, 10)
            : tx.date.toISOString().slice(0, 10),
        paymentStatus: status,
        categoryId: tx.categoryId ?? null,
        categoryName: tx.categoryName || 'Outras receitas',
        bankAccountId: tx.bankAccountId ?? null,
        bankAccountName: tx.bankAccountName ?? null,
        origin: tx.origin || 'MANUAL',
      })
      continue
    }

    // Despesas e Estornos
    if (tx.type === 'EXPENSE' || tx.type === 'REFUND') {
      const expenseLabel = (
        tx.expenseName ||
        tx.categoryName ||
        tx.merchant ||
        tx.description
      ).trim()

      let targetKey: string | null = null
      if (tx.spreadsheetRowId && customRowById.has(tx.spreadsheetRowId)) {
        targetKey = `row:${tx.spreadsheetRowId}`
      } else {
        const matchedByName = customRowByName.get(expenseLabel.toLowerCase())
        if (matchedByName) {
          targetKey = `row:${matchedByName.id}`
        } else {
          targetKey = `auto:${expenseLabel.toLowerCase()}`
        }
      }

      if (!rowMap.has(targetKey)) {
        rowMap.set(targetKey, {
          rowKey: targetKey,
          spreadsheetRowId: null,
          name: expenseLabel,
          categoryId: tx.categoryId ?? null,
          categoryName: tx.categoryName || 'Sem categoria',
          categoryColor: tx.categoryColor || '#6366f1',
          highlightColor: null,
          sortOrder: dynamicOrderCounter++,
          transactions: [],
        })
      }

      rowMap.get(targetKey)!.transactions.push(tx)
    }
  }

  let totalExpensesCents = 0
  let totalPaidCents = 0
  let totalPendingCents = 0

  const expenseRows: SpreadsheetExpenseRow[] = Array.from(rowMap.values())
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((entry) => {
      const weekCells: SpreadsheetWeekCell[] = weeks.map((w) => ({
        weekIndex: w.index,
        totalCents: 0,
        paidCents: 0,
        pendingCents: 0,
        transactions: [],
      }))

      let rowTotal = 0
      let rowPaid = 0
      let earliestUnpaidDue: string | null = null

      for (const tx of entry.transactions) {
        const wIdx = getWeekIndexForDate(tx.date, weeks)
        const cell = weekCells[wIdx]
        const sign = tx.type === 'REFUND' ? -1 : 1
        const txTotal = sign * Math.abs(tx.amountCents)
        const txPaid = sign * resolveTransactionPaidCents(tx)

        cell.totalCents += txTotal
        cell.paidCents += txPaid
        cell.transactions.push(tx)

        rowTotal += txTotal
        rowPaid += txPaid

        if (tx.type === 'EXPENSE' && txPaid < Math.abs(tx.amountCents)) {
          const d = tx.dueDate ?? tx.date
          const iso =
            typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10)
          if (!earliestUnpaidDue || iso < earliestUnpaidDue) {
            earliestUnpaidDue = iso
          }
        }
      }

      rowTotal = Math.max(0, rowTotal)
      rowPaid = Math.max(0, Math.min(rowTotal, rowPaid))
      const rowPending = Math.max(0, rowTotal - rowPaid)

      for (const cell of weekCells) {
        cell.totalCents = Math.max(0, cell.totalCents)
        cell.paidCents = Math.max(0, Math.min(cell.totalCents, cell.paidCents))
        cell.pendingCents = Math.max(0, cell.totalCents - cell.paidCents)
        weeklyTotalsCents[cell.weekIndex] += cell.totalCents
      }

      totalExpensesCents += rowTotal
      totalPaidCents += rowPaid
      totalPendingCents += rowPending

      const paymentStatus = computePaymentStatus(
        rowTotal,
        rowPaid,
        earliestUnpaidDue,
        referenceNow
      )

      return {
        rowKey: entry.rowKey,
        spreadsheetRowId: entry.spreadsheetRowId,
        name: entry.name,
        categoryId: entry.categoryId,
        categoryName: entry.categoryName,
        categoryColor: entry.categoryColor,
        highlightColor: entry.highlightColor,
        sortOrder: entry.sortOrder,
        weeks: weekCells,
        totalCents: rowTotal,
        paidCents: rowPaid,
        pendingCents: rowPending,
        paymentStatus,
        transactions: entry.transactions,
      }
    })

  // Breakdown exclusivo de Gastos de Cartões para o gráfico da planilha
  const cardMap = new Map<string, { amountCents: number; count: number; color: string }>()
  const CARD_COLORS = ['#d946ef', '#c026d3', '#a855f7', '#ec4899', '#8b5cf6', '#f472b6']
  let totalCreditCardCents = 0

  for (const row of expenseRows) {
    const isCardRow =
      /cart[aã]o/i.test(row.name) ||
      /cart[aã]o/i.test(row.categoryName) ||
      row.transactions.some((t) => Boolean(t.creditCardId))
    if (!isCardRow || row.totalCents <= 0) continue

    const label = row.name
    const color =
      row.highlightColor ||
      row.categoryColor ||
      CARD_COLORS[cardMap.size % CARD_COLORS.length]
    const prev = cardMap.get(label) || { amountCents: 0, count: 0, color }
    prev.amountCents += row.totalCents
    prev.count += row.transactions.length
    cardMap.set(label, prev)
    totalCreditCardCents += row.totalCents
  }

  const creditCardBreakdown: SpreadsheetCardItem[] = Array.from(cardMap.entries())
    .map(([name, v]) => ({
      name,
      color: v.color,
      amountCents: v.amountCents,
      count: v.count,
      percentage:
        totalCreditCardCents > 0
          ? Number(((v.amountCents / totalCreditCardCents) * 100).toFixed(1))
          : 0,
    }))
    .sort((a, b) => b.amountCents - a.amountCents)

  const totalPlannedIncomeCents = incomeRows.reduce(
    (acc, r) => acc + r.plannedCents,
    0
  )
  const totalReceivedIncomeCents = incomeRows.reduce(
    (acc, r) => acc + r.receivedCents,
    0
  )
  const totalPendingIncomeCents = Math.max(
    0,
    totalPlannedIncomeCents - totalReceivedIncomeCents
  )

  const monthResultCents = totalReceivedIncomeCents - totalExpensesCents
  const availableBalanceCents =
    initialAccountsBalanceCents + totalReceivedIncomeCents - totalPaidCents
  const projectedBalanceCents =
    totalPlannedIncomeCents - totalExpensesCents

  return {
    month,
    weeks,
    expenseRows,
    incomeRows,
    creditCardBreakdown,
    totalCreditCardCents,
    summary: {
      totalExpensesCents,
      totalPaidCents,
      totalPendingCents,
      totalPlannedIncomeCents,
      totalReceivedIncomeCents,
      totalPendingIncomeCents,
      monthResultCents,
      availableBalanceCents,
      projectedBalanceCents,
      weeklyTotalsCents,
      weeklyIncomeCents,
    },
  }
}
