import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    // Se passar ?id=..., retorna o lote completo com suas transações já salvas (ou extractedItems) para reedição
    if (id) {
      const batch = await prisma.importBatch.findUnique({
        where: { id },
        include: {
          bankAccount: true,
          creditCard: true,
          transactions: {
            include: { category: true },
            orderBy: { date: 'desc' },
          },
          extractedItems: {
            include: { category: true },
            orderBy: { resolvedDate: 'desc' },
          },
        },
      })

      if (!batch) {
        return NextResponse.json(
          { error: 'Extrato não encontrado.' },
          { status: 404 }
        )
      }

      return NextResponse.json({ batch })
    }

    const [batches, lastExpenseTx, recentTransactions] = await Promise.all([
      prisma.importBatch.findMany({
        include: {
          bankAccount: true,
          creditCard: true,
          transactions: {
            select: { competenceMonth: true, type: true, amountCents: true },
          },
          _count: {
            select: { extractedItems: true, transactions: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
      prisma.transaction.findFirst({
        where: { type: 'EXPENSE' },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          date: true,
          description: true,
          amountCents: true,
          competenceMonth: true,
        },
      }),
      prisma.transaction.findMany({
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 5,
        select: {
          id: true,
          date: true,
          description: true,
          amountCents: true,
          type: true,
          competenceMonth: true,
          category: {
            select: { name: true, color: true },
          },
        },
      }),
    ])

    const lastBatch = batches[0]
      ? {
          id: batches[0].id,
          sourceName: batches[0].sourceName,
          createdAt: batches[0].createdAt,
          providerUsed: batches[0].providerUsed,
          status: batches[0].status,
          transactionCount: batches[0]._count.transactions,
        }
      : null

    return NextResponse.json({
      batches,
      stats: {
        lastImportBatch: lastBatch,
        lastExpense: lastExpenseTx,
        lastTransaction: recentTransactions[0] ?? null,
        recentTransactions,
      },
    })
  } catch (error) {
    console.error('Erro ao listar histórico de importações:', error)
    return NextResponse.json(
      { error: 'Falha ao carregar histórico de importações.' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const deleteTransactions =
      searchParams.get('deleteTransactions') !== 'false'

    if (id) {
      await prisma.$transaction(async (tx) => {
        if (deleteTransactions) {
          // Exclui todas as transações que vieram deste extrato/lote
          await tx.transaction.deleteMany({
            where: { importBatchId: id },
          })
        }
        await tx.extractedItem.deleteMany({
          where: { importBatchId: id },
        })
        await tx.importBatch.delete({
          where: { id },
        })
      })
    } else {
      // Apagar apenas o log de lotes mantendo transações se for limpeza geral de log
      await prisma.extractedItem.deleteMany({})
      await prisma.importBatch.deleteMany({})
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro ao excluir extrato importado:', error)
    return NextResponse.json(
      { error: 'Não foi possível excluir o extrato.' },
      { status: 500 }
    )
  }
}
