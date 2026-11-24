import { PrismaClient } from '@prisma/client'
import { DEFAULT_BANKS, DEFAULT_CATEGORIES } from '@/lib/constants/categories'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  seededVersion?: number
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

const CURRENT_SEED_VERSION = 2

export async function ensureSeeded() {
  if (globalForPrisma.seededVersion === CURRENT_SEED_VERSION) return
  try {
    // Garante que todas as categorias da planilha do usuário existam no banco
    for (const cat of DEFAULT_CATEGORIES) {
      await prisma.category.upsert({
        where: { slug: cat.slug },
        update: {},
        create: {
          name: cat.name,
          slug: cat.slug,
          type: cat.type,
          color: cat.color,
          icon: cat.icon,
          isSystem: false,
          monthlyBudgetCents: cat.monthlyBudgetCents ?? null,
        },
      })
    }

    const bankCount = await prisma.bankAccount.count()
    if (bankCount === 0) {
      for (const bank of DEFAULT_BANKS) {
        const createdBank = await prisma.bankAccount.create({
          data: {
            name: bank.name,
            institution: bank.institution,
            type: bank.type,
            color: bank.color,
            icon: bank.icon,
          },
        })

        if (
          ['Nubank', 'Itaú', 'Santander', 'PicPay', 'Celebre'].includes(
            bank.institution
          )
        ) {
          await prisma.creditCard.create({
            data: {
              name: `CARTÃO ${bank.institution.toUpperCase()}`,
              institution: bank.institution,
              limitCents: 1000000,
              closingDay: 5,
              dueDay: 12,
              color: bank.color,
              bankAccountId: createdBank.id,
            },
          })
        }
      }
    }
    globalForPrisma.seededVersion = CURRENT_SEED_VERSION
  } catch {
    // Database might not be pushed yet during build
  }
}
