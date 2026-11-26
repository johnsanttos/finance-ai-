'use client'

import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCentsToBrl } from '@/lib/finance/money'
import { CategorySummary, TransactionRecord } from '@/lib/finance/metrics'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface AnnualMonthPoint {
  monthCode: string
  monthLabel: string
  fullMonthLabel: string
  expensesCents: number
  incomeCents: number
  expensesReais: number
  incomeReais: number
}

export interface WeeklyComparisonPoint {
  label: string
  range: string
  expensesCents: number
  incomeCents: number
  expensesReais: number
  incomeReais: number
}

export interface TopExpenseItem {
  name: string
  categoryName: string
  color: string
  amountCents: number
  amountReais: number
  count: number
}

/* GRÁFICO 1 — Gastos por Categoria (Rosca clicável com detalhamento) */
export function CategoryPieChart({
  data,
  transactions,
}: {
  data: CategorySummary[]
  transactions: TransactionRecord[]
}) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const categoryDetails = selectedCategory
    ? transactions.filter(
        (t) =>
          (t.type === 'EXPENSE' || t.type === 'REFUND') &&
          (t.categoryName || 'Sem categoria') === selectedCategory
      )
    : []

  return (
    <>
      <Card className='col-span-1 lg:col-span-3'>
        <CardHeader>
          <CardTitle>1. Gastos por Categoria</CardTitle>
          <CardDescription>
            Clique em uma categoria no gráfico para ver seus gastos detalhados
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <div className='flex h-[280px] items-center justify-center text-sm text-muted-foreground'>
              Nenhuma despesa registrada neste período.
            </div>
          ) : (
            <div className='flex flex-col gap-2'>
              <div className='h-[200px] w-full'>
                <ResponsiveContainer width='100%' height='100%'>
                  <PieChart>
                    <Pie
                      data={data}
                      dataKey='amountCents'
                      nameKey='name'
                      cx='50%'
                      cy='50%'
                      innerRadius={52}
                      outerRadius={82}
                      paddingAngle={2}
                      onClick={(entry) => {
                        if (entry?.name) setSelectedCategory(String(entry.name))
                      }}
                      className='cursor-pointer'
                    >
                      {data.map((entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, _name, item) => [
                        `${formatCentsToBrl(Number(value))} (${item?.payload?.percentage ?? 0}%)`,
                        String(item?.payload?.name || 'Total'),
                      ]}
                      contentStyle={{
                        borderRadius: '8px',
                        backgroundColor: 'var(--popover)',
                        color: 'var(--popover-foreground)',
                        border: '1px solid var(--border)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className='flex max-h-[112px] flex-wrap justify-center gap-x-3 gap-y-1.5 overflow-y-auto rounded-md border bg-muted/20 p-2'>
                {data.map((entry) => (
                  <li key={entry.name} className='min-w-0 max-w-full'>
                    <button
                      type='button'
                      className='flex max-w-full cursor-pointer items-center gap-1.5 text-left text-[11px] text-foreground hover:text-primary hover:underline'
                      onClick={() => setSelectedCategory(entry.name)}
                      title={`${entry.name}: ${formatCentsToBrl(entry.amountCents)} (${entry.percentage}%)`}
                    >
                      <span
                        aria-hidden='true'
                        className='size-2.5 shrink-0 rounded-full'
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className='min-w-0 truncate max-w-[140px]'>
                        {entry.name}
                      </span>
                      <span className='shrink-0 text-[10px] text-muted-foreground'>
                        ({entry.percentage}%)
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selectedCategory)}
        onOpenChange={(open) => !open && setSelectedCategory(null)}
      >
        <DialogContent className='sm:max-w-[500px]'>
          <DialogHeader>
            <DialogTitle>Gastos em {selectedCategory}</DialogTitle>
            <DialogDescription>
              Detalhamento dos {categoryDetails.length} lançamento(s) desta
              categoria no período selecionado.
            </DialogDescription>
          </DialogHeader>
          <div className='max-h-72 divide-y overflow-y-auto rounded-lg border'>
            {categoryDetails.map((tx) => (
              <div
                key={tx.id}
                className='flex items-center justify-between px-3 py-2 text-xs'
              >
                <div>
                  <p className='font-medium'>{tx.description}</p>
                  <p className='text-[11px] text-muted-foreground'>
                    {new Date(tx.date).toLocaleDateString('pt-BR', {
                      timeZone: 'UTC',
                    })}
                  </p>
                </div>
                <span className='font-semibold text-rose-500'>
                  {formatCentsToBrl(tx.amountCents)}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* GRÁFICO 2 — Entradas e Saídas (Barras agrupadas: Mês selecionado ou por Semanas) */
export function IncomeExpenseChart({
  monthLabel,
  totalIncomeCents,
  totalExpenseCents,
  weeklyData,
}: {
  monthLabel: string
  totalIncomeCents: number
  totalExpenseCents: number
  weeklyData: WeeklyComparisonPoint[]
}) {
  const [mode, setMode] = useState<'WEEKS' | 'MONTH'>('WEEKS')

  const chartData =
    mode === 'WEEKS'
      ? weeklyData
      : [
          {
            label: monthLabel,
            incomeReais: Number((totalIncomeCents / 100).toFixed(2)),
            expensesReais: Number((totalExpenseCents / 100).toFixed(2)),
          },
        ]

  return (
    <Card className='col-span-1 lg:col-span-4'>
      <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-2'>
        <div>
          <CardTitle>2. Entradas e Saídas</CardTitle>
          <CardDescription>
            Comparativo entre receitas e despesas no período
          </CardDescription>
        </div>
        <div className='flex items-center gap-1'>
          <Button
            variant={mode === 'WEEKS' ? 'default' : 'outline'}
            size='sm'
            className='h-7 text-xs'
            onClick={() => setMode('WEEKS')}
          >
            Por Semanas
          </Button>
          <Button
            variant={mode === 'MONTH' ? 'default' : 'outline'}
            size='sm'
            className='h-7 text-xs'
            onClick={() => setMode('MONTH')}
          >
            Total do Mês
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className='h-[280px] w-full'>
          <ResponsiveContainer width='100%' height='100%'>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray='3 3' opacity={0.15} />
              <XAxis
                dataKey='label'
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `R$${val}`}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  formatCentsToBrl(Math.round(Number(value) * 100)),
                  name === 'incomeReais' ? 'Receitas' : 'Despesas',
                ]}
                contentStyle={{
                  borderRadius: '8px',
                  backgroundColor: 'var(--popover)',
                  color: 'var(--popover-foreground)',
                  border: '1px solid var(--border)',
                }}
              />
              <Legend
                formatter={(value) =>
                  value === 'incomeReais' ? 'Receitas' : 'Despesas'
                }
              />
              <Bar
                dataKey='incomeReais'
                name='incomeReais'
                fill='#10b981'
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey='expensesReais'
                name='expensesReais'
                fill='#f43f5e'
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

/* GRÁFICO 3 — Comparação dos Últimos 12 Meses (Linhas com série opcional de Receitas) */
export function Last12MonthsLineChart({ data }: { data: AnnualMonthPoint[] }) {
  const [showIncome, setShowIncome] = useState<boolean>(false)

  return (
    <Card className='col-span-1 lg:col-span-4'>
      <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-2'>
        <div>
          <CardTitle>3. Comparação dos Últimos 12 Meses</CardTitle>
          <CardDescription>
            Evolução histórica das despesas nos últimos 12 meses
          </CardDescription>
        </div>
        <Button
          variant={showIncome ? 'default' : 'outline'}
          size='sm'
          className='h-7 text-xs'
          onClick={() => setShowIncome((v) => !v)}
        >
          {showIncome ? 'Ocultar Receitas' : '+ Mostrar Receitas'}
        </Button>
      </CardHeader>
      <CardContent>
        <div className='h-[280px] w-full'>
          <ResponsiveContainer width='100%' height='100%'>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray='3 3' opacity={0.15} />
              <XAxis
                dataKey='monthLabel'
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `R$${val}`}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  formatCentsToBrl(Math.round(Number(value) * 100)),
                  name === 'incomeReais' ? 'Receitas' : 'Despesas',
                ]}
                contentStyle={{
                  borderRadius: '8px',
                  backgroundColor: 'var(--popover)',
                  color: 'var(--popover-foreground)',
                  border: '1px solid var(--border)',
                }}
              />
              <Legend
                formatter={(value) =>
                  value === 'incomeReais' ? 'Receitas' : 'Despesas'
                }
              />
              <Line
                type='monotone'
                dataKey='expensesReais'
                name='expensesReais'
                stroke='#ec4899'
                strokeWidth={2.5}
                dot={{ r: 3.5 }}
                activeDot={{ r: 6 }}
              />
              {showIncome && (
                <Line
                  type='monotone'
                  dataKey='incomeReais'
                  name='incomeReais'
                  stroke='#10b981'
                  strokeWidth={2}
                  strokeDasharray='5 5'
                  dot={{ r: 3 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

/* GRÁFICO 4 — Top 5 / Top 10 Maiores Gastos (Barras Horizontais) */
export function TopExpensesHorizontalChart({
  data,
}: {
  data: TopExpenseItem[]
}) {
  const [limit, setLimit] = useState<5 | 10>(5)
  const visible = data.slice(0, limit)

  return (
    <Card className='col-span-1 lg:col-span-3'>
      <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-2'>
        <div>
          <CardTitle>4. Maiores Gastos (Top {limit})</CardTitle>
          <CardDescription>
            Ranking por nome do gasto (sem duplicar pagamentos de fatura)
          </CardDescription>
        </div>
        <div className='flex items-center gap-1'>
          <Button
            variant={limit === 5 ? 'default' : 'outline'}
            size='sm'
            className='h-7 text-xs'
            onClick={() => setLimit(5)}
          >
            Top 5
          </Button>
          <Button
            variant={limit === 10 ? 'default' : 'outline'}
            size='sm'
            className='h-7 text-xs'
            onClick={() => setLimit(10)}
          >
            Top 10
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <div className='flex h-[280px] items-center justify-center text-sm text-muted-foreground'>
            Sem despesas registradas neste período.
          </div>
        ) : (
          <div className='h-[280px] w-full'>
            <ResponsiveContainer width='100%' height='100%'>
              <BarChart
                data={visible}
                layout='vertical'
                margin={{ left: 10, right: 18, top: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray='3 3' opacity={0.12} horizontal={false} />
                <XAxis
                  type='number'
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `R$${v}`}
                />
                <YAxis
                  type='category'
                  dataKey='name'
                  width={130}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val: string) =>
                    val.length > 18 ? `${val.slice(0, 17)}…` : val
                  }
                />
                <Tooltip
                  formatter={(value: number, _n, item) => [
                    formatCentsToBrl(Math.round(Number(value) * 100)),
                    `${item?.payload?.name} (${item?.payload?.categoryName})`,
                  ]}
                  contentStyle={{
                    borderRadius: '8px',
                    backgroundColor: 'var(--popover)',
                    color: 'var(--popover-foreground)',
                    border: '1px solid var(--border)',
                  }}
                />
                <Bar dataKey='amountReais' radius={[0, 4, 4, 0]}>
                  {visible.map((entry, idx) => (
                    <Cell key={`bar-${idx}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {visible.length > 0 && (
          <div className='mt-3 flex flex-wrap gap-1.5 border-t pt-2.5'>
            {visible.slice(0, 5).map((item, idx) => (
              <Badge key={item.name} variant='secondary' className='text-[10px]'>
                #{idx + 1} {item.name} • {item.categoryName}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
