import { describe, expect, it } from 'vitest'
import {
  detectAccountHolderFromText,
  isBalanceSnapshotLine,
  parseBankStatementText,
  parseItauStatementText,
  parseMobileAppScreenshotOcr,
  postProcessExtractedCandidates,
  suggestCategoryFromDescription,
} from '../extract-transactions'

describe('AI Post-Processing Pipeline (Task 5)', () => {
  it('filters out bank balance lines so balance is never treated as income or expense', () => {
    expect(isBalanceSnapshotLine('Saldo do dia')).toBe(true)
    expect(isBalanceSnapshotLine('SALDO ANTERIOR')).toBe(true)
    expect(isBalanceSnapshotLine('Saldo disponível em conta')).toBe(true)
    expect(isBalanceSnapshotLine('Limite disponível do cartão')).toBe(true)
    expect(isBalanceSnapshotLine('(=) saldo total disponível')).toBe(true)
    expect(isBalanceSnapshotLine('(+) saldo em aplicação automática - aplic aut mais')).toBe(true)
    expect(isBalanceSnapshotLine('Supermercado Carrefour')).toBe(false)
  })

  it('auto-suggests Brazilian categories from merchant description including Itaú statement merchants and user spreadsheet accounts', () => {
    expect(suggestCategoryFromDescription('IFOOD *RESTAURANTE')).toBe('IFOOD')
    expect(suggestCategoryFromDescription('99 FOOD LTDA')).toBe('IFOOD')
    expect(suggestCategoryFromDescription('ELCSS AUTOPASS S A1811')).toBe('PASSAGEM')
    expect(suggestCategoryFromDescription('ELCSS EMV CMT 15800411')).toBe('PASSAGEM')
    expect(suggestCategoryFromDescription('AUTO POSTO BANDEIRA DE SANTA TEREZA LTDA')).toBe('COMBUSTÍVEL/UBER')
    expect(suggestCategoryFromDescription('DROGARIA SAO PAULO')).toBe('RÉMEDIO/FARMACIA')
    expect(suggestCategoryFromDescription('CONDOCONTA FINANCE SA')).toBe('CONDOMÍNIO')
    expect(suggestCategoryFromDescription('TELEFONICA BRAS')).toBe('VIVO FIBRA')
    expect(suggestCategoryFromDescription('ENEL DISTRIBUICAO SAO PAULO')).toBe('ENEL')
    expect(suggestCategoryFromDescription('CONECTOGO')).toBe('PRESENCIAL CONECTO')
    expect(suggestCategoryFromDescription('PAGTO SALARIO')).toBe('Salário')
  })

  it('parses Itaú checking account PDF/OCR statement format accurately', () => {
    const sampleItauOcr = `
JOHN ELTON DA SILVA SANTOS
CPF: 399.244.208-02 agência: 0746 conta: 0019672-4
Saldo em conta
R$ 2.072,06
Extrato conta corrente
Lançamentos futuros
Saídas futuras
Data Lançamentos Descrição Valor(R$) Saldo (R$)
23/11/2026 PIX AUTOMÁTICO PIX AUT GOOGLE BRASIL PA 23/11 -9,99
Lançamentos
Data Lançamentos Descrição Valor(R$) Saldo (R$)
19/11/2026 2.072,06
19/11/2026 ENTRADA PAGTO SALARIO 1.885,10
18/11/2026 186,96
18/11/2026 PAGAMENTO DE PIX QR CODE 99 FOOD LTDA -37,15
18/11/2026 COMPRA DÉBITO ELCSS AUTOPASS S A1811 -10,80
17/11/2026 234,91
17/11/2026 PIX RECEBIDO EVERTON CARVALHO SILVA SANTOS 120,00
10/11/2026 PIX RECEBIDO JOHN ELTON DA SILVA SANTOS DE CARVALHO 40,00
16/10/2026 PIX ENVIADO JOHN ELTON DA SILVA SANTOS DE CARVALHO -1.000,00
Posição consolidada
saldo disponível sem investimentos automáticos R$ 1,00
(=) saldo total disponível R$ 2.072,06
`

    const candidates = parseItauStatementText(sampleItauOcr)
    const processed = postProcessExtractedCandidates(candidates, '2026-11', new Set(), {
      accountHolderName: 'JOHN ELTON DA SILVA SANTOS',
    })

    // Daily balance lines (2.072,06 / 186,96 / 234,91), future launches, and consolidated position are excluded
    expect(processed).toHaveLength(6)

    // 1. PAGTO SALARIO -> INCOME (188510 cents), category Salário
    expect(processed[0]).toMatchObject({
      isoDate: '2026-11-19',
      amountCents: 188510,
      type: 'INCOME',
      suggestedCategory: 'Salário',
    })

    // 2. 99 FOOD LTDA -> EXPENSE (3715 cents), category IFOOD
    expect(processed[1]).toMatchObject({
      isoDate: '2026-11-18',
      amountCents: 3715,
      type: 'EXPENSE',
      suggestedCategory: 'IFOOD',
    })

    // 3. ELCSS AUTOPASS -> EXPENSE (1080 cents), category PASSAGEM
    expect(processed[2]).toMatchObject({
      isoDate: '2026-11-18',
      amountCents: 1080,
      type: 'EXPENSE',
      suggestedCategory: 'PASSAGEM',
    })

    // 4. PIX RECEBIDO EVERTON -> INCOME (12000 cents)
    expect(processed[3]).toMatchObject({
      isoDate: '2026-11-17',
      amountCents: 12000,
      type: 'INCOME',
    })

    // 5 & 6. PIX from/to own account holder (JOHN ELTON DA SILVA SANTOS...) -> TRANSFER
    expect(processed[4]).toMatchObject({
      isoDate: '2026-11-10',
      amountCents: 4000,
      type: 'TRANSFER',
      suggestedCategory: 'Transferências',
    })
    expect(processed[5]).toMatchObject({
      isoDate: '2026-10-16',
      competenceMonth: '2026-10',
      amountCents: 100000,
      type: 'TRANSFER',
      suggestedCategory: 'Transferências',
    })
  })

  it('parses Santander checking account PDF format (Viviane) extracting Valor and ignoring Saldo', () => {
    const sampleSantanderText = `
EXTRATO DE CONTA
Agência: 0001 | Conta: 02.009219.4
Período: 22/10/2026 a 20/11/2026
Titular: Viviane
Saldo inicial -R$ 23,80 Entradas R$ 4.909,21 Saídas R$ 3.451,04 Saldo final R$ 1.434,37
DETALHE DOS MOVIMENTOS
Data Descrição Valor Saldo
Quarta, 18 de novembro de 2026
18/11/2026 Debito visa electron brasil -R$ 5,95 R$ 1.434,37 Emv Cmt.162819097
18/11/2026 Debito visa electron brasil -R$ 16,00 R$ 1.440,32 Retro Explorer Comerc
17/11/2026 Debito visa electron brasil -R$ 171,68 R$ 1.474,12 Drogaria Sao Paulo Sa
Sexta, 13 de novembro de 2026
13/11/2026 Liquido de vencimento R$ 2.080,00 R$ 2.094,73 Dexian Do Brasil Serv
30/10/2026 Pix enviado -R$ 54,00 R$ 2.572,18 Telefonica Brasil S A
`
    const holder = detectAccountHolderFromText(sampleSantanderText)
    expect(holder).toBe('Viviane')

    const candidates = parseBankStatementText(sampleSantanderText)
    const processed = postProcessExtractedCandidates(candidates, '2026-11', new Set(), {
      accountHolderName: holder,
      ownerTag: 'viviane',
    })

    expect(processed).toHaveLength(5)
    expect(processed[0]).toMatchObject({
      isoDate: '2026-11-18',
      amountCents: 595,
      type: 'EXPENSE',
      suggestedCategory: 'PASSAGEM',
    })
    expect(processed[2]).toMatchObject({
      isoDate: '2026-11-17',
      amountCents: 17168,
      type: 'EXPENSE',
      suggestedCategory: 'RÉMEDIO/FARMACIA',
    })
    expect(processed[3]).toMatchObject({
      isoDate: '2026-11-13',
      amountCents: 208000,
      type: 'INCOME',
      suggestedCategory: 'Salário',
    })
    expect(processed[4]).toMatchObject({
      isoDate: '2026-10-30',
      competenceMonth: '2026-10',
      amountCents: 5400,
      type: 'EXPENSE',
      suggestedCategory: 'VIVO FIBRA',
    })
  })

  it('parses mobile app screenshot OCR (Itaú app format) skipping "Saldo do dia" and extracting Pix enviado/recebido', () => {
    const sampleAppOcr = `
Recentes Futuros 1
Período Entradas e saídas Mais recentes
09 de novembro de 2026
Saldo do dia: R$ 0,23
Pix enviado
Viviane Da Cruz Santos
- R$ 62,00
Pix recebido
John Elton Da Silva Santos De
Carvalho
R$ 560,00
Pix enviado
Viviane Da Cruz Santos
- R$ 1.500,00
Pix recebido
John Elton Da Silva Santos
R$ 1.280,00
Início Pagamentos Pra você Menu
`
    const candidates = parseMobileAppScreenshotOcr(sampleAppOcr, '2026-11')
    expect(candidates).toHaveLength(4)

    expect(candidates[0]).toMatchObject({
      rawDate: '09 de novembro de 2026',
      description: 'Viviane Da Cruz Santos',
      amountBrl: '- R$ 62,00',
      type: 'EXPENSE',
    })
    expect(candidates[1]).toMatchObject({
      rawDate: '09 de novembro de 2026',
      description: 'John Elton Da Silva Santos De Carvalho',
      amountBrl: 'R$ 560,00',
      type: 'INCOME',
    })
    expect(candidates[2]).toMatchObject({
      description: 'Viviane Da Cruz Santos',
      amountBrl: '- R$ 1.500,00',
      type: 'EXPENSE',
    })
    expect(candidates[3]).toMatchObject({
      description: 'John Elton Da Silva Santos',
      amountBrl: 'R$ 1.280,00',
      type: 'INCOME',
    })

    // Pós-processamento: transferências entre John e Viviane viram TRANSFER (não contam como Receita nem Despesa)
    const processedApp = postProcessExtractedCandidates(candidates, '2026-11', new Set())
    expect(processedApp[0].type).toBe('TRANSFER')
    expect(processedApp[1].type).toBe('TRANSFER')
    expect(processedApp[2].type).toBe('TRANSFER')
    expect(processedApp[3].type).toBe('TRANSFER')
  })

  it('post-processes raw AI items: skips balances, resolves BRL strings, flags illegible items, and detects overlap duplicates', () => {
    const rawItems = [
      {
        rawDate: '05/11',
        description: 'Saldo do dia',
        amountBrl: 'R$ 4.320,10',
        type: 'INCOME' as const,
      },
      {
        rawDate: '05 NOV',
        description: 'Supermercado Assaí',
        amountBrl: 'R$ 342,80',
        type: 'EXPENSE' as const,
        suggestedCategory: 'Supermercado',
      },
      {
        rawDate: '05/11/2026',
        description: 'SUPERMERCADO ASSAI',
        amountBrl: '342,80',
        type: 'EXPENSE' as const,
        suggestedCategory: 'Supermercado',
      },
      {
        rawDate: '06/11',
        description: 'Posto Shell (valor cortado)',
        amountBrl: 'ilegível',
        type: 'EXPENSE' as const,
      },
    ]

    const processed = postProcessExtractedCandidates(rawItems, '2026-11', new Set())

    expect(processed).toHaveLength(3)
    // Ordenado cronologicamente (mais recente primeiro: 06/11 antes de 05/11)
    expect(processed[0].isoDate).toBe('2026-11-06')
    expect(processed[0].needsReview).toBe(true)
    expect(processed[0].reviewReason).toContain('Valor')
    expect(processed[1].isoDate).toBe('2026-11-05')
    expect(processed[1].amountCents).toBe(34280)
    expect(processed[1].isDuplicate).toBe(false)
    expect(processed[2].isDuplicate).toBe(true)
  })

  it('extracts real dates from mobile OCR headers with weekdays/dots and sorts newest first', () => {
    const ocrText = `
Sexta-feira, 14 de nov.
Pix enviado
Posto Ipiranga
- R$ 100,00
terça, 18/11/2026
Compra débito
Drogasil
- R$ 45,90
`
    const candidates = parseMobileAppScreenshotOcr(ocrText, '2026-11')
    const processed = postProcessExtractedCandidates(candidates, '2026-11', new Set())

    expect(processed).toHaveLength(2)
    expect(processed[0]).toMatchObject({
      isoDate: '2026-11-18',
      amountCents: 4590,
      needsReview: false,
    })
    expect(processed[1]).toMatchObject({
      isoDate: '2026-11-14',
      amountCents: 10000,
      needsReview: false,
    })
  })
})
