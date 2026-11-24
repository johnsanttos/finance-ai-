'use client'

import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  Database,
  Download,
  KeyRound,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { usePeriod } from '@/context/period-provider'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface AiStatusInfo {
  geminiConfigured: boolean
  openAiConfigured: boolean
  activeProvider: string
  model: string
}

export default function ConfiguracoesPage() {
  const { triggerRefresh } = usePeriod()
  const [aiStatus, setAiStatus] = useState<AiStatusInfo | null>(null)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    fetch('/api/backup')
      .then((res) => res.json())
      .then((json) => {
        if (json.aiStatus) setAiStatus(json.aiStatus)
      })
      .catch(() => null)
  }, [])

  const handleDownloadBackup = async () => {
    try {
      const res = await fetch('/api/backup')
      if (!res.ok) throw new Error()
      const json = await res.json()
      const blob = new Blob([JSON.stringify(json, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `finance-ai-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Backup completo exportado em JSON!')
    } catch {
      toast.error('Erro ao exportar backup.')
    }
  }

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setRestoring(true)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Backup inválido')

      toast.success(
        `Backup restaurado com sucesso (${json.restoredTransactions} transações sincronizadas)!`
      )
      triggerRefresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Erro ao restaurar backup.'
      )
    } finally {
      setRestoring(false)
      e.target.value = ''
    }
  }

  const handleClearImportHistory = async () => {
    const res = await fetch('/api/imports', { method: 'DELETE' })
    if (res.ok) {
      toast.success(
        'Histórico de lotes de importação apagado (suas transações confirmadas foram preservadas).'
      )
    }
  }

  return (
    <>
      <Header fixed hidePeriodSelector>
        <h1 className='text-sm font-semibold sm:text-base'>
          Configurações, Segurança & Backup
        </h1>
      </Header>

      <Main className='space-y-6'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>
            Configurações do Sistema
          </h2>
          <p className='text-sm text-muted-foreground'>
            Gerencie seus backups, privacidade das importações e verifique o
            status da integração com a IA multimodal.
          </p>
        </div>

        <div className='grid gap-6 lg:grid-cols-2'>
          {/* Status da IA Multimodal */}
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-base'>
                <KeyRound className='h-4 w-4 text-primary' />
                Motor de Inteligência Artificial Multimodal
              </CardTitle>
              <CardDescription>
                Chaves processadas exclusivamente no servidor (Next.js Route
                Handlers), nunca expostas no navegador.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3 text-sm'>
              <div className='flex items-center justify-between rounded-lg border p-3'>
                <span>Provedor Ativo</span>
                <Badge
                  variant={
                    aiStatus?.geminiConfigured || aiStatus?.openAiConfigured
                      ? 'default'
                      : 'destructive'
                  }
                >
                  {aiStatus?.activeProvider || 'Verificando...'}
                </Badge>
              </div>

              <div className='flex items-center justify-between rounded-lg border p-3'>
                <span>Modelo Configurado</span>
                <span className='font-mono text-xs'>
                  {aiStatus?.model || 'gemini-2.5-flash'}
                </span>
              </div>

              <p className='text-xs leading-relaxed text-muted-foreground'>
                Para configurar ou trocar sua chave, edite a variável{' '}
                <code>GEMINI_API_KEY</code> (ou <code>OPENAI_API_KEY</code>) no
                arquivo <code>.env</code> na raiz do projeto{' '}
                <code>finance-ai</code>.
              </p>
            </CardContent>
          </Card>

          {/* Backup e Restauração */}
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-base'>
                <Database className='h-4 w-4 text-emerald-500' />
                Backup e Restauração de Dados
              </CardTitle>
              <CardDescription>
                Exporte todas as suas contas, cartões, categorias, metas e
                transações ou restaure a partir de um arquivo JSON.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='flex flex-wrap gap-3'>
                <Button onClick={handleDownloadBackup} className='gap-2'>
                  <Download className='h-4 w-4' />
                  Baixar Backup Completo (.JSON)
                </Button>

                <label className='inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium shadow-xs hover:bg-accent'>
                  <Upload className='h-4 w-4' />
                  {restoring ? 'Restaurando...' : 'Restaurar Backup (.JSON)'}
                  <input
                    type='file'
                    accept='application/json'
                    className='hidden'
                    onChange={handleRestoreFile}
                    disabled={restoring}
                  />
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Privacidade e Limpeza */}
          <Card className='lg:col-span-2'>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-base'>
                <ShieldCheck className='h-4 w-4 text-sky-500' />
                Segurança & Privacidade Financeira
              </CardTitle>
              <CardDescription>
                Garantias de privacidade implementadas na arquitetura do
                FINANCE AI.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4 text-xs text-muted-foreground'>
              <div className='grid gap-3 sm:grid-cols-3'>
                <div className='flex items-start gap-2 rounded-lg border p-3'>
                  <CheckCircle2 className='mt-0.5 h-4 w-4 shrink-0 text-emerald-500' />
                  <div>
                    <p className='font-semibold text-foreground'>
                      Imagens Não Armazenadas
                    </p>
                    <p className='mt-0.5'>
                      Os screenshots bancários são lidos em memória RAM apenas
                      durante a extração e descartados imediatamente.
                    </p>
                  </div>
                </div>

                <div className='flex items-start gap-2 rounded-lg border p-3'>
                  <CheckCircle2 className='mt-0.5 h-4 w-4 shrink-0 text-emerald-500' />
                  <div>
                    <p className='font-semibold text-foreground'>
                      Banco de Dados Local Persistente
                    </p>
                    <p className='mt-0.5'>
                      Seus dados ficam gravados localmente em SQLite via Prisma
                      ORM (compatível com PostgreSQL).
                    </p>
                  </div>
                </div>

                <div className='flex items-start gap-2 rounded-lg border p-3'>
                  <CheckCircle2 className='mt-0.5 h-4 w-4 shrink-0 text-emerald-500' />
                  <div>
                    <p className='font-semibold text-foreground'>
                      Precisão Contábil em Centavos
                    </p>
                    <p className='mt-0.5'>
                      Cálculos em inteiros sem erros de ponto flutuante e sem
                      duplicação de transferências ou pagamento de faturas.
                    </p>
                  </div>
                </div>
              </div>

              <div className='flex items-center justify-between border-t pt-4'>
                <span>
                  Deseja remover os logs de lotes e itens temporários de
                  extração mantendo todas as transações confirmadas?
                </span>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={handleClearImportHistory}
                  className='gap-1.5 text-xs'
                >
                  <Trash2 className='h-3.5 w-3.5' />
                  Apagar Histórico de Importações
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Main>
    </>
  )
}
