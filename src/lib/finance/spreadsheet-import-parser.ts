import * as XLSX from 'xlsx'

export interface ParsedSpreadsheetExpense {
  name: string
  weeksCents: [number, number, number, number, number]
  paid: boolean
  totalCents: number
}

export interface ParsedSpreadsheetIncome {
  description: string
  amountCents: number
  received: boolean
}

export interface ParsedSpreadsheetBlock {
  blockId: string
  label: string
  detectedMonth: string // YYYY-MM
  hintText: string | null
  expenses: ParsedSpreadsheetExpense[]
  incomes: ParsedSpreadsheetIncome[]
  totalExpensesCents: number
  totalIncomesCents: number
}

const PT_MONTH_MAP: Record<string, string> = {
  jan: '01',
  janeiro: '01',
  fev: '02',
  fevereiro: '02',
  mar: '03',
  marco: '03',
  março: '03',
  abr: '04',
  abril: '04',
  mai: '05',
  maio: '05',
  jun: '06',
  junho: '06',
  jul: '07',
  julho: '07',
  ago: '08',
  agosto: '08',
  set: '09',
  setembro: '09',
  out: '10',
  outubro: '10',
  nov: '11',
  novembro: '11',
  dez: '12',
  dezembro: '12',
}

/**
 * Converte números vindos de Excel/CSV (tanto "542.68" quanto "1.449,48" ou "R$ 542,68") para centavos inteiros.
 */
export function parseFlexibleNumberToCents(raw: unknown): number {
  if (raw === null || raw === undefined) return 0
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return 0
    return Math.round(raw * 100)
  }
  const str = String(raw)
    .replace(/R\$/gi, '')
    .replace(/\s+/g, '')
    .trim()
  if (!str || str === '-' || str.toLowerCase() === 'nan' || str === 'L') {
    return 0
  }

  let normalized = str
  const hasComma = normalized.includes(',')
  const hasDot = normalized.includes('.')

  if (hasComma && hasDot) {
    // Decide pelo último separador: "1.449,48" -> BR; "1,449.48" -> US
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.')
    } else {
      normalized = normalized.replace(/,/g, '')
    }
  } else if (hasComma) {
    normalized = normalized.replace(',', '.')
  }

  const num = Number(normalized)
  if (!Number.isFinite(num) || num <= 0) return 0
  return Math.round(num * 100)
}

