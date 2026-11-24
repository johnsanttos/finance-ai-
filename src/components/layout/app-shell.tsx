'use client'

import { cn } from '@/lib/utils'
import { ThemeProvider } from '@/context/theme-provider'
import { LayoutProvider } from '@/context/layout-provider'
import { PeriodProvider } from '@/context/period-provider'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Toaster } from '@/components/ui/sonner'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider defaultTheme='dark'>
      <PeriodProvider>
        <LayoutProvider>
          <SidebarProvider defaultOpen={true}>
            <AppSidebar />
            <SidebarInset
              className={cn(
                '@container/content',
                'has-data-[layout=fixed]:h-svh',
                'peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100svh-(var(--spacing)*4))]'
              )}
            >
              {children}
            </SidebarInset>
            <Toaster position='top-right' richColors />
          </SidebarProvider>
        </LayoutProvider>
      </PeriodProvider>
    </ThemeProvider>
  )
}
