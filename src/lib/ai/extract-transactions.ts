import { GoogleGenAI, Type } from '@google/genai'
import { extractText } from 'unpdf'
import { parseBrlToCents } from '@/lib/finance/money'
import {
  detectDuplicates,
  ExistingTxReference,
  normalizeDescription,
  resolveTransactionDate,
} from '@/lib/finance/deduplication'
import { DEFAULT_CATEGORIES } from '@/lib/constants/categories'

export interface RawAiExtractedCandidate {
  rawDate?: string | null
  launchType?: string | null
  description: string
  merchant?: string | null
  amountBrl?: string | number | null
  type?: 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'INVOICE_PAYMENT' | 'REFUND'
  suggestedCategory?: string | null
  installmentNumber?: number | null
  totalInstallments?: number | null
  needsReview?: boolean
  reviewReason?: string | null
}

export interface ProcessedExtractedCandidate {
  rawDateText: string | null
  resolvedDate: Date
  isoDate: string
  competenceMonth: string
  description: string
  merchant: string | null
  amountCents: number
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'INVOICE_PAYMENT' | 'REFUND'
  suggestedCategory: string
  installmentNumber: number | null
  totalInstallments: number | null
  needsReview: boolean
  reviewReason: string | null
  isDuplicate: boolean
  duplicateReason: string | null
  fingerprint: string
}

const BALANCE_PATTERNS = [
  /^saldo\s+(do\s+dia|anterior|atual|final|dispon[ií]vel|em\s+conta|bloqueado|parcial|total)/i,
  /^\([+=]\)\s*saldo/i,
  /^\(\+\)\s*rendimentos\s+de\s+aplica[cç][oõ]es\s+autom[aá]ticas/i,
  /^limite\s+(da\s+conta|dispon[ií]vel|total|utilizado|em\s+uso)/i,
  /^total\s+da\s+fatura/i,
  /^resumo\s+da\s+fatura/i,
  /^posi[cç][aã]o\s+consolidada/i,
]

export function isBalanceSnapshotLine(description: string): boolean {
  const clean = description.trim()
  if (!clean) return true
  if (/^-?\d{1,3}(\.\d{3})*,\d{2}$/.test(clean)) return true
  return BALANCE_PATTERNS.some((pattern) => pattern.test(clean))
}

const KEYWORD_CATEGORY_MAP: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /(pagamento\s+de\s+fatura|fatura\s+cartao|pagto\s+fatura)/i, category: 'Cartão de crédito' },
  { pattern: /(nu\s*pagamentos)/i, category: 'CARTÃO NUBANK/VIVI E JOHN' },
  { pattern: /(pagto\s+salario|liquido\s+de\s+vencimento|salario|pro-labore|adiantamento\s+salarial|folha\s+pagto|remuneracao)/i, category: 'Salário' },
  { pattern: /(condoconta|condominio)/i, category: 'CONDOMÍNIO' },
  { pattern: /(enel\s+distribuicao|enel)/i, category: 'ENEL' },
  { pattern: /(telefonica\s+bras|vivo\s+fibra)/i, category: 'VIVO FIBRA' },
  { pattern: /(tim\s+sao\s+paulo|vivo\s+chip|recarga\s+vivo)/i, category: 'VIVO CHIP' },
  { pattern: /(pagamento\s+tributo|iptu|pm\s+cotia)/i, category: 'IPTU' },
  { pattern: /(receita\s+federal|darf|irpf)/i, category: 'RECEITA FEDERAL' },
  { pattern: /(conectogo|presencial\s+conecto)/i, category: 'PRESENCIAL CONECTO' },
  { pattern: /(sistema\s+vaz|estacionamento)/i, category: 'ESTACIONAMENTO' },
  { pattern: /(elcss\s+autopass|elcss\s+emv\s+cmt|elcss\s+rapidin|emv\s+cmt|autopass|bilhete\s+unico|metro\b(?!\s*farma))/i, category: 'PASSAGEM' },
  { pattern: /(auto\s+posto|posto\s+bandeira|posto\s+parati|posto\s+992|combustivei|combustivel|shell|ipiranga|petrobras|gasolina|etanol|uber|99app|99\*|99\s+pop)/i, category: 'COMBUSTÍVEL/UBER' },
  { pattern: /(99\s*food|ifood|rappi)/i, category: 'IFOOD' },
  { pattern: /(drogaria|drogasil|droga\s+raia|raia\s+drogasil|metro\s+farma|pague\s+menos|panvel|farmacia|ultrafarma)/i, category: 'RÉMEDIO/FARMACIA' },
  { pattern: /(supermercado|assa[ií]|carrefour|pao\s+de\s+acucar|atacadao|extra|zaffari|hortifruti|comercio\s+de\s+alimentos\s+alves\s+e\s+farias)/i, category: 'MERCADO' },
  { pattern: /(pix\s+marketplace|amazon\.?com\.?br|americanas\s+s\s+a|shpp\s+brasil|mercado\s*livre|mercado\s*pago|shopee|magalu|magazine|shein|aliexpress)/i, category: 'COMPRAS MARKETPLACE' },
  { pattern: /(pix\s+aut\s+google|google\s+brasil\s+pagamentos|netflix|spotify|amazon\s+prime|disney|hbo|apple\.com\/bill|google\s+one|youtube|ebanx)/i, category: 'NETFLIX/STREMMING' },
  { pattern: /(arcos\s+dourados|padaria|panificacao|pao\s+de\s+q|mdp\s*fpaes|lanchonete|burger|mcdonald|bk|a[cç]a[ií]|cafeteria|cafe|ricos\s+gourmet|stadium\s+food|nareia\s+butanta|restaurante|tempero\s+moderno|pizzaria)/i, category: 'SAIDAS VIVI/JOHN' },
  { pattern: /(cabeleireiro|barbearia|salao)/i, category: 'CABELEIREIRO/JOHN E VIVI' },
  { pattern: /(rend\s+pago\s+aplic\s+aut|rendimentos)/i, category: 'Outras receitas' },
  { pattern: /(transferencia\s+mesma\s+titularidade|entre\s+contas\s+proprias)/i, category: 'Transferências' },
]

