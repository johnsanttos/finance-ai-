import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractMerchantPattern } from '@/lib/finance/category-rules'
import { z } from 'zod'

const ruleSchema = z.object({
  description: z.string().min(2),
  categoryId: z.string().min(1),
  transactionType: z
    .enum(['ALL', 'EXPENSE', 'INCOME', 'TRANSFER', 'INVOICE_PAYMENT', 'REFUND'])
    .optional()
    .default('EXPENSE'),
})

export async function GET() {
  try {
    const rules = await prisma.categoryRule.findMany({
      include: { category: true },
      orderBy: { updatedAt: 'desc' },
    })
    return NextResponse.json({ rules })
  } catch (error) {
    console.error('Erro ao listar regras aprendidas:', error)
    return NextResponse.json(
      { error: 'Falha ao carregar padrões de categorias.' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = ruleSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    const pattern = extractMerchantPattern(parsed.data.description)
    if (!pattern || pattern.length < 3) {
      return NextResponse.json(
        { error: 'Descrição muito curta para salvar padrão.' },
        { status: 400 }
      )
    }

    const rule = await prisma.categoryRule.upsert({
      where: {
        pattern_transactionType: {
          pattern,
          transactionType: parsed.data.transactionType,
        },
      },
      update: {
        categoryId: parsed.data.categoryId,
        rawExample: parsed.data.description.trim(),
      },
      create: {
        pattern,
        rawExample: parsed.data.description.trim(),
        transactionType: parsed.data.transactionType,
        categoryId: parsed.data.categoryId,
      },
      include: { category: true },
    })

    return NextResponse.json({ rule, pattern })
  } catch (error) {
    console.error('Erro ao salvar regra de categoria:', error)
    return NextResponse.json(
      { error: 'Não foi possível salvar o padrão da categoria.' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })
    }
    await prisma.categoryRule.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro ao remover regra aprendida:', error)
    return NextResponse.json(
      { error: 'Falha ao excluir padrão.' },
      { status: 500 }
    )
  }
}
