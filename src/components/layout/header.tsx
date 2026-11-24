'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { PeriodSelector } from '@/components/layout/period-selector'
import { ThemeSwitch } from '@/components/theme-switch'

type HeaderProps = React.HTMLAttributes<HTMLElement> & {
  fixed?: boolean
  hidePeriodSelector?: boolean
}

export function Header({
  className,
  fixed = true,
  hidePeriodSelector = false,
  children,
  ...props
}: HeaderProps) {
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const onScroll = () => {
      setOffset(document.body.scrollTop || document.documentElement.scrollTop)
    }
    document.addEventListener('scroll', onScroll, { passive: true })
    return () => document.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'z-50 h-16 border-b border-border/50 bg-background/80 backdrop-blur-md',
        fixed && 'header-fixed peer/header sticky top-0 w-[inherit]',
        offset > 10 && fixed ? 'shadow-xs' : 'shadow-none',
        className
      )}
      {...props}
    >
      <div className='relative flex h-full items-center justify-between gap-3 px-4 sm:gap-4'>
        <div className='flex items-center gap-3'>
          <SidebarTrigger variant='outline' className='max-md:scale-110' />
          <Separator orientation='vertical' className='h-6' />
          {children}
        </div>
        <div className='flex items-center gap-2'>
          {!hidePeriodSelector && <PeriodSelector />}
          <ThemeSwitch />
        </div>
      </div>
    </header>
  )
}
