export interface InstallmentInput {
  description: string
  totalAmountCents: number
  totalInstallments: number
  startDate: string // YYYY-MM-DD
}

export interface GeneratedInstallment {
  installmentNumber: number
  totalInstallments: number
  amountCents: number
  date: Date
  isoDate: string
  competenceMonth: string
  description: string
}

export function generateInstallments(input: InstallmentInput): GeneratedInstallment[] {
  const count = Math.max(1, Math.floor(input.totalInstallments))
  const total = Math.abs(Math.round(input.totalAmountCents))
  const baseInstallment = Math.floor(total / count)
  const remainder = total - baseInstallment * count

  const [yearStr, monthStr, dayStr] = input.startDate.slice(0, 10).split('-')
  const startYear = Number(yearStr)
  const startMonthIndex = Number(monthStr) - 1 // 0-11
  const startDay = Number(dayStr) || 1

  const cleanDesc = input.description.replace(/\s*\(\d+\/\d+\)\s*$/, '').trim()
  const result: GeneratedInstallment[] = []

  for (let i = 0; i < count; i++) {
    const targetMonthIndex = startMonthIndex + i
    const targetYear = startYear + Math.floor(targetMonthIndex / 12)
    const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12
    const maxDayInMonth = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate()
    const clampedDay = Math.min(startDay, maxDayInMonth)

    const monthPadded = String(normalizedMonth + 1).padStart(2, '0')
    const dayPadded = String(clampedDay).padStart(2, '0')
    const competenceMonth = `${targetYear}-${monthPadded}`
    const isoDate = `${competenceMonth}-${dayPadded}`
    const dateObj = new Date(`${isoDate}T12:00:00.000Z`)

    const amountCents = i === 0 ? baseInstallment + remainder : baseInstallment
    const installmentNumber = i + 1

    result.push({
      installmentNumber,
      totalInstallments: count,
      amountCents,
      date: dateObj,
      isoDate,
      competenceMonth,
      description: count > 1 ? `${cleanDesc} (${installmentNumber}/${count})` : cleanDesc,
    })
  }

  return result
}