export function suggestCategoryFromDescription(
  description: string,
  aiSuggestion?: string | null,
  type?: string
): string {
  if (type === 'INVOICE_PAYMENT') return 'Cartão de crédito'
  if (type === 'TRANSFER') return 'Transferências'

  for (const rule of KEYWORD_CATEGORY_MAP) {
    if (rule.pattern.test(description)) {
      return rule.category
    }
  }

  const validNames = new Set(DEFAULT_CATEGORIES.map((c) => c.name))
  if (aiSuggestion && validNames.has(aiSuggestion.trim())) {
    return aiSuggestion.trim()
  }

  if (type === 'INCOME') return 'Outras receitas'
  return 'Outros gastos'
}

const COUPLE_INTERNAL_PATTERNS = [
  /john\s+elton\s+da\s+silva/i,
  /viviane\s+da\s+cruz\s+santo/i,
]

export function isCoupleOrOwnTransfer(
  description: string,
  accountHolderName?: string | null
): boolean {
  const descNorm = normalizeDescription(description)

  // Qualquer transferência entre John Elton e Viviane da Cruz (casal) ou para próprias contas
  if (COUPLE_INTERNAL_PATTERNS.some((p) => p.test(descNorm))) {
    return true
  }

  if (!accountHolderName || accountHolderName.trim().length < 6) return false
  const holderTokens = normalizeDescription(accountHolderName)
    .split(' ')
    .filter((t) => t.length > 2)
  if (holderTokens.length < 2) return false

  const matchedTokens = holderTokens.filter((token) => descNorm.includes(token))
  return matchedTokens.length >= Math.min(3, holderTokens.length)
}

export function detectAccountHolderFromText(rawText: string): string | null {
  // Padrão Santander: "Titular: Viviane"
  const titularMatch = rawText.match(/Titular:\s*([A-Za-zÀ-ÿ\s]{3,60}?)(?:\r?\n|Saldo|Per[ií]odo|Ag[êe]ncia|$)/i)
  if (titularMatch && titularMatch[1].trim()) {
    return titularMatch[1].trim()
  }

  // Padrão Itaú: nome na linha acima do CPF
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    if (/CPF:\s*\d{3}/i.test(lines[i]) && i > 0) {
      const candidate = lines[i - 1].replace(/[^A-Za-zÀ-ÿ\s]/g, '').trim()
      if (candidate.split(/\s+/).length >= 2) {
        return candidate
      }
    }
  }
  return null
}

/**
 * Parser determinístico para extratos bancários em PDF/texto (como Itaú Conta Corrente):
 * Colunas: Data | Lançamentos | Descrição | Valor(R$) | Saldo(R$)
 */
