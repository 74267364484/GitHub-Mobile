import { useEffect, useMemo, useState } from 'react'
import type { GitHubUser } from '../types'
import { loadImage } from '../lib/api'
import { isNative } from '../lib/native'

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function identicon(seed: string): string {
  const h = hashString(seed || 'octodeck')
  const hue = h % 360
  const fg = `hsl(${hue} 52% 46%)`
  const cells: string[] = []
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      const bit = (h >>> ((y * 3 + x) % 31)) & 1
      if (bit) {
        cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`)
        if (x < 2) cells.push(`<rect x="${4 - x}" y="${y}" width="1" height="1"/>`)
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5 5" shape-rendering="crispEdges"><rect width="5" height="5" fill="#ebedf0"/><g fill="${fg}">${cells.join('')}</g></svg>`
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

interface AvatarProps {
  user?: Pick<GitHubUser, 'login' | 'avatar_url' | 'type'> | null
  login?: string
  url?: string
  size?: number
  square?: boolean
  className?: string
  title?: string
}

export function Avatar({ user, login, url, size = 20, square, className = '', title }: AvatarProps) {
  const name = login || user?.login || 'ghost'
  const source = url || user?.avatar_url || ''
  const isOrg = square ?? user?.type === 'Organization'
  const fallback = useMemo(() => identicon(name), [name])
  const [src, setSrc] = useState<string>(() => {
    if (!source) return fallback
    if (source.startsWith('data:')) return source
    if (isNative()) return fallback
    return `/api/img?url=${encodeURIComponent(source)}`
  })

  useEffect(() => {
    let alive = true
    if (!source) {
      setSrc(fallback)
      return
    }
    if (source.startsWith('data:')) {
      setSrc(source)
      return
    }
    if (!isNative()) {
      setSrc(`/api/img?url=${encodeURIComponent(source)}`)
      return
    }
    setSrc(fallback)
    loadImage(source)
      .then((data) => {
        if (alive && data) setSrc(data)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [source, fallback])

  return (
    <img
      className={`avatar ${isOrg ? 'avatar-square' : ''} ${className}`}
      src={src}
      width={size}
      height={size}
      alt={`@${name}`}
      title={title || `@${name}`}
      loading="lazy"
      decoding="async"
      onError={() => setSrc(fallback)}
    />
  )
}
