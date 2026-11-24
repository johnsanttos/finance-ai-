import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const bulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1, 'Selecione ao menos uma transação'),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = bulkDeleteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'IDs inválidos' }, { status: 400 })
    }

    const result = await prisma.transaction.deleteMany({
      where: {
        id: { in: parsed.data.ids },
      },
    })

    return NextResponse.json({ deletedCount: result.count })
  } catch (error) {
    console.error('Erro ao excluir transações em lote:', error)
    return NextResponse.json(
      { error: 'Falha ao excluir transações selecionadas.' },
      { status: 500 }
    )
  }
}
