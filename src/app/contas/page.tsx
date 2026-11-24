'use client'

import { useEffect, useState } from 'react'
import { CreditCard, Landmark, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatCentsToBrl, parseBrlToCents } from '@/lib/finance/money'
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

interface BankAccountRecord {
  id: string
  name: string
  institution: string
  type: string
  initialBalanceCents: number
  color: string
  _count?: { transactions: number }
}

interface CreditCardRecord {
  id: string
  name: string
  institution: string
  limitCents: number
  closingDay: number
  dueDay: number
  color: string
  _count?: { transactions: number }
}

export default function ContasPage() {
  const [banks, setBanks] = useState<BankAccountRecord[]>([])
  const [cards, setCards] = useState<CreditCardRecord[]>([])

  const [bankName, setBankName] = useState('')
  const [bankInst, setBankInst] = useState('')

  const [cardName, setCardName] = useState('')
  const [cardInst, setCardInst] = useState('')
  const [cardLimit, setCardLimit] = useState('')
  const [closingDay, setClosingDay] = useState('5')
  const [dueDay, setDueDay] = useState('12')

  const loadAccounts = async () => {
    const res = await fetch('/api/accounts')
    if (res.ok) {
      const json = await res.json()
      setBanks(json.bankAccounts || [])
      setCards(json.creditCards || [])
    }
  }

  useEffect(() => {
    loadAccounts()
  }, [])

  const handleAddBank = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!bankName.trim() || !bankInst.trim()) return

    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityType: 'BANK_ACCOUNT',
        name: bankName.trim(),
        institution: bankInst.trim(),
        type: 'CHECKING',
      }),
    })
    if (res.ok) {
      toast.success('Conta bancária adicionada!')
      setBankName('')
      setBankInst('')
      loadAccounts()
    }
  }

  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cardName.trim() || !cardInst.trim()) return

    const limitCents = parseBrlToCents(cardLimit) ?? 0
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityType: 'CREDIT_CARD',
        name: cardName.trim(),
        institution: cardInst.trim(),
        limitCents,
        closingDay: Number(closingDay) || 5,
        dueDay: Number(dueDay) || 12,
      }),
    })
    if (res.ok) {
      toast.success('Cartão de crédito adicionado!')
      setCardName('')
      setCardInst('')
      setCardLimit('')
      loadAccounts()
    }
  }

  const handleDelete = async (id: string, entityType: string) => {
    const res = await fetch(
      `/api/accounts?id=${id}&entityType=${entityType}`,
      { method: 'DELETE' }
    )
    if (res.ok) {
      toast.success('Registro removido.')
      loadAccounts()
    }
  }

  return (
    <>
      <Header fixed hidePeriodSelector>
        <h1 className='text-sm font-semibold sm:text-base'>
          Contas Bancárias & Cartões de Crédito
        </h1>
      </Header>

      <Main className='space-y-6'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>
            Instituições Financeiras e Cartões
          </h2>
          <p className='text-sm text-muted-foreground'>
            Cadastre seus bancos e cartões para vincular às importações de
            prints e lançamentos manuais.
          </p>
        </div>

        <div className='grid gap-6 lg:grid-cols-2'>
          {/* Contas Bancárias */}
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-base'>
                <Landmark className='h-4 w-4 text-primary' />
                Contas Bancárias ({banks.length})
              </CardTitle>
              <CardDescription>
                Nubank, Itaú, Bradesco, Santander, Banco do Brasil, Inter, etc.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <form
                onSubmit={handleAddBank}
                className='grid gap-2 sm:grid-cols-3'
              >
                <Input
                  placeholder='Nome (ex: Conta Itaú)'
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  required
                />
                <Input
                  placeholder='Banco (ex: Itaú)'
                  value={bankInst}
                  onChange={(e) => setBankInst(e.target.value)}
                  required
                />
                <Button type='submit' className='gap-1'>
                  <Plus className='h-4 w-4' />
                  Adicionar
                </Button>
              </form>

              <div className='divide-y'>
                {banks.map((b) => (
                  <div
                    key={b.id}
                    className='flex items-center justify-between py-2.5 text-sm'
                  >
                    <div>
                      <div className='font-medium'>{b.name}</div>
                      <div className='text-xs text-muted-foreground'>
                        Instituição: {b.institution} •{' '}
                        {b._count?.transactions || 0} lançamento(s)
                      </div>
                    </div>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='h-7 w-7 text-muted-foreground hover:text-destructive'
                      onClick={() => handleDelete(b.id, 'BANK_ACCOUNT')}
                    >
                      <Trash2 className='h-3.5 w-3.5' />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Cartões de Crédito */}
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-base'>
                <CreditCard className='h-4 w-4 text-violet-500' />
                Cartões de Crédito ({cards.length})
              </CardTitle>
              <CardDescription>
                Configure seus cartões para controle de faturas e compras
                parceladas.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <form
                onSubmit={handleAddCard}
                className='grid gap-2 sm:grid-cols-2'
              >
                <Input
                  placeholder='Nome (ex: Nubank Ultravioleta)'
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  required
                />
                <Input
                  placeholder='Emissor (ex: Nubank)'
                  value={cardInst}
                  onChange={(e) => setCardInst(e.target.value)}
                  required
                />
                <Input
                  placeholder='Limite R$ (ex: 15000,00)'
                  value={cardLimit}
                  onChange={(e) => setCardLimit(e.target.value)}
                />
                <div className='grid grid-cols-2 gap-2'>
                  <div className='flex items-center gap-1'>
                    <Label className='text-[11px] whitespace-nowrap'>
                      Fech.:
                    </Label>
                    <Input
                      type='number'
                      min={1}
                      max={31}
                      value={closingDay}
                      onChange={(e) => setClosingDay(e.target.value)}
                    />
                  </div>
                  <div className='flex items-center gap-1'>
                    <Label className='text-[11px] whitespace-nowrap'>
                      Venc.:
                    </Label>
                    <Input
                      type='number'
                      min={1}
                      max={31}
                      value={dueDay}
                      onChange={(e) => setDueDay(e.target.value)}
                    />
                  </div>
                </div>
                <Button type='submit' className='gap-1 sm:col-span-2'>
                  <Plus className='h-4 w-4' />
                  Adicionar Cartão
                </Button>
              </form>

              <div className='divide-y'>
                {cards.map((c) => (
                  <div
                    key={c.id}
                    className='flex items-center justify-between py-2.5 text-sm'
                  >
                    <div>
                      <div className='flex items-center gap-2 font-medium'>
                        <span>{c.name}</span>
                        <Badge variant='secondary' className='text-[10px]'>
                          Fecha dia {c.closingDay} • Vence dia {c.dueDay}
                        </Badge>
                      </div>
                      <div className='text-xs text-muted-foreground'>
                        Limite: {formatCentsToBrl(c.limitCents)} •{' '}
                        {c._count?.transactions || 0} compra(s)
                      </div>
                    </div>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='h-7 w-7 text-muted-foreground hover:text-destructive'
                      onClick={() => handleDelete(c.id, 'CREDIT_CARD')}
                    >
                      <Trash2 className='h-3.5 w-3.5' />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </Main>
    </>
  )
}