export function parseItauStatementText(rawText: string): RawAiExtractedCandidate[] {
  // Normaliza o texto para que cada data DD/MM/YYYY comece em sua própria linha,
  // mesmo quando o extrator de PDF junta a tabela numa única linha contínua
  const normalizedText = rawText
    .replace(/\s+(Lançamentos\s+futuros|Saídas\s+futuras|Posição\s+consolidada)/gi, '\n$1\n')
    .replace(/\s+(Lançamentos)\s+(Data\s+Lançamentos)/gi, '\n$1\n$2\n')
    .replace(/(?<!Período de visualização:\s*)(?<!até\s*)(?<!Emitido em:\s*)(\b\d{2}\/\d{2}\/\d{4}\b)/g, '\n$1')

  const lines = normalizedText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const candidates: RawAiExtractedCandidate[] = []
  let inFutureSection = false

  const LAUNCH_PREFIXES = [
    'PAGAMENTO DE PIX QR CODE',
    'PAGAMENTO DE BOLETO',
    'PAGAMENTO DE IMPOSTO',
    'PIX AUTOMÁTICO',
    'PIX AUTOMATICO',
    'PIX RECEBIDO',
    'PIX ENVIADO',
    'COMPRA DÉBITO',
    'COMPRA DEBITO',
    'RENDIMENTOS',
    'ENTRADA',
    'SAÍDA',
    'SAIDA',
  ]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (/^lan[cç]amentos\s+futuros|^sa[ií]das\s+futuras/i.test(line)) {
      inFutureSection = true
      continue
    }

    if (/^lan[cç]amentos$/i.test(line) || /^data\s+lan[cç]amentos\s+descri[cç][aã]o/i.test(line)) {
      if (!inFutureSection || /^lan[cç]amentos$/i.test(line)) {
        inFutureSection = false
      }
      continue
    }

    if (/^posi[cç][aã]o\s+consolidada|^limites$/i.test(line)) {
      break
    }

    // Ignorar linhas de cabeçalho de período ou emissão
    if (/per[ií]odo\s+de\s+visualiza[cç][aã]o|emitido\s+em/i.test(line)) {
      continue
    }

    const dateMatch = line.match(/^(\d{2}\/\d{2}\/\d{4})\s+(.*)$/)
    if (!dateMatch) continue

    const [, rawDate, restOfLine] = dateMatch

    if (inFutureSection) {
      // Se passou da seção futura e encontrou data menor ou igual à data atual de lançamentos, destrava
      if (!/PIX\s+AUTOM[AÁ]TICO/i.test(restOfLine)) {
        inFutureSection = false
      } else {
        continue
      }
    }

    // Linha de Saldo do Dia (apenas número ou número seguido de cabeçalho da página seguinte)
    const cleanRest = restOfLine
      .replace(/Data\s+Lançamentos\s+Descrição\s+Valor\s*\(R\$\)\s+Saldo\s*\(R\$\).*$/i, '')
      .trim()

    if (/^-?\d{1,3}(\.\d{3})*,\d{2}$/.test(cleanRest)) {
      continue
    }

    let combined = cleanRest
    while (
      !/(-?\d{1,3}(?:\.\d{3})*,\d{2})$/.test(combined) &&
      i + 1 < lines.length &&
      !/^\d{2}\/\d{2}\/\d{4}/.test(lines[i + 1]) &&
      !/^(posi[cç][aã]o\s+consolidada|data\s+lan[cç]amentos)/i.test(lines[i + 1])
    ) {
      i++
      const nextClean = lines[i]
        .replace(/Data\s+Lançamentos\s+Descrição\s+Valor\s*\(R\$\)\s+Saldo\s*\(R\$\).*$/i, '')
        .trim()
      combined = `${combined} ${nextClean}`.trim()
    }

    // Remove eventual saldo acoplado após o valor ou cabeçalho de página
    combined = combined
      .replace(/Data\s+Lançamentos\s+Descrição\s+Valor\s*\(R\$\)\s+Saldo\s*\(R\$\).*$/i, '')
      .trim()

    const amountMatch = combined.match(/^(.*?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})$/)
    if (!amountMatch) continue

    const fullText = amountMatch[1].trim()
    const amountStr = amountMatch[2].trim()

    if (!fullText || isBalanceSnapshotLine(fullText)) continue

    let launchType = ''
    let merchantDesc = fullText

    for (const prefix of LAUNCH_PREFIXES) {
      if (fullText.toUpperCase().startsWith(prefix)) {
        launchType = prefix
        merchantDesc = fullText.slice(prefix.length).trim()
        break
      }
    }

    const isNegative = amountStr.startsWith('-')
    const isIncomeLaunch =
      /^(PIX\s+RECEBIDO|ENTRADA|RENDIMENTOS)/i.test(launchType) || !isNegative

    candidates.push({
      rawDate,
      launchType: launchType || null,
      description: merchantDesc || fullText,
      merchant: merchantDesc || null,
      amountBrl: amountStr,
      type: isIncomeLaunch && !isNegative ? 'INCOME' : 'EXPENSE',
    })
  }

  return candidates
}

/**
 * Parser determinístico para Extrato de Conta Santander PDF:
 * Formato: "DD/MM/YYYY <Modalidade> (-?R$ Valor) (-?R$ Saldo) <Estabelecimento/Complemento>"
 */
