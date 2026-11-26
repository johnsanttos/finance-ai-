'use client'

import { useState } from 'react'
import {
  Check,
  FileImage,
  FileSpreadsheet,
  Loader2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatCentsToBrl } from '@/lib/finance/money'
import { PT_BR_MONTH_NAMES } from '@/lib/constants/months'
import { ParsedSpreadsheetBlock } from '@/lib/finance/spreadsheet-import-parser'

const IMPORT_YEARS = ['2022', '2023', '2024', '2025', '2026', '2027', '2028']
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface EditableBlock extends ParsedSpreadsheetBlock {
  selected: boolean
  month: string
  replaceSpreadsheetInMonth: boolean
}

export function ImportSpreadsheetModal({
  open,
  onOpenChange,
  defaultMonth,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultMonth: string
  onImported: (monthsSaved: string[]) => void
}) {
  const [tab, setTab] = useState<'file' | 'csv' | 'image'>('file')
  const [targetMonth, setTargetMonth] = useState(defaultMonth)
  const [file, setFile] = useState<File | null>(null)
  const [csvText, setCsvText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [provider, setProvider] = useState('')
  const [blocks, setBlocks] = useState<EditableBlock[]>([])

  const resetAll = () => {
    setFile(null)
    setCsvText('')
    setBlocks([])
    setProvider('')
  }

  const handleParse = async () => {
    if ((tab === 'file' || tab === 'image') && !file) {
      toast.error(
        tab === 'image'
          ? 'Selecione o print/foto da planilha.'
          : 'Selecione o arquivo Excel (.xlsx) ou CSV (.csv).'
      )
      return
    }
    if (tab === 'csv' && !csvText.trim()) {
      toast.error('Cole o texto CSV/Excel da planilha abaixo.')
      return
    }

    setParsing(true)
    try {
      const formData = new FormData()
      formData.append('defaultMonth', targetMonth || defaultMonth)
      if (tab === 'csv') {
        formData.append('csvText', csvText)
      } else if (file) {
        formData.append('file', file)
      }

      const res = await fetch('/api/spreadsheet/import/parse', {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro ao ler planilha.')

      const parsedBlocks: ParsedSpreadsheetBlock[] = json.blocks || []
      if (parsedBlocks.length === 0) {
        toast.warning(
          'Nenhuma linha com valores foi reconhecida. Verifique se o arquivo ou print está legível.'
        )
        return
      }

      setProvider(json.provider || '')
      setBlocks(
        parsedBlocks.map((b) => ({
          ...b,
          selected: true,
          month: b.detectedMonth || targetMonth || defaultMonth,
          replaceSpreadsheetInMonth: false,
        }))
      )
      toast.success(
        `${parsedBlocks.length} mês(es)/bloco(s) identificado(s)! Confira o mês de cada bloco abaixo e clique em Salvar Histórico.`
      )
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Falha ao analisar planilha.'
      )
    } finally {
      setParsing(false)
    }
  }

  const handleCommit = async () => {
    const selected = blocks.filter((b) => b.selected)
    if (selected.length === 0) {
      toast.error('Marque ao menos um mês para importar.')
      return
    }

    setCommitting(true)
    try {
      const res = await fetch('/api/spreadsheet/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blocks: selected.map((b) => ({
            month: b.month,
            replaceSpreadsheetInMonth: b.replaceSpreadsheetInMonth,
            expenses: b.expenses,
            incomes: b.incomes,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Falha ao salvar histórico.')

      toast.success(
        `Histórico salvo! ${json.createdCount} lançamento(s) importado(s) em ${json.monthsSaved.length} mês(es)${
          json.skippedDuplicates > 0
            ? ` (${json.skippedDuplicates} duplicata(s) ignorada(s))`
            : ''
        }.`
      )
      onImported(json.monthsSaved || [])
      resetAll()
      onOpenChange(false)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Erro ao gravar histórico.'
      )
    } finally {
      setCommitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetAll()
        onOpenChange(next)
      }}
    >
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-[760px]'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <FileSpreadsheet className='h-5 w-5 text-primary' />
            Importar Histórico de Planilhas (Excel, CSV ou Print)
          </DialogTitle>
          <DialogDescription>
            Traga suas planilhas de meses passados (Agosto, Setembro, Outubro,
            ou o arquivo inteiro com vários meses) para preencher a Planilha
            Financeira, Transações e o Gráfico de 12 Meses.
          </DialogDescription>
        </DialogHeader>

        {blocks.length === 0 ? (
          <div className='space-y-4'>
            <div className='space-y-1.5'>
              <Label className='text-xs'>
                Mês/Ano padrão (para prints ou planilhas sem data no nome da aba)
              </Label>
              <Input
                type='month'
                value={targetMonth}
                onChange={(e) => setTargetMonth(e.target.value)}
                className='h-9 w-48 text-xs'
              />
            </div>

            <Tabs
              value={tab}
              onValueChange={(v) => {
                setTab(v as 'file' | 'csv' | 'image')
                setFile(null)
              }}
            >
              <TabsList className='grid w-full grid-cols-3'>
                <TabsTrigger value='file' className='gap-1.5 text-xs'>
                  <FileSpreadsheet className='h-3.5 w-3.5' />
                  Excel / CSV (.xlsx, .csv)
                </TabsTrigger>
                <TabsTrigger value='csv' className='gap-1.5 text-xs'>
                  <Upload className='h-3.5 w-3.5' />
                  Colar CSV / Texto
                </TabsTrigger>
                <TabsTrigger value='image' className='gap-1.5 text-xs'>
                  <FileImage className='h-3.5 w-3.5' />
                  Print / Foto
                </TabsTrigger>
              </TabsList>

              <TabsContent value='file' className='space-y-3 pt-2'>
                <div className='rounded-lg border-2 border-dashed p-6 text-center'>
                  <p className='text-xs font-medium'>
                    Envie seu arquivo Excel (<strong>.xlsx</strong>,{' '}
                    <strong>.xls</strong>) com uma ou várias abas, ou{' '}
                    <strong>.csv</strong>
                  </p>
                  <p className='mt-1 text-[11px] text-muted-foreground'>
                    100% preciso: lê automaticamente todas as contas, Semanas 1
                    a 4, coluna PAGO (x) e Entrada de Receitas.
                  </p>
                  <Input
                    type='file'
                    accept='.xlsx,.xls,.csv,.txt'
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className='mx-auto mt-3 max-w-xs cursor-pointer text-xs'
                  />
                </div>
              </TabsContent>

              <TabsContent value='csv' className='space-y-2 pt-2'>
                <Label className='text-xs'>
                  Cole o conteúdo da planilha (pode colar 1 mês ou vários meses
                  seguidos!)
                </Label>
                <Textarea
                  rows={8}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder=',CONTAS,SEMANA 1,SEMANA 2,SEMANA 3,SEMANA 4,PAGO,TOTAL,...'
                  className='font-mono text-[11px]'
                />
              </TabsContent>

              <TabsContent value='image' className='space-y-3 pt-2'>
                <div className='rounded-lg border-2 border-dashed p-6 text-center'>
                  <p className='text-xs font-medium'>
                    Envie um print/foto (<strong>PNG, JPG, WEBP</strong>) da
                    planilha do mês escolhido acima
                  </p>
                  <p className='mt-1 text-[11px] text-muted-foreground'>
                    O leitor extrai as contas e valores do print para você
                    conferir antes de salvar no mês selecionado.
                  </p>
                  <Input
                    type='file'
                    accept='image/png,image/jpeg,image/jpg,image/webp'
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className='mx-auto mt-3 max-w-xs cursor-pointer text-xs'
                  />
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button
                variant='outline'
                onClick={() => onOpenChange(false)}
                disabled={parsing}
              >
                Cancelar
              </Button>
              <Button onClick={handleParse} disabled={parsing} className='gap-1.5'>
                {parsing ? (
                  <>
                    <Loader2 className='h-4 w-4 animate-spin' />
                    Lendo planilha...
                  </>
                ) : (
                  <>
                    <Upload className='h-4 w-4' />
                    Analisar e Visualizar Prévia
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className='space-y-4'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div className='flex flex-wrap items-center gap-2'>
                <Badge variant='secondary' className='text-xs'>
                  {blocks.length} bloco(s) encontrado(s)
                </Badge>
                {provider && (
                  <Badge variant='outline' className='text-xs'>
                    {provider}
                  </Badge>
                )}
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='h-7 text-[11px]'
                  onClick={() => {
                    const allChecked = blocks.every((b) => b.selected)
                    setBlocks((prev) =>
                      prev.map((b) => ({ ...b, selected: !allChecked }))
                    )
                  }}
                >
                  {blocks.every((b) => b.selected)
                    ? 'Desmarcar todos'
                    : 'Marcar todos'}
                </Button>
              </div>
              <Button
                variant='ghost'
                size='sm'
                className='h-7 text-xs'
                onClick={resetAll}
              >
                Escolher outro arquivo
              </Button>
            </div>

            <div className='max-h-[420px] space-y-2.5 overflow-y-auto pr-1'>
              {blocks.map((block, idx) => (
                <div
                  key={block.blockId}
                  className={`rounded-lg border p-3 text-xs transition-colors ${
                    block.selected ? 'bg-card' : 'bg-muted/30 opacity-60'
                  }`}
                >
                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    <div className='flex items-center gap-2'>
                      <Checkbox
                        checked={block.selected}
                        onCheckedChange={(checked) =>
                          setBlocks((prev) =>
                            prev.map((b, i) =>
                              i === idx
                                ? { ...b, selected: Boolean(checked) }
                                : b
                            )
                          )
                        }
                      />
                      <div>
                        <span className='font-bold'>{block.label}</span>
                        {block.hintText && (
                          <span className='ml-2 text-[10px] text-muted-foreground'>
                            ({block.hintText})
                          </span>
                        )}
                      </div>
                    </div>

                    <div className='flex flex-wrap items-center gap-1.5'>
                      <Label className='text-[11px] text-muted-foreground'>
                        Salvar no mês:
                      </Label>
                      <select
                        value={block.month.slice(5, 7)}
                        onChange={(e) => {
                          const nextMonth = `${block.month.slice(0, 4)}-${e.target.value}`
                          setBlocks((prev) =>
                            prev.map((b, i) =>
                              i === idx ? { ...b, month: nextMonth } : b
                            )
                          )
                        }}
                        className='h-7 rounded-md border bg-background px-2 text-xs font-semibold text-foreground'
                      >
                        {PT_BR_MONTH_NAMES.map((mName, mIdx) => (
                          <option
                            key={mName}
                            value={String(mIdx + 1).padStart(2, '0')}
                          >
                            {mName}
                          </option>
                        ))}
                      </select>
                      <select
                        value={block.month.slice(0, 4)}
                        onChange={(e) => {
                          const nextMonth = `${e.target.value}-${block.month.slice(5, 7)}`
                          setBlocks((prev) =>
                            prev.map((b, i) =>
                              i === idx ? { ...b, month: nextMonth } : b
                            )
                          )
                        }}
                        className='h-7 rounded-md border bg-background px-2 text-xs font-semibold text-foreground'
                      >
                        {IMPORT_YEARS.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className='mt-2 flex flex-wrap items-center gap-3 text-[11px]'>
                    <span className='font-medium text-rose-500'>
                      {block.expenses.length} contas • Gastos:{' '}
                      <strong>{formatCentsToBrl(block.totalExpensesCents)}</strong>
                    </span>
                    <span className='font-medium text-emerald-500'>
                      {block.incomes.length} receitas • Entradas:{' '}
                      <strong>{formatCentsToBrl(block.totalIncomesCents)}</strong>
                    </span>
                    <label className='ml-auto flex cursor-pointer items-center gap-1.5 text-[10px] text-muted-foreground'>
                      <input
                        type='checkbox'
                        checked={block.replaceSpreadsheetInMonth}
                        onChange={(e) =>
                          setBlocks((prev) =>
                            prev.map((b, i) =>
                              i === idx
                                ? {
                                    ...b,
                                    replaceSpreadsheetInMonth: e.target.checked,
                                  }
                                : b
                            )
                          )
                        }
                        className='accent-primary'
                      />
                      Substituir lançamentos de planilha deste mês
                    </label>
                  </div>

                  <details className='mt-2'>
                    <summary className='cursor-pointer text-[11px] text-primary hover:underline'>
                      Ver contas e receitas detectadas
                    </summary>
                    <div className='mt-1.5 grid gap-2 rounded border bg-muted/20 p-2 sm:grid-cols-2'>
                      <div className='space-y-1'>
                        <p className='text-[10px] font-bold uppercase text-muted-foreground'>
                          Contas ({block.expenses.length})
                        </p>
                        {block.expenses.slice(0, 12).map((e, eIdx) => (
                          <div
                            key={`${e.name}-${eIdx}`}
                            className='flex justify-between text-[11px]'
                          >
                            <span className='truncate pr-2'>
                              {e.name} {e.paid ? '✓' : '⏳'}
                            </span>
                            <span className='shrink-0 font-semibold'>
                              {formatCentsToBrl(e.totalCents)}
                            </span>
                          </div>
                        ))}
                        {block.expenses.length > 12 && (
                          <p className='text-[10px] text-muted-foreground'>
                            + {block.expenses.length - 12} contas...
                          </p>
                        )}
                      </div>
                      <div className='space-y-1'>
                        <p className='text-[10px] font-bold uppercase text-muted-foreground'>
                          Receitas ({block.incomes.length})
                        </p>
                        {block.incomes.map((inc, iIdx) => (
                          <div
                            key={`${inc.description}-${iIdx}`}
                            className='flex justify-between text-[11px]'
                          >
                            <span className='truncate pr-2'>
                              {inc.description}
                            </span>
                            <span className='shrink-0 font-semibold text-emerald-500'>
                              {formatCentsToBrl(inc.amountCents)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </details>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button
                variant='outline'
                onClick={() => setBlocks([])}
                disabled={committing}
              >
                Voltar
              </Button>
              <Button
                onClick={handleCommit}
                disabled={committing}
                className='gap-1.5'
              >
                {committing ? (
                  <>
                    <Loader2 className='h-4 w-4 animate-spin' />
                    Salvando histórico...
                  </>
                ) : (
                  <>
                    <Check className='h-4 w-4' />
                    Importar {blocks.filter((b) => b.selected).length} Mês(es)
                    no Histórico
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
