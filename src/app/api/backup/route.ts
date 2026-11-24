import { NextRequest, NextResponse } from 'next/server'
import { ensureSeeded, prisma } from '@/lib/prisma'

export async function GET() {
  try {
    await ensureSeeded()
    const [
      bankAccounts,
      creditCards,
      categories,
      transactions,
      recurringExpenses,
    ] = await Promise.all([
      prisma.bankAccount.findMany(),
      prisma.creditCard.findMany(),
      prisma.category.findMany(),
      prisma.transaction.findMany(),
      prisma.recurringExpense.findMany(),
    ])

    const hasGeminiKey = Boolean(
      process.env.GEMINI_API_KEY &&
        process.env.GEMINI_API_KEY !== 'sua_chave_gemini_aqui'
    )
    const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY)

    return NextResponse.json({
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      aiStatus: {
        geminiConfigured: hasGeminiKey,
        openAiConfigured: hasOpenAiKey,
        activeProvider: hasGeminiKey ? 'Google Gemini' : hasOpenAiKey ? 'OpenAI' : 'Não configurado',
        model: hasGeminiKey
          ? process.env.GEMINI_MODEL || 'gemini-2.5-flash'
          : process.env.OPENAI_MODEL || 'gpt-4o-mini',
      },
      data: {
        bankAccounts,
        creditCards,
        categories,
        transactions,
        recurringExpenses,
      },
    })
  } catch (error) {
    console.error('Erro ao gerar backup:', error)
    return NextResponse.json(
      { error: 'Não foi possível gerar o backup.' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = body?.data
    if (!data || !Array.isArray(data.transactions)) {
      return NextResponse.json(
        { error: 'Arquivo de backup inválido.' },
        { status: 400 }
      )
    }

    await prisma.$transaction(async (tx) => {
      if (Array.isArray(data.categories)) {
        for (const cat of data.categories) {
          await tx.category.upsert({
            where: { slug: cat.slug },
            update: {
              name: cat.name,
              color: cat.color,
              type: cat.type,
              monthlyBudgetCents: cat.monthlyBudgetCents ?? null,
            },
            create: {
              id: cat.id,
              name: cat.name,
              slug: cat.slug,
              type: cat.type || 'EXPENSE',
              color: cat.color || '#3b82f6',
              icon: cat.icon || 'Tag',
              isSystem: Boolean(cat.isSystem),
              monthlyBudgetCents: cat.monthlyBudgetCents ?? null,
            },
          })
        }
      }

      if (Array.isArray(data.bankAccounts)) {
        for (const acc of data.bankAccounts) {
          await tx.bankAccount.upsert({
            where: { id: acc.id },
            update: { name: acc.name, institution: acc.institution },
            create: {
              id: acc.id,
              name: acc.name,
              institution: acc.institution,
              type: acc.type || 'CHECKING',
              initialBalanceCents: acc.initialBalanceCents || 0,
              color: acc.color || '#6366f1',
            },
          })
        }
      }

      if (Array.isArray(data.creditCards)) {
        for (const card of data.creditCards) {
          await tx.creditCard.upsert({
            where: { id: card.id },
            update: { name: card.name },
            create: {
              id: card.id,
              name: card.name,
              institution: card.institution,
              limitCents: card.limitCents || 0,
              closingDay: card.closingDay || 5,
              dueDay: card.dueDay || 12,
              color: card.color || '#8b5cf6',
              bankAccountId: card.bankAccountId || null,
            },
          })
        }
      }

      for (const t of data.transactions) {
        await tx.transaction.upsert({
          where: { id: t.id },
          update: {
            description: t.description,
            amountCents: t.amountCents,
            type: t.type,
            date: new Date(t.date),
            competenceMonth: t.competenceMonth,
            categoryId: t.categoryId || null,
            bankAccountId: t.bankAccountId || null,
            creditCardId: t.creditCardId || null,
          },
          create: {
            id: t.id,
            description: t.description,
            merchant: t.merchant || null,
            amountCents: t.amountCents,
            type: t.type,
            date: new Date(t.date),
            competenceMonth: t.competenceMonth,
            categoryId: t.categoryId || null,
            bankAccountId: t.bankAccountId || null,
            creditCardId: t.creditCardId || null,
            origin: t.origin || 'MANUAL',
            fingerprint: t.fingerprint || `${t.competenceMonth}|${t.amountCents}|${t.description}`,
          },
        })
      }
    })

    return NextResponse.json({
      restoredTransactions: data.transactions.length,
    })
  } catch (error) {
    console.error('Erro ao restaurar backup:', error)
    return NextResponse.json(
      { error: 'Falha ao restaurar os dados do backup.' },
      { status: 500 }
    )
  }
}
