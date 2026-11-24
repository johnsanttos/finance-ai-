# FINANCE AI — Sistema Inteligente de Controle Financeiro Pessoal

Sistema web full-stack moderno, responsivo e 100% em português brasileiro para gerenciamento de finanças pessoais com **importação inteligente de screenshots (prints) bancários via IA Multimodal**, inspirado no design system do `shadcn-admin`.

---

## 1. Stack Tecnológica

- **Framework:** Next.js 15 (App Router) + React 19 + TypeScript
- **Estilização & UI:** Tailwind CSS v4 (`oklch` design tokens, Light/Dark mode) + `shadcn/ui` + Lucide Icons
- **Gráficos:** Recharts (Rosca, Barras, Linhas, Receitas x Despesas, Rankings)
- **Banco de Dados & ORM:** Prisma ORM + SQLite local (`dev.db`), com estrutura pronta para PostgreSQL
- **IA Multimodal:** Google Gemini (`@google/genai`, modelo padrão `gemini-2.5-flash` com Structured Outputs) e suporte alternativo a OpenAI (`gpt-4o-mini` / `gpt-4o`)
- **Validação & Exportação:** Zod + SheetJS (`xlsx`) para exportação CSV/Excel + Backup/Restauração JSON
- **Testes Automatizados:** Vitest

---

## 2. Como Executar Localmente

### Passo 1: Acessar a pasta do projeto

```bash
cd finance-ai
```

### Passo 2: Configurar as variáveis de ambiente (`.env`)

Copie o arquivo `.env.example` para `.env` (já criado por padrão) e insira sua chave da API de IA:

```env
DATABASE_URL="file:./dev.db"

# Chave do Google Gemini (Obtenha gratuitamente em https://aistudio.google.com/apikey)
GEMINI_API_KEY="sua_chave_gemini_aqui"
GEMINI_MODEL="gemini-2.5-flash"

# Opcional: caso prefira utilizar OpenAI
OPENAI_API_KEY=""
OPENAI_MODEL="gpt-4o-mini"
```

### Passo 3: Instalar dependências e preparar o banco SQLite

```bash
npm install
npm run db:push
npm run db:seed
```

*(O comando `db:seed` cria automaticamente as **18 categorias financeiras padrão**, além das contas iniciais do Nubank, Itaú, Bradesco, Santander, Banco do Brasil e Inter).*

### Passo 4: Iniciar o servidor de desenvolvimento

```bash
npm run dev
```

Acesse **`http://localhost:3000`** no navegador.

---

## 3. Funcionalidades Implementadas

1. **Dashboard Principal (`/`)**:
   - 8 Indicadores (Despesas líquidas no mês, Receitas, Saldo do período, Variação % vs. mês anterior, Categoria com maior gasto, Total no cartão de crédito, Média mensal histórica e Quantidade de transações).
   - Seletor global de **Mês/Ano** + filtro por **Intervalo de Datas**.
   - Alertas automáticos de **Orçamento/Meta ultrapassada** e **Transações sem categoria**.
   - 5 visualizações Recharts baseadas exclusivamente nos dados reais do banco.
2. **Importação de Prints com IA (`/importar`)**:
   - Upload drag-and-drop de múltiplas imagens (`PNG`, `JPG`, `JPEG`, `WEBP`) de qualquer banco, PIX ou fatura de cartão.
   - Processamento 100% server-side (chaves protegidas e imagens descartadas da memória após leitura).
   - Reconhecimento de valores em Real (`R$ 1.250,90`), filtro automático de linhas de "Saldo do dia", detecção de **transações duplicadas** e **sobreposição entre screenshots**.
   - Tabela de pré-visualização e revisão editável antes de confirmar a gravação no banco.
3. **Tabela Completa de Transações (`/transacoes`)**:
   - CRUD completo (Adicionar, Editar, Excluir com confirmação e Exclusão em lote).
   - Suporte a compras parceladas (geração automática nas competências futuras).
   - Busca por descrição/estabelecimento, filtros combinados, ordenação por data/valor, paginação e **Exportação CSV e Excel (`.xlsx`)**.
4. **Categorias & Metas (`/categorias`)**:
   - 18 categorias padrão + criação/edição/exclusão de categorias personalizadas e definição de teto de gastos mensal com barra de progresso.
5. **Contas & Cartões (`/contas`)** e **Despesas Recorrentes (`/recorrencias`)**:
   - Gestão de bancos, cartões de crédito e geração de despesas fixas no mês com 1 clique.
6. **Segurança & Backup (`/configuracoes`)**:
   - Exportação de Backup completo (`.json`), Restauração de dados e limpeza de histórico de importações.

---

## 4. Comandos de Qualidade e Testes

```bash
# Executar testes automatizados das regras financeiras e pipeline de IA
npm test

# Verificar tipagem TypeScript
npm run lint

# Gerar build de produção
npm run build
```
