'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { usePathname } from 'next/navigation'

/**
 * Cross-route fade. `mode="wait"` plus the pathname key means the outgoing
 * route finishes leaving before the next one arrives, which keeps the fixed
 * header from sitting over two stacked pages mid-navigation.
 *
 * Framer Motion animates in JavaScript, so the global CSS
 * prefers-reduced-motion rule in globals.css cannot reach it. Visitors who
 * ask for reduced motion get the fade with no vertical offset at all; a
 * MotionConfig reducedMotion="user" alone still jumped the page 16px.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const offset = useReducedMotion() ? 0 : 16

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: offset }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -offset }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
