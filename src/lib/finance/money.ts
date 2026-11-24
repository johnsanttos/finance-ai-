export function parseBrlToCents(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') {
    if (Number.isNaN(raw) || !Number.isFinite(raw)) return null
    return Math.round(Math.abs(raw) * 100)
  }

  const trimmed = raw.trim()
  if (!trimmed) return null

  // Remove R$, spaces, plus/minus signs
  const cleaned = trimmed
    .replace(/[R$\s+-]/gi, '')
    .trim()

  if (!cleaned || !/\d/.test(cleaned)) return null

  // Brazilian format with comma as decimal separator: "1.250,90" or "250,00"
  if (cleaned.includes(',')) {
    const normalized = cleaned.replace(/\./g, '').replace(',', '.')
    const parsed = Number(normalized)
    if (Number.isNaN(parsed)) return null
    return Math.round(Math.abs(parsed) * 100)
  }

  // Dot as thousand separator if multiple dots or 3 digits after dot without comma (e.g. "1.250")
  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    const parsed = Number(cleaned.replace(/\./g, ''))
    if (Number.isNaN(parsed)) return null
    return Math.round(Math.abs(parsed) * 100)
  }

  const parsed = Number(cleaned)
  if (Number.isNaN(parsed)) return null
  return Math.round(Math.abs(parsed) * 100)
}

export function formatCentsToBrl(cents: number, options?: { showSign?: boolean; type?: string }): string {
  const absValue = Math.abs(cents) / 100
  const formatted = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(absValue)

  if (options?.showSign) {
    if (options.type === 'EXPENSE') return `-${formatted}`
    if (options.type === 'INCOME' || options.type === 'REFUND') return `+${formatted}`
  }

  if (cents < 0) return `-${formatted}`
  return formatted
}
