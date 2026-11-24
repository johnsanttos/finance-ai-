import { describe, expect, it } from 'vitest'
import { formatCentsToBrl, parseBrlToCents } from '../money'
import {
  buildTransactionFingerprint,
  detectDuplicates,
  resolveTransactionDate,
} from '../deduplication'
import { generateInstallments } from '../installments'
import { calculateDashboardMetrics } from '../metrics'

describe('Finance Engine — Money BRL & Centavos (Review Focus #1)', () => {
  it('converts standard Brazilian currency strings to exact integer cents', () => {
    expect(parseBrlToCents('R$ 1.250,90')).toBe(125090)
    expect(parseBrlToCents('-R$ 250,00')).toBe(25000)
    expect(parseBrlToCents('1250,90')).toBe(125090)
    expect(parseBrlToCents('R$ 0,05')).toBe(5)
    expect(parseBrlToCents('15.432,10')).toBe(1543210)
    expect(parseBrlToCents(199.9)).toBe(19990)
  })

  it('returns null for illegible or non-numeric strings', () => {
    expect(parseBrlToCents('ilegível')).toBeNull()
    expect(parseBrlToCents('')).toBeNull()
  })

  it('formats cents back to standard BRL string', () => {
    const formatted = formatCentsToBrl(125090)
    expect(formatted.replace(/\s+/g, ' ')).toContain('1.250,90')
  })
})

describe('Finance Engine — Partial Dates & Deduplication/Overlap (Review Focus #2 & #4)', () => {
  it('resolves partial dates like "05 NOV" or "07/11" using referenceMonth', () => {
    const r1 = resolveTransactionDate('05 NOV', '2026-11')
    expect(r1.competenceMonth).toBe('2026-11')
    expect(r1.isoDate).toBe('2026-11-05')
    expect(r1.needsReview).toBe(false)

    const r2 = resolveTransactionDate('07/11', '2026-11')
    expect(r2.isoDate).toBe('2026-11-07')
    expect(r2.needsReview).toBe(false)

    const r3 = resolveTransactionDate('data cortada', '2026-11')
    expect(r3.needsReview).toBe(true)
  })

  it('detects duplicates against database AND overlapping screenshots in the same batch', () => {
    const existingFp = buildTransactionFingerprint({
      date: '2026-11-05',
      amountCents: 25000,
      description: 'Supermercado Extra',
    })
    const existingSet = new Set([existingFp])

    const batchItems = [
      {
        date: '2026-11-05',
        amountCents: 25000,
        description: 'SUPERMERCADO EXTRA',
        type: 'EXPENSE' as const,
      },
      {
        date: '2026-11-08',
        amountCents: 4990,
        description: 'Uber Viagem',
        type: 'EXPENSE' as const,
      },
      // Overlapping line from 2nd screenshot of the same statement scroll
      {
        date: '2026-11-08',
        amountCents: 4990,
        description: 'Uber   Viagem ',
        type: 'EXPENSE' as const,
      },
    ]

    const checked = detectDuplicates(batchItems, existingSet)

    expect(checked[0].isDuplicate).toBe(true)
    expect(checked[0].duplicateReason).toContain('banco de dados')
    expect(checked[1].isDuplicate).toBe(false)
    expect(checked[2].isDuplicate).toBe(true)
    expect(checked[2].duplicateReason).toContain('mesmo lote')
  })

  it('allows wife (Viviane) statement in the same month/day without false-positive duplicate against John', () => {
    const johnFp = buildTransactionFingerprint({
      date: '2026-11-18',
      amountCents: 1080,
      description: 'ELCSS AUTOPASS S A1811',
      ownerTag: 'john',
    })
    const existingSet = new Set([johnFp])

    const vivianeItems = [
      {
        date: '2026-11-18',
        amountCents: 1080,
        description: 'ELCSS AUTOPASS S A1811',
        type: 'EXPENSE' as const,
      },
    ]

    const checkedViviane = detectDuplicates(vivianeItems, existingSet, 'viviane')
    expect(checkedViviane[0].isDuplicate).toBe(false)

    // Importing Viviane's same item a second time IS caught as duplicate for Viviane
    existingSet.add(checkedViviane[0].fingerprint)
    const checkedVivianeAgain = detectDuplicates(vivianeItems, existingSet, 'viviane')
    expect(checkedVivianeAgain[0].isDuplicate).toBe(true)
  })
})

