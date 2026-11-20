import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Octicon, type IconName } from './Octicon'
import { timeAgo } from '../lib/format'

type ButtonVariant = 'default' | 'primary' | 'danger' | 'invisible' | 'outline'
type ButtonSize = 'sm' | 'md'

export function Button({
  children, variant = 'default', size = 'md', className = '', icon, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: IconName
}) {
  return (
    <button className={`btn btn-${variant} btn-${size} ${className}`} {...props}>
      {icon && <Octicon name={icon} size={16} />}
      {children}
    </button>
  )
}

export function ButtonLink({
  children, href, variant = 'default', size = 'md', className = '', icon, external, onClick,
}: {
  children: React.ReactNode
  href: string
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  icon?: IconName
  external?: boolean
  onClick?: (e: React.MouseEvent) => void
}) {
  return (
    <a
      className={`btn btn-${variant} btn-${size} ${className}`}
      href={href}
      onClick={onClick}
      {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
    >
      {icon && <Octicon name={icon} size={16} />}
      {children}
    </a>
  )
}

export function Counter({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`Counter ${className}`}>{children}</span>
}

export function LabelPill({ name, color, description }: { name: string; color: string; description?: string | null }) {
  const hex = color?.replace('#', '') || 'ededed'
  const r = parseInt(hex.slice(0, 2), 16) || 0
  const g = parseInt(hex.slice(2, 4), 16) || 0
  const b = parseInt(hex.slice(4, 6), 16) || 0
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return (
    <span
      className="Label"
      style={{ backgroundColor: `#${hex}`, color: luminance > 0.62 ? '#24292f' : '#ffffff' }}
      title={description || name}
    >
      {name}
    </span>
  )
}

export function StateBadge({ state, merged, draft }: { state: string; merged?: boolean; draft?: boolean }) {
  if (merged) {
    return (
      <span className="State State--merged">
        <Octicon name="git-merge" size={14} /> 已合并
      </span>
    )
  }
  if (draft && state === 'open') {
    return (
      <span className="State State--draft">
        <Octicon name="git-pull-request-draft" size={14} /> 草稿
      </span>
    )
  }
  if (state === 'closed') {
    return (
      <span className="State State--closed">
        <Octicon name="issue-closed" size={14} /> 已关闭
      </span>
    )
  }
  return (
    <span className="State State--open">
      <Octicon name="issue-opened" size={14} /> 打开
    </span>
  )
}

export function Skeleton({ width, height = 16, className = '', circle }: { width?: number | string; height?: number; className?: string; circle?: boolean }) {
  return (
    <span
      className={`Skeleton ${circle ? 'Skeleton--circle' : ''} ${className}`}
      style={{ width: width ?? '100%', height: circle ? height : height }}
    />
  )
}

export function EmptyState({
  icon, title, children, action,
}: {
  icon: IconName
  title: string
  children?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="blankslate">
      <span className="blankslate-icon">
        <Octicon name={icon} size={24} />
      </span>
      <h3>{title}</h3>
      {children && <div className="blankslate-body">{children}</div>}
      {action && <div className="blankslate-action">{action}</div>}
    </div>
  )
}

export function RelativeTime({ iso, className = '' }: { iso?: string | null; className?: string }) {
  if (!iso) return null
  return (
    <span className={className} title={new Date(iso).toLocaleString()}>
      {timeAgo(iso)}
    </span>
  )
}

export function Dialog({
  title, subtitle, onClose, children, footer, width = 560, className = '',
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  width?: number
  className?: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.classList.add('dialog-open')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('dialog-open')
    }
  }, [onClose])

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`dialog ${className}`} style={{ width }} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Dialog'}>
        <div className="dialog-head">
          <div>
            <h2 className="dialog-title">{title}</h2>
            {subtitle && <div className="dialog-subtitle">{subtitle}</div>}
          </div>
          <button className="dialog-close" onClick={onClose} aria-label="关闭对话框">
            <Octicon name="x" size={16} />
          </button>
        </div>
        <div className="dialog-content">{children}</div>
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>
  )
}

export function Dropdown({
  trigger, children, align = 'right', panelClassName = '', width,
}: {
  trigger: React.ReactNode
  children: (close: () => void) => React.ReactNode
  align?: 'left' | 'right'
  panelClassName?: string
  width?: number
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const el = panelRef.current
    if (!el) return
    el.style.transform = ''
    const rect = el.getBoundingClientRect()
    const margin = 8
    let dx = 0
    if (rect.left < margin) dx = margin - rect.left
    else if (rect.right > window.innerWidth - margin) dx = window.innerWidth - margin - rect.right
    if (dx) el.style.transform = `translateX(${Math.round(dx)}px)`
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className={`dropdown ${open ? 'is-open' : ''}`} ref={ref}>
      <div className="dropdown-trigger" onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open && (
        <div ref={panelRef} className={`dropdown-panel dropdown-${align} ${panelClassName}`} style={width ? { width } : undefined}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle ${checked ? 'toggle-on' : ''}`}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
    >
      <span className="toggle-knob" />
    </button>
  )
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-label="Loading" />
}

export function SegmentedTabs({
  items, value, onChange, className = '',
}: {
  items: { id: string; label: React.ReactNode; count?: number }[]
  value: string
  onChange: (id: string) => void
  className?: string
}) {
  return (
    <nav className={`segmented-tabs ${className}`}>
      {items.map((it) => (
        <button
          key={it.id}
          className={`segmented-tab ${value === it.id ? 'active' : ''}`}
          onClick={() => onChange(it.id)}
        >
          {it.label}
          {it.count != null && <span className="Counter">{it.count}</span>}
        </button>
      ))}
    </nav>
  )
}
