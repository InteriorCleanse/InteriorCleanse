'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icons'

interface ToastItem {
  id: number
  text: string
  action?: { label: string; onClick: () => void }
}

const ToastContext = createContext<(text: string, action?: ToastItem['action']) => void>(() => {})

/**
 * Short confirmations ("Saved", "Trip booked") that never block. Polite live
 * region, four seconds, one at a time on small screens.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const counter = useRef(0)
  const timers = useRef(new Map<number, number>())

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) window.clearTimeout(timer)
    timers.current.delete(id)
  }, [])

  const toast = useCallback(
    (text: string, action?: ToastItem['action']) => {
      const id = ++counter.current
      setItems((list) => [...list.slice(-2), { id, text, action }])
      timers.current.set(id, window.setTimeout(() => dismiss(id), 4000))
    },
    [dismiss],
  )

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((t) => window.clearTimeout(t))
  }, [])

  const value = useMemo(() => toast, [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="dr-toasts" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div key={t.id} className="dr-toast" role="status">
            <span>{t.text}</span>
            {t.action ? (
              <button
                type="button"
                className="dr-toast-action"
                onClick={() => {
                  t.action?.onClick()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            ) : null}
            <button type="button" className="dr-toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
