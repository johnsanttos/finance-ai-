'use client'

import { useState } from 'react'
import {
  CheckCircle2,
  Clock,
  CreditCard,
  PiggyBank,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  SpreadsheetCardItem,
  SpreadsheetSummary,
} from '@/lib/finance/spreadsheet'
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

export interface FinancialReserveItem {
  id: string
  name: string
  targetAmountCents: number
  currentAmountCents: number
  color: string
  notes?: string | null
}

export function SpreadsheetSummaryPanel({
  summary,
  reserves,
  creditCardBreakdown = [],
  totalCreditCardCents = 0,
  onReservesChanged,
}: {
  summary: SpreadsheetSummary
  reserves: FinancialReserveItem[]
  creditCardBreakdown?: SpreadsheetCardItem[]
  totalCreditCardCents?: number
  onReservesChanged: () => void
}) {
  const [addingReserve, setAddingReserve] = useState(false)
  const [resName, setResName] = useState('')
  const [resCurrent, setResCurrent] = useState('')
  const [resTarget, setResTarget] = useState('')

  const totalReservedCents = reserves.reduce(
    (acc, r) => acc + r.currentAmountCents,
    0
  )

  const handleAddReserve = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resName.trim()) return
    const currentAmountCents = parseBrlToCents(resCurrent) ?? 0
    const targetAmountCents = parseBrlToCents(resTarget) ?? 0

    const res = await fetch('/api/reserves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: resName.trim(),
        currentAmountCents,
        targetAmountCents,
      }),
    })
    if (res.ok) {
      toast.success('Reserva financeira adicionada (não infla despesas).')
      setResName('')
      setResCurrent('')
      setResTarget('')
      setAddingReserve(false)
      onReservesChanged()
    }
  }

  const handleUpdateReserveValue = async (
    item: FinancialReserveItem,
    deltaCents: number
  ) => {
    const nextVal = Math.max(0, item.currentAmountCents + deltaCents)
    const res = await fetch('/api/reserves', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, currentAmountCents: nextVal }),
    })
    if (res.ok) {
      onReservesChanged()
    }
  }

  const handleDeleteReserve = async (id: string) => {
    const res = await fetch(`/api/reserves?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Reserva removida.')
      onReservesChanged()
    }
  }

  return (
    <div className='space-y-4'>
      {/* Resumo Financeiro estilo Excel */}
      <Card className='border-primary/30'>
        <CardHeader className='pb-3'>
          <CardTitle className='flex items-center gap-2 text-base'>
            <Wallet className='h-4 w-4 text-primary' />
            Resumo Financeiro do Mês
          </CardTitle>
          <CardDescription className='text-xs'>
            Recalculado em tempo real conforme você edita a planilha.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-2.5 text-sm'>
          <div className='flex items-center justify-between rounded-lg border bg-rose-500/10 px-3 py-2'>
            <span className='flex items-center gap-1.5 text-xs font-semibold'>
              <TrendingDown className='h-3.5 w-3.5 text-rose-500' />
              TOTAL DE GASTOS
            </span>
            <span className='font-bold text-rose-500'>
              {formatCentsToBrl(summary.totalExpensesCents)}
            </span>
          </div>

          <div className='flex items-center justify-between rounded-lg border bg-emerald-500/10 px-3 py-2'>
            <span className='flex items-center gap-1.5 text-xs font-semibold'>
              <CheckCircle2 className='h-3.5 w-3.5 text-emerald-500' />
              TOTAL PAGO
            </span>
            <span className='font-bold text-emerald-500'>
              {formatCentsToBrl(summary.totalPaidCents)}
            </span>
          </div>

          <div className='flex items-center justify-between rounded-lg border bg-amber-500/10 px-3 py-2'>
            <span className='flex items-center gap-1.5 text-xs font-semibold'>
              <Clock className='h-3.5 w-3.5 text-amber-500' />
              FALTA PAGAR
            </span>
            <span className='font-bold text-amber-500'>
              {formatCentsToBrl(summary.totalPendingCents)}
            </span>
          </div>

          <div className='my-1 border-t pt-2' />

          <div className='flex items-center justify-between rounded-lg border bg-card px-3 py-2'>
            <div>
              <p className='flex items-center gap-1.5 text-xs font-semibold'>
                <TrendingUp className='h-3.5 w-3.5 text-emerald-500' />
                TOTAL DE RECEITAS
              </p>
              {summary.totalPendingIncomeCents > 0 && (
                <p className='text-[10px] text-muted-foreground'>
                  Previsto: {formatCentsToBrl(summary.totalPlannedIncomeCents)}
                </p>
              )}
            </div>
            <span className='font-bold text-emerald-500'>
              {formatCentsToBrl(summary.totalReceivedIncomeCents)}
            </span>
          </div>

          <div className='flex items-center justify-between rounded-lg border bg-card px-3 py-2'>
            <div>
              <p className='text-xs font-semibold'>SALDO DO MÊS</p>
              <p className='text-[10px] text-muted-foreground'>
                Receitas realizadas − Gastos do mês
              </p>
            </div>
            <span
              className={`font-bold ${
                summary.monthResultCents >= 0
                  ? 'text-emerald-500'
                  : 'text-rose-500'
              }`}
            >
              {formatCentsToBrl(summary.monthResultCents)}
            </span>
          </div>

          <div className='flex items-center justify-between rounded-lg border bg-card px-3 py-2'>
            <div>
              <p className='text-xs font-semibold'>SALDO DISPONÍVEL</p>
              <p className='text-[10px] text-muted-foreground'>
                Caixa efetivo (Recebido − Pago)
              </p>
            </div>
            <span
              className={`font-bold ${
                summary.availableBalanceCents >= 0
                  ? 'text-sky-400'
                  : 'text-rose-500'
              }`}
            >
              {formatCentsToBrl(summary.availableBalanceCents)}
            </span>
          </div>

          <div className='flex items-center justify-between rounded-lg border border-primary/40 bg-primary/10 px-3 py-2'>
            <div>
              <p className='text-xs font-semibold'>PREVISÃO DE SALDO</p>
              <p className='text-[10px] text-muted-foreground'>
                Receitas previstas − Gastos totais
              </p>
            </div>
            <span
              className={`font-bold ${
                summary.projectedBalanceCents >= 0
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              }`}
            >
              {formatCentsToBrl(summary.projectedBalanceCents)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Gráfico / Ranking de Gastos de Cartões */}
      <Card>
        <CardHeader className='pb-3'>
          <div className='flex items-center justify-between gap-2'>
            <CardTitle className='flex items-center gap-2 text-base'>
              <CreditCard className='h-4 w-4 text-fuchsia-500' />
              Gastos de Cartões
            </CardTitle>
            <span className='text-xs font-bold text-fuchsia-500'>
              {formatCentsToBrl(totalCreditCardCents)}
            </span>
          </div>
          <CardDescription className='text-[11px]'>
            Resumo das faturas e cartões lançados neste mês.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          {creditCardBreakdown.length === 0 ? (
            <p className='py-2 text-center text-xs text-muted-foreground'>
              Nenhum gasto de cartão neste mês (linhas com &ldquo;Cartão&rdquo; no nome aparecem aqui).
            </p>
          ) : (
            creditCardBreakdown.map((card, idx) => (
              <div key={`${card.name}-${idx}`} className='space-y-1.5 text-xs'>
                <div className='flex items-center justify-between gap-2'>
                  <div className='flex min-w-0 items-center gap-1.5'>
                    <span className='text-[10px] font-bold text-muted-foreground'>
                      #{idx + 1}
                    </span>
                    <span
                      className='h-2.5 w-2.5 shrink-0 rounded-full'
                      style={{ backgroundColor: card.color }}
                    />
                    <span className='truncate font-semibold'>{card.name}</span>
                    <Badge
                      variant='secondary'
                      className='h-4 px-1 text-[9px] font-medium'
                    >
                      {card.count}x
                    </Badge>
                  </div>
                  <div className='shrink-0 text-right'>
                    <span className='font-bold'>
                      {formatCentsToBrl(card.amountCents)}
                    </span>{' '}
                    <span className='text-[10px] text-muted-foreground'>
                      ({card.percentage.toFixed(1)}%)
                    </span>
                  </div>
                </div>
                <div className='h-1.5 w-full overflow-hidden rounded-full bg-secondary'>
                  <div
                    className='h-full rounded-full transition-all duration-500'
                    style={{
                      width: `${Math.max(4, Math.min(100, card.percentage))}%`,
                      backgroundColor: card.color,
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Seção de Reservas Financeiras */}
      <Card>
        <CardHeader className='flex flex-row items-center justify-between pb-3'>
          <div>
            <CardTitle className='flex items-center gap-2 text-base'>
              <PiggyBank className='h-4 w-4 text-emerald-500' />
              Reservas Financeiras
            </CardTitle>
            <CardDescription className='text-[11px]'>
              Total reservado:{' '}
              <strong className='text-foreground'>
                {formatCentsToBrl(totalReservedCents)}
              </strong>{' '}
              (não contabilizado como despesa)
            </CardDescription>
          </div>
          <Button
            variant='outline'
            size='icon'
            className='h-7 w-7'
            onClick={() => setAddingReserve((v) => !v)}
            title='Nova reserva'
          >
            <Plus className='h-3.5 w-3.5' />
          </Button>
        </CardHeader>

        <CardContent className='space-y-3'>
          {addingReserve && (
            <form
              onSubmit={handleAddReserve}
              className='space-y-2 rounded-lg border bg-card/70 p-2.5'
            >
              <Input
                placeholder='Nome (ex: Reserva de emergência, Viagem)'
                value={resName}
                onChange={(e) => setResName(e.target.value)}
                className='h-8 text-xs'
                required
              />
              <div className='grid grid-cols-2 gap-2'>
                <Input
                  placeholder='Guardado R$'
                  value={resCurrent}
                  onChange={(e) => setResCurrent(e.target.value)}
                  className='h-8 text-xs'
                />
                <Input
                  placeholder='Meta R$ (opc.)'
                  value={resTarget}
                  onChange={(e) => setResTarget(e.target.value)}
                  className='h-8 text-xs'
                />
              </div>
              <Button type='submit' size='sm' className='h-7 w-full text-xs'>
                Salvar Reserva
              </Button>
            </form>
          )}

          {reserves.length === 0 ? (
            <p className='py-3 text-center text-xs text-muted-foreground'>
              Nenhuma reserva cadastrada (ex: Emergência, Carro, Viagem).
            </p>
          ) : (
            <div className='space-y-2.5'>
              {reserves.map((r) => {
                const pct =
                  r.targetAmountCents > 0
                    ? Math.min(
                        100,
                        Math.round(
                          (r.currentAmountCents / r.targetAmountCents) * 100
                        )
                      )
                    : 0
                return (
                  <div
                    key={r.id}
                    className='space-y-1.5 rounded-lg border bg-card/40 p-2.5 text-xs'
                  >
                    <div className='flex items-center justify-between gap-2'>
                      <span className='font-semibold'>{r.name}</span>
                      <div className='flex items-center gap-1'>
                        <Button
                          variant='ghost'
                          size='sm'
                          className='h-6 px-1.5 text-[10px]'
                          onClick={() => handleUpdateReserveValue(r, 10000)}
                          title='Adicionar R$ 100,00'
                        >
                          +100
                        </Button>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='h-6 w-6 text-muted-foreground hover:text-destructive'
                          onClick={() => handleDeleteReserve(r.id)}
                        >
                          <Trash2 className='h-3 w-3' />
                        </Button>
                      </div>
                    </div>
                    <div className='flex items-baseline justify-between'>
                      <span className='font-bold text-emerald-500'>
                        {formatCentsToBrl(r.currentAmountCents)}
                      </span>
                      {r.targetAmountCents > 0 && (
                        <Badge variant='outline' className='px-1 py-0 text-[10px]'>
                          Meta {formatCentsToBrl(r.targetAmountCents)} ({pct}%)
                        </Badge>
                      )}
                    </div>
                    {r.targetAmountCents > 0 && (
                      <div className='h-1.5 w-full overflow-hidden rounded-full bg-secondary'>
                        <div
                          className='h-full rounded-full bg-emerald-500'
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