export function parseSantanderStatementText(rawText: string): RawAiExtractedCandidate[] {
  // Remove o cabeçalho de resumo (Saldo inicial / Entradas / Saídas / Saldo final) antes do DETALHE DOS MOVIMENTOS
  const detailIdx = rawText.search(/DETALHE\s+DOS\s+MOVIMENTOS/i)
  const bodyText = detailIdx >= 0 ? rawText.slice(detailIdx) : rawText

  // Coloca cada data DD/MM/YYYY (que não faça parte de "Periodo: DD/MM a DD/MM/YY") em sua própria linha
  const normalized = bodyText
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(
      /(?:Segunda|Ter[çc]a|Quarta|Quinta|Sexta|S[áa]bado|Domingo),\s+\d{1,2}\s+de\s+[a-zç]+\s+de\s+\d{4}/gi,
      '\n'
    )
    .replace(/DETALHE\s+DOS\s+MOVIMENTOS\s+Data\s+Descri[çc][aã]o\s+Valor\s+Saldo/gi, '\n')
    .replace(/\b(\d{2}\/\d{2}\/\d{4})\b/g, '\n$1')

  const lines = normalized
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const candidates: RawAiExtractedCandidate[] = []

  for (const line of lines) {
    const dateMatch = line.match(/^(\d{2}\/\d{2}\/\d{4})\s+(.*)$/)
    if (!dateMatch) continue

    const [, rawDate, rest] = dateMatch

    // Procura o par "<Valor> <Saldo>" no formato Santander: "(-?R$ X.XXX,XX) (-?R$ Y.YYY,YY)"
    const valueSaldoRegex =
      /(-?\s*R\$\s*\d{1,3}(?:\.\d{3})*,\d{2})\s+(-?\s*R\$\s*\d{1,3}(?:\.\d{3})*,\d{2})/
    const m = rest.match(valueSaldoRegex)
    if (!m || m.index === undefined) continue

    const beforeValues = rest.slice(0, m.index).trim()
    const amountStr = m[1].replace(/\s+/g, ' ').trim()
    const afterValues = rest
      .slice(m.index + m[0].length)
      .replace(/\b\d+\/\d+\s*$/, '') // remove número de página ex: "1/4", "2/4"
      .trim()

    const launchType = beforeValues || null
    const merchantDesc = afterValues || beforeValues
    const isNegative = amountStr.startsWith('-')

    candidates.push({
      rawDate,
      launchType,
      description: merchantDesc,
      merchant: afterValues || beforeValues || null,
      amountBrl: amountStr,
      type: isNegative ? 'EXPENSE' : 'INCOME',
    })
  }

  return candidates
}

export function parseBankStatementText(rawText: string): RawAiExtractedCandidate[] {
  // Detecta automaticamente formato Santander ("EXTRATO DE CONTA" / "DETALHE DOS MOVIMENTOS" com "R$ ... R$ ...")
  if (
    /DETALHE\s+DOS\s+MOVIMENTOS|Debito\s+visa\s+electron/i.test(rawText) ||
    /-?R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}\s+-?R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/.test(rawText)
  ) {
    const santander = parseSantanderStatementText(rawText)
    if (santander.length > 0) return santander
  }

  return parseItauStatementText(rawText)
}

const APP_LAUNCH_TYPES = [
  'pix enviado',
  'pix recebido',
  'pix automático',
  'pix automatico',
  'pix devolvido',
  'pagamento de pix',
  'pix qr code',
  'compra no débito',
  'compra no debito',
  'compra débito',
  'compra debito',
  'compra no crédito',
  'compra no credito',
  'transferência enviada',
  'transferencia enviada',
  'transferência recebida',
  'transferencia recebida',
  'pagamento efetuado',
  'pagamento de boleto',
  'pagamento de fatura',
  'boleto pago',
  'débito automático',
  'debito automatico',
  'ted enviada',
  'ted recebida',
  'rendimento',
  'estorno',
]

const UI_NOISE_PATTERNS = [
  /^(recentes|futuros|per[ií]odo|entradas\s+e\s+sa[ií]das|mais\s+recentes|compartilhe|o\s+extrato\s+est[aá]|expectativas|in[ií]cio|pagamentos|pra\s+voc[eê]|menu|extrato|ver\s+mais|filtrar)/i,
  /^saldo\s+do\s+dia/i,
  /^saldo\s+(atual|anterior|dispon[ií]vel)/i,
  /^\d{1,2}:\d{2}$/, // relógio do celular (ex: 16:16)
]

/**
 * Parser inteligente para OCR de screenshots de apps bancários mobile (Itaú, Nubank, Santander, Inter, etc.)
 * Ex:
 *   09 de novembro de 2026
 *   Saldo do dia: R$ 0,23
 *   Pix enviado
 *   Viviane Da Cruz Santos
 *   - R$ 62,00
 */
