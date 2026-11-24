export interface ExtractedItemInput {
  date: string
  amountCents: number
  description: string
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'INVOICE_PAYMENT' | 'REFUND'
  [key: string]: unknown
}

export interface ExtractedItemWithDup<T extends ExtractedItemInput = ExtractedItemInput> {
  item: T
  fingerprint: string
  isDuplicate: boolean
  duplicateReason: string | null
}

const PT_MONTHS: Record<string, string> = {
  JAN: '01',
  JANEIRO: '01',
  FEV: '02',
  FEVEREIRO: '02',
  MAR: '03',
  MARCO: '03',
  MARÇO: '03',
  ABR: '04',
  ABRIL: '04',
  MAI: '05',
  MAIO: '05',
  JUN: '06',
  JUNHO: '06',
  JUL: '07',
  JULHO: '07',
  AGO: '08',
  AGOSTO: '08',
  SET: '09',
  SETEMBRO: '09',
  OUT: '10',
  OUTUBRO: '10',
  NOV: '11',
  NOVEMBRO: '11',
  DEZ: '12',
  DEZEMBRO: '12',
}

export function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildTransactionFingerprint(input: {
  date: string
  amountCents: number
  description: string
  ownerTag?: string | null
}): string {
  const datePart = input.date.slice(0, 10)
  const normDesc = normalizeDescription(input.description)
  const ownerPart = input.ownerTag ? normalizeDescription(input.ownerTag) : ''
  const base = `${datePart}|${Math.abs(Math.round(input.amountCents))}|${normDesc}`
  return ownerPart ? `${ownerPart}|${base}` : base
}

export function resolveTransactionDate(
  rawDate: string | null | undefined,
  referenceMonth: string
): {
  isoDate: string
  competenceMonth: string
  needsReview: boolean
  reviewReason?: string
} {
  const fallbackMonth = /^\d{4}-\d{2}$/.test(referenceMonth)
    ? referenceMonth
    : new Date().toISOString().slice(0, 7)
  const [refYear, refMonth] = fallbackMonth.split('-')

  if (!rawDate || !rawDate.trim()) {
    return {
      isoDate: `${fallbackMonth}-01`,
      competenceMonth: fallbackMonth,
      needsReview: true,
      reviewReason: 'Data ausente ou ilegível no print',
    }
  }

  const text = rawDate
    .trim()
    .toUpperCase()
    .replace(
      /^(?:SEGUNDA(?:-FEIRA)?|TER[CÇ]A(?:-FEIRA)?|QUARTA(?:-FEIRA)?|QUINTA(?:-FEIRA)?|SEXTA(?:-FEIRA)?|S[AÁ]BADO|DOMINGO|SEG|TER|QUA|QUI|SEX|S[AÁ]B|DOM)\s*[.,\-–—]?\s*/i,
      ''
    )
    .replace(/^(?:HOJE|ONTEM)\s*[,.\-–—]\s*/i, '')
    .replace(/\s+\d{1,2}:\d{2}(?::\d{2})?$/, '')
    .replace(/\.$/, '')
    .trim()

  // Palavras relativas comuns em apps bancários (HOJE / ONTEM)
  if (text === 'HOJE' || text === 'ONTEM') {
    const now = new Date()
    if (text === 'ONTEM') now.setDate(now.getDate() - 1)
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return {
      isoDate: `${y}-${m}-${d}`,
      competenceMonth: `${y}-${m}`,
      needsReview: false,
    }
  }

  // Format YYYY-MM-DD
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const [, y, m, d] = isoMatch
    return {
      isoDate: `${y}-${m}-${d}`,
      competenceMonth: `${y}-${m}`,
      needsReview: false,
    }
  }

  // Format DD/MM/YYYY or DD-MM-YYYY
  const dmyFull = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (dmyFull) {
    const d = dmyFull[1].padStart(2, '0')
    const m = dmyFull[2].padStart(2, '0')
    const y = dmyFull[3]
    return {
      isoDate: `${y}-${m}-${d}`,
      competenceMonth: `${y}-${m}`,
      needsReview: false,
    }
  }

  // Format DD/MM/YY
  const dmyShort = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})$/)
  if (dmyShort) {
    const d = dmyShort[1].padStart(2, '0')
    const m = dmyShort[2].padStart(2, '0')
    const y = `20${dmyShort[3]}`
    return {
      isoDate: `${y}-${m}-${d}`,
      competenceMonth: `${y}-${m}`,
      needsReview: false,
    }
  }

  // Format DD/MM
  const dmMatch = text.match(/^(\d{1,2})[/.-](\d{1,2})$/)
  if (dmMatch) {
    const d = dmMatch[1].padStart(2, '0')
    const m = dmMatch[2].padStart(2, '0')
    return {
      isoDate: `${refYear}-${m}-${d}`,
      competenceMonth: `${refYear}-${m}`,
      needsReview: false,
    }
  }

  // Format "05 NOV" or "05 DE NOVEMBRO" or "05 NOV 2026"
  const ptMatch = text.match(/^(\d{1,2})\s+(?:DE\s+)?([A-ZÇ]+)(?:\s+(?:DE\s+)?(\d{4}))?$/)
  if (ptMatch) {
    const d = ptMatch[1].padStart(2, '0')
    const monthCode = PT_MONTHS[ptMatch[2]]
    const y = ptMatch[3] || refYear
    if (monthCode) {
      return {
        isoDate: `${y}-${monthCode}-${d}`,
        competenceMonth: `${y}-${monthCode}`,
        needsReview: false,
      }
    }
  }

  // Day only "DIA 12" or "12"
  const dayOnly = text.match(/^(?:DIA\s+)?(\d{1,2})$/)
  if (dayOnly) {
    const d = dayOnly[1].padStart(2, '0')
    return {
      isoDate: `${refYear}-${refMonth}-${d}`,
      competenceMonth: fallbackMonth,
      needsReview: true,
      reviewReason: 'Apenas o dia foi identificado; confirme o mês/ano',
    }
  }

  return {
    isoDate: `${fallbackMonth}-01`,
    competenceMonth: fallbackMonth,
    needsReview: true,
    reviewReason: `Formato de data não reconhecido ("${rawDate}")`,
  }
}

