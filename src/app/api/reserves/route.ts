import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const reserveSchema = z.object({
  name: z.string().min(2, 'Informe o nome da reserva'),
  targetAmountCents: z.number().int().nonnegative().default(0),
  currentAmountCents: z.number().int().nonnegative().default(0),
  color: z.string().default('#10b981'),
  notes: z.string().optional().nullable(),
})

export async function GET() {
  try {
    const reserves = await prisma.financialReserve.findMany({
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json({ reserves })
  } catch (error) {
    console.error('Erro ao listar reservas:', error)
    return NextResponse.json({ error: 'Falha ao carregar reservas.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = reserveSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados da reserva inválidos' }, { status: 400 })
    }

    const reserve = await prisma.financialReserve.create({
      data: parsed.data,
    })
    return NextResponse.json({ reserve }, { status: 201 })
  } catch (error) {
    console.error('Erro ao criar reserva:', error)
    return NextResponse.json({ error: 'Falha ao criar reserva.' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, name, targetAmountCents, currentAmountCents, color, notes } = body
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

    const reserve = await prisma.financialReserve.update({
      where: { id },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(targetAmountCents !== undefined ? { targetAmountCents } : {}),
        ...(currentAmountCents !== undefined ? { currentAmountCents } : {}),
        ...(color ? { color } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
    })
    return NextResponse.json({ reserve })
  } catch (error) {
    console.error('Erro ao atualizar reserva:', error)
    return NextResponse.json({ error: 'Falha ao atualizar reserva.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })
    await prisma.financialReserve.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro ao excluir reserva:', error)
    return NextResponse.json({ error: 'Falha ao excluir reserva.' }, { status: 500 })
  }
}
