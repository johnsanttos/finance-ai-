'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowUpDown,
  Download,
  FileSpreadsheet,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  formatCompetenceMonthPtBr,
  usePeriod,
} from '@/context/period-provider'
import { formatCentsToBrl } from '@/lib/finance/money'
import {
  exportTransactionsToCsv,
  exportTransactionsToExcel,
} from '@/lib/export/export-transactions'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Card, CardContent } from '@/components/ui/card'
import {
  EditableTransaction,
  TransactionDialog,
} from './transaction-dialog'
import { CategoryFilterEditorDialog } from '@/features/categories/category-filter-editor-dialog'

interface FullTransaction extends EditableTransaction {
  competenceMonth: string
  origin: string
  category?: { id: string; name: string; color: string } | null
  bankAccount?: { id: string; name: string } | null
  creditCard?: { id: string; name: string } | null
}

const TYPE_BADGES: Record<
  FullTransaction['type'],
  { label: string; className: string }
> = {
  EXPENSE: {
    label: 'Despesa',
    className: 'border-rose-500/40 bg-rose-500/10 text-rose-500',
  },
  INCOME: {
    label: 'Receita',
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500',
  },
  TRANSFER: {
    label: 'Transferência',
    className: 'border-slate-500/40 bg-slate-500/10 text-slate-400',
  },
  INVOICE_PAYMENT: {
    label: 'Pagto. Fatura',
    className: 'border-violet-500/40 bg-violet-500/10 text-violet-400',
  },
  REFUND: {
    label: 'Estorno',
    className: 'border-sky-500/40 bg-sky-500/10 text-sky-400',
  },
}

