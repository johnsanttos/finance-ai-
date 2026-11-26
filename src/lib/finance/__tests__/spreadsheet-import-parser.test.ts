import { describe, expect, it } from 'vitest'
import {
  detectMonthFromText,
  parseCsvSpreadsheetText,
  parseSpreadsheetOcrText,
} from '../spreadsheet-import-parser'

describe('Spreadsheet Historical Import Parser (Excel / CSV / Print)', () => {
  it('auto-detects sheet names without spaces like JUNHO25, AGOSTO25, SETEMBRO2025', () => {
    expect(detectMonthFromText('JUNHO25', '2026-11')).toBe('2025-06')
    expect(detectMonthFromText('JULHO25', '2026-11')).toBe('2025-07')
    expect(detectMonthFromText('AGOSTO25', '2026-11')).toBe('2025-08')
    expect(detectMonthFromText('SETEMBRO2025', '2026-11')).toBe('2025-09')
    expect(detectMonthFromText('OUTUBRO 26', '2026-11')).toBe('2026-10')
  })
  it('parses multi-block CSV matching user Excel format with weeks, PAGO flag and ENTRADA DE RECEITA', () => {
    const sampleCsv = `,CONTAS,SEMANA 1,SEMANA 2,SEMANA 3,SEMANA 4,PAGO,TOTAL,Coluna1,TOTAL DE GASTOS,,ENTRADA DE RECEITA,SALÁRIO,ADIANTAMENTO,FÉRIAS/13SALÁRIO,VALE REFEIÇÃO
,IPTU,82,,,,x,82,,11033.23,,SALÁRIO JOHN,1945.75,,,750
,CONDOMÍNIO,542.68,,,,x,542.68,,,,SALÁRIO VIVIANE,6700,1490,,
,MERCADO,217,386.39,750,296,x,1649.39,,,,,,,,
,CARTÃO NUBANK,291.7,,,,,291.7,,,,,,,,
,CONTAS,SEMANA 1,SEMANA 2,SEMANA 3,SEMANA 4,PAGO,TOTAL,,TOTAL DE GASTOS,,ENTRADA DE RECEITA,SALÁRIO,ADIANTAMENTO,FÉRIAS/13SALÁRIO,VALE REFEIÇÃO
,IPTU,86,,,,X,86,,7553,,SALÁRIO JOHN,2643,,,800
,ENEL ,177,,,,X,177,,TOTAL PAGO,,2026-07-25,,,,
`
    const blocks = parseCsvSpreadsheetText(sampleCsv, '2026-10')
    expect(blocks).toHaveLength(2)

    // Bloco 1
    expect(blocks[0].expenses).toHaveLength(4)
    const mercado = blocks[0].expenses.find((e) => e.name === 'MERCADO')!
    expect(mercado.weeksCents).toEqual([21700, 38639, 75000, 29600, 0])
    expect(mercado.paid).toBe(true)
    expect(mercado.totalCents).toBe(164939)

    const nubank = blocks[0].expenses.find((e) => e.name === 'CARTÃO NUBANK')!
    expect(nubank.paid).toBe(false)
    expect(nubank.totalCents).toBe(29170)

    // Receitas do bloco 1: Salário John (1945.75), Vale Refeição John (750), Salário Viviane (6700), Adiantamento Viviane (1490)
    expect(blocks[0].incomes).toHaveLength(4)
    expect(blocks[0].totalIncomesCents).toBe(194575 + 75000 + 670000 + 149000)

    // Bloco 2 detecta a data 2026-07-25 -> 2026-07
    expect(blocks[1].detectedMonth).toBe('2026-07')
    expect(blocks[1].expenses).toHaveLength(2)
  })

  it('parses OCR text of a spreadsheet screenshot for a past month', () => {
    const ocr = `
CONTAS SEMANA 1 SEMANA 2 SEMANA 3 SEMANA 4 PAGO TOTAL
CONDOMÍNIO 758,00 x 758,00
COMBUSTÍVEL 100,00 150,00 x 250,00
TOTAL DE GASTOS 1008,00
SALÁRIO JOHN 2643,00
`
    const block = parseSpreadsheetOcrText(ocr, '2026-09')
    expect(block).not.toBeNull()
    expect(block!.detectedMonth).toBe('2026-09')
    expect(block!.expenses).toHaveLength(2)
    expect(block!.expenses[0]).toMatchObject({
      name: 'CONDOMÍNIO',
      totalCents: 75800,
      paid: true,
    })
    expect(block!.expenses[1]).toMatchObject({
      name: 'COMBUSTÍVEL',
      weeksCents: [10000, 15000, 0, 0, 0],
      totalCents: 25000,
    })
    expect(block!.incomes).toHaveLength(1)
    expect(block!.incomes[0].amountCents).toBe(264300)
  })
})
