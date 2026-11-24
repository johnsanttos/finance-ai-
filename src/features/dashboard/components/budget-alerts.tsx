'use client'

import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Tag } from 'lucide-react'
import { formatCentsToBrl } from '@/lib/finance/money'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export interface BudgetAlertItem {
  categoryId: string
  categoryName: string
  color: string
  spentCents: number
  budgetCents: number
  usagePercent: number
  exceeded: boolean
  nearLimit: boolean
}

export function BudgetAlerts({
  alerts,
  uncategorizedCount,
}: {
  alerts: BudgetAlertItem[]
  uncategorizedCount: number
}) {
  const criticalAlerts = alerts.filter((a) => a.exceeded || a.nearLimit)

  if (criticalAlerts.length === 0 && uncategorizedCount === 0) {
    return null
  }

  return (
    <div className='grid gap-3 md:grid-cols-2'>
      {criticalAlerts.length > 0 && (
        <Alert variant='destructive' className='border-rose-500/40 bg-rose-500/10'>
          <AlertTriangle className='h-4 w-4' />
          <AlertTitle className='flex items-center justify-between font-semibold'>
            <span>Alertas de Orçamento Mensal</span>
            <Link href='/categorias'>
              <Button variant='ghost' size='sm' className='h-6 px-2 text-xs'>
                Ajustar metas
              </Button>
            </Link>
          </AlertTitle>
          <AlertDescription className='mt-2 space-y-1.5'>
            {criticalAlerts.slice(0, 3).map((item) => (
              <div
                key={item.categoryId}
                className='flex items-center justify-between text-xs'
              >
                <span className='font-medium'>{item.categoryName}</span>
                <div className='flex items-center gap-2'>
                  <span>
                    {formatCentsToBrl(item.spentCents)} /{' '}
                    {formatCentsToBrl(item.budgetCents)}
                  </span>
                  <Badge
                    variant={item.exceeded ? 'destructive' : 'secondary'}
                    className='px-1.5 py-0 text-[10px]'
                  >
                    {item.usagePercent}%
                  </Badge>
                </div>
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {uncategorizedCount > 0 && (
        <Alert className='border-amber-500/40 bg-amber-500/10'>
          <Tag className='h-4 w-4 text-amber-500' />
          <AlertTitle className='font-semibold text-amber-500'>
            Transações sem categoria ({uncategorizedCount})
          </AlertTitle>
          <AlertDescription className='mt-1 flex items-center justify-between text-xs'>
            <span>
              Existem movimentações sem categoria atribuída neste período.
            </span>
            <Link href='/transacoes?uncategorized=true'>
              <Button variant='outline' size='sm' className='h-7 text-xs'>
                Revisar agora
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
