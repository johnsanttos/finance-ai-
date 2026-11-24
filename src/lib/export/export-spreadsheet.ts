import * as XLSX from 'xlsx'
import { MonthlySpreadsheetView } from '@/lib/finance/spreadsheet'
import { formatCentsToBrl } from '@/lib/finance/money'

const STATUS_PT: Record<string, string> = {
  PAID: 'Paga',
  PARTIAL: 'Parcialmente paga',
  PENDING: 'Pendente',
  OVERDUE: 'Vencida',
}

function buildExpenseSheetRows(view: MonthlySpreadsheetView) {
  return view.expenseRows.map((row) => {
    const record: Record<string, string | number> = {
      'CONTA / GASTO': row.name,
      CATEGORIA: row.categoryName,
    }
    for (const w of view.weeks) {
      const cell = row.weeks[w.index]
      record[`${w.label} (${w.shortRange})`] = Number(
        ((cell?.totalCents || 0) / 100).toFixed(2)
      )
    }
    record['PAGO (R$)'] = Number((row.paidCents / 100).toFixed(2))
    record['FALTA PAGAR (R$)'] = Number((row.pendingCents / 100).toFixed(2))
    record['STATUS'] = STATUS_PT[row.paymentStatus] || row.paymentStatus
    record['TOTAL (R$)'] = Number((row.totalCents / 100).toFixed(2))
    return record
  })
}

export function exportSpreadsheetToExcel(view: MonthlySpreadsheetView) {
  const wb = XLSX.utils.book_new()

  const expenseRows = buildExpenseSheetRows(view)
  const wsExpenses = XLSX.utils.json_to_sheet(expenseRows)
  XLSX.utils.book_append_sheet(wb, wsExpenses, 'Despesas Semanais')

  const incomeRows = view.incomeRows.map((inc) => ({
    DESCRIÇÃO: inc.description,
    'PREVISTO (R$)': Number((inc.plannedCents / 100).toFixed(2)),
    'RECEBIDO (R$)': Number((inc.receivedCents / 100).toFixed(2)),
    DATA: inc.date.split('-').reverse().join('/'),
    STATUS: inc.paymentStatus === 'PAID' ? 'Recebido' : inc.paymentStatus === 'PARTIAL' ? 'Parcial' : 'Previsto',
    CONTA: inc.bankAccountName || 'Geral',
  }))
  const wsIncome = XLSX.utils.json_to_sheet(incomeRows)
  XLSX.utils.book_append_sheet(wb, wsIncome, 'Entradas de Receita')

  const summaryRows = [
    { INDICADOR: 'TOTAL DE GASTOS', VALOR: formatCentsToBrl(view.summary.totalExpensesCents) },
    { INDICADOR: 'TOTAL PAGO', VALOR: formatCentsToBrl(view.summary.totalPaidCents) },
    { INDICADOR: 'FALTA PAGAR', VALOR: formatCentsToBrl(view.summary.totalPendingCents) },
    { INDICADOR: 'TOTAL DE RECEITAS (RECEBIDAS)', VALOR: formatCentsToBrl(view.summary.totalReceivedIncomeCents) },
    { INDICADOR: 'TOTAL DE RECEITAS (PREVISTAS)', VALOR: formatCentsToBrl(view.summary.totalPlannedIncomeCents) },
    { INDICADOR: 'SALDO DO MÊS', VALOR: formatCentsToBrl(view.summary.monthResultCents) },
    { INDICADOR: 'SALDO DISPONÍVEL', VALOR: formatCentsToBrl(view.summary.availableBalanceCents) },
    { INDICADOR: 'PREVISÃO DE SALDO', VALOR: formatCentsToBrl(view.summary.projectedBalanceCents) },
  ]
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows)
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo Financeiro')

  XLSX.writeFile(wb, `planilha-financeira-${view.month}.xlsx`)
}

export function exportSpreadsheetToCsv(view: MonthlySpreadsheetView) {
  const expenseRows = buildExpenseSheetRows(view)
  const ws = XLSX.utils.json_to_sheet(expenseRows)
  const csv = XLSX.utils.sheet_to_csv(ws, { FS: ';' })
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `planilha-financeira-${view.month}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