export function detectMonthFromText(
  text: string,
  fallbackMonth: string
): string | null {
  const clean = text.trim()
  if (!clean) return null

  const fallbackYear = fallbackMonth.slice(0, 4)

  // 2026-07-25 ou 2026-07
  const isoMatch = clean.match(/\b(20\d{2})[-/](\d{2})(?:[-/]\d{2})?\b/)
  if (isoMatch) {
    const m = Number(isoMatch[2])
    if (m >= 1 && m <= 12) return `${isoMatch[1]}-${isoMatch[2]}`
  }

  // DD/MM/YYYY ou MM/YYYY
  const brFull = clean.match(/\b(\d{2})\/(\d{2})\/(20\d{2})\b/)
  if (brFull) {
    const m = Number(brFull[2])
    if (m >= 1 && m <= 12) return `${brFull[3]}-${brFull[2]}`
  }

  // "JUNHO25", "SETEMBRO2025", "Outubro 2026", "Ago/26", "SET 2025", "Outubro"
  const monthNamesPattern = Object.keys(PT_MONTH_MAP)
    .sort((a, b) => b.length - a.length)
    .join('|')
  const ptRegex = new RegExp(
    `(?:^|[^a-zà-ÿ])(${monthNamesPattern})(?:[\\s/_-]*(?:de\\s+)?(20\\d{2}|\\d{2}))?(?=$|[^a-zà-ÿ])`,
    'i'
  )
  const ptMatch = clean.match(ptRegex)
  if (ptMatch) {
    const mCode = PT_MONTH_MAP[ptMatch[1].toLowerCase()]
    if (mCode) {
      let y = fallbackYear
      if (ptMatch[2]) {
        y = ptMatch[2].length === 2 ? `20${ptMatch[2]}` : ptMatch[2]
      }
      return `${y}-${mCode}`
    }
  }

  return null
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

function detectDelimiter(text: string): string {
  const firstLines = text.split(/\r?\n/).slice(0, 5).join('\n')
  const tabCount = (firstLines.match(/\t/g) || []).length
  const semiCount = (firstLines.match(/;/g) || []).length
  const commaCount = (firstLines.match(/,/g) || []).length
  if (tabCount >= semiCount && tabCount >= commaCount && tabCount > 2) return '\t'
  if (semiCount > commaCount && semiCount > 2) return ';'
  return ','
}

function isHeaderRow(cells: string[]): boolean {
  const joined = cells.map((c) => c.toUpperCase().trim()).join('|')
  return (
    (joined.includes('CONTA') || joined.includes('GASTO')) &&
    (joined.includes('SEMANA 1') || joined.includes('TOTAL'))
  )
}

function parseSingleBlockMatrix(
  matrix: string[][],
  label: string,
  defaultMonth: string,
  blockIndex: number
): ParsedSpreadsheetBlock | null {
  if (matrix.length < 2) return null

  const headerIdx = matrix.findIndex((row) => isHeaderRow(row))
  const header = (headerIdx >= 0 ? matrix[headerIdx] : matrix[0]).map((c) =>
    c.toUpperCase().trim()
  )
  const dataRows = matrix.slice(headerIdx >= 0 ? headerIdx + 1 : 1)

  // Localiza índices das colunas de Despesas
  const contaCol = header.findIndex(
    (h) => h === 'CONTAS' || h === 'CONTA' || h.includes('CONTA / GASTO') || h === 'GASTO'
  )
  const sem1Col = header.findIndex((h) => h.includes('SEMANA 1'))
  const sem2Col = header.findIndex((h) => h.includes('SEMANA 2'))
  const sem3Col = header.findIndex((h) => h.includes('SEMANA 3'))
  const sem4Col = header.findIndex((h) => h.includes('SEMANA 4'))
  const sem5Col = header.findIndex((h) => h.includes('SEMANA 5'))
  const pagoCol = header.findIndex((h) => h === 'PAGO' || h === 'STATUS')
  const totalCol = header.findIndex((h) => h === 'TOTAL')

  // Localiza índices das colunas de Receitas (lado direito da planilha)
  const incomeTitleCol = header.findIndex(
    (h) => h.includes('ENTRADA DE RECEITA') || h.includes('RECEITA')
  )
  const incomeValueCols: Array<{ idx: number; label: string }> = []
  if (incomeTitleCol >= 0) {
    for (let c = incomeTitleCol + 1; c < header.length; c++) {
      if (header[c]) {
        incomeValueCols.push({ idx: c, label: header[c] })
      }
    }
  }

  const effectiveContaCol = contaCol >= 0 ? contaCol : 0
  const expenses: ParsedSpreadsheetExpense[] = []
  const incomes: ParsedSpreadsheetIncome[] = []
  let hintText: string | null = null
  let detectedMonth = detectMonthFromText(label, defaultMonth) || defaultMonth

  const IGNORED_EXPENSE_NAMES = [
    /^total\s*(por\s*semana|de\s*gastos|geral)?$/i,
    /^contas?$/i,
    /^saldo/i,
    /^cofre/i,
  ]

  for (const row of dataRows) {
    // Procura dicas de data nas células da direita (ex: "2026-07-25", "ULTIMA ATUALIZAÇÃO 22/04")
    for (const cell of row) {
      if (!cell) continue
      if (/^20\d{2}-\d{2}-\d{2}$/.test(cell.trim()) || /atualiza/i.test(cell)) {
        hintText = hintText || cell.trim()
        const fromHint = detectMonthFromText(cell, defaultMonth)
        if (fromHint) detectedMonth = fromHint
      }
    }

    // 1. Extrai linha de despesa
    const rawName = (row[effectiveContaCol] || '').trim()
    if (
      rawName &&
      !IGNORED_EXPENSE_NAMES.some((re) => re.test(rawName))
    ) {
      const w1 = sem1Col >= 0 ? parseFlexibleNumberToCents(row[sem1Col]) : 0
      const w2 = sem2Col >= 0 ? parseFlexibleNumberToCents(row[sem2Col]) : 0
      const w3 = sem3Col >= 0 ? parseFlexibleNumberToCents(row[sem3Col]) : 0
      const w4 = sem4Col >= 0 ? parseFlexibleNumberToCents(row[sem4Col]) : 0
      const w5 = sem5Col >= 0 ? parseFlexibleNumberToCents(row[sem5Col]) : 0

      const sumWeeks = w1 + w2 + w3 + w4 + w5
      const rawTotal = totalCol >= 0 ? parseFlexibleNumberToCents(row[totalCol]) : 0

      const weeksCents: [number, number, number, number, number] = [
        w1,
        w2,
        w3,
        w4,
        w5,
      ]

      let finalTotal = sumWeeks
      if (sumWeeks === 0 && rawTotal > 0) {
        weeksCents[0] = rawTotal
        finalTotal = rawTotal
      }

      if (finalTotal > 0) {
        const pagoFlag = (pagoCol >= 0 ? row[pagoCol] || '' : '').trim().toLowerCase()
        const isPaid =
          pagoFlag === 'x' ||
          pagoFlag === 'sim' ||
          pagoFlag === 'pago' ||
          pagoFlag === 'paga' ||
          pagoFlag === 'ok'

        expenses.push({
          name: rawName,
          weeksCents,
          paid: isPaid,
          totalCents: finalTotal,
        })
      }
    }

    // 2. Extrai linha de receita (lado direito da planilha Excel)
    if (incomeTitleCol >= 0) {
      const incLabel = (row[incomeTitleCol] || '').trim()
      if (
        incLabel &&
        !/^(entrada\s+de\s+receita|total|atualizad|ultima\s+atualiza|20\d{2}-)/i.test(
          incLabel
        )
      ) {
        for (const col of incomeValueCols) {
          const valCents = parseFlexibleNumberToCents(row[col.idx])
          if (valCents > 0) {
            const colPretty =
              col.label.charAt(0).toUpperCase() + col.label.slice(1).toLowerCase()
            incomes.push({
              description: `${incLabel} (${colPretty})`,
              amountCents: valCents,
              received: true,
            })
          }
        }
      }
    }
  }

  if (expenses.length === 0 && incomes.length === 0) return null

  return {
    blockId: `block-${blockIndex + 1}`,
    label,
    detectedMonth,
    hintText,
    expenses,
    incomes,
    totalExpensesCents: expenses.reduce((acc, e) => acc + e.totalCents, 0),
    totalIncomesCents: incomes.reduce((acc, i) => acc + i.amountCents, 0),
  }
}

export function parseCsvSpreadsheetText(
  csvText: string,
  defaultMonth: string
): ParsedSpreadsheetBlock[] {
  const delimiter = detectDelimiter(csvText)
  const rawLines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const matrix = rawLines.map((line) => splitCsvLine(line, delimiter))

  // Divide em múltiplos blocos mensais sempre que aparecer um novo cabeçalho "CONTAS,SEMANA 1..."
  const headerIndices: number[] = []
  matrix.forEach((row, idx) => {
    if (isHeaderRow(row)) headerIndices.push(idx)
  })

  if (headerIndices.length <= 1) {
    const single = parseSingleBlockMatrix(
      matrix,
      `Planilha (${defaultMonth})`,
      defaultMonth,
      0
    )
    return single ? [single] : []
  }

  const blocks: ParsedSpreadsheetBlock[] = []
  for (let i = 0; i < headerIndices.length; i++) {
    const start = headerIndices[i]
    const end = i + 1 < headerIndices.length ? headerIndices[i + 1] : matrix.length
    const slice = matrix.slice(start, end)
    const parsed = parseSingleBlockMatrix(
      slice,
      `Bloco Mensal #${i + 1}`,
      defaultMonth,
      i
    )
    if (parsed) blocks.push(parsed)
  }

  return blocks
}

export function parseExcelWorkbookBuffer(
  buffer: ArrayBuffer,
  defaultMonth: string
): ParsedSpreadsheetBlock[] {
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })
  const blocks: ParsedSpreadsheetBlock[] = []

  wb.SheetNames.forEach((sheetName, idx) => {
    const sheet = wb.Sheets[sheetName]
    if (!sheet) return
    const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    }) as string[][]

    const parsed = parseSingleBlockMatrix(matrix, sheetName, defaultMonth, idx)
    if (parsed) blocks.push(parsed)
  })

  return blocks
}

