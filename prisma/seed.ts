import { PrismaClient } from '@prisma/client'
import { DEFAULT_BANKS, DEFAULT_CATEGORIES } from '../src/lib/constants/categories'

const prisma = new PrismaClient()

async function main() {
  console.log('Iniciando seed do banco de dados FINANCE AI...')

  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {
        color: cat.color,
        icon: cat.icon,
        type: cat.type,
      },
      create: {
        name: cat.name,
        slug: cat.slug,
        type: cat.type,
        color: cat.color,
        icon: cat.icon,
        isSystem: true,
        monthlyBudgetCents: cat.monthlyBudgetCents ?? null,
      },
    })
  }

  const existingBanks = await prisma.bankAccount.count()
  if (existingBanks === 0) {
    for (const bank of DEFAULT_BANKS) {
      const account = await prisma.bankAccount.create({
        data: {
          name: bank.name,
          institution: bank.institution,
          type: bank.type,
          color: bank.color,
          icon: bank.icon,
        },
      })

      if (bank.institution === 'Nubank' || bank.institution === 'Itaú' || bank.institution === 'Inter') {
        await prisma.creditCard.create({
          data: {
            name: `Cartão ${bank.institution}`,
            institution: bank.institution,
            limitCents: 1200000,
            closingDay: 5,
            dueDay: 12,
            color: bank.color,
            bankAccountId: account.id,
          },
        })
      }
    }
  }

  console.log('Seed concluído com sucesso! 18 categorias padrão e contas configuradas.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
