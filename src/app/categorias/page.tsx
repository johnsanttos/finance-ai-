'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeftRight,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  formatCompetenceMonthPtBr,
  usePeriod,
} from '@/context/period-provider'
import { formatCentsToBrl, parseBrlToCents } from '@/lib/finance/money'
import { DEFAULT_CATEGORIES } from '@/lib/constants/categories'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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

interface CategoryItem {
  id: string
  name: string
  slug: string
  type: 'EXPENSE' | 'INCOME' | 'BOTH' | 'NEUTRAL'
  color: string
  isSystem: boolean
  monthlyBudgetCents: number | null
  spentCents: number
}

const TYPE_LABELS: Record<CategoryItem['type'], string> = {
  EXPENSE: 'Despesa',
  INCOME: 'Receita',
  BOTH: 'Despesa & Receita',
  NEUTRAL: 'Neutra (Transferência / Cartão)',
}

export default function CategoriasPage() {
  const { month, refreshTrigger, triggerRefresh } = usePeriod()
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [budgetInputs, setBudgetInputs] = useState<Record<string, string>>({})

  // Filtros da tela de categorias
  const [searchFilter, setSearchFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')

  // Formulário de nova categoria
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<CategoryItem['type']>('EXPENSE')
  const [newColor, setNewColor] = useState('#6366f1')
  const [newBudget, setNewBudget] = useState('')

  // Modal de edição completa de categoria (Nome, Tipo, Cor, Meta)
  const [editingCat, setEditingCat] = useState<CategoryItem | null>(null)
  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState<CategoryItem['type']>('EXPENSE')
  const [editColor, setEditColor] = useState('#6366f1')
  const [editBudget, setEditBudget] = useState('')

  // Modal de confirmação de exclusão
  const [deletingCat, setDeletingCat] = useState<CategoryItem | null>(null)

  const loadCategories = useCallback(async () => {
    const res = await fetch(`/api/categories?month=${month}`)
    if (res.ok) {
      const json = await res.json()
      const list: CategoryItem[] = json.categories || []
      setCategories(list)
      const map: Record<string, string> = {}
      for (const c of list) {
        map[c.id] = c.monthlyBudgetCents
          ? (c.monthlyBudgetCents / 100).toFixed(2).replace('.', ',')
          : ''
      }
      setBudgetInputs(map)
    }
  }, [month])

  useEffect(() => {
    loadCategories()
  }, [loadCategories, refreshTrigger])

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return

    const budgetCents = newBudget.trim() ? parseBrlToCents(newBudget) : null
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newName.trim(),
        type: newType,
        color: newColor,
        monthlyBudgetCents: budgetCents,
      }),
    })

    if (res.ok) {
      toast.success(`Categoria "${newName.trim()}" adicionada ao filtro!`)
      setNewName('')
      setNewBudget('')
      loadCategories()
      triggerRefresh()
    } else {
      toast.error('Já existe uma categoria com esse nome ou erro ao salvar.')
    }
  }

  const openEditDialog = (cat: CategoryItem) => {
    setEditingCat(cat)
    setEditName(cat.name)
    setEditType(cat.type)
    setEditColor(cat.color)
    setEditBudget(
      cat.monthlyBudgetCents
        ? (cat.monthlyBudgetCents / 100).toFixed(2).replace('.', ',')
        : ''
    )
  }

  const handleSaveEditCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCat || !editName.trim()) return

    const budgetCents = editBudget.trim() ? parseBrlToCents(editBudget) : null
    const res = await fetch('/api/categories', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingCat.id,
        name: editName.trim(),
        type: editType,
        color: editColor,
        monthlyBudgetCents: budgetCents,
      }),
    })

    if (res.ok) {
      toast.success(`Categoria "${editName.trim()}" atualizada!`)
      setEditingCat(null)
      loadCategories()
      triggerRefresh()
    } else {
      toast.error('Erro ao atualizar categoria.')
    }
  }

  const handleSaveBudgetInline = async (cat: CategoryItem) => {
    const raw = budgetInputs[cat.id] || ''
    const budgetCents = raw.trim() ? parseBrlToCents(raw) : null
    const res = await fetch('/api/categories', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: cat.id,
        monthlyBudgetCents: budgetCents,
      }),
    })

    if (res.ok) {
      toast.success(`Meta de "${cat.name}" atualizada!`)
      loadCategories()
      triggerRefresh()
    }
  }

  const handleConfirmDeleteCategory = async () => {
    if (!deletingCat) return
    const res = await fetch(`/api/categories?id=${deletingCat.id}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      toast.success(`Categoria "${deletingCat.name}" excluída do filtro!`)
      setDeletingCat(null)
      loadCategories()
      triggerRefresh()
    } else {
      toast.error('Não foi possível excluir a categoria.')
    }
  }

  const handleRestoreDefaults = async () => {
    const existingNames = new Set(
      categories.map((c) => c.name.toLowerCase())
    )
    let created = 0
    for (const def of DEFAULT_CATEGORIES) {
      if (!existingNames.has(def.name.toLowerCase())) {
        const res = await fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: def.name,
            type: def.type,
            color: def.color,
            monthlyBudgetCents: def.monthlyBudgetCents ?? null,
          }),
        })
        if (res.ok) created++
      }
    }
    if (created > 0) {
      toast.success(`${created} categoria(s) padrão restaurada(s)!`)
      loadCategories()
      triggerRefresh()
    } else {
      toast.info('Todas as 18 categorias padrão já estão presentes.')
    }
  }

  const filteredCategories = categories.filter((c) => {
    const matchesSearch =
      !searchFilter.trim() ||
      c.name.toLowerCase().includes(searchFilter.trim().toLowerCase())
    const matchesType = typeFilter === 'ALL' || c.type === typeFilter
    return matchesSearch && matchesType
  })

  return (
    <>
      <Header fixed>
        <h1 className='text-sm font-semibold sm:text-base'>
          Categorias & Filtro de Classificação
        </h1>
      </Header>

      <Main className='space-y-6'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>
              Editar Categorias e Metas — {formatCompetenceMonthPtBr(month)}
            </h2>
            <p className='text-sm text-muted-foreground'>
              Edite o nome, o tipo (Despesa, Receita, Neutra), a cor ou exclua
              qualquer opção que aparece nos filtros de categorias do sistema.
            </p>
          </div>
          <Button
            variant='outline'
            size='sm'
            onClick={handleRestoreDefaults}
            className='gap-1.5 text-xs'
          >
            <RotateCcw className='h-3.5 w-3.5' />
            Restaurar Categorias Padrão Ausentes
          </Button>
        </div>

        {/* Adicionar Nova Opção ao Filtro de Categorias */}
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>
              Adicionar Nova Categoria ao Filtro
            </CardTitle>
            <CardDescription>
              Toda categoria criada aqui aparece imediatamente nos filtros de
              Transações, Dashboard e Importação de PDF/Prints.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleCreateCategory}
              className='grid gap-3 sm:grid-cols-2 lg:grid-cols-5'
            >
              <div className='space-y-1'>
                <Label className='text-xs'>Nome da Categoria</Label>
                <Input
                  placeholder='Ex: Fast Food, Pet Shop, PIX Pessoal'
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
              </div>

              <div className='space-y-1'>
                <Label className='text-xs'>Tipo no Filtro</Label>
                <Select
                  value={newType}
                  onValueChange={(v: CategoryItem['type']) => setNewType(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='EXPENSE'>Despesa</SelectItem>
                    <SelectItem value='INCOME'>Receita</SelectItem>
                    <SelectItem value='BOTH'>
                      Ambos (Despesa e Receita)
                    </SelectItem>
                    <SelectItem value='NEUTRAL'>
                      Neutra (Transferência / Cartão)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-1'>
                <Label className='text-xs'>Meta Mensal (R$ - opcional)</Label>
                <Input
                  placeholder='Ex: 400,00'
                  value={newBudget}
                  onChange={(e) => setNewBudget(e.target.value)}
                />
              </div>

              <div className='space-y-1'>
                <Label className='text-xs'>Cor no Gráfico</Label>
                <Input
                  type='color'
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className='h-9 p-1'
                />
              </div>

              <div className='flex items-end'>
                <Button type='submit' className='w-full gap-1.5'>
                  <Plus className='h-4 w-4' />
                  Adicionar ao Filtro
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Barra de Busca e Filtro das Categorias Existentes */}
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='relative w-full sm:w-80'>
            <Search className='absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground' />
            <Input
              placeholder='Buscar categoria para editar...'
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className='pl-8'
            />
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            {(['ALL', 'EXPENSE', 'INCOME', 'NEUTRAL'] as const).map((t) => (
              <Button
                key={t}
                variant={typeFilter === t ? 'default' : 'outline'}
                size='sm'
                className='h-8 text-xs'
                onClick={() => setTypeFilter(t)}
              >
                {t === 'ALL'
                  ? `Todas (${categories.length})`
                  : TYPE_LABELS[t as CategoryItem['type']]}
              </Button>
            ))}
          </div>
        </div>

        {/* Grid de Categorias com Botões de Editar, Excluir e Ver Transações */}
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {filteredCategories.map((cat) => {
            const budget = cat.monthlyBudgetCents || 0
            const ratio =
              budget > 0 ? Math.round((cat.spentCents / budget) * 100) : 0
            const exceeded = budget > 0 && cat.spentCents > budget

            return (
              <Card
                key={cat.id}
                className={exceeded ? 'border-rose-500/50' : ''}
              >
                <CardHeader className='pb-3'>
                  <div className='flex items-center justify-between gap-2'>
                    <div className='flex items-center gap-2 truncate'>
                      <span
                        className='h-3.5 w-3.5 shrink-0 rounded-full'
                        style={{ backgroundColor: cat.color }}
                      />
                      <CardTitle className='truncate text-base'>
                        {cat.name}
                      </CardTitle>
                    </div>
                    <div className='flex items-center gap-1'>
                      <Badge variant='outline' className='text-[10px]'>
                        {TYPE_LABELS[cat.type] || cat.type}
                      </Badge>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='h-7 w-7'
                        onClick={() => openEditDialog(cat)}
                        title='Editar nome, tipo ou cor desta categoria'
                      >
                        <Pencil className='h-3.5 w-3.5' />
                      </Button>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='h-7 w-7 text-muted-foreground hover:text-destructive'
                        onClick={() => setDeletingCat(cat)}
                        title='Excluir categoria do filtro'
                      >
                        <Trash2 className='h-3.5 w-3.5' />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className='space-y-3'>
                  <div className='flex items-baseline justify-between text-xs'>
                    <span className='text-muted-foreground'>
                      Total em {formatCompetenceMonthPtBr(month)}:
                    </span>
                    <span className='text-sm font-bold'>
                      {formatCentsToBrl(cat.spentCents)}
                    </span>
                  </div>

                  {budget > 0 && (
                    <div className='space-y-1'>
                      <div className='flex justify-between text-[11px]'>
                        <span>
                          Meta: {formatCentsToBrl(budget)} ({ratio}%)
                        </span>
                        {exceeded && (
                          <span className='font-semibold text-rose-500'>
                            Orçamento excedido!
                          </span>
                        )}
                      </div>
                      <div className='h-2 w-full overflow-hidden rounded-full bg-secondary'>
                        <div
                          className={`h-full rounded-full transition-all ${
                            exceeded ? 'bg-rose-500' : 'bg-primary'
                          }`}
                          style={{ width: `${Math.min(100, ratio)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className='flex items-center gap-2 pt-1'>
                    <Input
                      placeholder='Meta R$ (ex: 800,00)'
                      value={budgetInputs[cat.id] ?? ''}
                      onChange={(e) =>
                        setBudgetInputs((prev) => ({
                          ...prev,
                          [cat.id]: e.target.value,
                        }))
                      }
                      className='h-8 text-xs'
                    />
                    <Button
                      variant='outline'
                      size='sm'
                      className='h-8 gap-1 text-xs'
                      onClick={() => handleSaveBudgetInline(cat)}
                    >
                      <Save className='h-3.5 w-3.5' />
                      Meta
                    </Button>
                  </div>

                  <div className='flex items-center justify-between border-t pt-2'>
                    <Button
                      variant='ghost'
                      size='sm'
                      className='h-7 px-2 text-xs'
                      onClick={() => openEditDialog(cat)}
                    >
                      <Pencil className='mr-1 h-3 w-3' />
                      Editar Categoria
                    </Button>

                    <Button
                      variant='ghost'
                      size='sm'
                      className='h-7 px-2 text-xs text-primary'
                      asChild
                    >
                      <Link href={`/transacoes?categoryId=${cat.id}`}>
                        <ArrowLeftRight className='mr-1 h-3 w-3' />
                        Ver lançamentos
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </Main>

      {/* Modal para Editar Nome, Tipo, Cor e Meta de Qualquer Categoria */}
      <Dialog
        open={Boolean(editingCat)}
        onOpenChange={(open) => !open && setEditingCat(null)}
      >
        <DialogContent className='sm:max-w-[440px]'>
          <DialogHeader>
            <DialogTitle>Editar Categoria</DialogTitle>
            <DialogDescription>
              Altere o nome, o tipo contábil, a cor nos gráficos ou a meta
              mensal desta opção do filtro.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveEditCategory} className='space-y-4'>
            <div className='space-y-1.5'>
              <Label>Nome da Categoria</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </div>

            <div className='space-y-1.5'>
              <Label>Tipo Contábil</Label>
              <Select
                value={editType}
                onValueChange={(v: CategoryItem['type']) => setEditType(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='EXPENSE'>Despesa</SelectItem>
                  <SelectItem value='INCOME'>Receita</SelectItem>
                  <SelectItem value='BOTH'>
                    Ambos (Despesa e Receita)
                  </SelectItem>
                  <SelectItem value='NEUTRAL'>
                    Neutra (Transferência / Cartão)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1.5'>
                <Label>Meta Mensal (R$)</Label>
                <Input
                  placeholder='Sem meta'
                  value={editBudget}
                  onChange={(e) => setEditBudget(e.target.value)}
                />
              </div>

              <div className='space-y-1.5'>
                <Label>Cor</Label>
                <Input
                  type='color'
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  className='h-9 p-1'
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setEditingCat(null)}
              >
                Cancelar
              </Button>
              <Button type='submit'>Salvar Alterações</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmação para Excluir Categoria do Filtro */}
      <AlertDialog
        open={Boolean(deletingCat)}
        onOpenChange={(open) => !open && setDeletingCat(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir a categoria &ldquo;{deletingCat?.name}&rdquo; do filtro?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A categoria será removida da lista de filtros. As transações que
              estavam vinculadas a ela não serão apagadas (ficarão apenas como
              &ldquo;Sem categoria&rdquo; até você escolher outra).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteCategory}>
              Excluir Categoria
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
