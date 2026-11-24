'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowLeftRight,
  CalendarClock,
  CreditCard,
  LayoutDashboard,
  Settings,
  Sparkles,
  Table2,
  Tags,
  Wallet,
} from 'lucide-react'
import { useLayout } from '@/context/layout-provider'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { Badge } from '@/components/ui/badge'

const navGroups = [
  {
    title: 'Visão Geral & IA',
    items: [
      {
        title: 'Dashboard',
        url: '/',
        icon: LayoutDashboard,
      },
      {
        title: 'Planilha Financeira',
        url: '/planilha',
        icon: Table2,
        badge: 'Excel',
      },
      {
        title: 'Importar Prints (IA)',
        url: '/importar',
        icon: Sparkles,
        badge: 'IA',
      },
      {
        title: 'Transações',
        url: '/transacoes',
        icon: ArrowLeftRight,
      },
    ],
  },
  {
    title: 'Planejamento & Contas',
    items: [
      {
        title: 'Categorias & Metas',
        url: '/categorias',
        icon: Tags,
      },
      {
        title: 'Contas & Cartões',
        url: '/contas',
        icon: CreditCard,
      },
      {
        title: 'Despesas Recorrentes',
        url: '/recorrencias',
        icon: CalendarClock,
      },
    ],
  },
  {
    title: 'Sistema',
    items: [
      {
        title: 'Configurações & Backup',
        url: '/configuracoes',
        icon: Settings,
      },
    ],
  },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { collapsible, variant } = useLayout()
  const { setOpenMobile } = useSidebar()

  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size='lg' asChild>
              <Link href='/' onClick={() => setOpenMobile(false)}>
                <div className='flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs'>
                  <Wallet className='size-4' />
                </div>
                <div className='grid flex-1 text-start text-sm leading-tight'>
                  <span className='truncate font-bold tracking-tight'>
                    FINANCE AI
                  </span>
                  <span className='truncate text-xs text-muted-foreground'>
                    Controle Inteligente
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const isActive =
                  item.url === '/'
                    ? pathname === '/'
                    : pathname.startsWith(item.url)
                const Icon = item.icon
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.title}
                    >
                      <Link href={item.url} onClick={() => setOpenMobile(false)}>
                        <Icon />
                        <span>{item.title}</span>
                        {item.badge && (
                          <Badge
                            variant='secondary'
                            className='ms-auto rounded-full px-1.5 py-0 text-[10px] font-semibold'
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <div className='rounded-lg border bg-card/50 p-3 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden'>
          <div className='flex items-center gap-2 font-medium text-foreground'>
            <Sparkles className='size-3.5 text-primary' />
            <span>Leitura Multimodal</span>
          </div>
          <p className='mt-1 leading-relaxed'>
            Arraste prints de qualquer banco ou fatura para extração automática.
          </p>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
