import { NextRequest, NextResponse } from 'next/server'
import { ensureSeeded, prisma } from '@/lib/prisma'
import { bankAccountSchema, creditCardSchema } from '@/lib/validations/finance'

export async function GET() {
  try {
    await ensureSeeded()
    const [bankAccounts, creditCards] = await Promise.all([
      prisma.bankAccount.findMany({
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { transactions: true } },
        },
      }),
      prisma.creditCard.findMany({
        orderBy: { name: 'asc' },
        include: {
          bankAccount: true,
          _count: { select: { transactions: true } },
        },
      }),
    ])

    return NextResponse.json({ bankAccounts, creditCards })
  } catch (error) {
    console.error('Erro ao listar contas e cartões:', error)
    return NextResponse.json(
      { error: 'Não foi possível carregar contas e cartões.' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded()
    const body = await req.json()
    const { entityType, ...payload } = body

    if (entityType === 'CREDIT_CARD') {
      const parsed = creditCardSchema.safeParse(payload)
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Dados do cartão inválidos', details: parsed.error.flatten() },
          { status: 400 }
        )
      }
      const card = await prisma.creditCard.create({
        data: {
          name: parsed.data.name,
          institution: parsed.data.institution,
          lastFourDigits: parsed.data.lastFourDigits || null,
          limitCents: parsed.data.limitCents,
          closingDay: parsed.data.closingDay,
          dueDay: parsed.data.dueDay,
          color: parsed.data.color,
          bankAccountId: parsed.data.bankAccountId || null,
        },
      })
      return NextResponse.json({ creditCard: card }, { status: 201 })
    }

    const parsed = bankAccountSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados da conta inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const account = await prisma.bankAccount.create({
      data: parsed.data,
    })

    return NextResponse.json({ bankAccount: account }, { status: 201 })
  } catch (error) {
    console.error('Erro ao criar conta/cartão:', error)
    return NextResponse.json(
      { error: 'Falha ao salvar conta ou cartão.' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const entityType = searchParams.get('entityType')

    if (!id) {
      return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })
    }

    if (entityType === 'CREDIT_CARD') {
      await prisma.creditCard.delete({ where: { id } })
    } else {
      await prisma.bankAccount.delete({ where: { id } })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro ao excluir conta/cartão:', error)
    return NextResponse.json(
      { error: 'Não foi possível excluir o registro.' },
      { status: 500 }
    )
  }
}
