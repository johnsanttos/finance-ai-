import * as XLSX from 'xlsx'
import { formatCentsToBrl } from '@/lib/finance/money'

export interface ExportableTransaction {
  id: string
  date: string
  competenceMonth: string
  description: string
  merchant?: string | null
  amountCents: number
  type: string
  category?: { name: string } | null
  bankAccount?: { name: string } | null
  creditCard?: { name: string } | null
  origin?: string
}

const TYPE_PT: Record<string, string> = {
  EXPENSE: 'Despesa',
  INCOME: 'Receita',
  TRANSFER: 'Transferência',
  INVOICE_PAYMENT: 'Pagamento de Fatura',
  REFUND: 'Estorno',
}

function buildRows(transactions: ExportableTransaction[]) {
  return transactions.map((tx) => {
    const signedValue =
      tx.type === 'EXPENSE'
        ? -(tx.amountCents / 100)
        : tx.amountCents / 100

    return {
      Data: new Date(tx.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
      Competência: tx.competenceMonth,
      Descrição: tx.description,
      Estabelecimento: tx.merchant || '',
      Categoria: tx.category?.name || 'Sem categoria',
      Tipo: TYPE_PT[tx.type] || tx.type,
      Conta_ou_Cartao:
        tx.creditCard?.name || tx.bankAccount?.name || 'Geral',
      Valor_BRL: formatCentsToBrl(tx.amountCents, {
        showSign: true,
        type: tx.type,
      }),
      Valor_Numerico: Number(signedValue.toFixed(2)),
    }
  })
}

export function exportTransactionsToCsv(
  transactions: ExportableTransaction[],
  filenamePrefix = 'transacoes-finance-ai'
) {
  const rows = buildRows(transactions)
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const csvContent = XLSX.utils.sheet_to_csv(worksheet, { FS: ';' })
  const blob = new Blob(['\uFEFF' + csvContent], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filenamePrefix}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function exportTransactionsToExcel(
  transactions: ExportableTransaction[],
  filenamePrefix = 'transacoes-finance-ai'
) {
  const rows = buildRows(transactions)
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Transações')
  XLSX.writeFile(workbook, `${filenamePrefix}.xlsx`)
}