export function parseMobileAppScreenshotOcr(
  rawText: string,
  referenceMonth: string
): RawAiExtractedCandidate[] {
  // Primeiro testa se o OCR leu uma tabela estilo Itaú/Santander PDF
  const structured = parseBankStatementText(rawText)
  if (structured.length > 0) return structured

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/[>»|[\]]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 1)

  const candidates: RawAiExtractedCandidate[] = []
  let currentDateText: string | null = null
  let currentLaunchType: string | null = null
  let pendingDescLines: string[] = []

  const PT_MONTH_WORDS =
    '(?:janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)'

  const ptDateInLineRegex = new RegExp(
    `\\b(\\d{1,2})\\s*(?:de\\s+)?(${PT_MONTH_WORDS})\\.?(?:\\s*(?:de\\s+)?(\\d{4}))?\\b`,
    'i'
  )
  const numericDateInLineRegex =
    /\b(\d{1,2})\/(\d{2})(?:\/(\d{2,4}))?\b/
  const relativeDateRegex = /^(hoje|ontem)\b/i

  const extractDateFromLine = (inputLine: string): string | null => {
    const ptMatch = inputLine.match(ptDateInLineRegex)
    if (ptMatch) {
      const day = Number(ptMatch[1])
      if (day >= 1 && day <= 31) {
        return ptMatch[3]
          ? `${ptMatch[1]} de ${ptMatch[2]} de ${ptMatch[3]}`
          : `${ptMatch[1]} de ${ptMatch[2]}`
      }
    }

    const numMatch = inputLine.match(numericDateInLineRegex)
    if (numMatch && !/parcela/i.test(inputLine)) {
      const day = Number(numMatch[1])
      const monthNum = Number(numMatch[2])
      if (day >= 1 && day <= 31 && monthNum >= 1 && monthNum <= 12) {
        return numMatch[3]
          ? `${numMatch[1].padStart(2, '0')}/${numMatch[2]}/${numMatch[3]}`
          : `${numMatch[1].padStart(2, '0')}/${numMatch[2]}`
      }
    }

    const relMatch = inputLine.match(relativeDateRegex)
    if (relMatch) {
      return relMatch[1]
    }

    return null
  }

  const amountLineRegex =
    /^([+-]?\s*R?\$?\s*\d{1,3}(?:\.\d{3})*,\d{2})$/i

  const inlineAmountRegex =
    /^(.*?)\s+([+-]?\s*R\$\s*\d{1,3}(?:\.\d{3})*,\d{2})$/i

  for (const rawLine of lines) {
    // Limpa ícones OCR comuns no início da linha (ex: "=$", "(O ", "[) ", "(E) ", "S ", "5 ")
    const line = rawLine
      .replace(/^(?:\([A-Za-z0-9]{1,2}\)?|\[\)?|[()[\]{}=•·*—\-_$§]+)\s*/g, '')
      .replace(/^[S5o0]\s+(?=[A-ZÀ-Ÿ][a-zà-ÿ]{2,})/, '')
      .trim()
    if (!line) continue

    // Cabeçalho de data do grupo (mesmo com dia da semana, ponto ou ruído OCR na linha)
    const detectedDate = extractDateFromLine(line)
    const hasMoneyValue = /\d+,\d{2}/.test(line)
    if (detectedDate && !hasMoneyValue) {
      currentDateText = detectedDate
      pendingDescLines = []
      currentLaunchType = null
      continue
    }

    if (UI_NOISE_PATTERNS.some((p) => p.test(line))) {
      pendingDescLines = []
      currentLaunchType = null
      continue
    }

    // Verifica se a linha é o tipo de lançamento (ex: "Pix enviado", "Pix recebido")
    const lower = line.toLowerCase()
    const matchedLaunch = APP_LAUNCH_TYPES.find((t) => lower === t || lower.startsWith(`${t} `))
    if (matchedLaunch && !hasMoneyValue) {
      currentLaunchType = line
      pendingDescLines = []
      continue
    }

    // Verifica se a linha é apenas o valor monetário (ex: "- R$ 62,00" ou "R$ 560,00")
    const amountMatch = rawLine.trim().match(amountLineRegex)
    if (amountMatch && (pendingDescLines.length > 0 || currentLaunchType)) {
      const amountStr = amountMatch[1].trim()
      const desc = pendingDescLines.join(' ').trim() || currentLaunchType || 'Lançamento'
      const isNegative =
        amountStr.startsWith('-') ||
        (currentLaunchType !== null &&
          /enviado|d[eé]bito|cr[eé]dito|pagamento|boleto|sa[ií]da/i.test(currentLaunchType))
      const isIncome =
        !amountStr.startsWith('-') &&
        (currentLaunchType === null ||
          /recebid|sal[aá]rio|rendimento|entrada/i.test(currentLaunchType))

      candidates.push({
        rawDate: currentDateText,
        launchType: currentLaunchType,
        description: desc,
        merchant: desc,
        amountBrl: amountStr,
        type: isNegative ? 'EXPENSE' : isIncome ? 'INCOME' : 'EXPENSE',
      })

      pendingDescLines = []
      currentLaunchType = null
      continue
    }

    // Verifica se descrição + valor estão na mesma linha (ex: "Supermercado Extra -R$ 120,00")
    const inlineMatch = line.match(inlineAmountRegex)
    if (inlineMatch && !isBalanceSnapshotLine(inlineMatch[1])) {
      const inlineDate = detectedDate || currentDateText
      if (detectedDate) currentDateText = detectedDate
      const desc = inlineMatch[1].trim()
      const amountStr = inlineMatch[2].trim()
      const isNegative = amountStr.startsWith('-')
      candidates.push({
        rawDate: inlineDate,
        launchType: currentLaunchType,
        description: desc,
        merchant: desc,
        amountBrl: amountStr,
        type: isNegative ? 'EXPENSE' : 'INCOME',
      })
      pendingDescLines = []
      currentLaunchType = null
      continue
    }

    // Acumula linhas de descrição do estabelecimento/favorecido
    if (line.length >= 2 && !/^\d+$/.test(line)) {
      pendingDescLines.push(line)
      if (pendingDescLines.length > 3) {
        pendingDescLines.shift()
      }
    }
  }

  return candidates
}

