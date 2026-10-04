import Link from 'next/link'
import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icons'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export function ButtonLink({
  href,
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconAfter,
  block,
  className = '',
  ...rest
}: {
  href: string
  children: ReactNode
  variant?: Variant
  size?: Size
  icon?: IconName
  iconAfter?: IconName
  block?: boolean
  className?: string
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return (
    <Link href={href} className={`btn btn-${variant} btn-${size}${block ? ' btn-block' : ''} ${className}`} {...rest}>
      {icon ? <Icon name={icon} size={17} /> : null}
      {children}
      {iconAfter ? <Icon name={iconAfter} size={17} /> : null}
    </Link>
  )
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="stars" role="img" aria-label={`Rated ${value.toFixed(1)} out of 5`}>
      <Icon name="star" size={size} />
      {value.toFixed(1)}
    </span>
  )
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="crumbs">
      <ol>
        {items.map((it, i) => (
          <li key={it.label + i}>
            {it.href && i < items.length - 1 ? <Link href={it.href}>{it.label}</Link> : <span aria-current="page">{it.label}</span>}
            {i < items.length - 1 ? <Icon name="chevron-right" size={13} /> : null}
          </li>
        ))}
      </ol>
    </nav>
  )
}

/** A person: their own photo if they added one, else their initials. */
export function Avatar({ name, size = 40, photo }: { name: string; size?: number; photo?: string | null }) {
  if (photo) {
    return (
      <span className="avatar-wrap" style={{ width: size, height: size, flex: 'none' }}>
        <img className="avatar-photo" src={photo} alt="" width={size} height={size} />
      </span>
    )
  }
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.36, background: 'var(--surface-3)', color: 'var(--text)' }}
    >
      {initials}
    </span>
  )
}

export function Empty({ icon = 'sparkle', title, body, action }: { icon?: IconName; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={30} className="dim" />
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  )
}

export function Notice({ children, tone = 'info', icon }: { children: ReactNode; tone?: 'info' | 'warn' | 'ok'; icon?: IconName }) {
  return (
    <div className={`notice${tone !== 'info' ? ` notice-${tone}` : ''}`} role={tone === 'warn' ? 'note' : undefined}>
      <Icon name={icon ?? (tone === 'warn' ? 'help' : tone === 'ok' ? 'check' : 'shield')} size={18} />
      <div>{children}</div>
    </div>
  )
}