describe('Finance Engine — Installments (Review Focus #5)', () => {
  it('splits total cents accurately across competence months and puts remainder in 1st installment', () => {
    const installments = generateInstallments({
      description: 'Notebook Dell',
      totalAmountCents: 10000, // R$ 100,00 in 3x -> 3334, 3333, 3333
      totalInstallments: 3,
      startDate: '2026-11-15',
    })

    expect(installments).toHaveLength(3)
    expect(installments[0]).toMatchObject({
      installmentNumber: 1,
      totalInstallments: 3,
      amountCents: 3334,
      competenceMonth: '2026-11',
      description: 'Notebook Dell (1/3)',
    })
    expect(installments[1]).toMatchObject({
      installmentNumber: 2,
      amountCents: 3333,
      competenceMonth: '2026-12',
    })
    expect(installments[2]).toMatchObject({
      installmentNumber: 3,
      amountCents: 3333,
      competenceMonth: '2027-01',
    })
  })
})

describe('Finance Engine — Accounting Rules & Dashboard Metrics (Review Focus #3)', () => {
  it('excludes TRANSFER and INVOICE_PAYMENT from income/expense totals and deducts REFUND from expenses', () => {
    const currentMonth = [
      {
        id: '1',
        description: 'Salário Mensal',
        amountCents: 800000,
        type: 'INCOME',
        date: new Date('2026-11-05T12:00:00Z'),
        competenceMonth: '2026-11',
        categoryName: 'Salário',
        creditCardId: null,
      },
      {
        id: '2',
        description: 'Supermercado Pão de Açúcar',
        amountCents: 150000,
        type: 'EXPENSE',
        date: new Date('2026-11-06T12:00:00Z'),
        competenceMonth: '2026-11',
        categoryName: 'Supermercado',
        creditCardId: 'card_1',
      },
      {
        id: '3',
        description: 'Estorno Cobrança Indevida',
        amountCents: 20000,
        type: 'REFUND',
        date: new Date('2026-11-07T12:00:00Z'),
        competenceMonth: '2026-11',
        categoryName: 'Supermercado',
        creditCardId: 'card_1',
      },
      {
        id: '4',
        description: 'Transferência entre contas próprias',
        amountCents: 300000,
        type: 'TRANSFER',
        date: new Date('2026-11-08T12:00:00Z'),
        competenceMonth: '2026-11',
        categoryName: 'Transferências',
        creditCardId: null,
      },
      {
        id: '5',
        description: 'Pagamento de fatura Nubank',
        amountCents: 130000,
        type: 'INVOICE_PAYMENT',
        date: new Date('2026-11-10T12:00:00Z'),
        competenceMonth: '2026-11',
        categoryName: 'Cartão de crédito',
        creditCardId: null,
      },
    ]

    const previousMonth = [
      {
        id: 'p1',
        description: 'Supermercado Outubro',
        amountCents: 100000,
        type: 'EXPENSE',
        date: new Date('2026-10-10T12:00:00Z'),
        competenceMonth: '2026-10',
        categoryName: 'Supermercado',
        creditCardId: 'card_1',
      },
    ]

    const metrics = calculateDashboardMetrics(currentMonth, previousMonth, [
      ...previousMonth,
      ...currentMonth,
    ])

    // Receitas: 8000,00 (Transferência ignorada)
    expect(metrics.totalIncomeCents).toBe(800000)
    // Despesas líquidas: 1500,00 - 200,00 (estorno) = 1300,00 (Pagamento de fatura e transferência ignorados)
    expect(metrics.totalExpenseCents).toBe(130000)
    // Saldo do período: 8000,00 - 1300,00 = 6700,00
    expect(metrics.balanceCents).toBe(670000)
    // Total no cartão de crédito líquido: 1300,00
    expect(metrics.creditCardExpenseCents).toBe(130000)
    // Comparação com mês anterior: (1300 - 1000) / 1000 = +30%
    expect(metrics.expenseChangePercent).toBe(30)
    // Maior categoria: Supermercado
    expect(metrics.topCategory?.name).toBe('Supermercado')
    expect(metrics.topCategory?.amountCents).toBe(130000)
  })
})
