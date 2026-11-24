'use client'

import { createContext, useContext, useState } from 'react'

import { PT_BR_MONTH_NAMES } from '@/lib/constants/months'
export { PT_BR_MONTH_NAMES }

export interface PeriodContextType {
  month: string // "YYYY-MM"
  setMonth: (month: string) => void
  startDate: string
  setStartDate: (date: string) => void
  endDate: string
  setEndDate: (date: string) => void
  useDateRange: boolean
  setUseDateRange: (use: boolean) => void
  refreshTrigger: number
  triggerRefresh: () => void
}

const now = new Date()
const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

const PeriodContext = createContext<PeriodContextType>({
  month: defaultMonth,
  setMonth: () => null,
  startDate: '',
  setStartDate: () => null,
  endDate: '',
  setEndDate: () => null,
  useDateRange: false,
  setUseDateRange: () => null,
  refreshTrigger: 0,
  triggerRefresh: () => null,
})

export function PeriodProvider({ children }: { children: React.ReactNode }) {
  const [month, setMonth] = useState<string>(defaultMonth)
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [useDateRange, setUseDateRange] = useState<boolean>(false)
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0)

  const triggerRefresh = () => setRefreshTrigger((prev) => prev + 1)

  return (
    <PeriodContext.Provider
      value={{
        month,
        setMonth,
        startDate,
        setStartDate,
        endDate,
        setEndDate,
        useDateRange,
        setUseDateRange,
        refreshTrigger,
        triggerRefresh,
      }}
    >
      {children}
    </PeriodContext.Provider>
  )
}

export function usePeriod() {
  return useContext(PeriodContext)
}

export function formatCompetenceMonthPtBr(competenceMonth: string): string {
  const [year, monthStr] = competenceMonth.split('-')
  const idx = Number(monthStr) - 1
  const monthName = PT_BR_MONTH_NAMES[idx] || monthStr
  return `${monthName} de ${year}`
}
