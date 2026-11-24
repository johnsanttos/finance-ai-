import { z } from 'zod'

export const transactionTypeSchema = z.enum([
  'EXPENSE',
  'INCOME',
  'TRANSFER',
  'INVOICE_PAYMENT',
  'REFUND',
])

export const createTransactionSchema = z.object({
  description: z.string().min(1, 'A descrição é obrigatória'),
  merchant: z.string().optional().nullable(),
  amountCents: z.number().int().positive('O valor deve ser maior que zero'),
  type: transactionTypeSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Data inválida (use YYYY-MM-DD)'),
  categoryId: z.string().optional().nullable(),
  bankAccountId: z.string().optional().nullable(),
  creditCardId: z.string().optional().nullable(),
  totalInstallments: z.number().int().min(1).max(72).optional().default(1),
  notes: z.string().optional().nullable(),
})

export const updateTransactionSchema = createTransactionSchema.partial()

export const categorySchema = z.object({
  name: z.string().min(2, 'Informe o nome da categoria'),
  type: z.enum(['EXPENSE', 'INCOME', 'BOTH', 'NEUTRAL']).default('EXPENSE'),
  color: z.string().default('#3b82f6'),
  icon: z.string().default('Tag'),
  monthlyBudgetCents: z.number().int().nonnegative().optional().nullable(),
})

export const bankAccountSchema = z.object({
  name: z.string().min(2, 'Informe o nome da conta'),
  institution: z.string().min(2, 'Informe a instituição bancária'),
  type: z.enum(['CHECKING', 'SAVINGS', 'WALLET', 'INVESTMENT']).default('CHECKING'),
  initialBalanceCents: z.number().int().default(0),
  color: z.string().default('#6366f1'),
})

export const creditCardSchema = z.object({
  name: z.string().min(2, 'Informe o nome do cartão'),
  institution: z.string().min(2, 'Informe o emissor'),
  lastFourDigits: z.string().max(4).optional().nullable(),
  limitCents: z.number().int().nonnegative().default(0),
  closingDay: z.number().int().min(1).max(31).default(5),
  dueDay: z.number().int().min(1).max(31).default(12),
  color: z.string().default('#8b5cf6'),
  bankAccountId: z.string().optional().nullable(),
})

export const recurringExpenseSchema = z.object({
  description: z.string().min(2, 'Informe a descrição'),
  amountCents: z.number().int().positive('Informe um valor válido'),
  type: z.enum(['EXPENSE', 'INCOME']).default('EXPENSE'),
  dayOfMonth: z.number().int().min(1).max(31).default(5),
  categoryId: z.string().optional().nullable(),
  bankAccountId: z.string().optional().nullable(),
  creditCardId: z.string().optional().nullable(),
  active: z.boolean().default(true),
})
