import { NextRequest, NextResponse } from 'next/server'
import { ensureSeeded, prisma } from '@/lib/prisma'
import { categorySchema } from '@/lib/validations/finance'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded()
    const { searchParams } = new URL(req.url)
    const month = searchParams.get('month')

    const categories = await prisma.category.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: {
        transactions: month
          ? {
              where: { competenceMonth: month },
              select: { amountCents: true, type: true },
            }
          : false,
      },
    })

    const enriched = categories.map((cat) => {
      let spentCents = 0
      if (Array.isArray(cat.transactions)) {
        for (const t of cat.transactions) {
          if (t.type === 'EXPENSE') spentCents += t.amountCents
          if (t.type === 'REFUND') spentCents -= t.amountCents
        }
      }
      return {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        type: cat.type,
        color: cat.color,
        icon: cat.icon,
        isSystem: cat.isSystem,
        monthlyBudgetCents: cat.monthlyBudgetCents,
        spentCents: Math.max(0, spentCents),
      }
    })

    return NextResponse.json({ categories: enriched })
  } catch (error) {
    console.error('Erro ao listar categorias:', error)
    return NextResponse.json(
      { error: 'Falha ao carregar categorias.' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded()
    const body = await req.json()
    const parsed = categorySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const slug = slugify(parsed.data.name)
    const category = await prisma.category.create({
      data: {
        name: parsed.data.name.trim(),
        slug: `${slug}-${Date.now().toString().slice(-4)}`,
        type: parsed.data.type,
        color: parsed.data.color,
        icon: parsed.data.icon,
        isSystem: false,
        monthlyBudgetCents: parsed.data.monthlyBudgetCents ?? null,
      },
    })

    return NextResponse.json({ category }, { status: 201 })
  } catch (error) {
    console.error('Erro ao criar categoria:', error)
    return NextResponse.json(
      { error: 'Já existe uma categoria com esse nome ou erro ao salvar.' },
      { status: 400 }
    )
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, name, color, type, monthlyBudgetCents } = body
    if (!id) {
      return NextResponse.json({ error: 'ID da categoria obrigatório' }, { status: 400 })
    }

    const updated = await prisma.category.update({
      where: { id },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(color ? { color } : {}),
        ...(type ? { type } : {}),
        ...(monthlyBudgetCents !== undefined ? { monthlyBudgetCents } : {}),
      },
    })

    return NextResponse.json({ category: updated })
  } catch (error) {
    console.error('Erro ao atualizar categoria:', error)
    return NextResponse.json(
      { error: 'Não foi possível atualizar a categoria.' },
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

    await prisma.category.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro ao excluir categoria:', error)
    return NextResponse.json(
      { error: 'Não foi possível excluir a categoria.' },
      { status: 500 }
    )
  }
}
