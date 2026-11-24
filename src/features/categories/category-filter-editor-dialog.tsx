'use client'

import { useEffect, useState } from 'react'
import { Check, Pencil, Plus, RotateCcw, Tags, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { DEFAULT_CATEGORIES } from '@/lib/constants/categories'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface EditableCategoryOption {
  id: string
  name: string
  type: string
  color?: string
}

export function CategoryFilterEditorDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}) {
  const [categories, setCategories] = useState<EditableCategoryOption[]>([])
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('EXPENSE')
  const [newColor, setNewColor] = useState('#6366f1')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState('EXPENSE')
  const [editColor, setEditColor] = useState('#6366f1')

  const loadList = async () => {
    const res = await fetch('/api/categories')
    if (res.ok) {
      const json = await res.json()
      setCategories(json.categories || [])
    }
  }

  useEffect(() => {
    if (open) loadList()
  }, [open])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newName.trim(),
        type: newType,
        color: newColor,
      }),
    })
    if (res.ok) {
      toast.success(`Categoria "${newName.trim()}" adicionada ao filtro!`)
      setNewName('')
      await loadList()
      onChanged()
    } else {
      toast.error('Já existe uma categoria com esse nome.')
    }
  }

  const startEdit = (c: EditableCategoryOption) => {
    setEditingId(c.id)
    setEditName(c.name)
    setEditType(c.type || 'EXPENSE')
    setEditColor(c.color || '#6366f1')
  }

  const saveEdit = async (id: string) => {
    if (!editName.trim()) return
    const res = await fetch('/api/categories', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        name: editName.trim(),
        type: editType,
        color: editColor,
      }),
    })
    if (res.ok) {
      toast.success('Categoria atualizada!')
      setEditingId(null)
      await loadList()
      onChanged()
    }
  }

  const handleDelete = async (c: EditableCategoryOption) => {
    const res = await fetch(`/api/categories?id=${c.id}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      toast.success(`Categoria "${c.name}" removida do filtro!`)
      await loadList()
      onChanged()
    }
  }

  const handleRestoreDefaults = async () => {
    const existing = new Set(categories.map((c) => c.name.toLowerCase()))
    let added = 0
    for (const def of DEFAULT_CATEGORIES) {
      if (!existing.has(def.name.toLowerCase())) {
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
        if (res.ok) added++
      }
    }
    if (added > 0) {
      toast.success(`${added} categoria(s) padrão restaurada(s)!`)
      await loadList()
      onChanged()
    } else {
      toast.info('Todas as categorias padrão já estão presentes.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-[560px]'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Tags className='h-4 w-4 text-primary' />
            Editar Opções do Filtro de Categorias
          </DialogTitle>
          <DialogDescription>
            Adicione novas categorias, renomeie, mude entre Despesa / Receita ou
            exclua qualquer opção do filtro.
          </DialogDescription>
        </DialogHeader>

        {/* Formulário Rápido para Nova Categoria */}
        <form
          onSubmit={handleAdd}
          className='flex flex-wrap items-center gap-2 rounded-lg border bg-card/60 p-3'
        >
          <Input
            placeholder='Nova categoria (ex: Delivery, Mercado...)'
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className='h-8 flex-1 text-xs'
            required
          />
          <Select value={newType} onValueChange={setNewType}>
            <SelectTrigger className='h-8 w-32 text-xs'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='EXPENSE'>Despesa</SelectItem>
              <SelectItem value='INCOME'>Receita</SelectItem>
              <SelectItem value='BOTH'>Ambos</SelectItem>
              <SelectItem value='NEUTRAL'>Neutra</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type='color'
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className='h-8 w-10 p-0.5'
          />
          <Button type='submit' size='sm' className='h-8 gap-1 text-xs'>
            <Plus className='h-3.5 w-3.5' />
            Criar
          </Button>
        </form>

        <div className='flex items-center justify-between text-xs text-muted-foreground'>
          <span>{categories.length} categorias disponíveis no filtro</span>
          <Button
            variant='ghost'
            size='sm'
            onClick={handleRestoreDefaults}
            className='h-7 gap-1 text-xs'
          >
            <RotateCcw className='h-3 w-3' />
            Restaurar padrões
          </Button>
        </div>

        {/* Lista de Categorias com Edição Inline e Exclusão */}
        <div className='max-h-[360px] divide-y overflow-y-auto rounded-lg border'>
          {categories.map((cat) => {
            const isEditing = editingId === cat.id
            return (
              <div
                key={cat.id}
                className='flex items-center justify-between gap-2 px-3 py-2 text-xs'
              >
                {isEditing ? (
                  <div className='flex flex-1 flex-wrap items-center gap-1.5'>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className='h-7 flex-1 text-xs'
                    />
                    <Select value={editType} onValueChange={setEditType}>
                      <SelectTrigger className='h-7 w-28 text-xs'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='EXPENSE'>Despesa</SelectItem>
                        <SelectItem value='INCOME'>Receita</SelectItem>
                        <SelectItem value='BOTH'>Ambos</SelectItem>
                        <SelectItem value='NEUTRAL'>Neutra</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type='color'
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      className='h-7 w-9 p-0.5'
                    />
                    <Button
                      size='icon'
                      className='h-7 w-7'
                      onClick={() => saveEdit(cat.id)}
                      title='Salvar'
                    >
                      <Check className='h-3.5 w-3.5' />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='h-7 w-7'
                      onClick={() => setEditingId(null)}
                      title='Cancelar'
                    >
                      <X className='h-3.5 w-3.5' />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className='flex items-center gap-2'>
                      <span
                        className='h-2.5 w-2.5 rounded-full'
                        style={{ backgroundColor: cat.color || '#6366f1' }}
                      />
                      <span className='font-medium'>{cat.name}</span>
                      <Badge variant='outline' className='px-1.5 py-0 text-[10px]'>
                        {cat.type === 'EXPENSE'
                          ? 'Despesa'
                          : cat.type === 'INCOME'
                            ? 'Receita'
                            : cat.type === 'BOTH'
                              ? 'Ambos'
                              : 'Neutra'}
                      </Badge>
                    </div>
                    <div className='flex items-center gap-1'>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='h-7 w-7'
                        onClick={() => startEdit(cat)}
                        title='Renomear ou mudar tipo'
                      >
                        <Pencil className='h-3.5 w-3.5' />
                      </Button>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='h-7 w-7 text-muted-foreground hover:text-destructive'
                        onClick={() => handleDelete(cat)}
                        title='Excluir do filtro'
                      >
                        <Trash2 className='h-3.5 w-3.5' />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
