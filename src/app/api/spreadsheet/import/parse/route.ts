import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI, Type } from '@google/genai'
import {
  parseCsvSpreadsheetText,
  ParsedSpreadsheetBlock,
  parseExcelWorkbookBuffer,
  parseFlexibleNumberToCents,
  parseSpreadsheetOcrText,
} from '@/lib/finance/spreadsheet-import-parser'

export const dynamic = 'force-dynamic'

async function extractSpreadsheetFromImageWithGemini(
  base64Data: string,
  mimeType: string,
  targetMonth: string,
  apiKey: string
): Promise<ParsedSpreadsheetBlock | null> {
  const ai = apiKey.startsWith('AQ.')
    ? new GoogleGenAI({ vertexai: true, apiKey })
    : new GoogleGenAI({ apiKey })
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Você está lendo um print/imagem de uma planilha financeira mensal no Excel (colunas CONTAS, SEMANA 1, SEMANA 2, SEMANA 3, SEMANA 4, PAGO, TOTAL e ENTRADA DE RECEITA).
Extraia TODAS as contas com valor maior que zero e TODAS as receitas visíveis.
Ignore linhas de resumo como TOTAL DE GASTOS, TOTAL PAGO, FALTAM A PAGAR, RENDIMENTOS, SALDO e COFRE.
Para cada despesa, informe os valores das semanas 1 a 4 (ou 5) em reais decimais (ex: 542.68) e paid=true se houver "x" ou "X" na coluna PAGO.`,
          },
          { inlineData: { mimeType, data: base64Data } },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          expenses: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                week1: { type: Type.NUMBER, nullable: true },
                week2: { type: Type.NUMBER, nullable: true },
                week3: { type: Type.NUMBER, nullable: true },
                week4: { type: Type.NUMBER, nullable: true },
                week5: { type: Type.NUMBER, nullable: true },
                total: { type: Type.NUMBER, nullable: true },
                paid: { type: Type.BOOLEAN },
              },
              required: ['name', 'paid'],
            },
          },
          incomes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING },
                amount: { type: Type.NUMBER },
              },
              required: ['description', 'amount'],
            },
          },
        },
        required: ['expenses', 'incomes'],
      },
    },
  })

  const raw = JSON.parse(response.text || '{"expenses":[],"incomes":[]}') as {
    expenses?: Array<{
      name: string
      week1?: number | null
      week2?: number | null
      week3?: number | null
      week4?: number | null
      week5?: number | null
      total?: number | null
      paid?: boolean
    }>
    incomes?: Array<{ description: string; amount: number }>
  }

  const expenses = (raw.expenses || [])
    .map((e) => {
      const weeksCents: [number, number, number, number, number] = [
        parseFlexibleNumberToCents(e.week1),
        parseFlexibleNumberToCents(e.week2),
        parseFlexibleNumberToCents(e.week3),
        parseFlexibleNumberToCents(e.week4),
        parseFlexibleNumberToCents(e.week5),
      ]
      let sum = weeksCents.reduce((a, b) => a + b, 0)
      if (sum === 0 && e.total) {
        const t = parseFlexibleNumberToCents(e.total)
        weeksCents[0] = t
        sum = t
      }
      return {
        name: e.name.trim(),
        weeksCents,
        paid: Boolean(e.paid),
        totalCents: sum,
      }
    })
    .filter((e) => e.name && e.totalCents > 0)

  const incomes = (raw.incomes || [])
    .map((inc) => ({
      description: inc.description.trim(),
      amountCents: parseFlexibleNumberToCents(inc.amount),
      received: true,
    }))
    .filter((i) => i.description && i.amountCents > 0)

  if (expenses.length === 0 && incomes.length === 0) return null

  return {
    blockId: 'gemini-1',
    label: `Print da Planilha (${targetMonth})`,
    detectedMonth: targetMonth,
    hintText: null,
    expenses,
    incomes,
    totalExpensesCents: expenses.reduce((a, e) => a + e.totalCents, 0),
    totalIncomesCents: incomes.reduce((a, i) => a + i.amountCents, 0),
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const csvText = String(formData.get('csvText') || '').trim()
    const defaultMonth =
      String(formData.get('defaultMonth') || '').trim() ||
      new Date().toISOString().slice(0, 7)
    const customApiKey = String(formData.get('apiKey') || '').trim()

    if (!file && !csvText) {
      return NextResponse.json(
        { error: 'Envie um arquivo (.xlsx, .csv ou imagem) ou cole o conteúdo da planilha.' },
        { status: 400 }
      )
    }

    // Caso 1: Texto CSV/Excel colado diretamente
    if (csvText && !file) {
      const blocks = parseCsvSpreadsheetText(csvText, defaultMonth)
      return NextResponse.json({
        blocks,
        provider: 'Leitor Direto CSV/Planilha (100% Preciso)',
      })
    }

    if (!file) {
      return NextResponse.json({ error: 'Arquivo não recebido.' }, { status: 400 })
    }

    const lowerName = file.name.toLowerCase()
    const arrayBuffer = await file.arrayBuffer()

    // Caso 2: Arquivo Excel (.xlsx / .xls)
    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
      const blocks = parseExcelWorkbookBuffer(arrayBuffer, defaultMonth)
      return NextResponse.json({
        blocks,
        provider: 'Leitor Nativo Excel (.xlsx)',
      })
    }

    // Caso 3: Arquivo CSV / TXT
    if (lowerName.endsWith('.csv') || lowerName.endsWith('.txt')) {
      const text = new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer))
      const blocks = parseCsvSpreadsheetText(text, defaultMonth)
      return NextResponse.json({
        blocks,
        provider: 'Leitor Nativo CSV',
      })
    }

    // Caso 4: Print / Foto da Planilha (PNG, JPG, WEBP)
    if (file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(lowerName)) {
      const base64Data = Buffer.from(new Uint8Array(arrayBuffer)).toString('base64')
      const mimeType = file.type || 'image/jpeg'

      const rawGeminiKey = customApiKey || process.env.GEMINI_API_KEY || ''
      const validGeminiKey =
        (rawGeminiKey.startsWith('AIza') || rawGeminiKey.startsWith('AQ.')) &&
        rawGeminiKey.length >= 30
          ? rawGeminiKey
          : ''

      if (validGeminiKey) {
        try {
          const geminiBlock = await extractSpreadsheetFromImageWithGemini(
            base64Data,
            mimeType,
            defaultMonth,
            validGeminiKey
          )
          if (geminiBlock) {
            return NextResponse.json({
              blocks: [geminiBlock],
              provider: 'Google Gemini Vision',
            })
          }
        } catch {
          // Fallback para OCR local gratuito abaixo
        }
      }

      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('por')
      try {
        const {
          data: { text },
        } = await worker.recognize(Buffer.from(new Uint8Array(arrayBuffer)))
        const block = parseSpreadsheetOcrText(text, defaultMonth)
        return NextResponse.json({
          blocks: block ? [block] : [],
          provider: 'OCR Local Gratuito (Tesseract.js)',
        })
      } finally {
        await worker.terminate()
      }
    }

    return NextResponse.json(
      { error: 'Formato não suportado. Envie .xlsx, .csv, .png, .jpg ou cole o texto da planilha.' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Erro ao ler planilha importada:', error)
    return NextResponse.json(
      { error: 'Não foi possível ler a planilha enviada.' },
      { status: 500 }
    )
  }
}