export function TransactionsPageView() {
  const {
    month,
    startDate,
    endDate,
    useDateRange,
    refreshTrigger,
    triggerRefresh,
  } = usePeriod()

  const [transactions, setTransactions] = useState<FullTransaction[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL')
  const [bankFilter, setBankFilter] = useState<string>('ALL')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const [viewScope, setViewScope] = useState<'PERIOD' | 'ALL'>('PERIOD')

  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState<number>(1)
  const pageSize = 15

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState<boolean>(false)
  const [editingTx, setEditingTx] = useState<FullTransaction | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] =
    useState<boolean>(false)
  const [catEditorOpen, setCatEditorOpen] = useState<boolean>(false)

  const [categories, setCategories] = useState<
    Array<{ id: string; name: string }>
  >([])
  const [banks, setBanks] = useState<Array<{ id: string; name: string }>>([])

  const loadMetadata = useCallback(() => {
    Promise.all([fetch('/api/categories'), fetch('/api/accounts')])
      .then(async ([cRes, aRes]) => {
        if (cRes.ok) {
          const cJson = await cRes.json()
          setCategories(cJson.categories || [])
        }
        if (aRes.ok) {
          const aJson = await aRes.json()
          setBanks(aJson.bankAccounts || [])
        }
      })
      .catch(() => null)
  }, [])

  useEffect(() => {
    loadMetadata()
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search)
      const catParam = sp.get('categoryId')
      const uncatParam = sp.get('uncategorized')
      if (catParam) setCategoryFilter(catParam)
      else if (uncatParam === 'true') setCategoryFilter('UNCATEGORIZED')
    }
  }, [loadMetadata])

  const loadTransactions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (viewScope === 'PERIOD') {
        if (useDateRange && startDate && endDate) {
          params.set('startDate', startDate)
          params.set('endDate', endDate)
        } else {
          params.set('month', month)
        }
      }
      if (categoryFilter !== 'ALL') {
        if (categoryFilter === 'UNCATEGORIZED') {
          params.set('uncategorized', 'true')
        } else {
          params.set('categoryId', categoryFilter)
        }
      }
      if (bankFilter !== 'ALL') params.set('bankAccountId', bankFilter)
      if (typeFilter !== 'ALL') params.set('type', typeFilter)

      const res = await fetch(`/api/transactions?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setTransactions(json.transactions || [])
        setSelectedIds(new Set())
        setPage(1)
      }
    } catch (error) {
      console.error('Erro ao buscar transações:', error)
    } finally {
      setLoading(false)
    }
  }, [
    month,
    startDate,
    endDate,
    useDateRange,
    viewScope,
    categoryFilter,
    bankFilter,
    typeFilter,
  ])

  useEffect(() => {
    loadTransactions()
  }, [loadTransactions, refreshTrigger])

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const filtered = q
      ? transactions.filter(
          (t) =>
            t.description.toLowerCase().includes(q) ||
            (t.merchant && t.merchant.toLowerCase().includes(q)) ||
            (t.category?.name && t.category.name.toLowerCase().includes(q))
        )
      : transactions

    return [...filtered].sort((a, b) => {
      if (sortBy === 'date') {
        const diff =
          new Date(a.date).getTime() - new Date(b.date).getTime()
        return sortOrder === 'asc' ? diff : -diff
      }
      const diff = a.amountCents - b.amountCents
      return sortOrder === 'asc' ? diff : -diff
    })
  }, [transactions, searchQuery, sortBy, sortOrder])

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / pageSize))
  const paginatedRows = filteredAndSorted.slice(
    (page - 1) * pageSize,
    page * pageSize
  )

  const toggleSort = (field: 'date' | 'amount') => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
  }

  const handleDeleteSingle = async () => {
    if (!deleteTargetId) return
    try {
      const res = await fetch(`/api/transactions/${deleteTargetId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        toast.success('Transação excluída com sucesso.')
        setDeleteTargetId(null)
        triggerRefresh()
      }
    } catch {
      toast.error('Erro ao excluir transação.')
    }
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    try {
      const res = await fetch('/api/transactions/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (res.ok) {
        const json = await res.json()
        toast.success(`${json.deletedCount} transações excluídas em lote.`)
        setBulkDeleteConfirmOpen(false)
        triggerRefresh()
      }
    } catch {
      toast.error('Erro ao excluir transações selecionadas.')
    }
  }

  const handleBulkUpdate = async (patch: {
    categoryId?: string | null
    type?: FullTransaction['type']
  }) => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    try {
      const res = await fetch('/api/transactions/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, ...patch }),
      })
      if (res.ok) {
        const json = await res.json()
        toast.success(`${json.updatedCount} transação(ões) atualizada(s)!`)
        triggerRefresh()
      }
    } catch {
      toast.error('Erro ao atualizar transações selecionadas.')
    }
  }

  return (
    <>
      <Header fixed>
        <h1 className='text-sm font-semibold sm:text-base'>
          Movimentações Financeiras
        </h1>
      </Header>

      <Main className='space-y-5'>
        {/* Topo da Página */}
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>
              Tabela de Transações
            </h2>
            <p className='text-sm text-muted-foreground'>
              {viewScope === 'PERIOD'
                ? `Exibindo lançamentos de ${formatCompetenceMonthPtBr(month)}`
                : 'Exibindo todo o histórico cadastrado'}
            </p>
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              disabled={filteredAndSorted.length === 0}
              onClick={() =>
                exportTransactionsToCsv(
                  filteredAndSorted,
                  `transacoes-${month}`
                )
              }
            >
              <Download className='mr-1.5 h-3.5 w-3.5' />
              Exportar CSV
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={filteredAndSorted.length === 0}
              onClick={() =>
                exportTransactionsToExcel(
                  filteredAndSorted,
                  `transacoes-${month}`
                )
              }
            >
              <FileSpreadsheet className='mr-1.5 h-3.5 w-3.5' />
              Exportar Excel
            </Button>
            <Button
              size='sm'
              onClick={() => {
                setEditingTx(null)
                setDialogOpen(true)
              }}
            >
              <Plus className='mr-1.5 h-4 w-4' />
              Adicionar Transação
            </Button>
          </div>
        </div>

        {/* Barra de Filtros */}
        <Card>
          <CardContent className='p-4'>
            <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-6'>
              <div className='relative sm:col-span-2'>
                <Search className='absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground' />
                <Input
                  placeholder='Buscar por descrição ou estabelecimento...'
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setPage(1)
                  }}
                  className='pl-8'
                />
              </div>

              <Select
                value={viewScope}
                onValueChange={(v: 'PERIOD' | 'ALL') => setViewScope(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='PERIOD'>
                    Mês selecionado ({month})
                  </SelectItem>
                  <SelectItem value='ALL'>Todo o histórico</SelectItem>
                </SelectContent>
              </Select>

              <div className='flex items-center gap-1'>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className='flex-1'>
                    <SelectValue placeholder='Categoria' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='ALL'>Todas as categorias</SelectItem>
                    <SelectItem value='UNCATEGORIZED'>Sem categoria</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant='outline'
                  size='icon'
                  className='h-9 w-9 shrink-0'
                  onClick={() => setCatEditorOpen(true)}
                  title='Editar opções do filtro de categorias'
                >
                  <Pencil className='h-3.5 w-3.5' />
                </Button>
              </div>

              <Select value={bankFilter} onValueChange={setBankFilter}>
                <SelectTrigger>
                  <SelectValue placeholder='Banco / Conta' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>Todos os bancos</SelectItem>
                  {banks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder='Tipo' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>Todos os tipos</SelectItem>
                  <SelectItem value='EXPENSE'>Despesas</SelectItem>
                  <SelectItem value='INCOME'>Receitas</SelectItem>
                  <SelectItem value='TRANSFER'>Transferências</SelectItem>
                  <SelectItem value='INVOICE_PAYMENT'>
                    Pagto. de Fatura
                  </SelectItem>
                  <SelectItem value='REFUND'>Estornos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedIds.size > 0 && (
              <div className='mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs'>
                <span className='font-medium'>
                  {selectedIds.size} registro(s) selecionado(s)
                </span>
                <div className='flex flex-wrap items-center gap-2'>
                  <Select
                    onValueChange={(val) =>
                      handleBulkUpdate({
                        categoryId: val === 'NONE' ? null : val,
                      })
                    }
                  >
                    <SelectTrigger className='h-7 w-44 text-xs'>
                      <SelectValue placeholder='Mudar categoria...' />
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
                    className='h-7 border-rose-500/40 text-xs text-rose-500'
                    onClick={() => handleBulkUpdate({ type: 'EXPENSE' })}
                  >
                    Mudar p/ Despesa
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    className='h-7 border-emerald-500/40 text-xs text-emerald-500'
                    onClick={() => handleBulkUpdate({ type: 'INCOME' })}
                  >
                    Mudar p/ Receita
                  </Button>

                  <Button
                    variant='ghost'
                    size='sm'
                    className='h-7 text-xs'
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Desmarcar
                  </Button>
                  <Button
                    variant='destructive'
                    size='sm'
                    className='h-7 gap-1 text-xs'
                    onClick={() => setBulkDeleteConfirmOpen(true)}
                  >
                    <Trash2 className='h-3.5 w-3.5' />
                    Excluir
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabela Principal */}
        <Card>
          <CardContent className='p-0'>
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-10 text-center'>
                      <Checkbox
                        checked={
                          paginatedRows.length > 0 &&
                          paginatedRows.every((r) => selectedIds.has(r.id))
                        }
                        onCheckedChange={(checked) => {
                          const next = new Set(selectedIds)
                          for (const r of paginatedRows) {
                            if (checked) next.add(r.id)
                            else next.delete(r.id)
                          }
                          setSelectedIds(next)
                        }}
                      />
                    </TableHead>
                    <TableHead className='w-32'>
                      <Button
                        variant='ghost'
                        size='sm'
                        className='-ml-3 h-8 gap-1 text-xs font-semibold'
                        onClick={() => toggleSort('date')}
                      >
                        Data
                        <ArrowUpDown className='h-3.5 w-3.5' />
                      </Button>
                    </TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Conta / Cartão</TableHead>
                    <TableHead className='text-right'>
                      <Button
                        variant='ghost'
                        size='sm'
                        className='h-8 gap-1 text-xs font-semibold'
                        onClick={() => toggleSort('amount')}
                      >
                        Valor
                        <ArrowUpDown className='h-3.5 w-3.5' />
                      </Button>
                    </TableHead>
                    <TableHead className='w-24 text-right'>Ações</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className='h-32 text-center text-sm text-muted-foreground'
                      >
                        Carregando movimentações...
                      </TableCell>
                    </TableRow>
                  ) : paginatedRows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className='h-32 text-center text-sm text-muted-foreground'
                      >
                        Nenhuma transação encontrada para os filtros aplicados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedRows.map((tx) => {
                      const typeInfo =
                        TYPE_BADGES[tx.type] || TYPE_BADGES.EXPENSE
                      return (
                        <TableRow key={tx.id}>
                          <TableCell className='text-center'>
                            <Checkbox
                              checked={selectedIds.has(tx.id)}
                              onCheckedChange={(checked) => {
                                const next = new Set(selectedIds)
                                if (checked) next.add(tx.id)
                                else next.delete(tx.id)
                                setSelectedIds(next)
                              }}
                            />
                          </TableCell>

                          <TableCell className='text-xs font-medium whitespace-nowrap'>
                            {new Date(tx.date).toLocaleDateString('pt-BR', {
                              timeZone: 'UTC',
                            })}
                          </TableCell>

                          <TableCell>
                            <div className='font-medium'>{tx.description}</div>
                            {tx.merchant && (
                              <div className='text-xs text-muted-foreground'>
                                {tx.merchant}
                              </div>
                            )}
                          </TableCell>

                          <TableCell>
                            {tx.category ? (
                              <Badge
                                variant='outline'
                                className='gap-1.5 text-xs'
                              >
                                <span
                                  className='h-2 w-2 rounded-full'
                                  style={{
                                    backgroundColor: tx.category.color,
                                  }}
                                />
                                {tx.category.name}
                              </Badge>
                            ) : (
                              <Badge
                                variant='outline'
                                className='border-amber-500/40 text-xs text-amber-500'
                              >
                                Sem categoria
                              </Badge>
                            )}
                          </TableCell>

                          <TableCell>
                            <Badge
                              variant='outline'
                              className={`text-xs ${typeInfo.className}`}
                            >
                              {typeInfo.label}
                            </Badge>
                          </TableCell>

                          <TableCell className='text-xs text-muted-foreground'>
                            {tx.creditCard?.name ||
                              tx.bankAccount?.name ||
                              'Geral'}
                          </TableCell>

                          <TableCell
                            className={`text-right font-semibold whitespace-nowrap ${
                              tx.type === 'EXPENSE'
                                ? 'text-rose-500'
                                : tx.type === 'INCOME' || tx.type === 'REFUND'
                                  ? 'text-emerald-500'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            {formatCentsToBrl(tx.amountCents, {
                              showSign: true,
                              type: tx.type,
                            })}
                          </TableCell>

                          <TableCell className='text-right'>
                            <div className='flex items-center justify-end gap-1'>
                              <Button
                                variant='ghost'
                                size='icon'
                                className='h-7 w-7'
                                onClick={() => {
                                  setEditingTx(tx)
                                  setDialogOpen(true)
                                }}
                                title='Editar'
                              >
                                <Pencil className='h-3.5 w-3.5' />
                              </Button>
                              <Button
                                variant='ghost'
                                size='icon'
                                className='h-7 w-7 text-muted-foreground hover:text-destructive'
                                onClick={() => setDeleteTargetId(tx.id)}
                                title='Excluir'
                              >
                                <Trash2 className='h-3.5 w-3.5' />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Paginação */}
            <div className='flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs text-muted-foreground'>
              <div>
                Total de <strong>{filteredAndSorted.length}</strong> registro(s)
              </div>
              <div className='flex items-center gap-2'>
                <span>
                  Página {page} de {totalPages}
                </span>
                <Button
                  variant='outline'
                  size='sm'
                  className='h-7 text-xs'
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  className='h-7 text-xs'
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Próxima
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </Main>

      <TransactionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialData={editingTx}
        onSaved={() => triggerRefresh()}
      />

      {/* Confirmação de Exclusão Unitária */}
      <AlertDialog
        open={Boolean(deleteTargetId)}
        onOpenChange={(open) => !open && setDeleteTargetId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta transação? Os gráficos e
              indicadores serão atualizados imediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSingle}>
              Excluir Transação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de Exclusão em Lote */}
      <AlertDialog
        open={bulkDeleteConfirmOpen}
        onOpenChange={setBulkDeleteConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {selectedIds.size} transações em lote?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá permanentemente todas as transações
              selecionadas do banco de dados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete}>
              Confirmar Exclusão em Lote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CategoryFilterEditorDialog
        open={catEditorOpen}
        onOpenChange={setCatEditorOpen}
        onChanged={() => {
          loadMetadata()
          triggerRefresh()
        }}
      />
    </>
  )
}
