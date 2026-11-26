import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildTransactionFingerprint } from '@/lib/finance/deduplication'
import { z } from 'zod'

const commitBlockSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  replaceSpreadsheetInMonth: z.boolean().optional().default(false),
  expenses: z.array(
    z.object({
      name: z.string().min(1),
      weeksCents: z.tuple([
        z.number().int().min(0),
        z.number().int().min(0),
        z.number().int().min(0),
        z.number().int().min(0),
        z.number().int().min(0),
      ]),
      paid: z.boolean().default(true),
      totalCents: z.number().int().min(0),
    })
  ),
  incomes: z.array(
    z.object({
      description: z.string().min(1),
      amountCents: z.number().int().positive(),
      received: z.boolean().default(true),
    })
  ),
})

const commitPayloadSchema = z.object({
  blocks: z.array(commitBlockSchema).min(1),
})

const WEEK_DEFAULT_DAYS = [4, 11, 18, 25, 29]

function getSafeIsoDate(month: string, weekIndex: number): string {
  const [yStr, mStr] = month.split('-')
  const year = Number(yStr)
  const monthNum = Number(mStr)
  const lastDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate()
  const day = Math.min(WEEK_DEFAULT_DAYS[weekIndex] ?? 25, lastDay)
  return `${month}-${String(day).padStart(2, '0')}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = commitPayloadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos para importação de histórico.', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const existingCats = await prisma.category.findMany()
    const catByLowerName = new Map(
      existingCats.map((c) => [c.name.trim().toLowerCase(), c])
    )
    const salaryCat =
      catByLowerName.get('salário') ||
      catByLowerName.get('salario') ||
      existingCats.find((c) => c.type === 'INCOME') ||
      null

    const existingTxs = await prisma.transaction.findMany({
      select: { fingerprint: true },
    })
    const existingFingerprints = new Set(existingTxs.map((t) => t.fingerprint))

    let createdCount = 0
    let skippedDuplicates = 0
    const monthsSaved: string[] = []

    await prisma.$transaction(async (tx) => {
      for (const block of parsed.data.blocks) {
        monthsSaved.push(block.month)

        if (block.replaceSpreadsheetInMonth) {
          await tx.transaction.deleteMany({
            where: {
              competenceMonth: block.month,
              origin: 'SPREADSHEET',
            },
          })
        }

        // 1. Grava Despesas por semana
        for (const exp of block.expenses) {
          const cleanName = exp.name.trim()
          if (!cleanName) continue

          // Garante categoria correspondente no sistema
          let cat = catByLowerName.get(cleanName.toLowerCase())
          if (!cat) {
            const slug = `${cleanName
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 99)}`
            cat = await tx.category.create({
              data: {
                name: cleanName,
                slug,
                type: 'EXPENSE',
                color: /cart[aã]o/i.test(cleanName) ? '#d946ef' : '#6366f1',
                icon: 'Tag',
                isSystem: false,
              },
            })
            catByLowerName.set(cleanName.toLowerCase(), cat)
          }

          for (let wIdx = 0; wIdx < 5; wIdx++) {
            const weekCents = exp.weeksCents[wIdx] || 0
            if (weekCents <= 0) continue

            const isoDate = getSafeIsoDate(block.month, wIdx)
            const fp = buildTransactionFingerprint({
              date: isoDate,
              amountCents: weekCents,
              description: `${cleanName} (Planilha S${wIdx + 1})`,
            })

            if (!block.replaceSpreadsheetInMonth && existingFingerprints.has(fp)) {
              skippedDuplicates++
              continue
            }

            await tx.transaction.create({
              data: {
                description: cleanName,
                merchant: cleanName,
                expenseName: cleanName,
                amountCents: weekCents,
                paidAmountCents: exp.paid ? weekCents : 0,
                paymentStatus: exp.paid ? 'PAID' : 'PENDING',
                paidAt: exp.paid ? new Date(`${isoDate}T12:00:00.000Z`) : null,
                type: 'EXPENSE',
                date: new Date(`${isoDate}T12:00:00.000Z`),
                competenceMonth: block.month,
                categoryId: cat.id,
                origin: 'SPREADSHEET',
                fingerprint: fp,
              },
            })
            existingFingerprints.add(fp)
            createdCount++
          }
        }

        // 2. Grava Receitas do mês
        for (const inc of block.incomes) {
          const cleanDesc = inc.description.trim()
          if (!cleanDesc || inc.amountCents <= 0) continue

          const isoDate = `${block.month}-05`
          const fp = buildTransactionFingerprint({
            date: isoDate,
            amountCents: inc.amountCents,
            description: cleanDesc,
          })

          if (!block.replaceSpreadsheetInMonth && existingFingerprints.has(fp)) {
            skippedDuplicates++
            continue
          }

          await tx.transaction.create({
            data: {
              description: cleanDesc,
              merchant: cleanDesc,
              amountCents: inc.amountCents,
              plannedAmountCents: inc.amountCents,
              paidAmountCents: inc.received ? inc.amountCents : 0,
              paymentStatus: inc.received ? 'PAID' : 'PENDING',
              paidAt: inc.received ? new Date(`${isoDate}T12:00:00.000Z`) : null,
              type: 'INCOME',
              date: new Date(`${isoDate}T12:00:00.000Z`),
              competenceMonth: block.month,
              categoryId: salaryCat?.id || null,
              origin: 'SPREADSHEET',
              fingerprint: fp,
            },
          })
          existingFingerprints.add(fp)
          createdCount++
        }
      }
    })

    return NextResponse.json({
      createdCount,
      skippedDuplicates,
      monthsSaved: Array.from(new Set(monthsSaved)).sort(),
    })
  } catch (error) {
    console.error('Erro ao gravar histórico da planilha:', error)
    return NextResponse.json(
      { error: 'Não foi possível salvar os dados importados.' },
      { status: 500 }
    )
  }
}