async function extractTransactionsFromImagesWithLocalOcr(
  files: Array<{ mimeType: string; base64Data: string }>,
  referenceMonth: string
): Promise<{
  candidates: RawAiExtractedCandidate[]
  accountHolderName?: string | null
  provider: string
}> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('por')

  const allCandidates: RawAiExtractedCandidate[] = []
  let detectedHolder: string | null = null

  try {
    for (const file of files) {
      if (file.mimeType === 'application/pdf') continue
      const imgBuffer = Buffer.from(file.base64Data, 'base64')
      const {
        data: { text },
      } = await worker.recognize(imgBuffer)

      if (!detectedHolder) {
        detectedHolder = detectAccountHolderFromText(text)
      }
      const parsed = parseMobileAppScreenshotOcr(text, referenceMonth)
      allCandidates.push(...parsed)
    }
  } finally {
    await worker.terminate()
  }

  return {
    candidates: allCandidates,
    accountHolderName: detectedHolder,
    provider: 'OCR Local Gratuito (Tesseract.js)',
  }
}

export async function extractTransactionsFromPdfBuffer(
  buffer: ArrayBuffer
): Promise<{
  candidates: RawAiExtractedCandidate[]
  accountHolderName: string | null
  rawText: string
}> {
  // Clona o ArrayBuffer para que o unpdf/PDF.js não desanexe (detach) o buffer original do chamador
  const uint8 = new Uint8Array(buffer.slice(0))
  const { text } = await extractText(uint8, { mergePages: true })
  const fullText = Array.isArray(text) ? text.join('\n') : String(text || '')
  const accountHolderName = detectAccountHolderFromText(fullText)
  const candidates = parseBankStatementText(fullText)

  return {
    candidates,
    accountHolderName,
    rawText: fullText,
  }
}

export function postProcessExtractedCandidates(
  candidates: RawAiExtractedCandidate[],
  referenceMonth: string,
  existingFingerprints: Set<string>,
  options?: {
    accountHolderName?: string | null
    ownerTag?: string | null
    existingTransactions?: ExistingTxReference[]
  }
): ProcessedExtractedCandidate[] {
  const nonBalance = candidates.filter(
    (c) => c.description && !isBalanceSnapshotLine(c.description)
  )

  const preliminary = nonBalance.map((raw) => {
    const dateInfo = resolveTransactionDate(raw.rawDate, referenceMonth)
    const parsedCents = parseBrlToCents(raw.amountBrl)
    const amountCents = parsedCents ?? 0

    let type: ProcessedExtractedCandidate['type'] = raw.type || 'EXPENSE'
    const fullDesc = `${raw.launchType || ''} ${raw.description}`.trim()

    if (/pagamento\s+de\s+fatura|fatura\s+paga/i.test(fullDesc)) {
      type = 'INVOICE_PAYMENT'
    } else if (/estorno|reembolso|credito\s+em\s+fatura/i.test(fullDesc)) {
      type = 'REFUND'
    } else if (
      isCoupleOrOwnTransfer(raw.description, options?.accountHolderName) ||
      /transferencia\s+mesma\s+titularidade/i.test(fullDesc)
    ) {
      type = 'TRANSFER'
    } else if (
      typeof raw.amountBrl === 'string' &&
      raw.amountBrl.trim().startsWith('-') &&
      type === 'INCOME'
    ) {
      type = 'EXPENSE'
    }

    const reasons: string[] = []
    if (raw.needsReview && raw.reviewReason) reasons.push(raw.reviewReason)
    if (dateInfo.needsReview && dateInfo.reviewReason) reasons.push(dateInfo.reviewReason)
    if (parsedCents === null || amountCents <= 0) {
      reasons.push('Valor ilegível ou ausente no documento')
    }

    const installmentMatch = raw.description.match(/\b(\d{1,2})\/(\d{1,2})\b/)
    const installmentNumber =
      raw.installmentNumber ?? (installmentMatch ? Number(installmentMatch[1]) : null)
    const totalInstallments =
      raw.totalInstallments ?? (installmentMatch ? Number(installmentMatch[2]) : null)

    const suggestedCategory = suggestCategoryFromDescription(
      fullDesc,
      raw.suggestedCategory,
      type
    )

    const displayDescription =
      raw.launchType &&
      !raw.description.toUpperCase().startsWith(raw.launchType.toUpperCase())
        ? `${raw.description.trim()} (${raw.launchType.trim()})`
        : raw.description.trim()

    return {
      date: dateInfo.isoDate,
      rawDateText: raw.rawDate ?? null,
      resolvedDate: new Date(`${dateInfo.isoDate}T12:00:00.000Z`),
      isoDate: dateInfo.isoDate,
      competenceMonth: dateInfo.competenceMonth,
      description: displayDescription,
      merchant: raw.merchant?.trim() || raw.description.trim() || null,
      amountCents,
      type,
      suggestedCategory,
      installmentNumber,
      totalInstallments,
      needsReview: Boolean(
        raw.needsReview ||
          dateInfo.needsReview ||
          parsedCents === null ||
          amountCents <= 0
      ),
      reviewReason: reasons.length > 0 ? reasons.join('; ') : null,
    }
  })

  const withDuplicates = detectDuplicates(
    preliminary,
    existingFingerprints,
    options?.ownerTag,
    options?.existingTransactions || []
  )

  return withDuplicates
    .map(({ date: _d, ...rest }) => rest)
    .sort((a, b) => b.isoDate.localeCompare(a.isoDate))
}

