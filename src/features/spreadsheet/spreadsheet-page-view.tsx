'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileSpreadsheet,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Table2,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  formatCompetenceMonthPtBr,
  PT_BR_MONTH_NAMES,
  usePeriod,
} from '@/context/period-provider'
import {
  CalendarWeek,
  MonthlySpreadsheetView,
  SpreadsheetExpenseRow,
  SpreadsheetTransactionInput,
} from '@/lib/finance/spreadsheet'
import { formatCentsToBrl, parseBrlToCents } from '@/lib/finance/money'
import {
  exportSpreadsheetToCsv,
  exportSpreadsheetToExcel,
} from '@/lib/export/export-spreadsheet'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  FinancialReserveItem,
  SpreadsheetSummaryPanel,
} from './components/spreadsheet-summary-panel'
import { IncomeTableSection } from './components/income-table-section'
import { ImportSpreadsheetModal } from './components/import-spreadsheet-modal'

interface CategoryOption {
  id: string
  name: string
  type: string
  color: string
}

interface BankOption {
  id: string
  name: string
}

interface UndoAction {
  label: string
  execute: () => Promise<void>
}

const YEARS = ['2024', '2025', '2026', '2027', '2028']

const HIGHLIGHT_PRESETS = [
  { label: 'Sem cor', value: '' },
  { label: 'Magenta (Cartões)', value: '#d946ef' },
  { label: 'Azul', value: '#0ea5e9' },
  { label: 'Vermelho', value: '#dc2626' },
  { label: 'Amarelo', value: '#eab308' },
  { label: 'Verde', value: '#10b981' },
  { label: 'Roxo', value: '#8b5cf6' },
  { label: 'Laranja', value: '#f97316' },
]

const STATUS_BADGE_MAP: Record<
  string,
  { label: string; className: string }
> = {
  PAID: {
    label: 'Paga',
    className: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-500',
  },
  PARTIAL: {
    label: 'Parcial',
    className: 'border-sky-500/50 bg-sky-500/15 text-sky-400',
  },
  PENDING: {
    label: 'Pendente',
    className: 'border-amber-500/50 bg-amber-500/15 text-amber-500',
  },
  OVERDUE: {
    label: 'Vencida',
    className: 'border-rose-500/50 bg-rose-500/15 text-rose-500',
  },
}

