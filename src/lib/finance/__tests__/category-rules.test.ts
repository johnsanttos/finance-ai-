import { describe, expect, it } from 'vitest'
import {
  extractMerchantPattern,
  matchLearnedCategoryRule,
} from '../category-rules'

describe('Learned Category Rules Engine', () => {
  it('extracts identical stable merchant pattern ignoring date codes, CPFs, and launch suffixes', () => {
    const p1 = extractMerchantPattern('ELCSS AUTOPASS S A1811 (COMPRA DÉBITO)')
    const p2 = extractMerchantPattern('ELCSS AUTOPASS S A1711 (COMPRA DÉBITO)')
    const p3 = extractMerchantPattern('ELCSS AUTOPASS S A0311')

    expect(p1).toBe('elcss autopass s')
    expect(p2).toBe(p1)
    expect(p3).toBe(p1)

    const eris1 = extractMerchantPattern(
      'ERISVALDO DOS SANTOS MENDES 03821504579 (PAGAMENTO DE PIX QR CODE)'
    )
    const eris2 = extractMerchantPattern('ERISVALDO DOS SANTOS MENDES')
    expect(eris1).toBe('erisvaldo dos santos mendes')
    expect(eris2).toBe(eris1)
  })

  it('matches learned rules prioritizing transactionType so PIX sent vs received can have different categories', () => {
    const rules = [
      {
        pattern: 'viviane da cruz santos',
        transactionType: 'EXPENSE',
        categoryId: 'cat_divida',
        categoryName: 'DIVIDA LEGADO/ROLES ALEATORIOS',
      },
      {
        pattern: 'viviane da cruz santos',
        transactionType: 'INCOME',
        categoryId: 'cat_outras_receitas',
        categoryName: 'Outras receitas',
      },
      {
        pattern: 'erisvaldo dos santos mendes',
        transactionType: 'EXPENSE',
        categoryId: 'cat_adega',
        categoryName: 'MERCADO CONDOMINIO/ ADEGA',
      },
    ]

    const sentMatch = matchLearnedCategoryRule(
      'VIVIANE DA CRUZ SANTOS (PIX ENVIADO)',
      'EXPENSE',
      rules
    )
    expect(sentMatch?.categoryId).toBe('cat_divida')

    const receivedMatch = matchLearnedCategoryRule(
      'VIVIANE DA CRUZ SANTOS (PIX RECEBIDO)',
      'INCOME',
      rules
    )
    expect(receivedMatch?.categoryId).toBe('cat_outras_receitas')

    const adegaMatch = matchLearnedCategoryRule(
      'ERISVALDO DOS SANTOS MENDES 03821504579',
      'EXPENSE',
      rules
    )
    expect(adegaMatch?.categoryId).toBe('cat_adega')
  })
})