const EXTRACTION_SYSTEM_PROMPT = `Você é um motor especialista em leitura contábil de extratos bancários (PDFs multipágina e screenshots/prints), comprovantes PIX e faturas de cartão de crédito brasileiros (Itaú, Nubank, Bradesco, Santander, Banco do Brasil, Inter, C6, BTG, XP, etc.).

REGRAS OBRIGATÓRIAS:
1. NUNCA invente transações, datas ou valores que não estejam visíveis no documento.
2. Formato Extrato Itaú ("Data | Lançamentos | Descrição | Valor (R$) | Saldo (R$)"):
   - IGNORE linhas que possuem apenas a Data e o valor na coluna "Saldo (R$)" (ex: "19/11/2026 | | | | 2.072,06"). Essas linhas são saldos diários da conta e NÃO são transações.
   - IGNORE as tabelas de "Posição consolidada", "Limites", "Limite da conta" e a seção "Lançamentos futuros / Saídas futuras".
   - Coloque o tipo da operação (ex: "PAGAMENTO DE PIX QR CODE", "COMPRA DÉBITO", "PIX RECEBIDO", "PIX ENVIADO", "ENTRADA", "PAGAMENTO DE BOLETO", "RENDIMENTOS") no campo "launchType" e o nome do estabelecimento/favorecido em "description" e "merchant".
   - Identifique o nome do titular da conta no topo do extrato e retorne em "accountHolderName". Se um PIX ENVIADO ou PIX RECEBIDO tiver como destinatário/remetente o próprio titular da conta, classifique "type" como "TRANSFER".
3. Extraia os valores no formato brasileiro exato visível (ex: "-37,15", "1.885,10").
4. Classifique o campo "type" rigorosamente como:
   - "EXPENSE": valores negativos (-), compras no débito/cartão, PIX enviado para terceiros, pagamento de PIX QR Code, boletos pagos, IOF/impostos.
   - "INCOME": valores positivos (+), PIX recebido de terceiros, ENTRADA PAGTO SALARIO, RENDIMENTOS.
   - "INVOICE_PAYMENT": pagamento de fatura de cartão de crédito.
   - "TRANSFER": transferência/PIX entre contas da mesma titularidade (mesmo titular do extrato).
   - "REFUND": estorno ou reembolso.
5. Sugira uma categoria dentre: Alimentação, Supermercado, Transporte, Combustível, Moradia, Contas da casa, Saúde, Farmácia, Educação, Lazer, Restaurantes, Compras, Assinaturas, Cartão de crédito, Transferências, Salário, Outras receitas, Outros gastos.`

