import type { Metadata } from 'next'
import '@/styles/index.css'
import { AppShell } from '@/components/layout/app-shell'

export const metadata: Metadata = {
  title: 'FINANCE AI — Controle Financeiro Inteligente',
  description:
    'Sistema inteligente de controle financeiro pessoal com importação de prints bancários por IA multimodal.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang='pt-BR' className='dark' suppressHydrationWarning>
      <body className='antialiased'>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
