import { describe, expect, it } from 'vitest'
import {
  buildMonthlySpreadsheet,
  computePaymentStatus,
  getMonthWeeks,
  getWeekIndexForDate,
  SpreadsheetTransactionInput,
} from '../spreadsheet'

describe('Spreadsheet Engine — Real Calendar Weeks & Grouping', () => {
  it('derives real calendar weeks for November 2026 (5 weeks with exact day ranges)', () => {
    const weeks = getMonthWeeks('2026-11')
    expect(weeks).toHaveLength(5)
    expect(weeks[0]).toMatchObject({ index: 0, label: 'SEMANA 1', startDay: 1, endDay: 7 })
    expect(weeks[1]).toMatchObject({ index: 1, label: 'SEMANA 2', startDay: 8, endDay: 14 })
    expect(weeks[2]).toMatchObject({ index: 2, label: 'SEMANA 3', startDay: 15, endDay: 21 })
    expect(weeks[3]).toMatchObject({ index: 3, label: 'SEMANA 4', startDay: 22, endDay: 28 })
    expect(weeks[4]).toMatchObject({ index: 4, label: 'SEMANA 5', startDay: 29, endDay: 30 })

    expect(getWeekIndexForDate('2026-11-05', weeks)).toBe(0)
    expect(getWeekIndexForDate('2026-11-12', weeks)).toBe(1)
    expect(getWeekIndexForDate('2026-11-30', weeks)).toBe(4)
  })

  it('derives 4 weeks for February 2026 (28 days)', () => {
    const weeks = getMonthWeeks('2026-02')
    expect(weeks).toHaveLength(4)
    expect(weeks[3]).toMatchObject({ index: 3, startDay: 22, endDay: 28 })
  })
})

