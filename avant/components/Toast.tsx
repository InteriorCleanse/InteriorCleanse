'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

const Ctx = createContext<(text: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; text: string }[]>([])
  const n = useRef(0)
  const timers = useRef<number[]>([])
  const toast = useCallback((text: string) => {
    const id = ++n.current
    setItems((l) => [...l.slice(-2), { id, text }])
    timers.current.push(window.setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 3500))
  }, [])
  useEffect(() => {
    const t = timers.current
    return () => t.forEach((x) => window.clearTimeout(x))
  }, [])
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast" role="status">
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
