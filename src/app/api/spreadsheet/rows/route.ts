import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractMerchantPattern } from '@/lib/finance/category-rules'
import { z } from 'zod'

async function ensureCategoryByName(
  tx: Pick<typeof prisma, 'category'>,
  rawName: string,
  preferredColor?: string | null
): Promise<{ id: string; name: string }> {
  const cleanName = rawName.trim()
  const allCats = await tx.category.findMany({
    select: { id: true, name: true },
  })
  const existing = allCats.find(
    (c) => c.name.trim().toLowerCase() === cleanName.toLowerCase()
  )
  if (existing) return existing

  const slug = `${cleanName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-4)}`

  const created = await tx.category.create({
    data: {
      name: cleanName,
      slug,
      type: 'EXPENSE',
      color: preferredColor || '#6366f1',
      icon: 'Tag',
      isSystem: false,
    },
    select: { id: true, name: true },
  })
  return created
}

const createRowSchema = z.object({
  name: z.string().min(1, 'Informe o nome do gasto'),
  categoryId: z.string().optional().nullable(),
  highlightColor: z.string().optional().nullable(),
  newCategoryName: z.string().optional().nullable(),
  newCategoryColor: z.string().optional().nullable(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = createRowSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    let resolvedCategoryId =
      parsed.data.categoryId && parsed.data.categoryId !== 'NONE'
        ? parsed.data.categoryId
        : null

    if (parsed.data.newCategoryName && parsed.data.newCategoryName.trim()) {
      const cat = await ensureCategoryByName(
        prisma,
        parsed.data.newCategoryName.trim(),
        parsed.data.newCategoryColor || parsed.data.highlightColor
      )
      resolvedCategoryId = cat.id
    } else if (!resolvedCategoryId && parsed.data.name.trim()) {
      // Se não escolheu categoria existente, cria/vincula automaticamente uma Categoria com o nome do gasto
      const cat = await ensureCategoryByName(
        prisma,
        parsed.data.name.trim(),
        parsed.data.highlightColor
      )
      resolvedCategoryId = cat.id
    }

    const lastRow = await prisma.spreadsheetRow.findFirst({
      orderBy: { sortOrder: 'desc' },
    })

    const row = await prisma.spreadsheetRow.create({
      data: {
        name: parsed.data.name.trim(),
        categoryId: resolvedCategoryId,
        highlightColor: parsed.data.highlightColor || null,
        sortOrder: (lastRow?.sortOrder ?? -1) + 1,
      },
      include: { category: true },
    })

    return NextResponse.json({ row }, { status: 201 })
  } catch (error) {
    console.error('Erro ao criar linha da planilha:', error)
    return NextResponse.json(
      { error: 'Não foi possível criar a linha.' },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()

    // Reordenação universal: aceita tanto linhas já salvas quanto linhas automáticas (materializa SpreadsheetRow para fixar a posição!)
    if (Array.isArray(body.orderedRows)) {
      await prisma.$transaction(async (tx) => {
        for (let index = 0; index < body.orderedRows.length; index++) {
          const item = body.orderedRows[index] as {
            spreadsheetRowId: string | null
            name: string
            categoryId: string | null
            highlightColor?: string | null
            transactionIds?: string[]
          }

          if (item.spreadsheetRowId) {
            await tx.spreadsheetRow.update({
              where: { id: item.spreadsheetRowId },
              data: { sortOrder: index },
            })
          } else {
            const created = await tx.spreadsheetRow.create({
              data: {
                name: item.name.trim(),
                categoryId:
                  item.categoryId && item.categoryId !== 'NONE'
                    ? item.categoryId
                    : null,
                highlightColor: item.highlightColor || null,
                sortOrder: index,
              },
            })
            if (Array.isArray(item.transactionIds) && item.transactionIds.length > 0) {
              await tx.transaction.updateMany({
                where: { id: { in: item.transactionIds } },
                data: {
                  spreadsheetRowId: created.id,
                  expenseName: item.name.trim(),
                },
              })
            }
          }
        }
      })
      return NextResponse.json({ success: true })
    }

    const {
      id,
      name,
      categoryId,
      highlightColor,
      transactionIds,
      syncAsCategory = true,
    } = body
    let resolvedCategoryId: string | null | undefined =
      categoryId === 'NONE' ? null : categoryId
    const resolvedHighlight =
      highlightColor === '' || highlightColor === 'NONE'
        ? null
        : highlightColor

    const learnRulesForTransactions = async (
      tx: Pick<typeof prisma, 'transaction' | 'categoryRule'>,
      txIds: string[] | undefined,
      catId: string | null | undefined
    ) => {
      if (!catId || !Array.isArray(txIds) || txIds.length === 0) return
      const txs = await tx.transaction.findMany({
        where: { id: { in: txIds } },
        select: { description: true, type: true },
      })
      for (const item of txs) {
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
              categoryId: catId,
              rawExample: item.description.trim(),
            },
            create: {
              pattern,
              rawExample: item.description.trim(),
              transactionType: item.type,
              categoryId: catId,
            },
          })
        }
      }
    }

    // Edição de linha automática (cria SpreadsheetRow para guardar cor de destaque e posição!)
    if (!id) {
      const created = await prisma.$transaction(async (tx) => {
        if (syncAsCategory && name && name.trim()) {
          const syncedCat = await ensureCategoryByName(
            tx,
            name.trim(),
            resolvedHighlight
          )
          resolvedCategoryId = syncedCat.id
        }

        const lastRow = await tx.spreadsheetRow.findFirst({
          orderBy: { sortOrder: 'desc' },
        })
        const row = await tx.spreadsheetRow.create({
          data: {
            name: (name || 'Gasto').trim(),
            categoryId: resolvedCategoryId ?? null,
            highlightColor: resolvedHighlight ?? null,
            sortOrder: (lastRow?.sortOrder ?? -1) + 1,
          },
          include: { category: true },
        })

        if (Array.isArray(transactionIds) && transactionIds.length > 0) {
          await tx.transaction.updateMany({
            where: { id: { in: transactionIds } },
            data: {
              spreadsheetRowId: row.id,
              ...(name ? { expenseName: name.trim() } : {}),
              ...(resolvedCategoryId !== undefined
                ? { categoryId: resolvedCategoryId }
                : {}),
            },
          })
          await learnRulesForTransactions(tx, transactionIds, resolvedCategoryId)
        }
        return row
      })

      return NextResponse.json({ row: created })
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (syncAsCategory && name && name.trim()) {
        const syncedCat = await ensureCategoryByName(
          tx,
          name.trim(),
          resolvedHighlight
        )
        resolvedCategoryId = syncedCat.id
      }

      const row = await tx.spreadsheetRow.update({
        where: { id },
        data: {
          ...(name ? { name: name.trim() } : {}),
          ...(resolvedCategoryId !== undefined
            ? { categoryId: resolvedCategoryId }
            : {}),
          ...(highlightColor !== undefined
            ? { highlightColor: resolvedHighlight }
            : {}),
        },
        include: { category: true },
      })

      if (Array.isArray(transactionIds) && transactionIds.length > 0) {
        await tx.transaction.updateMany({
          where: { id: { in: transactionIds } },
          data: {
            ...(name ? { expenseName: name.trim() } : {}),
            ...(resolvedCategoryId !== undefined
              ? { categoryId: resolvedCategoryId }
              : {}),
          },
        })
        await learnRulesForTransactions(tx, transactionIds, resolvedCategoryId)
      }

      return row
    })

    return NextResponse.json({ row: updated })
  } catch (error) {
    console.error('Erro ao atualizar linha:', error)
    return NextResponse.json(
      { error: 'Não foi possível atualizar a linha.' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const deleteMonthTransactions = searchParams.get('deleteMonthTransactions')
    const month = searchParams.get('month')

    if (!id) {
      return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })
    }

    await prisma.$transaction(async (tx) => {
      if (deleteMonthTransactions === 'true' && month) {
        await tx.transaction.deleteMany({
          where: {
            spreadsheetRowId: id,
            competenceMonth: month,
          },
        })
      }
      await tx.spreadsheetRow.delete({ where: { id } })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro ao excluir linha da planilha:', error)
    return NextResponse.json(
      { error: 'Não foi possível excluir a linha.' },
      { status: 500 }
    )
  }
}
