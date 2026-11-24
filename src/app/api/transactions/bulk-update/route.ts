import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const bulkUpdateSchema = z.object({
  ids: z.array(z.string()).min(1, 'Selecione ao menos uma transação'),
  categoryId: z.string().nullable().optional(),
  type: z
    .enum(['EXPENSE', 'INCOME', 'TRANSFER', 'INVOICE_PAYMENT', 'REFUND'])
    .optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = bulkUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    const dataToUpdate: Record<string, unknown> = {}
    if (parsed.data.categoryId !== undefined) {
      dataToUpdate.categoryId = parsed.data.categoryId
    }
    if (parsed.data.type !== undefined) {
      dataToUpdate.type = parsed.data.type
    }

    const result = await prisma.transaction.updateMany({
      where: {
        id: { in: parsed.data.ids },
      },
      data: dataToUpdate,
    })

    return NextResponse.json({ updatedCount: result.count })
  } catch (error) {
    console.error('Erro ao atualizar transações em lote:', error)
    return NextResponse.json(
      { error: 'Falha ao atualizar transações selecionadas.' },
      { status: 500 }
    )
  }
}
