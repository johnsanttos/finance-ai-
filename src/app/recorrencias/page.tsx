'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, Play, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  formatCompetenceMonthPtBr,
  usePeriod,
} from '@/context/period-provider'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface RecurringRule {
  id: string
  description: string
  amountCents: number
  type: 'EXPENSE' | 'INCOME'
  dayOfMonth: number
  active: boolean
  category?: { name: string } | null
  bankAccount?: { name: string } | null
}

export default function RecorrenciasPage() {
  const { month, triggerRefresh } = usePeriod()
  const [rules, setRules] = useState<RecurringRule[]>([])
  const [categories, setCategories] = useState<
    Array<{ id: string; name: string }>
  >([])

  const [description, setDescription] = useState('')
  const [amountInput, setAmountInput] = useState('')
  const [dayOfMonth, setDayOfMonth] = useState('5')
  const [type, setType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE')
  const [categoryId, setCategoryId] = useState('NONE')

  const loadRules = async () => {
    const [rRes, cRes] = await Promise.all([
      fetch('/api/recurring'),
      fetch('/api/categories'),
    ])
    if (rRes.ok) {
      const rJson = await rRes.json()
      setRules(rJson.recurring || [])
    }
    if (cRes.ok) {
      const cJson = await cRes.json()
      setCategories(cJson.categories || [])
    }
  }

  useEffect(() => {
    loadRules()
  }, [])

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault()
    const amountCents = parseBrlToCents(amountInput)
    if (!description.trim() || !amountCents) {
      toast.error('Preencha a descrição e o valor.')
      return
    }

    const res = await fetch('/api/recurring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: description.trim(),
        amountCents,
        type,
        dayOfMonth: Number(dayOfMonth) || 5,
        categoryId: categoryId !== 'NONE' ? categoryId : null,
        active: true,
      }),
    })

    if (res.ok) {
      toast.success('Despesa/Receita recorrente cadastrada!')
      setDescription('')
      setAmountInput('')
      loadRules()
    }
  }

  const handleGenerateForCurrentMonth = async () => {
    const res = await fetch('/api/recurring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'GENERATE_FOR_MONTH',
        month,
      }),
    })
    if (res.ok) {
      const json = await res.json()
      toast.success(
        json.createdCount > 0
          ? `${json.createdCount} lançamento(s) recorrente(s) gerado(s) em ${formatCompetenceMonthPtBr(month)}!`
          : `Todas as recorrências ativas já foram lançadas em ${formatCompetenceMonthPtBr(month)}.`
      )
      triggerRefresh()
    }
  }

  const handleDeleteRule = async (id: string) => {
    const res = await fetch(`/api/recurring?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Recorrência removida.')
      loadRules()
    }
  }

  return (
    <>
      <Header fixed>
        <h1 className='text-sm font-semibold sm:text-base'>
          Despesas e Receitas Recorrentes
        </h1>
      </Header>

      <Main className='space-y-6'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>
              Compromissos Fixos Mensais
            </h2>
            <p className='text-sm text-muted-foreground'>
              Cadastre contas fixas (aluguel, internet, assinaturas, salário) e
              gere os lançamentos do mês com 1 clique.
            </p>
          </div>
          <Button
            onClick={handleGenerateForCurrentMonth}
            disabled={rules.length === 0}
            className='gap-1.5'
          >
            <Play className='h-4 w-4' />
            Lançar Recorrências em {formatCompetenceMonthPtBr(month)}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>
              Cadastrar Nova Recorrência
            </CardTitle>
            <CardDescription>
              Defina o dia de vencimento e o valor padrão.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleCreateRule}
              className='grid gap-3 sm:grid-cols-2 lg:grid-cols-6'
            >
              <div className='space-y-1 sm:col-span-2'>
                <Label className='text-xs'>Descrição</Label>
                <Input
                  placeholder='Ex: Condomínio, Internet Fibra, Netflix'
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>

              <div className='space-y-1'>
                <Label className='text-xs'>Valor (R$)</Label>
                <Input
                  placeholder='Ex: 149,90'
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  required
                />
              </div>

              <div className='space-y-1'>
                <Label className='text-xs'>Dia do Mês</Label>
                <Input
                  type='number'
                  min={1}
                  max={31}
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(e.target.value)}
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
                    <SelectItem value='NONE'>Sem categoria</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='flex items-end'>
                <Button type='submit' className='w-full gap-1'>
                  <Plus className='h-4 w-4' />
                  Salvar Fixa
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <CalendarClock className='h-4 w-4 text-primary' />
              Recorrências Cadastradas ({rules.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rules.length === 0 ? (
              <p className='py-8 text-center text-sm text-muted-foreground'>
                Nenhuma despesa recorrente cadastrada ainda.
              </p>
            ) : (
              <div className='divide-y'>
                {rules.map((r) => (
                  <div
                    key={r.id}
                    className='flex items-center justify-between py-3 text-sm'
                  >
                    <div>
                      <div className='flex items-center gap-2 font-medium'>
                        <span>{r.description}</span>
                        <Badge variant='secondary' className='text-[10px]'>
                          Todo dia {r.dayOfMonth}
                        </Badge>
                        {r.category && (
                          <Badge variant='outline' className='text-[10px]'>
                            {r.category.name}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className='flex items-center gap-3'>
                      <span className='font-semibold text-rose-500'>
                        {formatCentsToBrl(r.amountCents)}
                      </span>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='h-7 w-7 text-muted-foreground hover:text-destructive'
                        onClick={() => handleDeleteRule(r.id)}
                      >
                        <Trash2 className='h-3.5 w-3.5' />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
