export interface DefaultCategoryDef {
  name: string
  slug: string
  type: 'EXPENSE' | 'INCOME' | 'BOTH' | 'NEUTRAL'
  color: string
  icon: string
  monthlyBudgetCents?: number
}

export const DEFAULT_CATEGORIES: DefaultCategoryDef[] = [
  // Categorias da Planilha Pessoal (Coluna CONTAS)
  { name: 'IPTU', slug: 'iptu', type: 'EXPENSE', color: '#64748b', icon: 'Home', monthlyBudgetCents: 8600 },
  { name: 'CONDOMÍNIO', slug: 'condominio', type: 'EXPENSE', color: '#6366f1', icon: 'Building', monthlyBudgetCents: 75800 },
  { name: 'APTO CAIXA', slug: 'apto-caixa', type: 'EXPENSE', color: '#3b82f6', icon: 'Home', monthlyBudgetCents: 149000 },
  { name: 'VIVO CHIP', slug: 'vivo-chip', type: 'EXPENSE', color: '#8b5cf6', icon: 'Smartphone', monthlyBudgetCents: 6000 },
  { name: 'ENEL', slug: 'enel', type: 'EXPENSE', color: '#eab308', icon: 'Zap', monthlyBudgetCents: 24600 },
  { name: 'VIVO FIBRA', slug: 'vivo-fibra', type: 'EXPENSE', color: '#a855f7', icon: 'Wifi', monthlyBudgetCents: 15000 },
  { name: 'CARTÃO ITAÚ', slug: 'cartao-itau', type: 'EXPENSE', color: '#d946ef', icon: 'CreditCard', monthlyBudgetCents: 77300 },
  { name: 'CARTÃO NUBANK/VIVI E JOHN', slug: 'cartao-nubank-vivi-e-john', type: 'EXPENSE', color: '#c026d3', icon: 'CreditCard', monthlyBudgetCents: 47300 },
  { name: 'CARTÃO CELEBRE', slug: 'cartao-celebre', type: 'EXPENSE', color: '#e879f9', icon: 'CreditCard', monthlyBudgetCents: 136600 },
  { name: 'CARTÃO SANTANDER', slug: 'cartao-santander', type: 'EXPENSE', color: '#ec4899', icon: 'CreditCard', monthlyBudgetCents: 90100 },
  { name: 'CARTÃO PICPAY', slug: 'cartao-picpay', type: 'EXPENSE', color: '#f472b6', icon: 'CreditCard', monthlyBudgetCents: 23900 },
  { name: 'MERCADO', slug: 'mercado', type: 'EXPENSE', color: '#10b981', icon: 'ShoppingCart', monthlyBudgetCents: 60000 },
  { name: 'COMBUSTÍVEL/UBER', slug: 'combustivel-uber', type: 'EXPENSE', color: '#0ea5e9', icon: 'Fuel', monthlyBudgetCents: 40000 },
  { name: 'ESTACIONAMENTO', slug: 'estacionamento', type: 'EXPENSE', color: '#0284c7', icon: 'Car', monthlyBudgetCents: 10000 },
  { name: 'DIVIDA LEGADO/ROLES ALEATORIOS', slug: 'divida-legado-roles-aleatorios', type: 'EXPENSE', color: '#dc2626', icon: 'AlertCircle', monthlyBudgetCents: 140000 },
  { name: 'RÉMEDIO/FARMACIA', slug: 'remedio-farmacia', type: 'EXPENSE', color: '#f43f5e', icon: 'Pill', monthlyBudgetCents: 25000 },
  { name: 'RECEITA FEDERAL', slug: 'receita-federal', type: 'EXPENSE', color: '#b91c1c', icon: 'Landmark', monthlyBudgetCents: 20000 },
  { name: 'PRESENCIAL CONECTO', slug: 'presencial-conecto', type: 'EXPENSE', color: '#14b8a6', icon: 'Utensils', monthlyBudgetCents: 18200 },
  { name: 'MERCADO CONDOMINIO/ ADEGA', slug: 'mercado-condominio-adega', type: 'EXPENSE', color: '#059669', icon: 'ShoppingBag', monthlyBudgetCents: 25000 },
  { name: 'NETFLIX/STREMMING', slug: 'netflix-stremming', type: 'EXPENSE', color: '#e11d48', icon: 'Tv', monthlyBudgetCents: 10000 },
  { name: 'CABELEIREIRO/JOHN E VIVI', slug: 'cabeleireiro-john-e-vivi', type: 'EXPENSE', color: '#f59e0b', icon: 'Scissors', monthlyBudgetCents: 16000 },
  { name: 'IFOOD', slug: 'ifood', type: 'EXPENSE', color: '#ef4444', icon: 'UtensilsCrossed', monthlyBudgetCents: 30000 },
  { name: 'PASSAGEM', slug: 'passagem', type: 'EXPENSE', color: '#3b82f6', icon: 'Train', monthlyBudgetCents: 24000 },
  { name: 'SAIDAS VIVI/JOHN', slug: 'saidas-vivi-john', type: 'EXPENSE', color: '#ec4899', icon: 'Gamepad2', monthlyBudgetCents: 40000 },
  { name: 'OUTROS', slug: 'outros', type: 'EXPENSE', color: '#71717a', icon: 'MoreHorizontal', monthlyBudgetCents: 20000 },
  { name: 'ROUPAS VIVI A VISTA', slug: 'roupas-vivi-a-vista', type: 'EXPENSE', color: '#f97316', icon: 'ShoppingBag', monthlyBudgetCents: 30000 },
  { name: 'COMPRAS MARKETPLACE', slug: 'compras-marketplace', type: 'EXPENSE', color: '#8b5cf6', icon: 'ShoppingBag', monthlyBudgetCents: 40000 },

  // Categorias Gerais e de Receita/Transferência
  { name: 'Salário', slug: 'salario', type: 'INCOME', color: '#22c55e', icon: 'Wallet' },
  { name: 'Outras receitas', slug: 'outras-receitas', type: 'INCOME', color: '#16a34a', icon: 'TrendingUp' },
  { name: 'Transferências', slug: 'transferencias', type: 'NEUTRAL', color: '#94a3b8', icon: 'ArrowLeftRight' },
  { name: 'Cartão de crédito', slug: 'cartao-de-credito', type: 'NEUTRAL', color: '#64748b', icon: 'CreditCard' },
  { name: 'Alimentação', slug: 'alimentacao', type: 'EXPENSE', color: '#f97316', icon: 'Utensils', monthlyBudgetCents: 80000 },
  { name: 'Supermercado', slug: 'supermercado', type: 'EXPENSE', color: '#10b981', icon: 'ShoppingCart', monthlyBudgetCents: 100000 },
  { name: 'Transporte', slug: 'transporte', type: 'EXPENSE', color: '#3b82f6', icon: 'Car', monthlyBudgetCents: 40000 },
  { name: 'Combustível', slug: 'combustivel', type: 'EXPENSE', color: '#eab308', icon: 'Fuel', monthlyBudgetCents: 50000 },
  { name: 'Moradia', slug: 'moradia', type: 'EXPENSE', color: '#6366f1', icon: 'Home', monthlyBudgetCents: 150000 },
  { name: 'Contas da casa', slug: 'contas-da-casa', type: 'EXPENSE', color: '#06b6d4', icon: 'Zap', monthlyBudgetCents: 60000 },
  { name: 'Saúde', slug: 'saude', type: 'EXPENSE', color: '#ef4444', icon: 'HeartPulse', monthlyBudgetCents: 50000 },
  { name: 'Farmácia', slug: 'farmacia', type: 'EXPENSE', color: '#f43f5e', icon: 'Pill', monthlyBudgetCents: 25000 },
  { name: 'Educação', slug: 'educacao', type: 'EXPENSE', color: '#8b5cf6', icon: 'GraduationCap', monthlyBudgetCents: 50000 },
  { name: 'Lazer', slug: 'lazer', type: 'EXPENSE', color: '#ec4899', icon: 'Gamepad2', monthlyBudgetCents: 40000 },
  { name: 'Restaurantes', slug: 'restaurantes', type: 'EXPENSE', color: '#f59e0b', icon: 'UtensilsCrossed', monthlyBudgetCents: 50000 },
  { name: 'Compras', slug: 'compras', type: 'EXPENSE', color: '#a855f7', icon: 'ShoppingBag', monthlyBudgetCents: 60000 },
  { name: 'Assinaturas', slug: 'assinaturas', type: 'EXPENSE', color: '#14b8a6', icon: 'Repeat', monthlyBudgetCents: 20000 },
  { name: 'Outros gastos', slug: 'outros-gastos', type: 'EXPENSE', color: '#71717a', icon: 'MoreHorizontal', monthlyBudgetCents: 30000 },
]

export const DEFAULT_BANKS = [
  { name: 'Itaú Unibanco', institution: 'Itaú', type: 'CHECKING', color: '#ec7000', icon: 'Landmark' },
  { name: 'Nubank (Vivi e John)', institution: 'Nubank', type: 'CHECKING', color: '#820ad1', icon: 'Landmark' },
  { name: 'Caixa Econômica (Apto)', institution: 'Caixa', type: 'CHECKING', color: '#005ca9', icon: 'Landmark' },
  { name: 'Santander', institution: 'Santander', type: 'CHECKING', color: '#ec0000', icon: 'Landmark' },
  { name: 'PicPay', institution: 'PicPay', type: 'CHECKING', color: '#11c76f', icon: 'Landmark' },
  { name: 'Cartão Celebre', institution: 'Celebre', type: 'CHECKING', color: '#e879f9', icon: 'Landmark' },
]
