'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileImage,
  FileText,
  FolderOpen,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  formatCompetenceMonthPtBr,
  usePeriod,
} from '@/context/period-provider'
import { formatCentsToBrl, parseBrlToCents } from '@/lib/finance/money'
import { extractMerchantPattern } from '@/lib/finance/category-rules'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { CategoryFilterEditorDialog } from '@/features/categories/category-filter-editor-dialog'

interface CategoryOption {
  id: string
  name: string
  type: string
}

interface BankOption {
  id: string
  name: string
  institution: string
}

interface CardOption {
  id: string
  name: string
  institution: string
}

interface ReviewRow {
  localId: string
  selected: boolean
  date: string
  description: string
  merchant: string
  amountInput: string
  amountCents: number
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'INVOICE_PAYMENT' | 'REFUND'
  categoryId: string
  suggestedCategory: string
  installmentNumber: number | null
  totalInstallments: number | null
  generateRemainingInstallments: boolean
  needsReview: boolean
  reviewReason: string | null
  isDuplicate: boolean
  duplicateReason: string | null
}

interface ImportHistoryBatch {
  id: string
  sourceName: string
  referenceMonth: string
  imageCount: number
  status: string
  providerUsed: string
  createdAt: string
  bankAccountId?: string | null
  creditCardId?: string | null
  transactions?: Array<{
    competenceMonth: string
    type: string
    amountCents: number
  }>
  _count: {
    extractedItems: number
    transactions: number
  }
}

interface ImportStats {
  lastImportBatch: {
    id: string
    sourceName: string
    createdAt: string
    providerUsed: string
    status: string
    transactionCount: number
  } | null
  lastExpense: {
    id: string
    date: string
    description: string
    amountCents: number
    competenceMonth: string
  } | null
  lastTransaction: {
    id: string
    date: string
    description: string
    amountCents: number
    type: string
    competenceMonth: string
  } | null
  recentTransactions?: Array<{
    id: string
    date: string
    description: string
    amountCents: number
    type: string
    competenceMonth: string
    category?: { name: string; color: string } | null
  }>
}

const TRANSACTION_TYPE_LABELS: Record<ReviewRow['type'], string> = {
  EXPENSE: 'Despesa',
  INCOME: 'Receita',
  TRANSFER: 'Transferência Própria',
  INVOICE_PAYMENT: 'Pagto. de Fatura',
  REFUND: 'Estorno / Reembolso',
}

const ACCEPTED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'application/pdf',
]

