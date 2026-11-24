'use client'

import { useState } from 'react'
import { Check, Pencil, Plus, Trash2, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { SpreadsheetIncomeRow } from '@/lib/finance/spreadsheet'
import { formatCentsToBrl, parseBrlToCents } from '@/lib/finance/money'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

interface BankAccountOption {
  id: string
  name: string
}

interface CategoryOption {
  id: string
  name: string
  type: string
}

export function IncomeTableSection({
  month,
  incomeRows,
  bankAccounts,
  categories,
  onChanged,
}: {
  month: string
  incomeRows: SpreadsheetIncomeRow[]
  bankAccounts: BankAccountOption[]
  categories: CategoryOption[]
  onChanged: () => void
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [plannedInput, setPlannedInput] = useState('')
  const [receivedInput, setReceivedInput] = useState('')
  const [date, setDate] = useState(`${month}-05`)
  const [bankAccountId, setBankAccountId] = useState('NONE')
  const [categoryId, setCategoryId] = useState('NONE')

  const incomeCategories = categories.filter(
    (c) => c.type === 'INCOME' || c.type === 'BOTH'
  )

  const openCreate = () => {
    setEditingId(null)
    setDescription('')
    setPlannedInput('')
    setReceivedInput('')
    setDate(`${month}-05`)
    setBankAccountId('NONE')
    setCategoryId(incomeCategories[0]?.id || 'NONE')
    setDialogOpen(true)
  }

  const openEdit = (row: SpreadsheetIncomeRow) => {
    setEditingId(row.id)
    setDescription(row.description)
    setPlannedInput((row.plannedCents / 100).toFixed(2).replace('.', ','))
    setReceivedInput((row.receivedCents / 100).toFixed(2).replace('.', ','))
    setDate(row.date)
    setBankAccountId(row.bankAccountId || 'NONE')
    setCategoryId(row.categoryId || 'NONE')
    setDialogOpen(true)
  }

  const handleSaveIncome = async (e: React.FormEvent) => {
    e.preventDefault()
    const plannedCents = parseBrlToCents(plannedInput)
    if (!description.trim() || !plannedCents || plannedCents <= 0) {
      toast.error('Informe a descrição e um valor previsto válido.')
      return
    }
    const receivedCents = receivedInput.trim()
      ? (parseBrlToCents(receivedInput) ?? 0)
      : 0

    const res = await fetch('/api/spreadsheet/cell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactionId: editingId,
        expenseName: description.trim(),
        description: description.trim(),
        amountCents: plannedCents,
        plannedAmountCents: plannedCents,
        paidAmountCents: Math.min(plannedCents, receivedCents),
        type: 'INCOME',
        date,
        categoryId: categoryId !== 'NONE' ? categoryId : null,
        bankAccountId: bankAccountId !== 'NONE' ? bankAccountId : null,
      }),
    })

    if (res.ok) {
      toast.success(
        editingId ? 'Receita atualizada!' : 'Entrada de receita adicionada!'
      )
      setDialogOpen(false)
      onChanged()
    } else {
      toast.error('Erro ao salvar receita.')
    }
  }

  const handleToggleReceived = async (row: SpreadsheetIncomeRow) => {
    const isAlreadyFull = row.paymentStatus === 'PAID'
    const res = await fetch('/api/spreadsheet/cell', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactionIds: [row.id],
        markFullPaid: !isAlreadyFull,
        markUnpaid: isAlreadyFull,
      }),
    })
    if (res.ok) {
      toast.success(
        isAlreadyFull
          ? `"${row.description}" marcada como prevista.`
          : `"${row.description}" marcada como recebida!`
      )
      onChanged()
    }
  }

  const handleDeleteIncome = async (id: string) => {
    const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Receita removida.')
      onChanged()
    }
  }

  const totalPlanned = incomeRows.reduce((a, r) => a + r.plannedCents, 0)
  const totalReceived = incomeRows.reduce((a, r) => a + r.receivedCents, 0)

  return (
    <Card>
      <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-2 pb-3'>
        <div>
          <CardTitle className='flex items-center gap-2 text-base'>
            <TrendingUp className='h-4 w-4 text-emerald-500' />
            ENTRADAS DE RECEITA
          </CardTitle>
          <CardDescription className='text-xs'>
            Salário, adiantamento, férias, 13º, renda extra e PIX recebido (sincronizado com Transações e Dashboard).
          </CardDescription>
        </div>
        <Button size='sm' onClick={openCreate} className='h-8 gap-1 text-xs'>
          <Plus className='h-3.5 w-3.5' />
          Adicionar Receita
        </Button>
      </CardHeader>

      <CardContent className='p-0'>
        <div className='overflow-x-auto'>
          <Table>
            <TableHeader>
              <TableRow className='bg-muted/40 text-xs'>
                <TableHead>DESCRIÇÃO</TableHead>
                <TableHead className='text-right'>PREVISTO</TableHead>
                <TableHead className='text-right'>RECEBIDO</TableHead>
                <TableHead className='w-28 text-center'>DATA</TableHead>
                <TableHead className='w-32 text-center'>STATUS</TableHead>
                <TableHead className='text-right'>TOTAL</TableHead>
                <TableHead className='w-24 text-right'>AÇÕES</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {incomeRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className='h-20 text-center text-xs text-muted-foreground'
                  >
                    Nenhuma entrada de receita neste mês. Clique em &ldquo;Adicionar Receita&rdquo; para lançar.
                  </TableCell>
                </TableRow>
              ) : (
                incomeRows.map((row) => (
                  <TableRow key={row.id} className='text-xs'>
                    <TableCell>
                      <div className='font-medium'>{row.description}</div>
                      <div className='text-[11px] text-muted-foreground'>
                        {row.categoryName}
                        {row.bankAccountName ? ` • ${row.bankAccountName}` : ''}
                      </div>
                    </TableCell>
                    <TableCell className='text-right text-muted-foreground'>
                      {formatCentsToBrl(row.plannedCents)}
                    </TableCell>
                    <TableCell className='text-right font-semibold text-emerald-500'>
                      {formatCentsToBrl(row.receivedCents)}
                    </TableCell>
                    <TableCell className='text-center'>
                      {row.date.split('-').reverse().join('/')}
                    </TableCell>
                    <TableCell className='text-center'>
                      <button
                        type='button'
                        onClick={() => handleToggleReceived(row)}
                        title='Clique para alternar entre Recebido e Previsto'
                      >
                        <Badge
                          variant='outline'
                          className={
                            row.paymentStatus === 'PAID'
                              ? 'cursor-pointer border-emerald-500/50 bg-emerald-500/15 text-emerald-500'
                              : row.paymentStatus === 'PARTIAL'
                                ? 'cursor-pointer border-sky-500/50 bg-sky-500/15 text-sky-400'
                                : 'cursor-pointer border-amber-500/50 bg-amber-500/15 text-amber-500'
                          }
                        >
                          {row.paymentStatus === 'PAID'
                            ? 'Recebido'
                            : row.paymentStatus === 'PARTIAL'
                              ? 'Parcial'
                              : 'Previsto'}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell className='text-right font-bold text-emerald-500'>
                      {formatCentsToBrl(row.receivedCents || row.plannedCents)}
                    </TableCell>
                    <TableCell className='text-right'>
                      <div className='flex items-center justify-end gap-1'>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='h-6 w-6'
                          onClick={() => handleToggleReceived(row)}
                          title='Marcar como recebido'
                        >
                          <Check className='h-3.5 w-3.5 text-emerald-500' />
                        </Button>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='h-6 w-6'
                          onClick={() => openEdit(row)}
                          title='Editar receita / recebimento parcial'
                        >
                          <Pencil className='h-3.5 w-3.5' />
                        </Button>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='h-6 w-6 text-muted-foreground hover:text-destructive'
                          onClick={() => handleDeleteIncome(row.id)}
                          title='Excluir receita'
                        >
                          <Trash2 className='h-3.5 w-3.5' />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}

              {incomeRows.length > 0 && (
                <TableRow className='bg-emerald-500/10 text-xs font-bold'>
                  <TableCell>TOTAL DE RECEITAS</TableCell>
                  <TableCell className='text-right'>
                    {formatCentsToBrl(totalPlanned)}
                  </TableCell>
                  <TableCell className='text-right text-emerald-500'>
                    {formatCentsToBrl(totalReceived)}
                  </TableCell>
                  <TableCell colSpan={2} />
                  <TableCell className='text-right text-emerald-500'>
                    {formatCentsToBrl(totalReceived)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className='sm:max-w-[440px]'>
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Editar Entrada de Receita' : 'Nova Entrada de Receita'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveIncome} className='space-y-3'>
            <div className='space-y-1'>
              <Label className='text-xs'>Descrição</Label>
              <Input
                placeholder='Ex: Salário, Adiantamento, Férias, Renda Extra'
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1'>
                <Label className='text-xs'>Valor Previsto (R$)</Label>
                <Input
                  placeholder='Ex: 3.500,00'
                  value={plannedInput}
                  onChange={(e) => setPlannedInput(e.target.value)}
                  required
                />
              </div>
              <div className='space-y-1'>
                <Label className='text-xs'>Valor Recebido (R$)</Label>
                <Input
                  placeholder='0,00 (ou valor parcial)'
                  value={receivedInput}
                  onChange={(e) => setReceivedInput(e.target.value)}
                />
              </div>
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1'>
                <Label className='text-xs'>Data</Label>
                <Input
                  type='date'
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <div className='space-y-1'>
                <Label className='text-xs'>Categoria</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder='Categoria' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='NONE'>Outras receitas</SelectItem>
                    {incomeCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className='space-y-1'>
              <Label className='text-xs'>Conta Bancária (opcional)</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder='Selecione a conta' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='NONE'>Conta Geral</SelectItem>
                  {bankAccounts.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type='submit'>Salvar Receita</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
