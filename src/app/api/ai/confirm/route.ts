import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildTransactionFingerprint } from '@/lib/finance/deduplication'
import { generateInstallments } from '@/lib/finance/installments'
import { extractMerchantPattern } from '@/lib/finance/category-rules'
import { z } from 'zod'

const confirmItemSchema = z.object({
  id: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  description: z.string().min(1),
  merchant: z.string().optional().nullable(),
  amountCents: z.number().int().positive(),
  type: z.enum(['EXPENSE', 'INCOME', 'TRANSFER', 'INVOICE_PAYMENT', 'REFUND']),
  categoryId: z.string().optional().nullable(),
  bankAccountId: z.string().optional().nullable(),
  creditCardId: z.string().optional().nullable(),
  installmentNumber: z.number().int().optional().nullable(),
  totalInstallments: z.number().int().optional().nullable(),
  generateRemainingInstallments: z.boolean().optional().default(false),
})

const confirmBatchSchema = z.object({
  batchId: z.string().optional().nullable(),
  ownerTag: z.string().optional().nullable(),
  replaceExistingBatchTransactions: z.boolean().optional().default(false),
  bankAccountId: z.string().optional().nullable(),
  creditCardId: z.string().optional().nullable(),
  items: z
    .array(confirmItemSchema)
    .min(1, 'Selecione ao menos uma transação para salvar'),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = confirmBatchSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Dados de revisão inválidos',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      )
    }

    const {
      batchId,
      ownerTag,
      replaceExistingBatchTransactions,
      bankAccountId,
      creditCardId,
      items,
    } = parsed.data

    const monthsAffected = new Set<string>()

    const savedTransactions = await prisma.$transaction(async (tx) => {
      // Se o usuário reabriu um extrato já confirmado para editar, substituímos as transações anteriores desse lote
      if (batchId && replaceExistingBatchTransactions) {
        await tx.transaction.deleteMany({
          where: { importBatchId: batchId },
        })
      }

      const results = []

      for (const item of items) {
        // Aprende automaticamente o padrão (estabelecimento + tipo -> categoria) para os próximos extratos
        if (item.categoryId && item.categoryId !== 'NONE') {
          const pattern = extractMerchantPattern(item.description)
          if (pattern && pattern.length >= 3) {
            await tx.categoryRule.upsert({
              where: {
                pattern_transactionType: {
                  pattern,
                  transactionType: item.type,
                },
              },
              update: {
                categoryId: item.categoryId,
                rawExample: item.description.trim(),
              },
              create: {
                pattern,
                rawExample: item.description.trim(),
                transactionType: item.type,
                categoryId: item.categoryId,
              },
            })
          }
        }

        const isoDate = item.date.slice(0, 10)
        // A competência (YYYY-MM) é SEMPRE derivada da data real da transação!
        // Assim, um PDF com transações de Setembro, Outubro e Novembro separa cada uma no seu próprio mês.
        const competenceMonth = isoDate.slice(0, 7)
        monthsAffected.add(competenceMonth)

        const resolvedBankId =
          item.bankAccountId ||
          (bankAccountId && bankAccountId !== 'NONE' ? bankAccountId : null)
        const resolvedCardId =
          item.creditCardId ||
          (creditCardId && creditCardId !== 'NONE' ? creditCardId : null)

        if (
          item.generateRemainingInstallments &&
          item.totalInstallments &&
          item.totalInstallments > 1 &&
          item.type === 'EXPENSE'
        ) {
          const currentInst = item.installmentNumber || 1
          const remainingCount = item.totalInstallments - currentInst + 1
          const generated = generateInstallments({
            description: item.description,
            totalAmountCents: item.amountCents * remainingCount,
            totalInstallments: remainingCount,
            startDate: isoDate,
          })

          const group = await tx.installmentGroup.create({
            data: {
              description: item.description,
              totalAmountCents: item.amountCents * item.totalInstallments,
              totalInstallments: item.totalInstallments,
              startDate: new Date(`${isoDate}T12:00:00.000Z`),
              creditCardId: resolvedCardId,
              categoryId: item.categoryId || null,
            },
          })

          for (let idx = 0; idx < generated.length; idx++) {
            const g = generated[idx]
            monthsAffected.add(g.competenceMonth)
            const realInstNum = currentInst + idx
            const cleanDesc = item.description
              .replace(/\s*\(\d+\/\d+\)\s*$/, '')
              .trim()
            const descWithInst = `${cleanDesc} (${realInstNum}/${item.totalInstallments})`
            const fp = buildTransactionFingerprint({
              date: g.isoDate,
              amountCents: item.amountCents,
              description: descWithInst,
            })

            const created = await tx.transaction.create({
              data: {
                description: descWithInst,
                merchant: item.merchant || null,
                amountCents: item.amountCents,
                type: item.type,
                date: g.date,
                competenceMonth: g.competenceMonth,
                categoryId: item.categoryId || null,
                bankAccountId: resolvedBankId,
                creditCardId: resolvedCardId,
                installmentGroupId: group.id,
                installmentNumber: realInstNum,
                totalInstallments: item.totalInstallments,
                importBatchId: batchId || null,
                origin: 'AI_IMPORT',
                fingerprint: fp,
                paidAmountCents: item.amountCents,
                paymentStatus: 'PAID',
              },
            })
            results.push(created)
          }
        } else {
          const fp = buildTransactionFingerprint({
            date: isoDate,
            amountCents: item.amountCents,
            description: item.description,
            ownerTag,
          })

          const created = await tx.transaction.create({
            data: {
              description: item.description,
              merchant: item.merchant || null,
              amountCents: item.amountCents,
              type: item.type,
              date: new Date(`${isoDate}T12:00:00.000Z`),
              competenceMonth,
              categoryId: item.categoryId || null,
              bankAccountId: resolvedBankId,
              creditCardId: resolvedCardId,
              installmentNumber: item.installmentNumber || null,
              totalInstallments: item.totalInstallments || null,
              importBatchId: batchId || null,
              origin: 'AI_IMPORT',
              fingerprint: fp,
              paidAmountCents: item.amountCents,
              paymentStatus: 'PAID',
              notes:
                ownerTag === 'viviane'
                  ? 'Extrato Viviane'
                  : ownerTag === 'john'
                    ? 'Extrato John'
                    : null,
            },
          })
          results.push(created)
        }
      }

      if (batchId) {
        const sortedMonths = Array.from(monthsAffected).sort()
        await tx.importBatch.update({
          where: { id: batchId },
          data: {
            status: 'CONFIRMED',
            confirmedAt: new Date(),
            referenceMonth:
              sortedMonths[sortedMonths.length - 1] || undefined,
            bankAccountId:
              bankAccountId && bankAccountId !== 'NONE'
                ? bankAccountId
                : undefined,
            creditCardId:
              creditCardId && creditCardId !== 'NONE'
                ? creditCardId
                : undefined,
          },
        })
      }

      return results
    })

    return NextResponse.json({
      savedCount: savedTransactions.length,
      monthsAffected: Array.from(monthsAffected).sort(),
    })
  } catch (error) {
    console.error('Erro ao confirmar transações importadas:', error)
    return NextResponse.json(
      { error: 'Não foi possível salvar as transações confirmadas.' },
      { status: 500 }
    )
  }
}
