'use client'

import { createContext, useContext, useState } from 'react'

export type Collapsible = 'offcanvas' | 'icon' | 'none'
export type Variant = 'inset' | 'sidebar' | 'floating'

type LayoutContextType = {
  collapsible: Collapsible
  setCollapsible: (c: Collapsible) => void
  variant: Variant
  setVariant: (v: Variant) => void
}

const LayoutContext = createContext<LayoutContextType>({
  collapsible: 'icon',
  setCollapsible: () => null,
  variant: 'inset',
  setVariant: () => null,
})

export function LayoutProvider({ children }: { children: React.ReactNode }) {
  const [collapsible, setCollapsible] = useState<Collapsible>('icon')
  const [variant, setVariant] = useState<Variant>('inset')

  return (
    <LayoutContext.Provider value={{ collapsible, setCollapsible, variant, setVariant }}>
      {children}
    </LayoutContext.Provider>
  )
}

export function useLayout() {
  return useContext(LayoutContext)
}