export interface ExistingTxReference {
  date: string
  amountCents: number
  description: string
  fingerprint: string
}

const STOP_WORDS = new Set([
  'pix',
  'enviado',
  'recebido',
  'pagamento',
  'compra',
  'debito',
  'credito',
  'boleto',
  'code',
  'ltda',
  'automatico',
  'para',
  'com',
  'dos',
  'das',
])

function extractMeaningfulTokens(desc: string): string[] {
  return normalizeDescription(desc)
    .split(' ')
    .filter((t) => t.length >= 4 && !STOP_WORDS.has(t))
}

function findFuzzyExistingMatch(
  item: ExtractedItemInput,
  existingTxs: ExistingTxReference[],
  ownerTag?: string | null
): ExistingTxReference | null {
  if (!existingTxs.length || item.amountCents <= 0) return null
  const itemMonth = item.date.slice(0, 7)
  const itemTokens = extractMeaningfulTokens(item.description)
  if (itemTokens.length === 0) return null

  for (const ex of existingTxs) {
    if (Math.abs(ex.amountCents) !== Math.abs(item.amountCents)) continue
    if (ownerTag === 'viviane' && !ex.fingerprint.startsWith('viviane|')) {
      continue
    }

    const exDate = ex.date.slice(0, 10)
    const exMonth = exDate.slice(0, 7)
    if (exMonth !== itemMonth) continue

    const exTokens = new Set(extractMeaningfulTokens(ex.description))
    let shared = 0
    for (const tok of itemTokens) {
      if (exTokens.has(tok)) shared++
    }

    const sameExactDate = exDate === item.date.slice(0, 10)
    if ((sameExactDate && shared >= 1) || shared >= 2) {
      return ex
    }
  }
  return null
}

export function detectDuplicates<T extends ExtractedItemInput>(
  items: T[],
  existingFingerprints: Set<string>,
  ownerTag?: string | null,
  existingTransactions: ExistingTxReference[] = []
): Array<T & { fingerprint: string; isDuplicate: boolean; duplicateReason: string | null }> {
  const seenInBatch = new Set<string>()

  return items.map((item) => {
    const fingerprint = buildTransactionFingerprint({
      date: item.date,
      amountCents: item.amountCents,
      description: item.description,
      ownerTag,
    })

    if (existingFingerprints.has(fingerprint)) {
      seenInBatch.add(fingerprint)
      return {
        ...item,
        fingerprint,
        isDuplicate: true,
        duplicateReason: ownerTag
          ? `Transação idêntica já cadastrada para ${ownerTag}`
          : 'Transação idêntica já cadastrada no banco de dados',
      }
    }

    const fuzzyMatch = findFuzzyExistingMatch(item, existingTransactions, ownerTag)
    if (fuzzyMatch) {
      const [y, m, d] = fuzzyMatch.date.slice(0, 10).split('-')
      return {
        ...item,
        fingerprint,
        isDuplicate: true,
        duplicateReason: `Possível duplicata já salva em ${d}/${m}/${y} (${fuzzyMatch.description})`,
      }
    }

    if (seenInBatch.has(fingerprint)) {
      return {
        ...item,
        fingerprint,
        isDuplicate: true,
        duplicateReason: 'Sobreposição detectada entre screenshots do mesmo lote',
      }
    }

    seenInBatch.add(fingerprint)
    return {
      ...item,
      fingerprint,
      isDuplicate: false,
      duplicateReason: null,
    }
  })
}