export async function extractTransactionsFromImagesWithAI(
  files: Array<{ mimeType: string; base64Data: string }>,
  referenceMonth: string,
  customApiKey?: string | null
): Promise<{
  candidates: RawAiExtractedCandidate[]
  accountHolderName?: string | null
  provider: string
}> {
  const rawGeminiKey =
    (customApiKey && customApiKey.trim()) || process.env.GEMINI_API_KEY || ''
  const geminiKey =
    (rawGeminiKey.startsWith('AIza') || rawGeminiKey.startsWith('AQ.')) &&
    rawGeminiKey.length >= 30
      ? rawGeminiKey
      : ''
  const openAiKey = process.env.OPENAI_API_KEY

  if (geminiKey) {
    try {
      const isVertexExpressKey = geminiKey.startsWith('AQ.')
      const ai = isVertexExpressKey
        ? new GoogleGenAI({ vertexai: true, apiKey: geminiKey })
        : new GoogleGenAI({ apiKey: geminiKey })
      const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

      const parts: Array<
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
      > = [
        {
          text: `${EXTRACTION_SYSTEM_PROMPT}\n\nMês/Ano de referência padrão (caso alguma linha não exiba o ano): ${referenceMonth}. Extraia todas as movimentações reais realizadas em todas as páginas deste(s) ${files.length} arquivo(s) (PDF ou imagens).`,
        },
        ...files.map((f) => ({
          inlineData: {
            mimeType: f.mimeType,
            data: f.base64Data,
          },
        })),
      ]

      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              accountHolderName: {
                type: Type.STRING,
                nullable: true,
                description: 'Nome do titular da conta identificado no cabeçalho do extrato',
              },
              transactions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    rawDate: {
                      type: Type.STRING,
                      description: 'Data da movimentação (ex: 19/11/2026)',
                    },
                    launchType: {
                      type: Type.STRING,
                      nullable: true,
                      description: 'Modalidade na coluna Lançamentos',
                    },
                    description: {
                      type: Type.STRING,
                      description: 'Descrição ou favorecido na coluna Descrição',
                    },
                    merchant: {
                      type: Type.STRING,
                      nullable: true,
                      description: 'Nome limpo do estabelecimento comercial ou pessoa',
                    },
                    amountBrl: {
                      type: Type.STRING,
                      description: 'Valor na coluna Valor (R$) mantendo o sinal (ex: -37,15 ou 1.885,10)',
                    },
                    type: {
                      type: Type.STRING,
                      description: 'EXPENSE | INCOME | TRANSFER | INVOICE_PAYMENT | REFUND',
                    },
                    suggestedCategory: {
                      type: Type.STRING,
                      description: 'Categoria sugerida em português',
                    },
                    installmentNumber: {
                      type: Type.INTEGER,
                      nullable: true,
                    },
                    totalInstallments: {
                      type: Type.INTEGER,
                      nullable: true,
                    },
                    needsReview: {
                      type: Type.BOOLEAN,
                    },
                    reviewReason: {
                      type: Type.STRING,
                      nullable: true,
                    },
                  },
                  required: ['description', 'amountBrl', 'type'],
                },
              },
            },
            required: ['transactions'],
          },
        },
      })

      const rawText = response.text || '{"transactions":[]}'
      const parsed = JSON.parse(rawText) as {
        accountHolderName?: string | null
        transactions?: RawAiExtractedCandidate[]
      }

      return {
        candidates: parsed.transactions || [],
        accountHolderName: parsed.accountHolderName || null,
        provider: `Google Gemini (${modelName})`,
      }
    } catch {
      // Se a chave Gemini falhar por billing/permissão/quota, usa o OCR Local Gratuito abaixo
    }
  }

  if (openAiKey) {
    const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini'
    const contentParts = [
      {
        type: 'text',
        text: `${EXTRACTION_SYSTEM_PROMPT}\nMês de referência: ${referenceMonth}. Retorne um objeto JSON estrito no formato {"accountHolderName": "...", "transactions": [{"rawDate": "...", "launchType": "...", "description": "...", "merchant": "...", "amountBrl": "...", "type": "EXPENSE|INCOME|TRANSFER|INVOICE_PAYMENT|REFUND", "suggestedCategory": "...", "installmentNumber": null, "totalInstallments": null, "needsReview": false, "reviewReason": null}]}`,
      },
      ...files.map((img) => ({
        type: 'image_url',
        image_url: {
          url: `data:${img.mimeType};base64,${img.base64Data}`,
        },
      })),
    ]

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: contentParts }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Erro na API OpenAI (${res.status}): ${errText}`)
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || '{"transactions":[]}'
    const parsed = JSON.parse(content) as {
      accountHolderName?: string | null
      transactions?: RawAiExtractedCandidate[]
    }

    return {
      candidates: parsed.transactions || [],
      accountHolderName: parsed.accountHolderName || null,
      provider: `OpenAI (${modelName})`,
    }
  }

  // Fallback automático 100% gratuito e local para prints (PNG/JPG/WEBP) via Tesseract.js OCR
  const hasImages = files.some((f) => f.mimeType.startsWith('image/'))
  if (hasImages) {
    return extractTransactionsFromImagesWithLocalOcr(files, referenceMonth)
  }

  throw new Error(
    'Não foi possível extrair transações deste documento. Para PDFs escaneados, configure uma chave gratuita AIzaSy... do Google AI Studio.'
  )
}
