'use client'

/**
 * Drive's small set of primitives. Every control here is a real HTML control
 * with a real label; the classes only style them.
 */

import Link from 'next/link'
import { useId, type ReactNode } from 'react'
import { Icon, type DriveIconName } from './Icons'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonBase {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: DriveIconName
  iconAfter?: DriveIconName
  block?: boolean
  className?: string
  children: ReactNode
}

type ButtonProps = ButtonBase &
  (
    | ({ href: string } & Omit<React.ComponentProps<typeof Link>, 'href' | 'className' | 'children'>)
    | ({ href?: undefined } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>)
  )

export function Button(props: ButtonProps) {
  const { variant = 'primary', size = 'md', icon, iconAfter, block, className = '', children, ...rest } = props
  const cls = `dr-btn dr-btn-${variant} dr-btn-${size}${block ? ' dr-btn-block' : ''} ${className}`.trim()
  const inner = (
    <>
      {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} /> : null}
      <span>{children}</span>
      {iconAfter ? <Icon name={iconAfter} size={size === 'sm' ? 16 : 18} /> : null}
    </>
  )
  if ('href' in rest && rest.href) {
    const { href, ...linkRest } = rest as { href: string } & Omit<React.ComponentProps<typeof Link>, 'href'>
    return (
      <Link href={href} className={cls} {...linkRest}>
        {inner}
      </Link>
    )
  }
  const { type = 'button', ...buttonRest } = rest as React.ButtonHTMLAttributes<HTMLButtonElement>
  return (
    <button type={type} className={cls} {...buttonRest}>
      {inner}
    </button>
  )
}

export function Chip({
  active,
  onClick,
  href,
  children,
  icon,
  count,
}: {
  active?: boolean
  onClick?: () => void
  href?: string
  children: ReactNode
  icon?: DriveIconName
  count?: number
}) {
  const inner = (
    <>
      {icon ? <Icon name={icon} size={15} /> : null}
      <span>{children}</span>
      {typeof count === 'number' ? <span className="dr-chip-count">{count}</span> : null}
    </>
  )
  if (href) {
    return (
      <Link href={href} className="dr-chip" data-active={active ? 'true' : undefined}>
        {inner}
      </Link>
    )
  }
  return (
    <button type="button" className="dr-chip" aria-pressed={active} onClick={onClick}>
      {inner}
    </button>
  )
}

/** A labelled control. The label always points at the control; hint and error are announced with it. */
export function Field({
  label,
  hint,
  error,
  children,
  id: givenId,
  className = '',
}: {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  id?: string
  className?: string
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode
}) {
  const auto = useId()
  const id = givenId ?? auto
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={`dr-field ${className}`.trim()} data-invalid={error ? 'true' : undefined}>
      <label htmlFor={id} className="dr-label">
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint ? (
        <p id={hintId} className="dr-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="dr-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function Card({ children, className = '', as: Tag = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' | 'li' }) {
  return <Tag className={`dr-card ${className}`.trim()}>{children}</Tag>
}

export function EmptyState({
  icon = 'sparkle',
  title,
  body,
  action,
}: {
  icon?: DriveIconName
  title: string
  body?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="dr-empty">
      <span className="dr-empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <h2 className="dr-empty-title">{title}</h2>
      {body ? <p className="dr-empty-body">{body}</p> : null}
      {action ? <div className="dr-empty-action">{action}</div> : null}
    </div>
  )
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="dr-crumbs">
      <ol>
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`}>
            {item.href && i < items.length - 1 ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
            {i < items.length - 1 ? <Icon name="chevron-right" size={14} className="dr-crumb-sep" /> : null}
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="dr-stars" aria-label={`${value.toFixed(1)} out of 5`} role="img">
      <Icon name="star" size={size} className="dr-star" />
      <span>{value.toFixed(1)}</span>
    </span>
  )
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
  // A stable hue from the name so the same host always looks the same.
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const hue = hash % 360
  return (
    <span
      className="dr-avatar"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 45% 82%)`, color: `hsl(${hue} 50% 24%)` }}
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}

export function Badge({ tone = 'neutral', icon, children }: { tone?: 'neutral' | 'accent' | 'success' | 'warn' | 'danger'; icon?: DriveIconName; children: ReactNode }) {
  return (
    <span className={`dr-badge dr-badge-${tone}`}>
      {icon ? <Icon name={icon} size={13} /> : null}
      {children}
    </span>
  )
}

export function SectionTitle({ title, sub, action }: { title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="dr-section-title">
      <div>
        <h2>{title}</h2>
        {sub ? <p>{sub}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="dr-kbd">{children}</kbd>
}

/** Segmented control for a small set of exclusive options. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { id: T; label: ReactNode }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="dr-segmented" role="group" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          aria-pressed={opt.id === value}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
