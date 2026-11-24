'use client'

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Calculator,
  CreditCard,
  Flame,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { formatCentsToBrl } from '@/lib/finance/money'
import { DashboardMetrics } from '@/lib/finance/metrics'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function KpiCards({ metrics }: { metrics: DashboardMetrics }) {
  const expenseIncreased =
    metrics.expenseChangePercent !== null && metrics.expenseChangePercent > 0
  const expenseDecreased =
    metrics.expenseChangePercent !== null && metrics.expenseChangePercent < 0

  return (
    <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
      {/* 1. Total de despesas no mês */}
      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>
            Despesas no Período
          </CardTitle>
          <TrendingDown className='h-4 w-4 text-rose-500' />
        </CardHeader>
        <CardContent>
          <div className='text-2xl font-bold text-rose-500'>
            {formatCentsToBrl(metrics.totalExpenseCents)}
          </div>
          <p className='mt-1 text-xs text-muted-foreground'>
            Líquido de estornos (sem transferências)
          </p>
        </CardContent>
      </Card>

      {/* 2. Total de receitas no mês */}
      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>
            Receitas no Período
          </CardTitle>
          <TrendingUp className='h-4 w-4 text-emerald-500' />
        </CardHeader>
        <CardContent>
          <div className='text-2xl font-bold text-emerald-500'>
            {formatCentsToBrl(metrics.totalIncomeCents)}
          </div>
          <p className='mt-1 text-xs text-muted-foreground'>
            {metrics.incomeChangePercent !== null
              ? `${metrics.incomeChangePercent > 0 ? '+' : ''}${metrics.incomeChangePercent}% vs. mês anterior`
              : 'Entradas confirmadas no período'}
          </p>
        </CardContent>
      </Card>

      {/* 3. Saldo do período */}
      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>Saldo do Período</CardTitle>
          <Wallet className='h-4 w-4 text-primary' />
        </CardHeader>
        <CardContent>
          <div
            className={`text-2xl font-bold ${
              metrics.balanceCents >= 0 ? 'text-emerald-500' : 'text-rose-500'
            }`}
          >
            {formatCentsToBrl(metrics.balanceCents)}
          </div>
          <p className='mt-1 text-xs text-muted-foreground'>
            {metrics.balanceCents >= 0
              ? 'Superávit no período selecionado'
              : 'Déficit no período selecionado'}
          </p>
        </CardContent>
      </Card>

      {/* 4. Comparação com o mês anterior */}
      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>
            Variação vs. Mês Anterior
          </CardTitle>
          <Activity className='h-4 w-4 text-muted-foreground' />
        </CardHeader>
        <CardContent>
          {metrics.expenseChangePercent !== null ? (
            <div className='flex items-center gap-2'>
              <span
                className={`text-2xl font-bold ${
                  expenseIncreased
                    ? 'text-rose-500'
                    : expenseDecreased
                      ? 'text-emerald-500'
                      : ''
                }`}
              >
                {metrics.expenseChangePercent > 0 ? '+' : ''}
                {metrics.expenseChangePercent}%
              </span>
              {expenseIncreased ? (
                <Badge variant='destructive' className='gap-0.5 text-[10px]'>
                  <ArrowUpRight className='h-3 w-3' /> Aumento
                </Badge>
              ) : expenseDecreased ? (
                <Badge
                  variant='secondary'
                  className='gap-0.5 bg-emerald-500/15 text-[10px] text-emerald-500'
                >
                  <ArrowDownRight className='h-3 w-3' /> Redução
                </Badge>
              ) : null}
            </div>
          ) : (
            <div className='text-2xl font-bold text-muted-foreground'>—</div>
          )}
          <p className='mt-1 text-xs text-muted-foreground'>
            Comparativo de gastos com o mês prévio
          </p>
        </CardContent>
      </Card>

      {/* 5. Categoria com maior gasto */}
      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>
            Maior Categoria de Gasto
          </CardTitle>
          <Flame className='h-4 w-4 text-amber-500' />
        </CardHeader>
        <CardContent>
          <div className='truncate text-xl font-bold'>
            {metrics.topCategory ? metrics.topCategory.name : 'Sem gastos'}
          </div>
          <p className='mt-1 text-xs text-muted-foreground'>
            {metrics.topCategory
              ? `${formatCentsToBrl(metrics.topCategory.amountCents)} (${metrics.topCategory.percentage}% do total)`
              : 'Nenhuma despesa registrada'}
          </p>
        </CardContent>
      </Card>

      {/* 6. Total de gastos no cartão de crédito */}
      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>
            Gastos no Cartão de Crédito
          </CardTitle>
          <CreditCard className='h-4 w-4 text-violet-500' />
        </CardHeader>
        <CardContent>
          <div className='text-2xl font-bold'>
            {formatCentsToBrl(metrics.creditCardExpenseCents)}
          </div>
          <p className='mt-1 text-xs text-muted-foreground'>
            Compras e parcelas lançadas em cartões
          </p>
        </CardContent>
      </Card>

      {/* 7. Média mensal de despesas */}
      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>
            Média Mensal de Despesas
          </CardTitle>
          <Calculator className='h-4 w-4 text-sky-500' />
        </CardHeader>
        <CardContent>
          <div className='text-2xl font-bold'>
            {formatCentsToBrl(metrics.monthlyAverageExpenseCents)}
          </div>
          <p className='mt-1 text-xs text-muted-foreground'>
            Média histórica dos meses ativos
          </p>
        </CardContent>
      </Card>

      {/* 8. Quantidade de transações */}
      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>
            Quantidade de Transações
          </CardTitle>
          <Receipt className='h-4 w-4 text-muted-foreground' />
        </CardHeader>
        <CardContent>
          <div className='text-2xl font-bold'>{metrics.transactionCount}</div>
          <p className='mt-1 text-xs text-muted-foreground'>
            {metrics.uncategorizedCount > 0
              ? `${metrics.uncategorizedCount} aguardando categorização`
              : 'Todas categorizadas'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