describe('Spreadsheet Engine — Payments, Partial Payments, Income & Summary Integrity', () => {
  it('computes payment statuses accurately (PAID, PARTIAL, PENDING, OVERDUE)', () => {
    const refNow = new Date('2026-11-20T12:00:00Z')
    expect(computePaymentStatus(75800, 75800, '2026-11-10', refNow)).toBe('PAID')
    expect(computePaymentStatus(75800, 30000, '2026-11-25', refNow)).toBe('PARTIAL')
    expect(computePaymentStatus(75800, 0, '2026-11-25', refNow)).toBe('PENDING')
    expect(computePaymentStatus(75800, 0, '2026-11-10', refNow)).toBe('OVERDUE')
  })

  it('aggregates weekly expenses, partial payments, income, and excludes TRANSFER & INVOICE_PAYMENT from totals', () => {
    const txs: SpreadsheetTransactionInput[] = [
      // Combustível em 3 semanas -> Total R$ 450,00
      {
        id: 't1',
        description: 'Posto Shell',
        expenseName: 'Combustível',
        amountCents: 10000,
        paidAmountCents: 10000,
        paymentStatus: 'PAID',
        type: 'EXPENSE',
        date: '2026-11-03T12:00:00.000Z',
        competenceMonth: '2026-11',
        categoryId: 'cat_transp',
        categoryName: 'Transporte',
        categoryColor: '#3b82f6',
      },
      {
        id: 't2',
        description: 'Posto Ipiranga',
        expenseName: 'Combustível',
        amountCents: 15000,
        paidAmountCents: 15000,
        paymentStatus: 'PAID',
        type: 'EXPENSE',
        date: '2026-11-10T12:00:00.000Z',
        competenceMonth: '2026-11',
        categoryId: 'cat_transp',
        categoryName: 'Transporte',
        categoryColor: '#3b82f6',
      },
      {
        id: 't3',
        description: 'Posto BR',
        expenseName: 'Combustível',
        amountCents: 20000,
        paidAmountCents: 20000,
        paymentStatus: 'PAID',
        type: 'EXPENSE',
        date: '2026-11-18T12:00:00.000Z',
        competenceMonth: '2026-11',
        categoryId: 'cat_transp',
        categoryName: 'Transporte',
        categoryColor: '#3b82f6',
      },
      // Condomínio com pagamento parcial: R$ 758,00 | Pago: R$ 300,00 | Falta: R$ 458,00
      {
        id: 't4',
        description: 'CONDOCONTA FINANCE SA',
        expenseName: 'Condomínio',
        amountCents: 75800,
        paidAmountCents: 30000,
        paymentStatus: 'PARTIAL',
        type: 'EXPENSE',
        date: '2026-11-05T12:00:00.000Z',
        dueDate: '2026-11-10T12:00:00.000Z',
        competenceMonth: '2026-11',
        categoryId: 'cat_moradia',
        categoryName: 'Moradia',
        categoryColor: '#6366f1',
      },
      // Transferência própria -> NÃO deve entrar em despesas nem receitas
      {
        id: 't5',
        description: 'PIX Própria Conta',
        amountCents: 50000,
        paidAmountCents: 50000,
        paymentStatus: 'PAID',
        type: 'TRANSFER',
        date: '2026-11-09T12:00:00.000Z',
        competenceMonth: '2026-11',
        categoryId: 'cat_transf',
        categoryName: 'Transferências',
      },
      // Pagamento de fatura -> NÃO deve duplicar despesa
      {
        id: 't6',
        description: 'Pagamento de Fatura Cartão',
        amountCents: 100000,
        paidAmountCents: 100000,
        paymentStatus: 'PAID',
        type: 'INVOICE_PAYMENT',
        date: '2026-11-12T12:00:00.000Z',
        competenceMonth: '2026-11',
        categoryId: 'cat_card',
        categoryName: 'Cartão de crédito',
      },
      // Receita recebida: Salário R$ 4.000,00
      {
        id: 'r1',
        description: 'Salário Mensal',
        amountCents: 400000,
        plannedAmountCents: 400000,
        paidAmountCents: 400000,
        paymentStatus: 'PAID',
        type: 'INCOME',
        date: '2026-11-05T12:00:00.000Z',
        competenceMonth: '2026-11',
        categoryId: 'cat_sal',
        categoryName: 'Salário',
      },
      // Receita prevista ainda não recebida: Renda extra R$ 500,00
      {
        id: 'r2',
        description: 'Freelance Extra',
        amountCents: 50000,
        plannedAmountCents: 50000,
        paidAmountCents: 0,
        paymentStatus: 'PENDING',
        type: 'INCOME',
        date: '2026-11-28T12:00:00.000Z',
        competenceMonth: '2026-11',
        categoryId: 'cat_extra',
        categoryName: 'Outras receitas',
      },
    ]

    const view = buildMonthlySpreadsheet({
      month: '2026-11',
      transactions: txs,
      customRows: [],
      referenceNow: new Date('2026-11-20T12:00:00Z'),
    })

    // 2 linhas de despesa (Combustível e Condomínio; TRANSFER e INVOICE_PAYMENT ignorados)
    expect(view.expenseRows).toHaveLength(2)

    const combRow = view.expenseRows.find((r) => r.name === 'Combustível')!
    expect(combRow.totalCents).toBe(45000)
    expect(combRow.paidCents).toBe(45000)
    expect(combRow.pendingCents).toBe(0)
    expect(combRow.weeks[0].totalCents).toBe(10000)
    expect(combRow.weeks[1].totalCents).toBe(15000)
    expect(combRow.weeks[2].totalCents).toBe(20000)
    expect(combRow.paymentStatus).toBe('PAID')

    const condRow = view.expenseRows.find((r) => r.name === 'Condomínio')!
    expect(condRow.totalCents).toBe(75800)
    expect(condRow.paidCents).toBe(30000)
    expect(condRow.pendingCents).toBe(45800)
    expect(condRow.paymentStatus).toBe('PARTIAL')

    // Resumo Financeiro
    expect(view.summary.totalExpensesCents).toBe(120800) // 450 + 758
    expect(view.summary.totalPaidCents).toBe(75000) // 450 + 300
    expect(view.summary.totalPendingCents).toBe(45800) // 758 - 300
    expect(view.summary.totalPlannedIncomeCents).toBe(450000) // 4000 + 500
    expect(view.summary.totalReceivedIncomeCents).toBe(400000) // 4000 recebido
    // Saldo do Mês (Receitas realizadas - Despesas do período): 4000 - 1208 = 2792
    expect(view.summary.monthResultCents).toBe(279200)
    // Saldo Disponível efetivo (Receitas recebidas - Despesas efetivamente pagas): 4000 - 750 = 3250
    expect(view.summary.availableBalanceCents).toBe(325000)
    // Previsão de Saldo (Receitas previstas - Despesas totais sem dupla contagem): 4500 - 1208 = 3292
    expect(view.summary.projectedBalanceCents).toBe(329200)

    // Entradas de Receita
    expect(view.incomeRows).toHaveLength(2)
  })

  it('excludes internal couple PIX (John / Viviane) from incomeRows and computes creditCardBreakdown', () => {
    const txs: SpreadsheetTransactionInput[] = [
      {
        id: 'card1',
        description: 'Fatura Nubank',
        expenseName: 'Cartão Nubank / Vivi e John',
        amountCents: 41481,
        paidAmountCents: 41481,
        paymentStatus: 'PAID',
        type: 'EXPENSE',
        date: '2026-11-05T12:00:00.000Z',
        competenceMonth: '2026-11',
        categoryId: 'cat_nu',
        categoryName: 'CARTÃO NUBANK/VIVI E JOHN',
        categoryColor: '#d946ef',
      },
      {
        id: 'card2',
        description: 'Fatura Itaú',
        expenseName: 'Cartão Itaú',
        amountCents: 60000,
        paidAmountCents: 0,
        paymentStatus: 'PENDING',
        type: 'EXPENSE',
        date: '2026-11-12T12:00:00.000Z',
        competenceMonth: '2026-11',
        categoryId: 'cat_itau',
        categoryName: 'CARTÃO ITAÚ',
        categoryColor: '#f97316',
      },
      {
        id: 'inc_ext',
        description: 'PAGTO SALARIO (ENTRADA)',
        amountCents: 222394,
        plannedAmountCents: 222394,
        paidAmountCents: 222394,
        paymentStatus: 'PAID',
        type: 'INCOME',
        date: '2026-11-05T12:00:00.000Z',
        competenceMonth: '2026-11',
        categoryId: 'cat_sal',
        categoryName: 'Salário',
      },
      {
        id: 'inc_vivi',
        description: 'EB Viviane Da Cruz Santos (Pix recebido)',
        amountCents: 16000,
        plannedAmountCents: 16000,
        paidAmountCents: 16000,
        paymentStatus: 'PAID',
        type: 'INCOME',
        date: '2026-11-01T12:00:00.000Z',
        competenceMonth: '2026-11',
        categoryId: 'cat_out',
        categoryName: 'Outras receitas',
      },
      {
        id: 'inc_john',
        description: 'PIX RECEBIDO JOHN ELTON DA SILVA',
        amountCents: 30000,
        plannedAmountCents: 30000,
        paidAmountCents: 30000,
        paymentStatus: 'PAID',
        type: 'INCOME',
        date: '2026-11-02T12:00:00.000Z',
        competenceMonth: '2026-11',
        categoryId: 'cat_out',
        categoryName: 'Outras receitas',
      },
    ]

    const view = buildMonthlySpreadsheet({
      month: '2026-11',
      transactions: txs,
      customRows: [],
      referenceNow: new Date('2026-11-20T12:00:00Z'),
    })

    // Apenas renda externa entra em ENTRADAS DE RECEITA
    expect(view.incomeRows).toHaveLength(1)
    expect(view.incomeRows[0].description).toBe('PAGTO SALARIO (ENTRADA)')
    expect(view.summary.totalReceivedIncomeCents).toBe(222394)

    // Gráfico de Cartões soma apenas linhas de cartão
    expect(view.creditCardBreakdown).toHaveLength(2)
    expect(view.totalCreditCardCents).toBe(101481)
    expect(view.creditCardBreakdown[0].name).toBe('Cartão Itaú')
    expect(view.creditCardBreakdown[1].name).toBe('Cartão Nubank / Vivi e John')
  })
})