/**
 * Parser local para OCR de print/foto de planilha mensal (colunas CONTA | SEMANA 1..4 | PAGO | TOTAL).
 */
export function parseSpreadsheetOcrText(
  rawText: string,
  targetMonth: string
): ParsedSpreadsheetBlock | null {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/[|[\]]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 2)

  const expenses: ParsedSpreadsheetExpense[] = []
  const incomes: ParsedSpreadsheetIncome[] = []

  const SKIP_LINE =
    /^(contas?|semana\s*\d|pago|total(\s+de\s+gastos|\s+pago)?|faltam?\s+a?\s*pagar|rendimentos|saldo|cofre|entrada\s+de\s+receita|sal[aá]rio\s+adiantamento)/i

  const MONEY_REGEX = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+\.\d{2}|\b\d{2,5}\b)/g

  for (const line of lines) {
    if (SKIP_LINE.test(line)) continue

    // Separa nome inicial dos números
    const firstNumMatch = line.match(/\s+(?:R\$\s*)?\d/)
    if (!firstNumMatch || firstNumMatch.index === undefined) continue

    const namePart = line.slice(0, firstNumMatch.index).trim()
    const restPart = line.slice(firstNumMatch.index).trim()
    if (!namePart || namePart.length < 2 || SKIP_LINE.test(namePart)) continue

    const nums: number[] = []
    for (const m of restPart.matchAll(MONEY_REGEX)) {
      const cents = parseFlexibleNumberToCents(m[1])
      if (cents > 0) nums.push(cents)
    }
    if (nums.length === 0) continue

    if (/^(sal[aá]rio|vari[aá]vel|adiantamento|f[eé]rias|13[ºo]|renda\s+extra)/i.test(namePart)) {
      const totalInc = nums.reduce((a, b) => a + b, 0)
      incomes.push({
        description: namePart,
        amountCents: totalInc,
        received: true,
      })
      continue
    }

    const isPaid = /\b[xX]\b|\bpago\b|\bpaga\b/i.test(restPart)
    const weeksCents: [number, number, number, number, number] = [0, 0, 0, 0, 0]

    // Se o último número for igual à soma dos anteriores, ele é a coluna TOTAL
    let weekNums = nums
    if (nums.length >= 2) {
      const last = nums[nums.length - 1]
      const prevSum = nums.slice(0, -1).reduce((a, b) => a + b, 0)
      if (Math.abs(last - prevSum) <= 5) {
        weekNums = nums.slice(0, -1)
      }
    }

    for (let i = 0; i < Math.min(weekNums.length, 5); i++) {
      weeksCents[i] = weekNums[i]
    }
    const totalCents = weeksCents.reduce((a, b) => a + b, 0)
    if (totalCents > 0) {
      expenses.push({
        name: namePart,
        weeksCents,
        paid: isPaid,
        totalCents,
      })
    }
  }

  if (expenses.length === 0 && incomes.length === 0) return null

  return {
    blockId: 'ocr-1',
    label: `Print da Planilha (${targetMonth})`,
    detectedMonth: targetMonth,
    hintText: null,
    expenses,
    incomes,
    totalExpensesCents: expenses.reduce((a, e) => a + e.totalCents, 0),
    totalIncomesCents: incomes.reduce((a, i) => a + i.amountCents, 0),
  }
}