export function ImportPageView() {
  const { month, setMonth, triggerRefresh } = usePeriod()
  const [files, setFiles] = useState<File[]>([])
  const [rawStatementText, setRawStatementText] = useState<string>('')
  const [accountHolderName, setAccountHolderName] = useState<string>('')
  const [statementOwner, setStatementOwner] = useState<
    'AUTO' | 'JOHN' | 'VIVIANE'
  >('AUTO')
  const [activeOwnerTag, setActiveOwnerTag] = useState<string | null>(null)
  const [referenceMonth, setReferenceMonth] = useState<string>(month)
  const [bankAccountId, setBankAccountId] = useState<string>('NONE')
  const [creditCardId, setCreditCardId] = useState<string>('NONE')
  const [sourceName, setSourceName] = useState<string>('')
  const [apiKey, setApiKey] = useState<string>('')

  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [banks, setBanks] = useState<BankOption[]>([])
  const [cards, setCards] = useState<CardOption[]>([])
  const [history, setHistory] = useState<ImportHistoryBatch[]>([])
  const [importStats, setImportStats] = useState<ImportStats | null>(null)
  const [dateSortOrder, setDateSortOrder] = useState<'desc' | 'asc'>('desc')

  const [extracting, setExtracting] = useState<boolean>(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null)
  const [activeBatchName, setActiveBatchName] = useState<string>('')
  const [isEditingExistingBatch, setIsEditingExistingBatch] =
    useState<boolean>(false)
  const [providerUsed, setProviderUsed] = useState<string>('')
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([])
  const [reviewMonthFilter, setReviewMonthFilter] = useState<string>('ALL')
  const [saving, setSaving] = useState<boolean>(false)
  const [batchToDelete, setBatchToDelete] =
    useState<ImportHistoryBatch | null>(null)
  const [catEditorOpen, setCatEditorOpen] = useState<boolean>(false)

  useEffect(() => {
    setReferenceMonth(month)
  }, [month])

  const loadMetadata = async () => {
    try {
      const [catRes, accRes, impRes] = await Promise.all([
        fetch('/api/categories', { cache: 'no-store' }),
        fetch('/api/accounts', { cache: 'no-store' }),
        fetch('/api/imports', { cache: 'no-store' }),
      ])
      if (catRes.ok) {
        const cJson = await catRes.json()
        setCategories(cJson.categories || [])
      }
      if (accRes.ok) {
        const aJson = await accRes.json()
        setBanks(aJson.bankAccounts || [])
        setCards(aJson.creditCards || [])
      }
      if (impRes.ok) {
        const iJson = await impRes.json()
        setHistory(iJson.batches || [])
        setImportStats(iJson.stats || null)
      }
    } catch {
      // ignore metadata load error
    }
  }

  useEffect(() => {
    loadMetadata()
  }, [])

  const isSupportedFile = (f: File) =>
    ACCEPTED_MIME_TYPES.includes(f.type) ||
    f.name.toLowerCase().endsWith('.pdf')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    const selected = Array.from(e.target.files).filter(isSupportedFile)
    setFiles((prev) => [...prev, ...selected])
    setExtractError(null)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (!e.dataTransfer.files) return
    const dropped = Array.from(e.dataTransfer.files).filter(isSupportedFile)
    if (dropped.length === 0) {
      toast.error('Envie arquivos PDF, PNG, JPG, JPEG ou WEBP.')
      return
    }
    setFiles((prev) => [...prev, ...dropped])
    setExtractError(null)
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  // Agrupamento automático das linhas da revisão por Mês/Ano (YYYY-MM) com base na data real de cada linha
  const monthBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { count: number; expenseCents: number; incomeCents: number }
    >()
    for (const r of reviewRows) {
      const m = r.date.slice(0, 7)
      if (!/^\d{4}-\d{2}$/.test(m)) continue
      const current = map.get(m) || {
        count: 0,
        expenseCents: 0,
        incomeCents: 0,
      }
      current.count += 1
      if (r.selected) {
        if (r.type === 'EXPENSE') current.expenseCents += r.amountCents
        if (r.type === 'INCOME') current.incomeCents += r.amountCents
      }
      map.set(m, current)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([monthCode, stats]) => ({
        monthCode,
        ...stats,
      }))
  }, [reviewRows])

  const visibleReviewRows = useMemo(() => {
    const filtered =
      reviewMonthFilter === 'ALL'
        ? reviewRows
        : reviewRows.filter((r) => r.date.slice(0, 7) === reviewMonthFilter)
    return [...filtered].sort((a, b) =>
      dateSortOrder === 'desc'
        ? b.date.localeCompare(a.date)
        : a.date.localeCompare(b.date)
    )
  }, [reviewRows, reviewMonthFilter, dateSortOrder])

  const handleExtract = async (mode: 'FILES' | 'TEXT') => {
    if (mode === 'FILES' && files.length === 0) {
      toast.error('Selecione ao menos um PDF ou screenshot bancário.')
      return
    }
    if (mode === 'TEXT' && !rawStatementText.trim()) {
      toast.error('Cole o texto do extrato PDF do Itaú/banco para analisar.')
      return
    }

    setExtracting(true)
    setExtractError(null)

    try {
      const formData = new FormData()
      if (mode === 'FILES') {
        for (const f of files) {
          formData.append('images', f)
        }
      } else {
        formData.append('rawStatementText', rawStatementText)
      }
      formData.append('referenceMonth', referenceMonth)
      formData.append('statementOwner', statementOwner)
      if (accountHolderName.trim()) {
        formData.append('accountHolderName', accountHolderName.trim())
      }
      if (bankAccountId !== 'NONE')
        formData.append('bankAccountId', bankAccountId)
      if (creditCardId !== 'NONE') formData.append('creditCardId', creditCardId)
      if (sourceName.trim()) formData.append('sourceName', sourceName.trim())
      if (apiKey.trim()) formData.append('apiKey', apiKey.trim())

      const res = await fetch('/api/ai/extract', {
        method: 'POST',
        body: formData,
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Falha ao processar documento.')
      }

      const batch = json.batch
      setActiveBatchId(batch.id)
      setActiveBatchName(batch.sourceName)
      setIsEditingExistingBatch(false)
      setProviderUsed(json.provider || 'IA Multimodal')
      setActiveOwnerTag(json.ownerTag || null)
      setReviewMonthFilter('ALL')
      if (json.accountHolderName && !accountHolderName) {
        setAccountHolderName(json.accountHolderName)
      }

      const rows: ReviewRow[] = (batch.extractedItems || []).map(
        (item: {
          id: string
          selected: boolean
          resolvedDate: string
          description: string
          merchant: string | null
          amountCents: number
          type: ReviewRow['type']
          categoryId: string | null
          suggestedCategory: string | null
          installmentNumber: number | null
          totalInstallments: number | null
          needsReview: boolean
          reviewReason: string | null
          isDuplicate: boolean
          duplicateReason: string | null
        }) => ({
          localId: item.id,
          selected: item.selected,
          date: new Date(item.resolvedDate).toISOString().slice(0, 10),
          description: item.description,
          merchant: item.merchant || '',
          amountInput: (item.amountCents / 100).toFixed(2).replace('.', ','),
          amountCents: item.amountCents,
          type: item.type,
          categoryId: item.categoryId || 'NONE',
          suggestedCategory: item.suggestedCategory || 'Outros gastos',
          installmentNumber: item.installmentNumber,
          totalInstallments: item.totalInstallments,
          generateRemainingInstallments: false,
          needsReview: item.needsReview,
          reviewReason: item.reviewReason,
          isDuplicate: item.isDuplicate,
          duplicateReason: item.duplicateReason,
        })
      )

      setReviewRows(rows)
      loadMetadata()

      if (rows.length === 0) {
        toast.warning(
          'Nenhuma transação financeira foi identificada no documento enviado.'
        )
      } else {
        const distinctMonths = new Set(rows.map((r) => r.date.slice(0, 7)))
        toast.success(
          `${rows.length} movimentações extraídas e separadas em ${distinctMonths.size} mês(es) pela data real!`
        )
      }
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : 'Erro ao processar o documento.'
      setExtractError(msg)
      toast.error(msg)
    } finally {
      setExtracting(false)
    }
  }

  // Reabrir um extrato já importado ou pendente do histórico para editar transações, adicionar novas ou mudar de Receita/Transferência para Despesa
  const handleReopenBatchForEdit = async (batchId: string) => {
    try {
      const res = await fetch(`/api/imports?id=${batchId}`)
      if (!res.ok) throw new Error('Não foi possível abrir o extrato.')
      const { batch } = await res.json()

      setActiveBatchId(batch.id)
      setActiveBatchName(batch.sourceName)
      setProviderUsed(batch.providerUsed || 'Extrato Reaberto')
      setBankAccountId(batch.bankAccountId || 'NONE')
      setCreditCardId(batch.creditCardId || 'NONE')
      setReviewMonthFilter('ALL')

      // Se o lote já havia sido confirmado e tem transações salvas, carregamos as transações reais dele para edição!
      // Caso contrário, carregamos os extractedItems originais.
      if (batch.transactions && batch.transactions.length > 0) {
        setIsEditingExistingBatch(true)
        const rows: ReviewRow[] = batch.transactions.map(
          (tx: {
            id: string
            date: string
            description: string
            merchant: string | null
            amountCents: number
            type: ReviewRow['type']
            categoryId: string | null
            category?: { name: string } | null
            installmentNumber: number | null
            totalInstallments: number | null
          }) => ({
            localId: tx.id,
            selected: true,
            date: new Date(tx.date).toISOString().slice(0, 10),
            description: tx.description,
            merchant: tx.merchant || '',
            amountInput: (tx.amountCents / 100).toFixed(2).replace('.', ','),
            amountCents: tx.amountCents,
            type: tx.type,
            categoryId: tx.categoryId || 'NONE',
            suggestedCategory: tx.category?.name || 'Outros gastos',
            installmentNumber: tx.installmentNumber,
            totalInstallments: tx.totalInstallments,
            generateRemainingInstallments: false,
            needsReview: false,
            reviewReason: null,
            isDuplicate: false,
            duplicateReason: null,
          })
        )
        setReviewRows(rows)
        toast.info(
          `Extrato "${batch.sourceName}" reaberto com ${rows.length} lançamentos para edição!`
        )
      } else if (batch.extractedItems && batch.extractedItems.length > 0) {
        setIsEditingExistingBatch(false)
        const rows: ReviewRow[] = batch.extractedItems.map(
          (item: {
            id: string
            selected: boolean
            resolvedDate: string
            description: string
            merchant: string | null
            amountCents: number
            type: ReviewRow['type']
            categoryId: string | null
            suggestedCategory: string | null
            installmentNumber: number | null
            totalInstallments: number | null
            needsReview: boolean
            reviewReason: string | null
            isDuplicate: boolean
            duplicateReason: string | null
          }) => ({
            localId: item.id,
            selected: true,
            date: new Date(item.resolvedDate).toISOString().slice(0, 10),
            description: item.description,
            merchant: item.merchant || '',
            amountInput: (item.amountCents / 100).toFixed(2).replace('.', ','),
            amountCents: item.amountCents,
            type: item.type,
            categoryId: item.categoryId || 'NONE',
            suggestedCategory: item.suggestedCategory || 'Outros gastos',
            installmentNumber: item.installmentNumber,
            totalInstallments: item.totalInstallments,
            generateRemainingInstallments: false,
            needsReview: item.needsReview,
            reviewReason: item.reviewReason,
            isDuplicate: false,
            duplicateReason: null,
          })
        )
        setReviewRows(rows)
        toast.info(
          `Extrato "${batch.sourceName}" carregado na tabela de revisão!`
        )
      } else {
        toast.warning('Este lote não possui lançamentos para editar.')
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Erro ao reabrir extrato para edição.'
      )
    }
  }

  // Adicionar nova linha manual diretamente dentro do extrato aberto na revisão
  const handleAddRowToCurrentExtract = () => {
    const defaultDate =
      reviewMonthFilter !== 'ALL'
        ? `${reviewMonthFilter}-05`
        : `${referenceMonth}-05`
    const newRow: ReviewRow = {
      localId: `manual-${Date.now()}`,
      selected: true,
      date: defaultDate,
      description: 'Nova Despesa no Extrato',
      merchant: '',
      amountInput: '0,00',
      amountCents: 0,
      type: 'EXPENSE',
      categoryId: 'NONE',
      suggestedCategory: 'Outros gastos',
      installmentNumber: null,
      totalInstallments: null,
      generateRemainingInstallments: false,
      needsReview: true,
      reviewReason: 'Preencha a descrição e o valor',
      isDuplicate: false,
      duplicateReason: null,
    }
    setReviewRows((prev) => [newRow, ...prev])
  }

  // Alterar o tipo contábil (ex: mudar todos os selecionados para Despesa)
  const handleBulkSetType = (newType: ReviewRow['type']) => {
    const visibleIds = new Set(visibleReviewRows.map((r) => r.localId))
    setReviewRows((prev) =>
      prev.map((row) =>
        row.selected && visibleIds.has(row.localId)
          ? { ...row, type: newType }
          : row
      )
    )
    toast.success(
      `Itens selecionados alterados para "${TRANSACTION_TYPE_LABELS[newType]}"!`
    )
  }

  const handleBulkSetCategory = (newCatId: string) => {
    const visibleIds = new Set(visibleReviewRows.map((r) => r.localId))
    setReviewRows((prev) =>
      prev.map((row) =>
        row.selected && visibleIds.has(row.localId)
          ? { ...row, categoryId: newCatId }
          : row
      )
    )
    const catName =
      categories.find((c) => c.id === newCatId)?.name || 'Sem categoria'
    toast.success(`Categoria dos selecionados alterada para "${catName}"!`)
  }

  const updateRow = (localId: string, patch: Partial<ReviewRow>) => {
    const targetRow = reviewRows.find((r) => r.localId === localId)

    // Se o usuário mudou a categoria de um lançamento, salvamos o padrão no banco e aplicamos para todos os lançamentos parecidos na tabela!
    if (
      targetRow &&
      patch.categoryId &&
      patch.categoryId !== 'NONE' &&
      patch.categoryId !== targetRow.categoryId
    ) {
      const targetPattern = extractMerchantPattern(targetRow.description)
      const catName =
        categories.find((c) => c.id === patch.categoryId)?.name || 'Categoria'

      if (targetPattern && targetPattern.length >= 3) {
        // Salva o padrão no banco para todos os futuros extratos
        fetch('/api/category-rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: targetRow.description,
            categoryId: patch.categoryId,
            transactionType: targetRow.type,
          }),
        }).catch(() => null)

        let propagatedCount = 0
        setReviewRows((prev) =>
          prev.map((row) => {
            if (row.localId === localId) {
              return { ...row, ...patch, suggestedCategory: catName }
            }
            const rowPattern = extractMerchantPattern(row.description)
            if (
              row.type === targetRow.type &&
              rowPattern === targetPattern &&
              row.categoryId !== patch.categoryId
            ) {
              propagatedCount++
              return {
                ...row,
                categoryId: patch.categoryId!,
                suggestedCategory: catName,
              }
            }
            return row
          })
        )

        toast.success(
          propagatedCount > 0
            ? `Categoria alterada para "${catName}" (+${propagatedCount} igual). Clique em "Confirmar e Salvar" para gravar na Planilha.`
            : `Categoria alterada para "${catName}" (regra aprendida). Clique em "Confirmar e Salvar" para gravar na Planilha.`
        )
        return
      }
    }

    setReviewRows((prev) =>
      prev.map((row) => {
        if (row.localId !== localId) return row
        const updated = { ...row, ...patch }
        if (patch.amountInput !== undefined) {
          const parsed = parseBrlToCents(patch.amountInput)
          updated.amountCents = parsed ?? 0
          if (parsed && parsed > 0) {
            updated.needsReview = false
          }
        }
        return updated
      })
    )
  }

  const removeRowFromReview = (localId: string) => {
    setReviewRows((prev) => prev.filter((r) => r.localId !== localId))
  }

  const handleConfirmImport = async () => {
    const selectedRows = reviewRows.filter((r) => r.selected)
    if (selectedRows.length === 0) {
      toast.error('Selecione ao menos uma transação na tabela para salvar.')
      return
    }

    const invalidAmount = selectedRows.find((r) => r.amountCents <= 0)
    if (invalidAmount) {
      toast.error(
        `Corrija o valor da transação "${invalidAmount.description}" antes de confirmar.`
      )
      return
    }

    setSaving(true)
    try {
      const payload = {
        batchId: activeBatchId,
        ownerTag: activeOwnerTag,
        replaceExistingBatchTransactions: isEditingExistingBatch,
        bankAccountId: bankAccountId !== 'NONE' ? bankAccountId : null,
        creditCardId: creditCardId !== 'NONE' ? creditCardId : null,
        items: selectedRows.map((r) => ({
          id: r.localId,
          date: r.date,
          description: r.description,
          merchant: r.merchant || null,
          amountCents: r.amountCents,
          type: r.type,
          categoryId: r.categoryId !== 'NONE' ? r.categoryId : null,
          bankAccountId: bankAccountId !== 'NONE' ? bankAccountId : null,
          creditCardId: creditCardId !== 'NONE' ? creditCardId : null,
          installmentNumber: r.installmentNumber,
          totalInstallments: r.totalInstallments,
          generateRemainingInstallments: r.generateRemainingInstallments,
        })),
      }

      const res = await fetch('/api/ai/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Falha ao salvar transações.')
      }

      const monthsList: string[] = json.monthsAffected || []
      const monthsFormatted = monthsList
        .map((m) => formatCompetenceMonthPtBr(m))
        .join(', ')

      toast.success(
        isEditingExistingBatch
          ? `Extrato atualizado! ${json.savedCount} transações salvas nos meses: ${monthsFormatted}.`
          : `${json.savedCount} transações salvas e organizadas nos meses: ${monthsFormatted}!`
      )

      // Se o extrato tiver lançamentos e o mês atual do topo não estiver entre eles, muda automaticamente o seletor global para o mês mais recente do extrato
      if (monthsList.length > 0 && !monthsList.includes(month)) {
        setMonth(monthsList[monthsList.length - 1])
      }

      setReviewRows([])
      setFiles([])
      setRawStatementText('')
      setActiveBatchId(null)
      setIsEditingExistingBatch(false)
      await loadMetadata()
      triggerRefresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Erro ao confirmar importação.'
      )
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteEntireBatch = async () => {
    if (!batchToDelete) return
    try {
      const res = await fetch(
        `/api/imports?id=${batchToDelete.id}&deleteTransactions=true`,
        { method: 'DELETE' }
      )
      if (res.ok) {
        toast.success(
          `Extrato "${batchToDelete.sourceName}" e todas as suas transações foram excluídos!`
        )
        if (activeBatchId === batchToDelete.id) {
          setReviewRows([])
          setActiveBatchId(null)
        }
        setBatchToDelete(null)
        triggerRefresh()
        loadMetadata()
      }
    } catch {
      toast.error('Erro ao excluir o extrato.')
    }
  }

  const handleClearHistoryLogsOnly = async () => {
    const res = await fetch('/api/imports', { method: 'DELETE' })
    if (res.ok) {
      toast.success(
        'Histórico de lotes limpo (as transações já salvas foram mantidas).'
      )
      setHistory([])
    }
  }

  const selectedCount = reviewRows.filter((r) => r.selected).length
  const duplicateCount = reviewRows.filter((r) => r.isDuplicate).length
  const reviewNeededCount = reviewRows.filter((r) => r.needsReview).length

  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-2'>
          <Sparkles className='h-4 w-4 text-primary' />
          <h1 className='text-sm font-semibold sm:text-base'>
            Importação de Extratos PDF e Prints Bancários (IA)
          </h1>
        </div>
      </Header>

      <Main className='space-y-6'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>
            Extração Multimodal de Extratos (PDF / Imagens) e Faturas
          </h2>
          <p className='text-sm text-muted-foreground'>
            Envie extratos PDF multipágina (mesmo com vários meses misturados:
            Setembro, Outubro, Novembro) ou prints. O sistema separa cada
            transação no seu respectivo mês pela data real, e você pode{' '}
            <strong>reabrir para editar</strong> ou{' '}
            <strong>excluir um extrato inteiro</strong> a qualquer momento.
          </p>
        </div>

        {/* Alerta quando há print/extrato pendente de confirmação */}
        {reviewRows.length === 0 &&
          importStats?.lastImportBatch?.status === 'PENDING_REVIEW' && (
            <Alert className='border-amber-500/50 bg-amber-500/10'>
              <AlertTriangle className='h-4 w-4 text-amber-500' />
              <AlertTitle className='text-sm font-bold text-amber-600 dark:text-amber-400'>
                Você tem um print/extrato aguardando confirmação!
              </AlertTitle>
              <AlertDescription className='mt-1 flex flex-wrap items-center justify-between gap-2 text-xs'>
                <span>
                  O envio{' '}
                  <strong>{importStats.lastImportBatch.sourceName}</strong>{' '}
                  ainda não foi salvo na Planilha nem nas Transações porque
                  faltou clicar em <strong>&ldquo;Confirmar e Salvar&rdquo;</strong>.
                </span>
                <Button
                  size='sm'
                  onClick={() =>
                    handleReopenBatchForEdit(importStats.lastImportBatch!.id)
                  }
                  className='h-8 gap-1.5 text-xs'
                >
                  <Check className='h-3.5 w-3.5' />
                  Abrir e Confirmar Agora
                </Button>
              </AlertDescription>
            </Alert>
          )}

        {/* Painel de Controle: Último Print/Extrato Enviado + Última Dívida/Despesa Registrada */}
        <div className='grid gap-4 sm:grid-cols-2'>
          <Card className='border-primary/25 bg-card/80'>
            <CardContent className='flex items-start gap-3 p-4'>
              <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'>
                <UploadCloud className='h-4 w-4' />
              </div>
              <div className='min-w-0 flex-1'>
                <p className='text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'>
                  Último Print / Extrato Enviado
                </p>
                {importStats?.lastImportBatch ? (
                  <>
                    <p className='mt-0.5 text-sm font-bold text-foreground'>
                      {new Date(
                        importStats.lastImportBatch.createdAt
                      ).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    <p className='truncate text-xs text-muted-foreground'>
                      {importStats.lastImportBatch.sourceName}
                    </p>
                  </>
                ) : (
                  <p className='mt-0.5 text-xs text-muted-foreground'>
                    Nenhum extrato ou print enviado ainda.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className='border-rose-500/25 bg-card/80'>
            <CardContent className='flex items-start gap-3 p-4'>
              <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500'>
                <Clock className='h-4 w-4' />
              </div>
              <div className='min-w-0 flex-1'>
                <p className='text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'>
                  Última Dívida / Despesa Lançada (Data Real)
                </p>
                {importStats?.lastExpense ? (
                  <>
                    <p className='mt-0.5 text-sm font-bold text-foreground'>
                      {new Date(importStats.lastExpense.date).toLocaleDateString(
                        'pt-BR',
                        { timeZone: 'UTC' }
                      )}{' '}
                      <span className='font-semibold text-rose-500'>
                        ({formatCentsToBrl(importStats.lastExpense.amountCents)})
                      </span>
                    </p>
                    <p className='truncate text-xs text-muted-foreground'>
                      {importStats.lastExpense.description}
                    </p>
                  </>
                ) : (
                  <p className='mt-0.5 text-xs text-muted-foreground'>
                    Nenhuma despesa registrada no sistema ainda.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Histórico Rápido: Últimas 5 Transações Salvas (por Data Real) */}
        {importStats?.recentTransactions &&
          importStats.recentTransactions.length > 0 && (
            <Card className='bg-card/80'>
              <CardHeader className='pb-2'>
                <CardTitle className='flex items-center gap-2 text-sm'>
                  <Calendar className='h-4 w-4 text-primary' />
                  Últimas 5 Transações Salvas no Sistema (por Data Real)
                </CardTitle>
                <CardDescription className='text-xs'>
                  Use esta referência para saber exatamente quais lançamentos já
                  estão salvos antes de enviar novos prints.
                </CardDescription>
              </CardHeader>
              <CardContent className='pt-0'>
                <div className='divide-y rounded-lg border'>
                  {importStats.recentTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      className='flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs'
                    >
                      <div className='flex min-w-0 items-center gap-2.5'>
                        <Badge
                          variant='outline'
                          className='shrink-0 font-mono text-[11px]'
                        >
                          {new Date(tx.date).toLocaleDateString('pt-BR', {
                            timeZone: 'UTC',
                          })}
                        </Badge>
                        <span className='truncate font-medium'>
                          {tx.description}
                        </span>
                        {tx.category && (
                          <Badge
                            variant='secondary'
                            className='hidden px-1.5 py-0 text-[10px] sm:inline-flex'
                          >
                            {tx.category.name}
                          </Badge>
                        )}
                      </div>
                      <span
                        className={`shrink-0 font-bold ${
                          tx.type === 'INCOME'
                            ? 'text-emerald-500'
                            : tx.type === 'TRANSFER'
                              ? 'text-muted-foreground'
                              : 'text-rose-500'
                        }`}
                      >
                        {tx.type === 'INCOME' ? '+' : tx.type === 'EXPENSE' ? '-' : ''}{' '}
                        {formatCentsToBrl(tx.amountCents)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

        {/* Passo 1: Configuração da Origem e Upload */}
        <div className='grid gap-6 lg:grid-cols-3'>
          <Card className='lg:col-span-1'>
            <CardHeader>
              <CardTitle className='text-base'>1. Origem e Titular</CardTitle>
              <CardDescription>
                Selecione a conta/cartão e opcionalmente o seu nome completo
                para identificar PIX entre suas próprias contas.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='space-y-1.5'>
                <Label>De quem é este extrato? (Gastos Compartilhados)</Label>
                <Select
                  value={statementOwner}
                  onValueChange={(v: 'AUTO' | 'JOHN' | 'VIVIANE') =>
                    setStatementOwner(v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='AUTO'>
                      Detectar automaticamente (John / Viviane)
                    </SelectItem>
                    <SelectItem value='JOHN'>John (Meu extrato)</SelectItem>
                    <SelectItem value='VIVIANE'>
                      Viviane (Esposa — pode repetir os mesmos meses)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className='text-[11px] text-muted-foreground'>
                  Os extratos da Viviane somam junto nos mesmos meses que os
                  seus sem dar conflito de duplicata.
                </p>
              </div>

              <div className='space-y-1.5'>
                <Label htmlFor='ref-month'>
                  Mês / Ano Base (para prints sem ano)
                </Label>
                <Input
                  id='ref-month'
                  type='month'
                  value={referenceMonth}
                  onChange={(e) => setReferenceMonth(e.target.value)}
                />
                <p className='text-[11px] text-muted-foreground'>
                  Se o PDF mostrar a data completa (ex: 25/09/2026, 20/10/2026 e
                  19/11/2026), cada linha irá automaticamente para o seu próprio
                  mês!
                </p>
              </div>

              <div className='space-y-1.5'>
                <Label>Conta Bancária de Origem</Label>
                <Select value={bankAccountId} onValueChange={setBankAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder='Selecione o banco' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='NONE'>Não especificado</SelectItem>
                    {banks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} ({b.institution})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-1.5'>
                <Label>Cartão de Crédito (se for fatura)</Label>
                <Select value={creditCardId} onValueChange={setCreditCardId}>
                  <SelectTrigger>
                    <SelectValue placeholder='Selecione o cartão (opcional)' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='NONE'>Não é fatura de cartão</SelectItem>
                    {cards.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-1.5'>
                <Label htmlFor='holder-name'>
                  Nome do Titular (auto-detecta transferências próprias)
                </Label>
                <Input
                  id='holder-name'
                  placeholder='Ex: JOHN ELTON DA SILVA SANTOS'
                  value={accountHolderName}
                  onChange={(e) => setAccountHolderName(e.target.value)}
                />
              </div>

              <div className='space-y-1.5'>
                <Label htmlFor='source-name'>
                  Identificação do Extrato (opcional)
                </Label>
                <Input
                  id='source-name'
                  name='finance-batch-label'
                  autoComplete='off'
                  data-lpignore='true'
                  placeholder='Ex: Extrato Itaú Set-Nov/2026'
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                />
              </div>

              <div className='space-y-1.5 border-t pt-3'>
                <Label htmlFor='gemini-key' className='text-xs'>
                  Chave Google Gemini (começa com AIza... — só para Prints/Imagens)
                </Label>
                <Input
                  id='gemini-key'
                  name='finance-gemini-token'
                  type='text'
                  autoComplete='off'
                  spellCheck={false}
                  data-lpignore='true'
                  placeholder='Cole sua chave AIzaSy... aqui'
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <p className='text-[11px] text-muted-foreground'>
                  Gere gratuitamente em{' '}
                  <a
                    href='https://aistudio.google.com/apikey'
                    target='_blank'
                    rel='noreferrer'
                    className='text-primary underline'
                  >
                    aistudio.google.com/apikey
                  </a>
                  . PDFs digitais não precisam de chave.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className='lg:col-span-2'>
            <CardHeader>
              <CardTitle className='text-base'>
                2. Enviar Extrato PDF, Prints ou Texto do Extrato
              </CardTitle>
              <CardDescription>
                Arraste o PDF completo do extrato Itaú (ou prints de tela) ou
                cole o texto copiado do PDF.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <Tabs defaultValue='files' className='space-y-4'>
                <TabsList>
                  <TabsTrigger value='files'>
                    Arquivos PDF ou Imagens (IA)
                  </TabsTrigger>
                  <TabsTrigger value='text'>
                    Colar Texto do Extrato PDF (Instantâneo)
                  </TabsTrigger>
                </TabsList>

                <TabsContent value='files' className='space-y-4'>
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    className='flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-6 py-10 text-center transition-colors hover:border-primary'
                  >
                    <UploadCloud className='mb-3 h-10 w-10 text-primary' />
                    <p className='text-sm font-medium'>
                      Arraste e solte seu Extrato PDF ou Prints Bancários aqui
                    </p>
                    <p className='mt-1 text-xs text-muted-foreground'>
                      Formatos aceitos: <strong>PDF</strong> (multipágina Itaú,
                      Nubank, etc.), <strong>PNG, JPG, JPEG e WEBP</strong>
                    </p>
                    <label className='mt-4 inline-flex cursor-pointer items-center justify-center rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90'>
                      Selecionar PDF ou Imagens
                      <input
                        type='file'
                        accept='.pdf,application/pdf,image/png,image/jpeg,image/jpg,image/webp'
                        multiple
                        className='hidden'
                        onChange={handleFileChange}
                      />
                    </label>
                  </div>

                  {files.length > 0 && (
                    <div className='space-y-3'>
                      <div className='flex items-center justify-between'>
                        <span className='text-xs font-semibold text-muted-foreground'>
                          {files.length} arquivo(s) selecionado(s)
                        </span>
                        <Button
                          variant='ghost'
                          size='sm'
                          className='h-7 text-xs'
                          onClick={() => setFiles([])}
                        >
                          Limpar lista
                        </Button>
                      </div>
                      <div className='grid gap-2 sm:grid-cols-2'>
                        {files.map((file, idx) => {
                          const isPdf =
                            file.type === 'application/pdf' ||
                            file.name.toLowerCase().endsWith('.pdf')
                          return (
                            <div
                              key={`${file.name}-${idx}`}
                              className='flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-xs'
                            >
                              <div className='flex items-center gap-2 truncate'>
                                {isPdf ? (
                                  <FileText className='h-4 w-4 shrink-0 text-rose-500' />
                                ) : (
                                  <FileImage className='h-4 w-4 shrink-0 text-primary' />
                                )}
                                <span className='truncate font-medium'>
                                  {file.name}
                                </span>
                                <span className='text-muted-foreground'>
                                  ({Math.round(file.size / 1024)} KB)
                                </span>
                              </div>
                              <Button
                                variant='ghost'
                                size='icon'
                                className='h-6 w-6 text-muted-foreground hover:text-destructive'
                                onClick={() => removeFile(idx)}
                              >
                                <Trash2 className='h-3.5 w-3.5' />
                              </Button>
                            </div>
                          )
                        })}
                      </div>

                      <div className='flex justify-end pt-2'>
                        <Button
                          onClick={() => handleExtract('FILES')}
                          disabled={extracting}
                          className='gap-2'
                        >
                          {extracting ? (
                            <>
                              <Loader2 className='h-4 w-4 animate-spin' />
                              Processando documento(s)...
                            </>
                          ) : (
                            <>
                              <Sparkles className='h-4 w-4' />
                              Extrair Transações ({files.length})
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value='text' className='space-y-3'>
                  <p className='text-xs text-muted-foreground'>
                    Copie e cole abaixo o texto de todas as páginas do extrato
                    PDF do Itaú (colunas{' '}
                    <code>Data | Lançamentos | Descrição | Valor | Saldo</code>
                    ). O parser reconhece automaticamente todas as datas,
                    separa por mês e categoriza cada estabelecimento:
                  </p>
                  <Textarea
                    rows={8}
                    placeholder='Cole aqui o conteúdo do extrato PDF do Itaú...'
                    value={rawStatementText}
                    onChange={(e) => setRawStatementText(e.target.value)}
                    className='font-mono text-xs'
                  />
                  <div className='flex justify-end'>
                    <Button
                      onClick={() => handleExtract('TEXT')}
                      disabled={extracting || !rawStatementText.trim()}
                      className='gap-2'
                    >
                      {extracting ? (
                        <Loader2 className='h-4 w-4 animate-spin' />
                      ) : (
                        <Sparkles className='h-4 w-4' />
                      )}
                      Extrair Lançamentos do Texto
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>

              {extractError && (
                <Alert variant='destructive'>
                  <AlertCircle className='h-4 w-4' />
                  <AlertTitle>Erro no processamento</AlertTitle>
                  <AlertDescription className='mt-1 flex flex-wrap items-center justify-between gap-2 text-xs'>
                    <span>{extractError}</span>
                    <Button
                      variant='outline'
                      size='sm'
                      className='h-7 gap-1 text-xs'
                      onClick={() =>
                        handleExtract(
                          rawStatementText.trim() ? 'TEXT' : 'FILES'
                        )
                      }
                      disabled={extracting}
                    >
                      <RefreshCw className='h-3 w-3' />
                      Tentar novamente
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Passo 2: Tabela de Pré-Visualização e Edição Completa do Extrato */}
        {reviewRows.length > 0 && (
          <Card className='border-primary/40 shadow-md'>
            <CardHeader className='space-y-4 border-b pb-4'>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <div>
                  <div className='flex flex-wrap items-center gap-2'>
                    <CardTitle>
                      {isEditingExistingBatch
                        ? `Editando Extrato: ${activeBatchName} (${reviewRows.length})`
                        : `3. Revisão e Edição do Extrato (${reviewRows.length} lançamentos)`}
                    </CardTitle>
                    {providerUsed && (
                      <Badge variant='secondary' className='text-xs'>
                        {providerUsed}
                      </Badge>
                    )}
                    {isEditingExistingBatch && (
                      <Badge className='bg-amber-500 text-xs text-black'>
                        Modo Reedição de Extrato Salvo
                      </Badge>
                    )}
                  </div>
                  <CardDescription className='mt-1'>
                    Altere qualquer lançamento (Data, Descrição, Categoria, Tipo
                    Despesa/Receita ou Valor), adicione novas linhas ou filtre
                    por mês abaixo.
                  </CardDescription>
                </div>

                <div className='flex flex-wrap items-center gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={handleAddRowToCurrentExtract}
                    className='gap-1 text-xs'
                  >
                    <Plus className='h-3.5 w-3.5' />
                    Adicionar Despesa neste Extrato
                  </Button>

                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => {
                      setReviewRows([])
                      setActiveBatchId(null)
                      setIsEditingExistingBatch(false)
                    }}
                    className='text-xs'
                  >
                    Fechar Revisão
                  </Button>

                  <Button
                    onClick={handleConfirmImport}
                    disabled={saving || selectedCount === 0}
                    className='gap-1.5'
                  >
                    {saving ? (
                      <Loader2 className='h-4 w-4 animate-spin' />
                    ) : (
                      <Check className='h-4 w-4' />
                    )}
                    {isEditingExistingBatch
                      ? `Salvar Alterações do Extrato (${selectedCount})`
                      : `Confirmar e Salvar (${selectedCount})`}
                  </Button>
                </div>
              </div>

              {/* Resumo e Filtro por Mês (Separação Automática de PDFs com múltiplos meses) */}
              <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/60 p-3'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='flex items-center gap-1 text-xs font-semibold text-muted-foreground'>
                    <Calendar className='h-3.5 w-3.5 text-primary' />
                    Meses identificados no documento:
                  </span>
                  <Button
                    variant={reviewMonthFilter === 'ALL' ? 'default' : 'outline'}
                    size='sm'
                    className='h-7 text-xs'
                    onClick={() => setReviewMonthFilter('ALL')}
                  >
                    Todos ({reviewRows.length})
                  </Button>
                  {monthBreakdown.map((m) => (
                    <Button
                      key={m.monthCode}
                      variant={
                        reviewMonthFilter === m.monthCode ? 'default' : 'outline'
                      }
                      size='sm'
                      className='h-7 gap-1.5 text-xs'
                      onClick={() => setReviewMonthFilter(m.monthCode)}
                    >
                      <span>{formatCompetenceMonthPtBr(m.monthCode)}</span>
                      <Badge
                        variant='secondary'
                        className='px-1 py-0 text-[10px]'
                      >
                        {m.count}
                      </Badge>
                    </Button>
                  ))}
                </div>

                {/* Ações Rápidas em Massa para mudar para Despesa / Receita / Transferência e Categoria */}
                <div className='flex flex-wrap items-center gap-1.5'>
                  <span className='text-xs text-muted-foreground'>
                    Mudar selecionados para:
                  </span>
                  <Button
                    variant='outline'
                    size='sm'
                    className='h-7 border-rose-500/40 text-xs text-rose-500 hover:bg-rose-500/10'
                    onClick={() => handleBulkSetType('EXPENSE')}
                  >
                    Despesa
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    className='h-7 border-emerald-500/40 text-xs text-emerald-500 hover:bg-emerald-500/10'
                    onClick={() => handleBulkSetType('INCOME')}
                  >
                    Receita
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    className='h-7 text-xs'
                    onClick={() => handleBulkSetType('TRANSFER')}
                  >
                    Transferência Própria
                  </Button>

                  <Select onValueChange={handleBulkSetCategory}>
                    <SelectTrigger className='h-7 w-44 text-xs'>
                      <SelectValue placeholder='Definir categoria...' />
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

                  <Button
                    variant='outline'
                    size='sm'
                    className='h-7 gap-1 text-xs'
                    onClick={() => setCatEditorOpen(true)}
                  >
                    <Pencil className='h-3 w-3' />
                    Editar Categorias
                  </Button>
                </div>
              </div>

              {(reviewNeededCount > 0 || duplicateCount > 0) && (
                <div className='flex flex-wrap items-center gap-2'>
                  {reviewNeededCount > 0 && (
                    <Badge
                      variant='outline'
                      className='border-amber-500/50 bg-amber-500/10 text-amber-500'
                    >
                      <AlertTriangle className='mr-1 h-3 w-3' />
                      {reviewNeededCount} requer(em) atenção
                    </Badge>
                  )}
                  {duplicateCount > 0 && (
                    <Badge
                      variant='outline'
                      className='border-orange-500/50 bg-orange-500/10 text-orange-500'
                    >
                      <Copy className='mr-1 h-3 w-3' />
                      {duplicateCount} possível(is) duplicata(s) (desmarcadas
                      por padrão; marque se quiser importar mesmo assim)
                    </Badge>
                  )}
                </div>
              )}
            </CardHeader>

            <CardContent className='p-0'>
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='w-10 text-center'>
                        <Checkbox
                          checked={
                            visibleReviewRows.length > 0 &&
                            visibleReviewRows.every((r) => r.selected)
                          }
                          onCheckedChange={(checked) => {
                            const visibleIds = new Set(
                              visibleReviewRows.map((r) => r.localId)
                            )
                            setReviewRows((prev) =>
                              prev.map((r) =>
                                visibleIds.has(r.localId)
                                  ? { ...r, selected: Boolean(checked) }
                                  : r
                              )
                            )
                          }}
                        />
                      </TableHead>
                      <TableHead className='w-40'>
                        <button
                          type='button'
                          onClick={() =>
                            setDateSortOrder((prev) =>
                              prev === 'desc' ? 'asc' : 'desc'
                            )
                          }
                          className='inline-flex items-center gap-1 font-semibold hover:text-primary'
                          title='Clique para alternar entre mais recentes primeiro e mais antigas primeiro'
                        >
                          Data Real
                          <ArrowUpDown className='h-3 w-3' />
                          <span className='text-[10px] font-normal text-muted-foreground'>
                            ({dateSortOrder === 'desc' ? 'Recentes' : 'Antigas'})
                          </span>
                        </button>
                      </TableHead>
                      <TableHead className='w-32'>Mês Competência</TableHead>
                      <TableHead className='min-w-[220px]'>Descrição</TableHead>
                      <TableHead className='w-44'>Categoria</TableHead>
                      <TableHead className='w-44'>Tipo Contábil</TableHead>
                      <TableHead className='w-36'>Valor (R$)</TableHead>
                      <TableHead className='w-44'>Status / Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleReviewRows.map((row) => {
                      const rowMonth = row.date.slice(0, 7)
                      return (
                        <TableRow
                          key={row.localId}
                          className={
                            row.needsReview
                              ? 'bg-amber-500/10'
                              : row.isDuplicate
                                ? 'bg-orange-500/10 opacity-85'
                                : ''
                          }
                        >
                          <TableCell className='text-center'>
                            <Checkbox
                              checked={row.selected}
                              onCheckedChange={(checked) =>
                                updateRow(row.localId, {
                                  selected: Boolean(checked),
                                })
                              }
                            />
                          </TableCell>

                          <TableCell>
                            <Input
                              type='date'
                              value={row.date}
                              onChange={(e) =>
                                updateRow(row.localId, { date: e.target.value })
                              }
                              className='h-8 text-xs'
                            />
                          </TableCell>

                          <TableCell>
                            <Badge variant='outline' className='text-[11px]'>
                              {/^\d{4}-\d{2}$/.test(rowMonth)
                                ? formatCompetenceMonthPtBr(rowMonth)
                                : rowMonth}
                            </Badge>
                          </TableCell>

                          <TableCell>
                            <Input
                              value={row.description}
                              onChange={(e) =>
                                updateRow(row.localId, {
                                  description: e.target.value,
                                })
                              }
                              className='h-8 text-xs font-medium'
                            />
                          </TableCell>

                          <TableCell>
                            <Select
                              value={row.categoryId}
                              onValueChange={(val) =>
                                updateRow(row.localId, { categoryId: val })
                              }
                            >
                              <SelectTrigger className='h-8 text-xs'>
                                <SelectValue
                                  placeholder={row.suggestedCategory}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value='NONE'>
                                  Sem categoria
                                </SelectItem>
                                {categories.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>

                          <TableCell>
                            <Select
                              value={row.type}
                              onValueChange={(val: ReviewRow['type']) =>
                                updateRow(row.localId, { type: val })
                              }
                            >
                              <SelectTrigger className='h-8 text-xs'>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(TRANSACTION_TYPE_LABELS).map(
                                  ([k, label]) => (
                                    <SelectItem key={k} value={k}>
                                      {label}
                                    </SelectItem>
                                  )
                                )}
                              </SelectContent>
                            </Select>
                          </TableCell>

                          <TableCell>
                            <Input
                              value={row.amountInput}
                              onChange={(e) =>
                                updateRow(row.localId, {
                                  amountInput: e.target.value,
                                })
                              }
                              className={`h-8 text-right text-xs font-semibold ${
                                row.type === 'EXPENSE'
                                  ? 'text-rose-500'
                                  : row.type === 'INCOME'
                                    ? 'text-emerald-500'
                                    : ''
                              }`}
                            />
                          </TableCell>

                          <TableCell className='space-y-1 text-xs'>
                            <div className='flex items-center justify-between gap-1'>
                              <div>
                                {row.needsReview && (
                                  <div className='flex items-center gap-1 font-medium text-amber-500'>
                                    <AlertTriangle className='h-3.5 w-3.5 shrink-0' />
                                    <span>
                                      {row.reviewReason || 'Revisar'}
                                    </span>
                                  </div>
                                )}
                                {row.isDuplicate && (
                                  <div className='flex items-center gap-1 font-medium text-orange-500'>
                                    <Copy className='h-3.5 w-3.5 shrink-0' />
                                    <span>Duplicata</span>
                                  </div>
                                )}
                                {!row.needsReview && !row.isDuplicate && (
                                  <div className='flex items-center gap-1 text-emerald-500'>
                                    <CheckCircle2 className='h-3.5 w-3.5' />
                                    <span>OK</span>
                                  </div>
                                )}
                              </div>
                              <Button
                                variant='ghost'
                                size='icon'
                                className='h-6 w-6 text-muted-foreground hover:text-destructive'
                                onClick={() => removeRowFromReview(row.localId)}
                                title='Remover linha deste extrato'
                              >
                                <Trash2 className='h-3.5 w-3.5' />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Histórico de Extratos Importados (Com botões de Reabrir/Editar e Excluir Extrato) */}
        <Card>
          <CardHeader className='flex flex-wrap items-center justify-between gap-2'>
            <div>
              <CardTitle className='text-base'>
                Extratos e Prints Importados ({history.length})
              </CardTitle>
              <CardDescription>
                Clique em <strong>Reabrir / Editar Extrato</strong> para alterar
                lançamentos de um PDF já aceito ou em{' '}
                <strong>Excluir Extrato</strong> para apagar o extrato e todas
                as transações geradas por ele.
              </CardDescription>
            </div>
            {history.length > 0 && (
              <Button
                variant='ghost'
                size='sm'
                onClick={handleClearHistoryLogsOnly}
                className='text-xs text-muted-foreground'
              >
                Limpar apenas log de histórico
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className='py-6 text-center text-xs text-muted-foreground'>
                Nenhum extrato importado ainda.
              </p>
            ) : (
              <div className='divide-y text-sm'>
                {history.map((b) => {
                  const distinctMonths = Array.from(
                    new Set(
                      (b.transactions || []).map((t) => t.competenceMonth)
                    )
                  ).sort()

                  return (
                    <div
                      key={b.id}
                      className='flex flex-wrap items-center justify-between gap-3 py-3'
                    >
                      <div className='space-y-1'>
                        <div className='flex flex-wrap items-center gap-2 font-medium'>
                          <span>{b.sourceName}</span>
                          <Badge
                            variant={
                              b.status === 'CONFIRMED' ? 'default' : 'secondary'
                            }
                            className='text-[10px]'
                          >
                            {b.status === 'CONFIRMED'
                              ? `${b._count.transactions} lançamentos salvos`
                              : `${b._count.extractedItems} aguardando confirmação`}
                          </Badge>
                          {distinctMonths.map((m) => (
                            <Badge
                              key={m}
                              variant='outline'
                              className='cursor-pointer text-[10px] hover:bg-accent'
                              onClick={() => setMonth(m)}
                              title='Clique para visualizar este mês no topo'
                            >
                              {formatCompetenceMonthPtBr(m)}
                            </Badge>
                          ))}
                        </div>
                        <p className='text-xs text-muted-foreground'>
                          Importado em{' '}
                          {new Date(b.createdAt).toLocaleString('pt-BR')} •{' '}
                          {b.providerUsed}
                        </p>
                      </div>

                      <div className='flex flex-wrap items-center gap-2'>
                        <Button
                          variant='outline'
                          size='sm'
                          className='h-8 gap-1.5 text-xs'
                          onClick={() => handleReopenBatchForEdit(b.id)}
                        >
                          <Pencil className='h-3.5 w-3.5' />
                          Reabrir / Editar Extrato
                        </Button>

                        <Button
                          variant='outline'
                          size='sm'
                          className='h-8 gap-1.5 border-destructive/40 text-xs text-destructive hover:bg-destructive/10'
                          onClick={() => setBatchToDelete(b)}
                        >
                          <Trash2 className='h-3.5 w-3.5' />
                          Excluir Extrato
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </Main>

      {/* Modal de Confirmação para Excluir Extrato e suas Transações */}
      <AlertDialog
        open={Boolean(batchToDelete)}
        onOpenChange={(open) => !open && setBatchToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir extrato &ldquo;{batchToDelete?.sourceName}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação apagará este registro de importação e removerá do banco
              de dados todas as{' '}
              <strong>
                {batchToDelete?._count.transactions || 0} transações
              </strong>{' '}
              que foram geradas por este extrato/PDF. Os gráficos e saldos do
              Dashboard serão recalculados imediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEntireBatch}>
              Sim, Excluir Extrato e Transações
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CategoryFilterEditorDialog
        open={catEditorOpen}
        onOpenChange={setCatEditorOpen}
        onChanged={loadMetadata}
      />
    </>
  )
}
