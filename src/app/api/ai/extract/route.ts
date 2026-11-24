import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { ensureSeeded, prisma } from '@/lib/prisma'
import {
  detectAccountHolderFromText,
  extractTransactionsFromImagesWithAI,
  extractTransactionsFromPdfBuffer,
  parseBankStatementText,
  postProcessExtractedCandidates,
  RawAiExtractedCandidate,
} from '@/lib/ai/extract-transactions'
import { matchLearnedCategoryRule } from '@/lib/finance/category-rules'

const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'application/pdf',
])

function isValidGeminiKeyFormat(key: string): boolean {
  const k = key.trim()
  return (k.startsWith('AIza') || k.startsWith('AQ.')) && k.length >= 30
}

function persistGeminiKeyIfProvided(apiKey: string) {
  const cleanKey = apiKey.trim()
  if (!isValidGeminiKeyFormat(cleanKey)) return
  process.env.GEMINI_API_KEY = cleanKey
  try {
    const envPath = path.join(process.cwd(), '.env')
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, 'utf-8')
      if (/^GEMINI_API_KEY=.*$/m.test(content)) {
        content = content.replace(
          /^GEMINI_API_KEY=.*$/m,
          `GEMINI_API_KEY="${cleanKey}"`
        )
      } else {
        content += `\nGEMINI_API_KEY="${cleanKey}"\n`
      }
      fs.writeFileSync(envPath, content, 'utf-8')
    }
  } catch {
    // Ignore fs write error if read-only
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded()
    const formData = await req.formData()
    const files = formData.getAll('images') as File[]
    const rawStatementText = (formData.get('rawStatementText') as string) || ''
    const customApiKey = (formData.get('apiKey') as string) || ''
    const accountHolderInput =
      (formData.get('accountHolderName') as string) || ''
    const statementOwnerInput =
      (formData.get('statementOwner') as string) || 'AUTO' // AUTO | JOHN | VIVIANE
    const referenceMonth =
      (formData.get('referenceMonth') as string) ||
      new Date().toISOString().slice(0, 7)
    const bankAccountId = (formData.get('bankAccountId') as string) || null
    const creditCardId = (formData.get('creditCardId') as string) || null
    const sourceName =
      (formData.get('sourceName') as string) ||
      (rawStatementText.trim()
        ? 'Extrato Bancário (Texto/PDF Itaú)'
        : `Importação (${files.length} arquivo${files.length > 1 ? 's' : ''})`)

    const validCustomApiKey = isValidGeminiKeyFormat(customApiKey)
      ? customApiKey.trim()
      : ''

    if (validCustomApiKey) {
      persistGeminiKeyIfProvided(validCustomApiKey)
    }

    if ((!files || files.length === 0) && !rawStatementText.trim()) {
      return NextResponse.json(
        {
          error:
            'Selecione ao menos um arquivo (PDF, PNG, JPG, JPEG ou WEBP) ou cole o texto do extrato.',
        },
        { status: 400 }
      )
    }

    const [existingTxs, categories, learnedRulesRaw] = await Promise.all([
      prisma.transaction.findMany({
        select: {
          fingerprint: true,
          date: true,
          amountCents: true,
          description: true,
        },
      }),
      prisma.category.findMany(),
      prisma.categoryRule.findMany({
        include: { category: true },
      }),
    ])

    const learnedRules = learnedRulesRaw.map((r) => ({
      id: r.id,
      pattern: r.pattern,
      transactionType: r.transactionType,
      categoryId: r.categoryId,
      categoryName: r.category.name,
    }))

    const existingFingerprints = new Set(existingTxs.map((t) => t.fingerprint))
    const categoryByName = new Map(
      categories.map((c) => [c.name.toLowerCase(), c.id])
    )

    let candidates: RawAiExtractedCandidate[] = []
    let provider = 'Extrator Nativo PDF (Itaú / Bancos)'
    let detectedHolder: string | null = accountHolderInput.trim() || null

    if (rawStatementText.trim()) {
      if (!detectedHolder) {
        detectedHolder = detectAccountHolderFromText(rawStatementText)
      }
      candidates = parseBankStatementText(rawStatementText)
      provider = 'Parser Estruturado de Extrato'
    } else {
      const filesForAi: Array<{ mimeType: string; base64Data: string }> = []

      for (const file of files) {
        const isPdf =
          file.type === 'application/pdf' ||
          file.name.toLowerCase().endsWith('.pdf')
        const resolvedMime =
          file.type || (isPdf ? 'application/pdf' : '')

        if (!ALLOWED_TYPES.has(resolvedMime)) {
          return NextResponse.json(
            {
              error: `Formato de arquivo não suportado (${file.name}). Utilize PDF, PNG, JPG, JPEG ou WEBP.`,
            },
            { status: 400 }
          )
        }

        const arrayBuffer = await file.arrayBuffer()
        // Guarda o base64 ANTES de passar o buffer para o unpdf (evita erro "detached ArrayBuffer")
        const base64Data = Buffer.from(new Uint8Array(arrayBuffer)).toString('base64')

        // Se for PDF, primeiro tentamos extrair a camada digital de texto diretamente no servidor (não exige chave de IA!)
        if (isPdf) {
          try {
            const pdfResult = await extractTransactionsFromPdfBuffer(arrayBuffer.slice(0))
            if (!detectedHolder && pdfResult.accountHolderName) {
              detectedHolder = pdfResult.accountHolderName
            }
            if (pdfResult.candidates.length > 0) {
              candidates.push(...pdfResult.candidates)
              continue
            }
          } catch {
            // Se o PDF for escaneado (imagem sem texto), cai para a IA multimodal abaixo
          }
        }

        filesForAi.push({
          mimeType:
            resolvedMime === 'image/jpg' ? 'image/jpeg' : resolvedMime,
          base64Data,
        })
      }

      // Se sobraram imagens (PNG/JPG) ou PDFs escaneados sem texto digital, processa via IA Multimodal
      if (filesForAi.length > 0) {
        const aiResult = await extractTransactionsFromImagesWithAI(
          filesForAi,
          referenceMonth,
          validCustomApiKey
        )
        candidates.push(...aiResult.candidates)
        provider = aiResult.provider
        if (!detectedHolder && aiResult.accountHolderName) {
          detectedHolder = aiResult.accountHolderName
        }
      }
    }

    // Define o titular do extrato (John vs Viviane) para permitir importar o PDF da esposa nos mesmos meses sem conflito de duplicata
    let ownerTag: string | null = null
    if (statementOwnerInput === 'VIVIANE') {
      ownerTag = 'viviane'
      if (!detectedHolder) detectedHolder = 'VIVIANE DA CRUZ SANTOS'
    } else if (statementOwnerInput === 'JOHN') {
      ownerTag = 'john'
    } else {
      // Auto-detecta se o PDF é da Viviane pelo cabeçalho ou nome do arquivo
      const fileNamesCombined = files.map((f) => f.name).join(' ')
      if (
        (detectedHolder && /viviane/i.test(detectedHolder)) ||
        /viviane/i.test(fileNamesCombined) ||
        /viviane/i.test(sourceName)
      ) {
        ownerTag = 'viviane'
      } else if (detectedHolder && /john/i.test(detectedHolder)) {
        ownerTag = 'john'
      }
    }

    const finalSourceName =
      ownerTag === 'viviane' && !/viviane/i.test(sourceName)
        ? `${sourceName} — Viviane`
        : sourceName

    const processed = postProcessExtractedCandidates(
      candidates,
      referenceMonth,
      existingFingerprints,
      {
        accountHolderName: detectedHolder,
        ownerTag,
        existingTransactions: existingTxs.map((t) => ({
          date: t.date.toISOString().slice(0, 10),
          amountCents: t.amountCents,
          description: t.description,
          fingerprint: t.fingerprint,
        })),
      }
    )

    const batch = await prisma.importBatch.create({
      data: {
        sourceName: finalSourceName,
        referenceMonth,
        imageCount: files.length || 1,
        status: 'PENDING_REVIEW',
        providerUsed: provider,
        bankAccountId:
          bankAccountId && bankAccountId !== 'NONE' ? bankAccountId : null,
        creditCardId:
          creditCardId && creditCardId !== 'NONE' ? creditCardId : null,
        extractedItems: {
          create: processed.map((item) => {
            // Prioridade 1: Regra aprendida pelo usuário no banco de dados!
            const learned = matchLearnedCategoryRule(
              item.description,
              item.type,
              learnedRules
            )
            const matchedCatId =
              learned?.categoryId ||
              categoryByName.get(item.suggestedCategory.toLowerCase()) ||
              null
            const finalSuggestedName =
              learned?.categoryName || item.suggestedCategory

            return {
              rawDateText: item.rawDateText,
              resolvedDate: item.resolvedDate,
              competenceMonth: item.competenceMonth,
              description: item.description,
              merchant: item.merchant,
              amountCents: item.amountCents,
              type: item.type,
              categoryId: matchedCatId,
              suggestedCategory: finalSuggestedName,
              installmentNumber: item.installmentNumber,
              totalInstallments: item.totalInstallments,
              needsReview: item.needsReview,
              reviewReason: item.reviewReason,
              isDuplicate: item.isDuplicate,
              duplicateReason: item.duplicateReason,
              fingerprint: item.fingerprint,
              selected: !item.isDuplicate && item.amountCents > 0,
            }
          }),
        },
      },
      include: {
        extractedItems: {
          include: { category: true },
          orderBy: { resolvedDate: 'desc' },
        },
        bankAccount: true,
        creditCard: true,
      },
    })

    return NextResponse.json({
      batch,
      provider,
      accountHolderName: detectedHolder,
      ownerTag,
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erro inesperado ao processar o documento.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
