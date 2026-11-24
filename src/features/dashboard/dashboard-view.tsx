'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeftRight, Plus, Sparkles, Table2 } from 'lucide-react'
import {
  formatCompetenceMonthPtBr,
  usePeriod,
} from '@/context/period-provider'
import { DashboardMetrics, TransactionRecord } from '@/lib/finance/metrics'
import { formatCentsToBrl } from '@/lib/finance/money'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { KpiCards } from './components/kpi-cards'
import { BudgetAlertItem, BudgetAlerts } from './components/budget-alerts'
import {
  AnnualMonthPoint,
  CategoryPieChart,
  IncomeExpenseChart,
  Last12MonthsLineChart,
  TopExpenseItem,
  TopExpensesHorizontalChart,
  WeeklyComparisonPoint,
} from './components/financial-charts'
import { TransactionDialog } from '@/features/transactions/transaction-dialog'

interface DashboardPayload {
  month: string
  prevMonth: string
  metrics: DashboardMetrics
  last12Months: AnnualMonthPoint[]
  weeklyComparison: WeeklyComparisonPoint[]
  topExpenses: TopExpenseItem[]
  budgetAlerts: BudgetAlertItem[]
  periodTransactions: TransactionRecord[]
  recentTransactions: TransactionRecord[]
}

export function DashboardView() {
  const {
    month,
    startDate,
    endDate,
    useDateRange,
    refreshTrigger,
    triggerRefresh,
  } = usePeriod()
  const [data, setData] = useState<DashboardPayload | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [createOpen, setCreateOpen] = useState<boolean>(false)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ month })
      if (useDateRange && startDate && endDate) {
        params.set('startDate', startDate)
        params.set('endDate', endDate)
      }
      const res = await fetch(`/api/dashboard?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (error) {
      console.error('Erro ao carregar dashboard:', error)
    } finally {
      setLoading(false)
    }
  }, [month, startDate, endDate, useDateRange])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard, refreshTrigger])

  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-2'>
          <h1 className='text-sm font-semibold sm:text-base'>
            Visão Geral Financeira
          </h1>
          <Badge variant='outline' className='hidden sm:inline-flex'>
            {useDateRange && startDate && endDate
              ? `${startDate.split('-').reverse().join('/')} até ${endDate.split('-').reverse().join('/')}`
              : formatCompetenceMonthPtBr(month)}
          </Badge>
        </div>
      </Header>

      <Main className='space-y-6'>
        {/* Cabeçalho e Ações Rápidas */}
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>
              Dashboard — {formatCompetenceMonthPtBr(month)}
            </h2>
            <p className='text-sm text-muted-foreground'>
              Acompanhe receitas, despesas reais, cartões e acesse sua Planilha
              Mensal integrada.
            </p>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <Button variant='outline' size='sm' asChild>
              <Link href='/planilha'>
                <Table2 className='mr-1.5 h-4 w-4 text-primary' />
                Abrir Planilha Mensal
              </Link>
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setCreateOpen(true)}
            >
              <Plus className='mr-1.5 h-4 w-4' />
              Nova Transação
            </Button>
            <Button size='sm' asChild>
              <Link href='/importar'>
                <Sparkles className='mr-1.5 h-4 w-4' />
                Importar Prints (IA)
              </Link>
            </Button>
          </div>
        </div>

        {loading || !data ? (
          <div className='space-y-6'>
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className='h-28 w-full rounded-xl' />
              ))}
            </div>
            <div className='grid gap-4 lg:grid-cols-7'>
              <Skeleton className='h-[340px] lg:col-span-3' />
              <Skeleton className='h-[340px] lg:col-span-4' />
            </div>
          </div>
        ) : (
          <>
            {/* Alertas de Orçamento e Transações sem Categoria */}
            <BudgetAlerts
              alerts={data.budgetAlerts}
              uncategorizedCount={data.metrics.uncategorizedCount}
            />

            {/* 8 Indicadores Principais */}
            <KpiCards metrics={data.metrics} />

            {/* EXATAMENTE 4 GRÁFICOS PRINCIPAIS */}
            {/* Linha 1: Gráfico 1 (Gastos por Categoria) + Gráfico 2 (Entradas e Saídas) */}
            <div className='grid grid-cols-1 gap-4 lg:grid-cols-7'>
              <CategoryPieChart
                data={data.metrics.categoryBreakdown}
                transactions={data.periodTransactions || []}
              />
              <IncomeExpenseChart
                monthLabel={formatCompetenceMonthPtBr(month)}
                totalIncomeCents={data.metrics.totalIncomeCents}
                totalExpenseCents={data.metrics.totalExpenseCents}
                weeklyData={data.weeklyComparison || []}
              />
            </div>

            {/* Linha 2: Gráfico 3 (Últimos 12 Meses) + Gráfico 4 (Top 5 / Top 10 Maiores Gastos) */}
            <div className='grid grid-cols-1 gap-4 lg:grid-cols-7'>
              <Last12MonthsLineChart data={data.last12Months || []} />
              <TopExpensesHorizontalChart data={data.topExpenses || []} />
            </div>

            {/* Últimas Movimentações do Período */}
            <Card>
              <CardHeader className='flex flex-row items-center justify-between'>
                <div>
                  <CardTitle>Movimentações Recentes do Período</CardTitle>
                  <CardDescription>
                    Últimos lançamentos registrados em{' '}
                    {formatCompetenceMonthPtBr(month)}
                  </CardDescription>
                </div>
                <Button variant='outline' size='sm' asChild>
                  <Link href='/transacoes'>
                    <ArrowLeftRight className='mr-1.5 h-3.5 w-3.5' />
                    Ver todas
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                {data.recentTransactions.length === 0 ? (
                  <div className='flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center'>
                    <Sparkles className='mb-3 h-8 w-8 text-muted-foreground' />
                    <h4 className='text-base font-semibold'>
                      Nenhuma movimentação registrada em{' '}
                      {formatCompetenceMonthPtBr(month)}
                    </h4>
                    <p className='mt-1 max-w-md text-xs text-muted-foreground'>
                      Preencha diretamente na Planilha Mensal, envie prints ou
                      PDFs do seu banco ou adicione manualmente.
                    </p>
                    <div className='mt-4 flex flex-wrap justify-center gap-2'>
                      <Button size='sm' asChild>
                        <Link href='/planilha'>Abrir Planilha Mensal</Link>
                      </Button>
                      <Button variant='outline' size='sm' asChild>
                        <Link href='/importar'>Importar Prints / PDF</Link>
                      </Button>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => setCreateOpen(true)}
                      >
                        Adicionar Manualmente
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className='divide-y'>
                    {data.recentTransactions.map((tx) => (
                      <div
                        key={tx.id}
                        className='flex items-center justify-between py-2.5 text-sm'
                      >
                        <div className='space-y-0.5'>
                          <div className='flex items-center gap-2 font-medium'>
                            <span>{tx.description}</span>
                            {tx.categoryName && (
                              <Badge
                                variant='secondary'
                                className='text-[10px]'
                              >
                                {tx.categoryName}
                              </Badge>
                            )}
                          </div>
                          <div className='text-xs text-muted-foreground'>
                            {new Date(tx.date).toLocaleDateString('pt-BR', {
                              timeZone: 'UTC',
                            })}{' '}
                            •{' '}
                            {tx.creditCardName ||
                              tx.bankAccountName ||
                              'Conta Geral'}
                          </div>
                        </div>
                        <span
                          className={`font-semibold ${
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
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </Main>

      <TransactionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={() => {
          triggerRefresh()
        }}
      />
    </>
  )
}
