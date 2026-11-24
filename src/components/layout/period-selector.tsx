'use client'

import { Calendar, ChevronLeft, ChevronRight, Filter } from 'lucide-react'
import { usePeriod } from '@/context/period-provider'
import { PT_BR_MONTH_NAMES } from '@/lib/constants/months'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

const YEARS = ['2024', '2025', '2026', '2027', '2028']

export function PeriodSelector() {
  const {
    month,
    setMonth,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    useDateRange,
    setUseDateRange,
  } = usePeriod()

  const [currentYear, currentMonthStr] = month.split('-')
  const currentMonthIdx = Number(currentMonthStr) - 1

  const stepMonth = (delta: number) => {
    setUseDateRange(false)
    let newMonth = currentMonthIdx + delta
    let newYear = Number(currentYear)
    if (newMonth < 0) {
      newMonth = 11
      newYear -= 1
    } else if (newMonth > 11) {
      newMonth = 0
      newYear += 1
    }
    setMonth(`${newYear}-${String(newMonth + 1).padStart(2, '0')}`)
  }

  return (
    <div className='flex flex-wrap items-center gap-1.5 sm:gap-2'>
      <div className='flex items-center rounded-md border bg-card p-0.5 shadow-xs'>
        <Button
          variant='ghost'
          size='icon'
          className='h-8 w-8'
          onClick={() => stepMonth(-1)}
          title='Mês anterior'
        >
          <ChevronLeft className='h-4 w-4' />
        </Button>

        <Select
          value={currentMonthStr}
          onValueChange={(val) => {
            setUseDateRange(false)
            setMonth(`${currentYear}-${val}`)
          }}
        >
          <SelectTrigger className='h-8 w-[125px] border-0 bg-transparent text-xs font-medium shadow-none focus:ring-0 sm:text-sm'>
            <Calendar className='mr-1.5 h-3.5 w-3.5 text-primary' />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PT_BR_MONTH_NAMES.map((name, index) => {
              const val = String(index + 1).padStart(2, '0')
              return (
                <SelectItem key={val} value={val}>
                  {name}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>

        <Select
          value={currentYear}
          onValueChange={(val) => {
            setUseDateRange(false)
            setMonth(`${val}-${currentMonthStr}`)
          }}
        >
          <SelectTrigger className='h-8 w-[82px] border-0 bg-transparent text-xs font-medium shadow-none focus:ring-0 sm:text-sm'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {YEARS.map((y) => (
              <SelectItem key={y} value={y}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant='ghost'
          size='icon'
          className='h-8 w-8'
          onClick={() => stepMonth(1)}
          title='Próximo mês'
        >
          <ChevronRight className='h-4 w-4' />
        </Button>
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={useDateRange ? 'default' : 'outline'}
            size='sm'
            className='h-9 gap-1.5 text-xs'
          >
            <Filter className='h-3.5 w-3.5' />
            <span className='hidden md:inline'>Intervalo</span>
            {useDateRange && startDate && endDate && (
              <Badge variant='secondary' className='ml-1 px-1 py-0 text-[10px]'>
                Ativo
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-72 space-y-3' align='end'>
          <div className='space-y-1'>
            <h4 className='text-sm font-semibold'>Filtrar por intervalo de datas</h4>
            <p className='text-xs text-muted-foreground'>
              Sobrescreve o filtro mensal para análises personalizadas.
            </p>
          </div>
          <div className='grid gap-2'>
            <div className='grid gap-1'>
              <Label htmlFor='start-date' className='text-xs'>
                Data inicial
              </Label>
              <Input
                id='start-date'
                type='date'
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className='h-8 text-xs'
              />
            </div>
            <div className='grid gap-1'>
              <Label htmlFor='end-date' className='text-xs'>
                Data final
              </Label>
              <Input
                id='end-date'
                type='date'
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className='h-8 text-xs'
              />
            </div>
          </div>
          <div className='flex items-center justify-between pt-1'>
            <Button
              variant='ghost'
              size='sm'
              className='h-8 text-xs'
              onClick={() => {
                setUseDateRange(false)
                setStartDate('')
                setEndDate('')
              }}
            >
              Limpar
            </Button>
            <Button
              size='sm'
              className='h-8 text-xs'
              disabled={!startDate || !endDate}
              onClick={() => setUseDateRange(true)}
            >
              Aplicar intervalo
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
