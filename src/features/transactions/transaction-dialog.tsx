'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { parseBrlToCents } from '@/lib/finance/money'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface EditableTransaction {
  id: string
  description: string
  merchant?: string | null
  amountCents: number
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'INVOICE_PAYMENT' | 'REFUND'
  date: string
  categoryId?: string | null
  bankAccountId?: string | null
  creditCardId?: string | null
  notes?: string | null
}

interface TransactionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialData?: EditableTransaction | null
  onSaved: () => void
}

export function TransactionDialog({
  open,
  onOpenChange,
  initialData,
  onSaved,
}: TransactionDialogProps) {
  const isEditing = Boolean(initialData?.id)
  const [description, setDescription] = useState('')
  const [merchant, setMerchant] = useState('')
  const [amountInput, setAmountInput] = useState('')
  const [type, setType] = useState<EditableTransaction['type']>('EXPENSE')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [categoryId, setCategoryId] = useState<string>('NONE')
  const [bankAccountId, setBankAccountId] = useState<string>('NONE')
  const [creditCardId, setCreditCardId] = useState<string>('NONE')
  const [totalInstallments, setTotalInstallments] = useState<string>('1')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const [categories, setCategories] = useState<
    Array<{ id: string; name: string }>
  >([])
  const [banks, setBanks] = useState<Array<{ id: string; name: string }>>([])
  const [cards, setCards] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    if (!open) return
    Promise.all([fetch('/api/categories'), fetch('/api/accounts')])
      .then(async ([cRes, aRes]) => {
        if (cRes.ok) {
          const cJson = await cRes.json()
          setCategories(cJson.categories || [])
        }
        if (aRes.ok) {
          const aJson = await aRes.json()
          setBanks(aJson.bankAccounts || [])
          setCards(aJson.creditCards || [])
        }
      })
      .catch(() => null)
  }, [open])

  useEffect(() => {
    if (initialData) {
      setDescription(initialData.description)
      setMerchant(initialData.merchant || '')
      setAmountInput((initialData.amountCents / 100).toFixed(2).replace('.', ','))
      setType(initialData.type)
      setDate(new Date(initialData.date).toISOString().slice(0, 10))
      setCategoryId(initialData.categoryId || 'NONE')
      setBankAccountId(initialData.bankAccountId || 'NONE')
      setCreditCardId(initialData.creditCardId || 'NONE')
      setNotes(initialData.notes || '')
      setTotalInstallments('1')
    } else {
      setDescription('')
      setMerchant('')
      setAmountInput('')
      setType('EXPENSE')
      setDate(new Date().toISOString().slice(0, 10))
      setCategoryId('NONE')
      setBankAccountId('NONE')
      setCreditCardId('NONE')
      setTotalInstallments('1')
      setNotes('')
    }
  }, [initialData, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim()) {
      toast.error('Informe a descrição da transação.')
      return
    }

    const amountCents = parseBrlToCents(amountInput)
    if (!amountCents || amountCents <= 0) {
      toast.error('Informe um valor válido em reais (ex: 125,90).')
      return
    }

    setSaving(true)
    try {
      const payload = {
        description: description.trim(),
        merchant: merchant.trim() || null,
        amountCents,
        type,
        date,
        categoryId: categoryId !== 'NONE' ? categoryId : null,
        bankAccountId: bankAccountId !== 'NONE' ? bankAccountId : null,
        creditCardId: creditCardId !== 'NONE' ? creditCardId : null,
        totalInstallments: isEditing ? 1 : Number(totalInstallments) || 1,
        notes: notes.trim() || null,
      }

      const url = isEditing
        ? `/api/transactions/${initialData!.id}`
        : '/api/transactions'
      const method = isEditing ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Erro ao salvar transação.')
      }

      toast.success(
        isEditing
          ? 'Transação atualizada com sucesso!'
          : json.installmentsCreated > 1
            ? `Compra parcelada criada em ${json.installmentsCreated} competências!`
            : 'Transação adicionada com sucesso!'
      )
      onSaved()
      onOpenChange(false)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Erro ao salvar transação.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[520px]'>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar Transação' : 'Nova Transação Financeira'}
          </DialogTitle>
          <DialogDescription>
            Preencha os dados da movimentação. Valores em transferências próprias
            ou pagamento de fatura não duplicam seus gastos.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className='space-y-4'>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-1.5 sm:col-span-2'>
              <Label htmlFor='tx-desc'>Descrição</Label>
              <Input
                id='tx-desc'
                placeholder='Ex: Supermercado Pão de Açúcar'
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            <div className='space-y-1.5'>
              <Label htmlFor='tx-amount'>
                {!isEditing && Number(totalInstallments) > 1
                  ? 'Valor Total da Compra (R$)'
                  : 'Valor (R$)'}
              </Label>
              <Input
                id='tx-amount'
                placeholder='Ex: 250,00'
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                required
              />
            </div>

            <div className='space-y-1.5'>
              <Label htmlFor='tx-date'>Data da Movimentação</Label>
              <Input
                id='tx-date'
                type='date'
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            <div className='space-y-1.5'>
              <Label>Tipo de Transação</Label>
              <Select
                value={type}
                onValueChange={(v: EditableTransaction['type']) => setType(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='EXPENSE'>Despesa</SelectItem>
                  <SelectItem value='INCOME'>Receita</SelectItem>
                  <SelectItem value='TRANSFER'>
                    Transferência entre contas próprias
                  </SelectItem>
                  <SelectItem value='INVOICE_PAYMENT'>
                    Pagamento de Fatura de Cartão
                  </SelectItem>
                  <SelectItem value='REFUND'>Estorno / Reembolso</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-1.5'>
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
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

            <div className='space-y-1.5'>
              <Label>Conta Bancária</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder='Conta (opcional)' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='NONE'>Nenhuma conta</SelectItem>
                  {banks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-1.5'>
              <Label>Cartão de Crédito</Label>
              <Select value={creditCardId} onValueChange={setCreditCardId}>
                <SelectTrigger>
                  <SelectValue placeholder='Cartão (opcional)' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='NONE'>Nenhum cartão</SelectItem>
                  {cards.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!isEditing && type === 'EXPENSE' && (
              <div className='space-y-1.5'>
                <Label htmlFor='tx-inst'>Parcelamento (Qtd. Parcelas)</Label>
                <Select
                  value={totalInstallments}
                  onValueChange={setTotalInstallments}
                >
                  <SelectTrigger id='tx-inst'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n === 1 ? 'À vista (1x)' : `${n}x parcelas mensais`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className='space-y-1.5'>
              <Label htmlFor='tx-merchant'>Estabelecimento (opcional)</Label>
              <Input
                id='tx-merchant'
                placeholder='Ex: iFood, Uber, Carrefour'
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type='submit' disabled={saving}>
              {saving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              {isEditing ? 'Salvar Alterações' : 'Adicionar Transação'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