export function SpreadsheetPageView() {
  const { month, setMonth, refreshTrigger, triggerRefresh } = usePeriod()

  const [view, setView] = useState<MonthlySpreadsheetView | null>(null)
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankOption[]>([])
  const [reserves, setReserves] = useState<FinancialReserveItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  // Filtros
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [bankFilter, setBankFilter] = useState('ALL')

  // Edição inline estilo Excel
  const [editingCell, setEditingCell] = useState<{
    rowKey: string
    weekIndex: number
    value: string
    date: string
  } | null>(null)
  const [recentlyEditedKey, setRecentlyEditedKey] = useState<string | null>(null)
  const [undoStack, setUndoStack] = useState<UndoAction[]>([])

  // Modal de detalhamento quando uma célula tem múltiplas transações (ou para adicionar ajuste/ver itens)
  const [cellDetailModal, setCellDetailModal] = useState<{
    row: SpreadsheetExpenseRow
    week: CalendarWeek
  } | null>(null)
  const [adjustDesc, setAdjustDesc] = useState('')
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustDate, setAdjustDate] = useState('')

  // Modal de pagamento parcial / total
  const [paymentModalRow, setPaymentModalRow] =
    useState<SpreadsheetExpenseRow | null>(null)
  const [partialPaidInput, setPartialPaidInput] = useState('')
  const [paidDateInput, setPaidDateInput] = useState(
    new Date().toISOString().slice(0, 10)
  )

  // Modal de nova linha (gasto + categoria ou nova categoria)
  const [newRowModalOpen, setNewRowModalOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [newRowName, setNewRowName] = useState('')
  const [newRowCategoryId, setNewRowCategoryId] = useState('NONE')
  const [newRowHighlightColor, setNewRowHighlightColor] = useState('')
  const [createNewCategoryMode, setCreateNewCategoryMode] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState('#6366f1')

  // Confirmação de exclusão de linha
  const [rowToDelete, setRowToDelete] = useState<SpreadsheetExpenseRow | null>(
    null
  )

  // Modal de edição do nome do gasto, categoria e cor de destaque de qualquer linha
  const [editingRow, setEditingRow] = useState<SpreadsheetExpenseRow | null>(
    null
  )
  const [editRowName, setEditRowName] = useState('')
  const [editRowCategoryId, setEditRowCategoryId] = useState('NONE')
  const [editRowHighlightColor, setEditRowHighlightColor] = useState('')
  const [editRowSyncAsCategory, setEditRowSyncAsCategory] = useState(true)

  const loadSpreadsheet = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      try {
        const params = new URLSearchParams({ month })
        if (categoryFilter !== 'ALL') params.set('categoryId', categoryFilter)
        if (bankFilter !== 'ALL') params.set('bankAccountId', bankFilter)

        const res = await fetch(`/api/spreadsheet?${params.toString()}`)
        if (res.ok) {
          const json = await res.json()
          setView(json.spreadsheet)
          setCategories(json.categories || [])
          setBankAccounts(json.bankAccounts || [])
          setReserves(json.reserves || [])
        }
      } catch {
        toast.error('Erro ao carregar a planilha mensal.')
      } finally {
        setLoading(false)
      }
    },
    [month, categoryFilter, bankFilter]
  )

  useEffect(() => {
    loadSpreadsheet()
  }, [loadSpreadsheet, refreshTrigger])

  // Navegação de meses
  const [currentYear, currentMonthStr] = month.split('-')
  const currentMonthIdx = Number(currentMonthStr) - 1

  const stepMonth = (delta: number) => {
    let nextMonth = currentMonthIdx + delta
    let nextYear = Number(currentYear)
    if (nextMonth < 0) {
      nextMonth = 11
      nextYear -= 1
    } else if (nextMonth > 11) {
      nextMonth = 0
      nextYear += 1
    }
    setEditingCell(null)
    setMonth(`${nextYear}-${String(nextMonth + 1).padStart(2, '0')}`)
  }

  const goToCurrentMonth = () => {
    const now = new Date()
    setMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  }

  const filteredExpenseRows = useMemo(() => {
    if (!view) return []
    const q = searchQuery.trim().toLowerCase()
    if (!q) return view.expenseRows
    return view.expenseRows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.categoryName.toLowerCase().includes(q)
    )
  }, [view, searchQuery])

  const markSavedFeedback = (cellKey?: string) => {
    setSaveState('saved')
    if (cellKey) {
      setRecentlyEditedKey(cellKey)
      setTimeout(() => setRecentlyEditedKey(null), 1500)
    }
    setTimeout(() => setSaveState('idle'), 2000)
  }

  // Inicia edição inline ou abre modal se houver 2+ lançamentos na célula
  const handleCellClick = (
    row: SpreadsheetExpenseRow,
    week: CalendarWeek
  ) => {
    const cell = row.weeks[week.index]
    if (cell && cell.transactions.length > 1) {
      setAdjustDesc('')
      setAdjustAmount('')
      setAdjustDate(week.defaultIsoDate)
      setCellDetailModal({ row, week })
      return
    }

    const existingTx = cell?.transactions[0]
    const initialDate = existingTx
      ? typeof existingTx.date === 'string'
        ? existingTx.date.slice(0, 10)
        : existingTx.date.toISOString().slice(0, 10)
      : week.defaultIsoDate

    setEditingCell({
      rowKey: row.rowKey,
      weekIndex: week.index,
      value:
        cell && cell.totalCents > 0
          ? (cell.totalCents / 100).toFixed(2).replace('.', ',')
          : '',
      date: initialDate,
    })
  }

  const commitInlineEdit = async (
    row: SpreadsheetExpenseRow,
    week: CalendarWeek,
    rawValue: string,
    realDate: string,
    advanceToNextCell = false
  ) => {
    const trimmed = rawValue.trim()
    const cents = trimmed === '' ? 0 : parseBrlToCents(trimmed)
    if (cents === null) {
      toast.error('Valor inválido. Digite um número em reais (ex: 150,00).')
      return
    }

    const cell = row.weeks[week.index]
    const existingTx = cell?.transactions[0]
    const previousCents = existingTx?.amountCents ?? 0

    // Nada mudou
    if (cents === previousCents) {
      setEditingCell(null)
      if (advanceToNextCell && view) {
        moveFocusToNextCell(row.rowKey, week.index)
      }
      return
    }

    setSaveState('saving')
    try {
      const res = await fetch('/api/spreadsheet/cell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: existingTx?.id ?? null,
          expenseName: row.name,
          description: existingTx?.description || row.name,
          amountCents: cents,
          paidAmountCents: existingTx
            ? Math.min(cents, existingTx.paidAmountCents ?? cents)
            : 0,
          paymentStatus: existingTx
            ? undefined
            : 'PENDING',
          type: 'EXPENSE',
          date: realDate || week.defaultIsoDate,
          categoryId: row.categoryId,
          spreadsheetRowId: row.spreadsheetRowId,
        }),
      })

      if (!res.ok) throw new Error('Falha ao salvar célula')
      const json = await res.json()
      const savedTxId: string | undefined = json.transaction?.id ?? existingTx?.id

      // Registra ação no histórico de Desfazer (Undo)
      setUndoStack((prev) => [
        {
          label: `${row.name} (${week.label})`,
          execute: async () => {
            if (!existingTx && savedTxId) {
              await fetch(`/api/transactions/${savedTxId}`, { method: 'DELETE' })
            } else if (existingTx) {
              await fetch('/api/spreadsheet/cell', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  transactionId: existingTx.id,
                  expenseName: row.name,
                  description: existingTx.description,
                  amountCents: previousCents,
                  type: 'EXPENSE',
                  date:
                    typeof existingTx.date === 'string'
                      ? existingTx.date.slice(0, 10)
                      : existingTx.date.toISOString().slice(0, 10),
                  categoryId: row.categoryId,
                  spreadsheetRowId: row.spreadsheetRowId,
                }),
              })
            }
          },
        },
        ...prev.slice(0, 9),
      ])

      setEditingCell(null)
      markSavedFeedback(`${row.rowKey}:${week.index}`)
      await loadSpreadsheet(true)
      triggerRefresh()

      if (advanceToNextCell) {
        moveFocusToNextCell(row.rowKey, week.index)
      }
    } catch {
      setSaveState('idle')
      toast.error('Não foi possível salvar a alteração.')
    }
  }

  const moveFocusToNextCell = (rowKey: string, weekIndex: number) => {
    if (!view) return
    const nextWeekIdx = weekIndex + 1
    if (nextWeekIdx < view.weeks.length) {
      const row = filteredExpenseRows.find((r) => r.rowKey === rowKey)
      if (row) handleCellClick(row, view.weeks[nextWeekIdx])
      return
    }
    const rIdx = filteredExpenseRows.findIndex((r) => r.rowKey === rowKey)
    if (rIdx >= 0 && rIdx + 1 < filteredExpenseRows.length) {
      handleCellClick(filteredExpenseRows[rIdx + 1], view.weeks[0])
    }
  }

  // Suporte a colar múltiplos valores separados por Tab (estilo copiar do Excel e colar em Semana 1..4)
  const handleCellPaste = async (
    e: React.ClipboardEvent<HTMLInputElement>,
    row: SpreadsheetExpenseRow,
    startWeekIndex: number
  ) => {
    const pastedText = e.clipboardData.getData('text')
    if (!pastedText.includes('\t')) return
    e.preventDefault()

    if (!view) return
    const tokens = pastedText
      .split(/\r?\n/)[0]
      .split('\t')
      .map((t) => t.trim())

    setSaveState('saving')
    for (let i = 0; i < tokens.length; i++) {
      const wIdx = startWeekIndex + i
      if (wIdx >= view.weeks.length) break
      const cents = parseBrlToCents(tokens[i])
      if (cents === null || cents <= 0) continue
      const week = view.weeks[wIdx]
      const existingTx = row.weeks[wIdx]?.transactions[0]
      await fetch('/api/spreadsheet/cell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: existingTx?.id ?? null,
          expenseName: row.name,
          description: existingTx?.description || row.name,
          amountCents: cents,
          paymentStatus: existingTx ? undefined : 'PENDING',
          type: 'EXPENSE',
          date: week.defaultIsoDate,
          categoryId: row.categoryId,
          spreadsheetRowId: row.spreadsheetRowId,
        }),
      })
    }
    setEditingCell(null)
    markSavedFeedback()
    toast.success('Valores colados e sincronizados com o banco de dados!')
    await loadSpreadsheet(true)
    triggerRefresh()
  }

  const handleUndo = async () => {
    if (undoStack.length === 0) return
    const [latest, ...rest] = undoStack
    setSaveState('saving')
    try {
      await latest.execute()
      setUndoStack(rest)
      toast.info(`Alteração desfeita: ${latest.label}`)
      await loadSpreadsheet(true)
      triggerRefresh()
      setSaveState('idle')
    } catch {
      setSaveState('idle')
      toast.error('Erro ao desfazer alteração.')
    }
  }

  // Adicionar lançamento de ajuste explícito dentro de uma célula detalhada
  const handleAddAdjustmentToCell = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cellDetailModal) return
    const cents = parseBrlToCents(adjustAmount)
    if (!cents || cents <= 0) {
      toast.error('Informe um valor válido para o lançamento.')
      return
    }

    const res = await fetch('/api/spreadsheet/cell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expenseName: cellDetailModal.row.name,
        description:
          adjustDesc.trim() || `${cellDetailModal.row.name} (Ajuste Planilha)`,
        amountCents: cents,
        paymentStatus: 'PENDING',
        type: 'EXPENSE',
        date: adjustDate || cellDetailModal.week.defaultIsoDate,
        categoryId: cellDetailModal.row.categoryId,
        spreadsheetRowId: cellDetailModal.row.spreadsheetRowId,
      }),
    })

    if (res.ok) {
      toast.success('Lançamento adicionado à semana!')
      setCellDetailModal(null)
      await loadSpreadsheet(true)
      triggerRefresh()
    }
  }

  const handleDeleteTxFromCell = async (txId: string) => {
    const res = await fetch(`/api/transactions/${txId}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Lançamento excluído.')
      setCellDetailModal(null)
      await loadSpreadsheet(true)
      triggerRefresh()
    }
  }

  // Controle de Pagamento (Total, Pendente ou Parcial)
  const openPaymentModal = (row: SpreadsheetExpenseRow) => {
    setPaymentModalRow(row)
    setPartialPaidInput(
      (row.paidCents / 100).toFixed(2).replace('.', ',')
    )
    setPaidDateInput(new Date().toISOString().slice(0, 10))
  }

  const handlePaymentUpdate = async (
    mode: 'FULL' | 'UNPAID' | 'PARTIAL'
  ) => {
    if (!paymentModalRow || paymentModalRow.transactions.length === 0) {
      toast.info('Adicione primeiro um valor em alguma semana desta linha.')
      return
    }

    const txIds = paymentModalRow.transactions.map((t) => t.id)
    const body: Record<string, unknown> = {
      transactionIds: txIds,
      paidAt: paidDateInput,
    }

    if (mode === 'FULL') body.markFullPaid = true
    else if (mode === 'UNPAID') body.markUnpaid = true
    else {
      const paidCents = parseBrlToCents(partialPaidInput)
      if (paidCents === null) {
        toast.error('Informe um valor pago válido.')
        return
      }
      body.paidAmountCents = paidCents
    }

    const res = await fetch('/api/spreadsheet/cell', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      toast.success('Status de pagamento atualizado!')
      setPaymentModalRow(null)
      await loadSpreadsheet(true)
      triggerRefresh()
    }
  }

  // Criar nova linha (diferenciando Nome do Gasto vs Categoria)
  const handleCreateRow = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRowName.trim()) {
      toast.error('Informe o nome da conta/gasto.')
      return
    }
    const res = await fetch('/api/spreadsheet/rows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newRowName.trim(),
        categoryId: createNewCategoryMode ? null : newRowCategoryId,
        highlightColor: newRowHighlightColor || null,
        newCategoryName: createNewCategoryMode ? newCategoryName.trim() : null,
        newCategoryColor: createNewCategoryMode ? newCategoryColor : null,
      }),
    })

    if (res.ok) {
      toast.success(`Linha "${newRowName.trim()}" adicionada à planilha!`)
      setNewRowModalOpen(false)
      setNewRowName('')
      setNewRowHighlightColor('')
      setNewCategoryName('')
      setCreateNewCategoryMode(false)
      await loadSpreadsheet(true)
      triggerRefresh()
    } else {
      toast.error('Erro ao adicionar linha.')
    }
  }

  // Reordenar qualquer linha de despesa (↑ / ↓) e persistir no banco
  const handleMoveRow = async (rowKey: string, direction: -1 | 1) => {
    if (!view) return
    const allRows = [...view.expenseRows]
    const idx = allRows.findIndex((r) => r.rowKey === rowKey)
    const targetIdx = idx + direction
    if (idx < 0 || targetIdx < 0 || targetIdx >= allRows.length) return

    const [moved] = allRows.splice(idx, 1)
    allRows.splice(targetIdx, 0, moved)

    // Atualização otimista imediata na tela
    setView({ ...view, expenseRows: allRows })
    setSaveState('saving')

    const res = await fetch('/api/spreadsheet/rows', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderedRows: allRows.map((r) => ({
          spreadsheetRowId: r.spreadsheetRowId,
          name: r.name,
          categoryId: r.categoryId,
          highlightColor: r.highlightColor ?? null,
          transactionIds: r.transactions.map((t) => t.id),
        })),
      }),
    })
    if (res.ok) {
      markSavedFeedback()
      await loadSpreadsheet(true)
    } else {
      setSaveState('idle')
      toast.error('Não foi possível salvar a nova ordem.')
      await loadSpreadsheet(true)
    }
  }

  const handleConfirmDeleteRow = async () => {
    if (!rowToDelete) return
    if (rowToDelete.spreadsheetRowId) {
      await fetch(
        `/api/spreadsheet/rows?id=${rowToDelete.spreadsheetRowId}&deleteMonthTransactions=true&month=${month}`,
        { method: 'DELETE' }
      )
    } else if (rowToDelete.transactions.length > 0) {
      await fetch('/api/transactions/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: rowToDelete.transactions.map((t) => t.id),
        }),
      })
    }

    toast.success(`Linha "${rowToDelete.name}" removida de ${formatCompetenceMonthPtBr(month)}.`)
    setRowToDelete(null)
    await loadSpreadsheet(true)
    triggerRefresh()
  }

  const openEditRowModal = (row: SpreadsheetExpenseRow) => {
    setEditingRow(row)
    setEditRowName(row.name)
    setEditRowCategoryId(row.categoryId || 'NONE')
    setEditRowHighlightColor(row.highlightColor || '')
    setEditRowSyncAsCategory(true)
  }

  const handleSaveRowEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingRow || !editRowName.trim()) {
      toast.error('Informe o nome do gasto.')
      return
    }

    setSaveState('saving')
    try {
      const res = await fetch('/api/spreadsheet/rows', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingRow.spreadsheetRowId,
          name: editRowName.trim(),
          categoryId: editRowCategoryId,
          highlightColor: editRowHighlightColor || null,
          syncAsCategory: editRowSyncAsCategory,
          transactionIds: editingRow.transactions.map((t) => t.id),
        }),
      })
      if (!res.ok) throw new Error()

      toast.success(
        editRowSyncAsCategory
          ? `Gasto "${editRowName.trim()}" salvo e integrado como categoria padrão em todo o sistema!`
          : `Gasto "${editRowName.trim()}" atualizado!`
      )
      setEditingRow(null)
      markSavedFeedback()
      await loadSpreadsheet(true)
      triggerRefresh()
    } catch {
      setSaveState('idle')
      toast.error('Não foi possível salvar as alterações da linha.')
    }
  }

  return (
    <>
      <Header fixed hidePeriodSelector>
        <div className='flex items-center gap-2'>
          <Table2 className='h-4 w-4 text-primary' />
          <h1 className='text-sm font-semibold sm:text-base'>
            Planilha Financeira Mensal
          </h1>
          {saveState === 'saving' && (
            <Badge variant='secondary' className='gap-1 text-[10px]'>
              <Loader2 className='h-3 w-3 animate-spin' /> Salvando...
            </Badge>
          )}
          {saveState === 'saved' && (
            <Badge
              variant='outline'
              className='gap-1 border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-500'
            >
              <Check className='h-3 w-3' /> Salvo automaticamente
            </Badge>
          )}
        </div>
      </Header>

      <Main fluid className='space-y-5'>
        {/* Banner Principal do Mês + Navegação Completa */}
        <div className='flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4 shadow-xs'>
          <div className='space-y-1'>
            <h2 className='text-xl font-extrabold tracking-tight uppercase sm:text-2xl'>
              PLANILHA FINANCEIRA — {formatCompetenceMonthPtBr(month)}
            </h2>
            <p className='text-xs text-muted-foreground'>
              Clique em qualquer célula para editar (Enter confirma • Tab avança • Cole colunas do Excel). Fonte única de verdade sincronizada com Transações, IA e Dashboard.
            </p>
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            <div className='flex items-center rounded-lg border bg-background p-0.5'>
              <Button
                variant='ghost'
                size='icon'
                className='h-8 w-8'
                onClick={() => stepMonth(-1)}
                title='Mês anterior'
              >
                <ChevronLeft className='h-4 w-4' />
              </Button>

              <Select
                value={currentMonthStr}
                onValueChange={(val) => setMonth(`${currentYear}-${val}`)}
              >
                <SelectTrigger className='h-8 w-[124px] border-0 bg-transparent text-xs font-semibold shadow-none'>
                  <Calendar className='mr-1 h-3.5 w-3.5 text-primary' />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PT_BR_MONTH_NAMES.map((name, idx) => (
                    <SelectItem
                      key={idx}
                      value={String(idx + 1).padStart(2, '0')}
                    >
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={currentYear}
                onValueChange={(val) => setMonth(`${val}-${currentMonthStr}`)}
              >
                <SelectTrigger className='h-8 w-[80px] border-0 bg-transparent text-xs font-semibold shadow-none'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={y}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant='ghost'
                size='icon'
                className='h-8 w-8'
                onClick={() => stepMonth(1)}
                title='Próximo mês'
              >
                <ChevronRight className='h-4 w-4' />
              </Button>
            </div>

            <Button
              variant='outline'
              size='sm'
              onClick={goToCurrentMonth}
              className='h-9 gap-1.5 text-xs'
            >
              <RotateCcw className='h-3.5 w-3.5' />
              Mês Atual
            </Button>
          </div>
        </div>

        {/* Barra de Ferramentas: Busca, Filtros, Nova Linha, Desfazer, Exportar */}
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div className='flex flex-wrap items-center gap-2'>
            <div className='relative w-56'>
              <Search className='absolute top-2.5 left-2.5 h-3.5 w-3.5 text-muted-foreground' />
              <Input
                placeholder='Buscar gasto ou categoria...'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className='h-9 pl-8 text-xs'
              />
            </div>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className='h-9 w-44 text-xs'>
                <SelectValue placeholder='Filtrar categoria' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='ALL'>Todas as categorias</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={bankFilter} onValueChange={setBankFilter}>
              <SelectTrigger className='h-9 w-40 text-xs'>
                <SelectValue placeholder='Filtrar conta' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='ALL'>Todas as contas</SelectItem>
                {bankAccounts.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            {undoStack.length > 0 && (
              <Button
                variant='outline'
                size='sm'
                onClick={handleUndo}
                className='h-9 gap-1.5 text-xs'
              >
                <Undo2 className='h-3.5 w-3.5' />
                Desfazer ({undoStack.length})
              </Button>
            )}

            <Button
              variant='outline'
              size='sm'
              disabled={!view}
              onClick={() => view && exportSpreadsheetToCsv(view)}
              className='h-9 gap-1.5 text-xs'
            >
              <Download className='h-3.5 w-3.5' />
              CSV
            </Button>

            <Button
              variant='outline'
              size='sm'
              disabled={!view}
              onClick={() => view && exportSpreadsheetToExcel(view)}
              className='h-9 gap-1.5 text-xs'
            >
              <FileSpreadsheet className='h-3.5 w-3.5' />
              Excel
            </Button>

            <Button
              variant='outline'
              size='sm'
              onClick={() => setImportModalOpen(true)}
              className='h-9 gap-1.5 border-primary/40 text-xs text-primary hover:bg-primary/10'
            >
              <Upload className='h-3.5 w-3.5' />
              Importar Planilha / Print
            </Button>

            <Button
              size='sm'
              onClick={() => setNewRowModalOpen(true)}
              className='h-9 gap-1.5 text-xs'
            >
              <Plus className='h-4 w-4' />
              Nova Linha de Gasto
            </Button>
          </div>
        </div>

        {loading || !view ? (
          <div className='grid gap-6 xl:grid-cols-4'>
            <Skeleton className='h-[460px] xl:col-span-3' />
            <Skeleton className='h-[460px] xl:col-span-1' />
          </div>
        ) : (
          <div className='grid gap-6 xl:grid-cols-4'>
            {/* Coluna Esquerda (3/4): Planilha de Despesas + Tabela de Receitas */}
            <div className='space-y-6 xl:col-span-3'>
              <Card className='overflow-hidden'>
                <CardContent className='p-0'>
                  <div className='max-h-[580px] overflow-auto'>
                    <table className='w-full border-collapse text-xs'>
                      <thead className='sticky top-0 z-20 bg-muted/95 backdrop-blur-sm'>
                        <tr className='border-b text-left font-bold tracking-wide uppercase'>
                          <th className='sticky left-0 z-30 min-w-[210px] border-r bg-muted/95 px-3 py-2.5'>
                            CONTA / GASTO
                          </th>
                          {view.weeks.map((w) => (
                            <th
                              key={w.index}
                              className='min-w-[112px] border-r px-2.5 py-2 text-right'
                            >
                              <div>{w.label}</div>
                              <div className='text-[10px] font-normal text-muted-foreground'>
                                {w.shortRange}
                              </div>
                            </th>
                          ))}
                          <th className='min-w-[105px] border-r px-2.5 py-2.5 text-center'>
                            PAGO
                          </th>
                          <th className='min-w-[115px] border-r bg-primary/15 px-3 py-2.5 text-right text-primary'>
                            TOTAL
                          </th>
                          <th className='w-28 px-2 py-2.5 text-center'>
                            AÇÕES
                          </th>
                        </tr>
                      </thead>

                      <tbody className='divide-y'>
                        {filteredExpenseRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={view.weeks.length + 4}
                              className='py-14 text-center text-sm text-muted-foreground'
                            >
                              Nenhum gasto registrado em{' '}
                              <strong>{formatCompetenceMonthPtBr(month)}</strong>.
                              Clique em <strong>&ldquo;Nova Linha de Gasto&rdquo;</strong>{' '}
                              para começar a preencher a planilha.
                            </td>
                          </tr>
                        ) : (
                          filteredExpenseRows.map((row, rowIdx) => {
                            const statusInfo =
                              STATUS_BADGE_MAP[row.paymentStatus] ||
                              STATUS_BADGE_MAP.PENDING
                            const isRowPaid =
                              row.totalCents > 0 && row.paymentStatus === 'PAID'
                            const rowHighlightBg = row.highlightColor
                              ? `${row.highlightColor}22`
                              : undefined

                            return (
                              <tr
                                key={row.rowKey}
                                className={`transition-colors hover:bg-muted/30 ${
                                  !rowHighlightBg && isRowPaid
                                    ? 'bg-emerald-500/[0.04]'
                                    : ''
                                }`}
                                style={
                                  rowHighlightBg
                                    ? { backgroundColor: rowHighlightBg }
                                    : undefined
                                }
                              >
                                {/* CONTA / GASTO */}
                                <td
                                  onClick={() => openEditRowModal(row)}
                                  className='sticky left-0 z-10 cursor-pointer border-r bg-card px-3 py-2 hover:bg-muted/50'
                                  style={
                                    row.highlightColor
                                      ? {
                                          borderLeft: `4px solid ${row.highlightColor}`,
                                          backgroundImage: `linear-gradient(${row.highlightColor}24, ${row.highlightColor}24)`,
                                        }
                                      : undefined
                                  }
                                  title='Clique para editar nome, categoria ou cor de destaque'
                                >
                                  <div className='flex items-center gap-2'>
                                    <span
                                      className='h-2.5 w-2.5 shrink-0 rounded-full'
                                      style={{
                                        backgroundColor: row.categoryColor,
                                      }}
                                    />
                                    <div className='min-w-0 flex-1'>
                                      <div className='truncate font-semibold text-foreground'>
                                        {row.name}
                                      </div>
                                      <div className='truncate text-[10px] text-muted-foreground'>
                                        {row.categoryName}
                                      </div>
                                    </div>
                                  </div>
                                </td>

                                {/* SEMANAS 1..5 */}
                                {view.weeks.map((w) => {
                                  const cell = row.weeks[w.index]
                                  const isEditing =
                                    editingCell?.rowKey === row.rowKey &&
                                    editingCell?.weekIndex === w.index
                                  const cellKey = `${row.rowKey}:${w.index}`
                                  const isHighlighted =
                                    recentlyEditedKey === cellKey
                                  const multiCount =
                                    cell?.transactions.length ?? 0

                                  return (
                                    <td
                                      key={w.index}
                                      onClick={() =>
                                        !isEditing && handleCellClick(row, w)
                                      }
                                      className={`cursor-pointer border-r px-2 py-1.5 text-right transition-colors ${
                                        isEditing
                                          ? 'bg-primary/15 p-1'
                                          : isHighlighted
                                            ? 'bg-emerald-500/20'
                                            : 'hover:bg-primary/10'
                                      }`}
                                      title={
                                        multiCount > 1
                                          ? `${multiCount} lançamentos nesta semana — clique para ver detalhes`
                                          : 'Clique para editar o valor desta semana'
                                      }
                                    >
                                      {isEditing ? (
                                        <div className='space-y-1'>
                                          <Input
                                            autoFocus
                                            value={editingCell.value}
                                            onChange={(e) =>
                                              setEditingCell({
                                                ...editingCell,
                                                value: e.target.value,
                                              })
                                            }
                                            onPaste={(e) =>
                                              handleCellPaste(e, row, w.index)
                                            }
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                e.preventDefault()
                                                commitInlineEdit(
                                                  row,
                                                  w,
                                                  editingCell.value,
                                                  editingCell.date,
                                                  false
                                                )
                                              } else if (e.key === 'Tab') {
                                                e.preventDefault()
                                                commitInlineEdit(
                                                  row,
                                                  w,
                                                  editingCell.value,
                                                  editingCell.date,
                                                  true
                                                )
                                              } else if (e.key === 'Escape') {
                                                setEditingCell(null)
                                              }
                                            }}
                                            onBlur={() =>
                                              commitInlineEdit(
                                                row,
                                                w,
                                                editingCell.value,
                                                editingCell.date,
                                                false
                                              )
                                            }
                                            placeholder='0,00'
                                            className='h-7 text-right text-xs font-semibold'
                                          />
                                        </div>
                                      ) : cell && cell.totalCents > 0 ? (
                                        <div className='flex items-center justify-end gap-1'>
                                          {multiCount > 1 && (
                                            <Badge
                                              variant='secondary'
                                              className='h-4 gap-0.5 px-1 text-[9px]'
                                            >
                                              <Layers className='h-2.5 w-2.5' />
                                              {multiCount}
                                            </Badge>
                                          )}
                                          <span className='font-medium'>
                                            {formatCentsToBrl(cell.totalCents)}
                                          </span>
                                        </div>
                                      ) : (
                                        <span className='text-muted-foreground/35'>
                                          —
                                        </span>
                                      )}
                                    </td>
                                  )
                                })}

                                {/* COLUNA PAGO */}
                                <td className='border-r px-2 py-1.5 text-center'>
                                  {row.totalCents > 0 ? (
                                    <button
                                      type='button'
                                      onClick={() => openPaymentModal(row)}
                                      className='inline-flex flex-col items-center gap-0.5'
                                      title='Clique para marcar como paga ou registrar pagamento parcial'
                                    >
                                      <Badge
                                        variant='outline'
                                        className={`cursor-pointer px-1.5 py-0 text-[10px] ${statusInfo.className}`}
                                      >
                                        {row.paymentStatus === 'PAID' ? (
                                          <CheckCircle2 className='mr-1 h-3 w-3' />
                                        ) : (
                                          <Clock className='mr-1 h-3 w-3' />
                                        )}
                                        {statusInfo.label}
                                      </Badge>
                                      {row.paymentStatus === 'PARTIAL' && (
                                        <span className='text-[9px] text-muted-foreground'>
                                          Pago {formatCentsToBrl(row.paidCents)}
                                        </span>
                                      )}
                                    </button>
                                  ) : (
                                    <span className='text-muted-foreground/35'>
                                      —
                                    </span>
                                  )}
                                </td>

                                {/* COLUNA TOTAL */}
                                <td className='border-r bg-primary/[0.06] px-3 py-2 text-right font-bold'>
                                  {row.totalCents > 0
                                    ? formatCentsToBrl(row.totalCents)
                                    : 'R$ 0,00'}
                                </td>

                                {/* AÇÕES DA LINHA */}
                                <td className='px-1.5 py-1.5 text-center'>
                                  <div className='flex items-center justify-center gap-0.5'>
                                    <Button
                                      variant='ghost'
                                      size='icon'
                                      className='h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-25'
                                      disabled={rowIdx === 0 || Boolean(searchQuery.trim())}
                                      onClick={() =>
                                        handleMoveRow(row.rowKey, -1)
                                      }
                                      title='Mover para cima'
                                    >
                                      <ArrowUp className='h-3 w-3' />
                                    </Button>
                                    <Button
                                      variant='ghost'
                                      size='icon'
                                      className='h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-25'
                                      disabled={
                                        rowIdx === filteredExpenseRows.length - 1 ||
                                        Boolean(searchQuery.trim())
                                      }
                                      onClick={() =>
                                        handleMoveRow(row.rowKey, 1)
                                      }
                                      title='Mover para baixo'
                                    >
                                      <ArrowDown className='h-3 w-3' />
                                    </Button>
                                    <Button
                                      variant='ghost'
                                      size='icon'
                                      className='h-6 w-6 text-muted-foreground hover:text-primary'
                                      onClick={() => openEditRowModal(row)}
                                      title='Editar nome, categoria e cor da linha'
                                    >
                                      <Pencil className='h-3 w-3' />
                                    </Button>
                                    <Button
                                      variant='ghost'
                                      size='icon'
                                      className='h-6 w-6 text-muted-foreground hover:text-destructive'
                                      onClick={() => setRowToDelete(row)}
                                      title='Excluir linha'
                                    >
                                      <Trash2 className='h-3 w-3' />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>

                      {/* Rodapé Fixo de Totais por Semana */}
                      <tfoot className='sticky bottom-0 z-20 border-t-2 bg-muted/95 font-bold backdrop-blur-sm'>
                        <tr>
                          <td className='sticky left-0 z-30 border-r bg-muted/95 px-3 py-2.5 uppercase'>
                            TOTAL POR SEMANA
                          </td>
                          {view.weeks.map((w) => (
                            <td
                              key={w.index}
                              className='border-r px-2.5 py-2.5 text-right'
                            >
                              {formatCentsToBrl(
                                view.summary.weeklyTotalsCents[w.index] || 0
                              )}
                            </td>
                          ))}
                          <td className='border-r px-2.5 py-2.5 text-center text-emerald-500'>
                            {formatCentsToBrl(view.summary.totalPaidCents)}
                          </td>
                          <td className='border-r bg-primary/20 px-3 py-2.5 text-right text-primary'>
                            {formatCentsToBrl(view.summary.totalExpensesCents)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Tabela de Entradas de Receita */}
              <IncomeTableSection
                month={month}
                incomeRows={view.incomeRows}
                bankAccounts={bankAccounts}
                categories={categories}
                onChanged={() => {
                  loadSpreadsheet(true)
                  triggerRefresh()
                }}
              />
            </div>

            {/* Coluna Direita (1/4): Painel de Resumo Financeiro + Cartões + Reservas */}
            <div className='xl:col-span-1'>
              <SpreadsheetSummaryPanel
                summary={view.summary}
                reserves={reserves}
                creditCardBreakdown={view.creditCardBreakdown || []}
                totalCreditCardCents={view.totalCreditCardCents || 0}
                onReservesChanged={() => loadSpreadsheet(true)}
              />
            </div>
          </div>
        )}
      </Main>

      {/* Modal de Nova Linha de Gasto (diferenciando Nome do Gasto vs Categoria) */}
      <Dialog open={newRowModalOpen} onOpenChange={setNewRowModalOpen}>
        <DialogContent className='sm:max-w-[440px]'>
          <DialogHeader>
            <DialogTitle>Adicionar Nova Linha na Planilha</DialogTitle>
            <DialogDescription>
              Diferencie o nome do gasto (ex: Condomínio, Combustível) da sua
              categoria (ex: Moradia, Transporte).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateRow} className='space-y-4'>
            <div className='space-y-1.5'>
              <Label>Nome do Gasto / Conta</Label>
              <Input
                placeholder='Ex: Condomínio, Energia elétrica, Combustível'
                value={newRowName}
                onChange={(e) => setNewRowName(e.target.value)}
                required
              />
            </div>

            <div className='space-y-2'>
              <div className='flex items-center justify-between'>
                <Label>Categoria do Finance AI</Label>
                <Button
                  type='button'
                  variant='link'
                  size='sm'
                  className='h-auto p-0 text-xs'
                  onClick={() => setCreateNewCategoryMode((v) => !v)}
                >
                  {createNewCategoryMode
                    ? 'Escolher categoria existente'
                    : '+ Criar nova categoria'}
                </Button>
              </div>

              {createNewCategoryMode ? (
                <div className='flex items-center gap-2'>
                  <Input
                    placeholder='Nome da nova categoria'
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    required
                  />
                  <Input
                    type='color'
                    value={newCategoryColor}
                    onChange={(e) => setNewCategoryColor(e.target.value)}
                    className='h-9 w-12 p-1'
                  />
                </div>
              ) : (
                <Select
                  value={newRowCategoryId}
                  onValueChange={setNewRowCategoryId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Selecione a categoria' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='NONE'>Sem categoria</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className='space-y-2'>
              <Label>Cor de Destaque da Linha (opcional)</Label>
              <div className='flex flex-wrap items-center gap-2'>
                {HIGHLIGHT_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type='button'
                    onClick={() => setNewRowHighlightColor(preset.value)}
                    title={preset.label}
                    className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-transform hover:scale-110 ${
                      newRowHighlightColor === preset.value
                        ? 'border-foreground ring-2 ring-primary/40'
                        : 'border-muted-foreground/30'
                    }`}
                    style={{
                      backgroundColor: preset.value || 'transparent',
                    }}
                  >
                    {!preset.value && (
                      <span className='text-[10px] font-bold text-muted-foreground'>
                        ✕
                      </span>
                    )}
                  </button>
                ))}
                <Input
                  type='color'
                  value={newRowHighlightColor || '#d946ef'}
                  onChange={(e) => setNewRowHighlightColor(e.target.value)}
                  className='h-7 w-9 cursor-pointer p-0.5'
                  title='Escolher outra cor personalizada'
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setNewRowModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button type='submit'>Adicionar Linha</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Detalhamento de Célula Multi-Transação (evita alteração silenciosa de agregados) */}
      <Dialog
        open={Boolean(cellDetailModal)}
        onOpenChange={(open) => !open && setCellDetailModal(null)}
      >
        <DialogContent className='sm:max-w-[540px]'>
          <DialogHeader>
            <DialogTitle>
              {cellDetailModal?.row.name} — {cellDetailModal?.week.label} (
              {cellDetailModal?.week.shortRange})
            </DialogTitle>
            <DialogDescription>
              Esta célula agrupa múltiplos lançamentos reais. Revise ou exclua
              itens individualmente, ou adicione um novo lançamento de ajuste
              com a data real.
            </DialogDescription>
          </DialogHeader>

          <div className='max-h-60 divide-y overflow-y-auto rounded-lg border'>
            {cellDetailModal?.row.weeks[
              cellDetailModal.week.index
            ]?.transactions.map((tx: SpreadsheetTransactionInput) => (
              <div
                key={tx.id}
                className='flex items-center justify-between px-3 py-2 text-xs'
              >
                <div>
                  <div className='font-medium'>{tx.description}</div>
                  <div className='text-[11px] text-muted-foreground'>
                    {new Date(tx.date).toLocaleDateString('pt-BR', {
                      timeZone: 'UTC',
                    })}{' '}
                    • Origem: {tx.origin || 'MANUAL'}
                  </div>
                </div>
                <div className='flex items-center gap-2'>
                  <span className='font-semibold text-rose-500'>
                    {formatCentsToBrl(tx.amountCents)}
                  </span>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='h-6 w-6 text-muted-foreground hover:text-destructive'
                    onClick={() => handleDeleteTxFromCell(tx.id)}
                  >
                    <Trash2 className='h-3.5 w-3.5' />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={handleAddAdjustmentToCell}
            className='space-y-3 rounded-lg border bg-muted/30 p-3'
          >
            <p className='text-xs font-semibold'>
              Adicionar novo lançamento / ajuste nesta semana:
            </p>
            <div className='grid gap-2 sm:grid-cols-3'>
              <Input
                placeholder='Descrição'
                value={adjustDesc}
                onChange={(e) => setAdjustDesc(e.target.value)}
                className='h-8 text-xs'
              />
              <Input
                placeholder='Valor R$ (ex: 50,00)'
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                className='h-8 text-xs'
                required
              />
              <Input
                type='date'
                value={adjustDate}
                onChange={(e) => setAdjustDate(e.target.value)}
                className='h-8 text-xs'
                required
              />
            </div>
            <div className='flex justify-end'>
              <Button type='submit' size='sm' className='h-8 text-xs'>
                + Adicionar Lançamento
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Controle de Pagamento (Total / Pendente / Parcial) */}
      <Dialog
        open={Boolean(paymentModalRow)}
        onOpenChange={(open) => !open && setPaymentModalRow(null)}
      >
        <DialogContent className='sm:max-w-[440px]'>
          <DialogHeader>
            <DialogTitle>
              Controle de Pagamento — {paymentModalRow?.name}
            </DialogTitle>
            <DialogDescription>
              Marcar como pago atualiza apenas o status da obrigação existente,
              sem gerar uma segunda despesa.
            </DialogDescription>
          </DialogHeader>

          {paymentModalRow && (
            <div className='space-y-4'>
              <div className='grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 p-3 text-center text-xs'>
                <div>
                  <p className='text-muted-foreground'>Total</p>
                  <p className='font-bold'>
                    {formatCentsToBrl(paymentModalRow.totalCents)}
                  </p>
                </div>
                <div>
                  <p className='text-muted-foreground'>Pago</p>
                  <p className='font-bold text-emerald-500'>
                    {formatCentsToBrl(paymentModalRow.paidCents)}
                  </p>
                </div>
                <div>
                  <p className='text-muted-foreground'>Restante</p>
                  <p className='font-bold text-amber-500'>
                    {formatCentsToBrl(paymentModalRow.pendingCents)}
                  </p>
                </div>
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div className='space-y-1'>
                  <Label className='text-xs'>Valor Pago (Parcial / Total)</Label>
                  <Input
                    value={partialPaidInput}
                    onChange={(e) => setPartialPaidInput(e.target.value)}
                    placeholder='Ex: 300,00'
                  />
                </div>
                <div className='space-y-1'>
                  <Label className='text-xs'>Data do Pagamento</Label>
                  <Input
                    type='date'
                    value={paidDateInput}
                    onChange={(e) => setPaidDateInput(e.target.value)}
                  />
                </div>
              </div>

              <div className='flex flex-wrap justify-between gap-2 pt-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => handlePaymentUpdate('UNPAID')}
                  className='text-xs'
                >
                  Marcar Pendente
                </Button>
                <div className='flex gap-2'>
                  <Button
                    variant='secondary'
                    size='sm'
                    onClick={() => handlePaymentUpdate('PARTIAL')}
                    className='text-xs'
                  >
                    Salvar Valor Parcial
                  </Button>
                  <Button
                    size='sm'
                    onClick={() => handlePaymentUpdate('FULL')}
                    className='bg-emerald-600 text-xs hover:bg-emerald-700'
                  >
                    Marcar 100% Paga
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Edição do Nome do Gasto e Categoria */}
      <Dialog
        open={Boolean(editingRow)}
        onOpenChange={(open) => !open && setEditingRow(null)}
      >
        <DialogContent className='sm:max-w-[440px]'>
          <DialogHeader>
            <DialogTitle>Editar Nome do Gasto</DialogTitle>
            <DialogDescription>
              Renomeie o gasto ou altere a categoria vinculada. A alteração
              reflete automaticamente na Planilha, Transações e Dashboard.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveRowEdit} className='space-y-4'>
            <div className='space-y-1.5'>
              <Label>Nome do Gasto / Conta</Label>
              <Input
                value={editRowName}
                onChange={(e) => setEditRowName(e.target.value)}
                placeholder='Ex: Condomínio, Vivo Fibra, Combustível'
                required
              />
            </div>

            <div className='space-y-1.5'>
              <Label>Categoria</Label>
              <Select
                value={editRowCategoryId}
                onValueChange={setEditRowCategoryId}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Selecione a categoria' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='NONE'>Sem categoria</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='flex items-start gap-2 rounded-lg border bg-muted/40 p-2.5'>
              <input
                id='sync-as-category'
                type='checkbox'
                checked={editRowSyncAsCategory}
                onChange={(e) => setEditRowSyncAsCategory(e.target.checked)}
                className='mt-0.5 h-4 w-4 cursor-pointer accent-primary'
              />
              <label
                htmlFor='sync-as-category'
                className='cursor-pointer text-xs leading-snug'
              >
                <strong>Salvar como categoria padrão do sistema</strong>
                <span className='block text-[11px] text-muted-foreground'>
                  Cria/vincula este nome em Categorias para aparecer nos filtros
                  de Importação de Prints/Extratos, Transações e Dashboard.
                </span>
              </label>
            </div>

            <div className='space-y-2'>
              <Label>Cor de Destaque da Linha (estilo Excel)</Label>
              <div className='flex flex-wrap items-center gap-2'>
                {HIGHLIGHT_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type='button'
                    onClick={() => setEditRowHighlightColor(preset.value)}
                    title={preset.label}
                    className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-transform hover:scale-110 ${
                      editRowHighlightColor === preset.value
                        ? 'border-foreground ring-2 ring-primary/40'
                        : 'border-muted-foreground/30'
                    }`}
                    style={{
                      backgroundColor: preset.value || 'transparent',
                    }}
                  >
                    {!preset.value && (
                      <span className='text-[10px] font-bold text-muted-foreground'>
                        ✕
                      </span>
                    )}
                  </button>
                ))}
                <Input
                  type='color'
                  value={editRowHighlightColor || '#d946ef'}
                  onChange={(e) => setEditRowHighlightColor(e.target.value)}
                  className='h-7 w-9 cursor-pointer p-0.5'
                  title='Escolher outra cor personalizada'
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setEditingRow(null)}
              >
                Cancelar
              </Button>
              <Button type='submit'>Salvar Alteração</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Importação de Histórico de Planilhas (Excel, CSV ou Print) */}
      <ImportSpreadsheetModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        defaultMonth={month}
        onImported={(monthsSaved) => {
          if (monthsSaved.length > 0 && !monthsSaved.includes(month)) {
            setMonth(monthsSaved[monthsSaved.length - 1])
          }
          loadSpreadsheet(true)
          triggerRefresh()
        }}
      />

      {/* Confirmação de Exclusão de Linha */}
      <AlertDialog
        open={Boolean(rowToDelete)}
        onOpenChange={(open) => !open && setRowToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir a linha &ldquo;{rowToDelete?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá a linha e seus{' '}
              <strong>{rowToDelete?.transactions.length || 0} lançamento(s)</strong>{' '}
              em {formatCompetenceMonthPtBr(month)}, recalculando a planilha e o
              Dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteRow}>
              Confirmar Exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
