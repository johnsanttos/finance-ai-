import { normalizeDescription } from '@/lib/finance/deduplication'

export interface LearnedCategoryRule {
  id?: string
  pattern: string
  transactionType: string
  categoryId: string
  categoryName?: string
}

/**
 * Extrai uma chave normalizada estável do estabelecimento/favorecido removendo:
 * - sufixos entre parênteses como "(PAGAMENTO DE PIX QR CODE)", "(COMPRA DÉBITO)"
 * - sufixos de parcelas como "(2/10)"
 * - números de CPF/CNPJ ou códigos de data no final como "A1811", "1711", "03821504579", "15800411"
 */
export function extractMerchantPattern(description: string): string {
  const withoutParens = description
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b\d{2}\/\d{2}\b/g, ' ')
    .replace(/\b[A-Z]?\d{4,}\b/gi, ' ')
    .replace(/\b\d{2,3}\.\d{3}\.\d{3}\b/g, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}\b/g, ' ')

  const normalized = normalizeDescription(withoutParens)
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized
}

/**
 * Encontra a regra aprendida pelo usuário que corresponde à descrição e tipo da transação.
 * Prioriza correspondência exata de padrão + tipo, depois padrão + "ALL", depois correspondência por prefixo/inclusão.
 */
export function matchLearnedCategoryRule(
  description: string,
  transactionType: string,
  rules: LearnedCategoryRule[]
): LearnedCategoryRule | null {
  const pattern = extractMerchantPattern(description)
  if (!pattern || pattern.length < 3) return null

  // 1. Match exato (padrão + tipo específico)
  const exactTyped = rules.find(
    (r) => r.pattern === pattern && r.transactionType === transactionType
  )
  if (exactTyped) return exactTyped

  // 2. Match exato (padrão + ALL)
  const exactAny = rules.find(
    (r) => r.pattern === pattern && r.transactionType === 'ALL'
  )
  if (exactAny) return exactAny

  // 3. Match parcial (quando a regra salva está contida na descrição ou vice-versa, ex: "elcss autopass" em "elcss autopass s")
  const partialTyped = rules.find(
    (r) =>
      r.pattern.length >= 5 &&
      r.transactionType === transactionType &&
      (pattern.includes(r.pattern) || r.pattern.includes(pattern))
  )
  if (partialTyped) return partialTyped

  const partialAny = rules.find(
    (r) =>
      r.pattern.length >= 5 &&
      r.transactionType === 'ALL' &&
      (pattern.includes(r.pattern) || r.pattern.includes(pattern))
  )
  return partialAny || null
}
