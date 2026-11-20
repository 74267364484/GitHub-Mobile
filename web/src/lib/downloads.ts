import { getClientToken } from './api'
import { isNative } from './native'

export type DownloadKind =
  | 'repo-zip'
  | 'repo-tar'
  | 'file'
  | 'release-asset'
  | 'pr-diff'
  | 'pr-patch'
  | 'run-logs'

export interface DownloadRequest {
  kind: DownloadKind
  repo: string
  ref?: string
  path?: string
  assetId?: number
  number?: number
  runId?: number
  filename?: string
}

export interface DownloadItem {
  id: string
  name: string
  state: 'queued' | 'downloading' | 'done' | 'error'
  received: number
  total: number
  error?: string
  local?: string
  startedAt: number
}

interface Target {
  url: string
  name: string
  accept: string
}

const items: DownloadItem[] = []
const listeners = new Set<() => void>()
let snapshot: DownloadItem[] = []

function emit(): void {
  snapshot = items.map((i) => ({ ...i }))
  listeners.forEach((fn) => fn())
}

export function subscribeDownloads(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function getDownloads(): DownloadItem[] {
  return snapshot
}

export function clearFinishedDownloads(): void {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].state === 'done' || items[i].state === 'error') items.splice(i, 1)
  }
  emit()
}

export function dismissDownload(id: string): void {
  const idx = items.findIndex((i) => i.id === id)
  if (idx >= 0) {
    items.splice(idx, 1)
    emit()
  }
}

function sanitize(name: string): string {
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim()
  return clean || 'download'
}

function baseName(path: string): string {
  return path.split('/').filter(Boolean).pop() || 'file'
}

export function buildTarget(req: DownloadRequest): Target {
  const [owner, repo] = req.repo.split('/')
  const ref = req.ref || 'HEAD'
  const refSafe = ref === 'HEAD' ? 'default' : sanitize(ref)
  switch (req.kind) {
    case 'repo-zip':
      return {
        url: `https://api.github.com/repos/${owner}/${repo}/zipball/${encodeURIComponent(ref)}`,
        name: sanitize(req.filename || `${repo}-${refSafe}.zip`),
        accept: 'application/vnd.github+json',
      }
    case 'repo-tar':
      return {
        url: `https://api.github.com/repos/${owner}/${repo}/tarball/${encodeURIComponent(ref)}`,
        name: sanitize(req.filename || `${repo}-${refSafe}.tar.gz`),
        accept: 'application/vnd.github+json',
      }
    case 'file':
      return {
        url: `https://api.github.com/repos/${owner}/${repo}/contents/${req.path!.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`,
        name: sanitize(req.filename || baseName(req.path || '')),
        accept: 'application/vnd.github.raw',
      }
    case 'release-asset':
      return {
        url: `https://api.github.com/repos/${owner}/${repo}/releases/assets/${req.assetId}`,
        name: sanitize(req.filename || `asset-${req.assetId}`),
        accept: 'application/octet-stream',
      }
    case 'pr-diff':
      return {
        url: `https://api.github.com/repos/${owner}/${repo}/pulls/${req.number}`,
        name: sanitize(req.filename || `${owner}-${repo}-${req.number}.diff`),
        accept: 'application/vnd.github.v3.diff',
      }
    case 'pr-patch':
      return {
        url: `https://api.github.com/repos/${owner}/${repo}/pulls/${req.number}`,
        name: sanitize(req.filename || `${owner}-${repo}-${req.number}.patch`),
        accept: 'application/vnd.github.v3.patch',
      }
    case 'run-logs':
      return {
        url: `https://api.github.com/repos/${owner}/${repo}/actions/runs/${req.runId}/logs`,
        name: sanitize(req.filename || `${owner}-${repo}-run-${req.runId}-logs.zip`),
        accept: 'application/vnd.github+json',
      }
  }
}

let seq = 0

export function startDownload(req: DownloadRequest): DownloadItem {
  const target = buildTarget(req)
  const item: DownloadItem = {
    id: `d${Date.now().toString(36)}${(seq++).toString(36)}`,
    name: target.name,
    state: 'queued',
    received: 0,
    total: 0,
    startedAt: Date.now(),
  }
  items.unshift(item)
  emit()

  if (isNative()) {
    item.state = 'downloading'
    emit()
    try {
      window.OctoDeck?.startDownload?.(item.id, target.url, target.name, target.accept)
    } catch (e) {
      fail(item, e instanceof Error ? e.message : '原生下载启动失败')
    }
    return item
  }

  void downloadOnWeb(item, target)
  return item
}

function fail(item: DownloadItem, message: string): void {
  item.state = 'error'
  item.error = message
  emit()
}

async function downloadOnWeb(item: DownloadItem, target: Target): Promise<void> {
  item.state = 'downloading'
  emit()
  const token = getClientToken()
  try {
    const res = await fetch(
      `/api/download?url=${encodeURIComponent(target.url)}&name=${encodeURIComponent(target.name)}`,
      {
        headers: {
          ...(token ? { 'x-gh-token': token } : {}),
          'x-accept': target.accept,
        },
        cache: 'no-store',
      },
    )
    if (!res.ok) {
      let message = `下载失败（HTTP ${res.status}）`
      try {
        const data = await res.json()
        if (data?.message) message = data.message
      } catch {}
      fail(item, message)
      return
    }

    item.total = Number(res.headers.get('content-length')) || 0
    const type = res.headers.get('content-type') || 'application/octet-stream'
    const chunks: Uint8Array[] = []
    if (res.body) {
      const reader = res.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          chunks.push(value)
          item.received += value.byteLength
          emit()
        }
      }
    } else {
      const buf = await res.arrayBuffer()
      chunks.push(new Uint8Array(buf))
      item.received = buf.byteLength
      emit()
    }
    if (item.received === 0) {
      fail(item, 'GitHub 返回了空文件')
      return
    }
    const blob = new Blob(chunks as BlobPart[], { type })
    const url = URL.createObjectURL(blob)
    item.local = url
    item.total = item.total || item.received
    item.state = 'done'
    emit()
    const a = document.createElement('a')
    a.href = url
    a.download = item.name
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000)
  } catch (e) {
    fail(item, e instanceof Error ? e.message : '下载失败')
  }
}

export function initNativeDownloadEvents(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('octo-download', ((e: CustomEvent) => {
    const detail = e.detail || {}
    const item = items.find((i) => i.id === detail.id)
    if (!item) return
    if (typeof detail.received === 'number') item.received = detail.received
    if (typeof detail.total === 'number') item.total = detail.total
    if (detail.name) item.name = sanitize(detail.name)
    if (detail.state === 'done') {
      item.state = 'done'
      item.total = item.total || item.received
      if (detail.uri) item.local = String(detail.uri)
      else if (detail.path) item.local = String(detail.path)
      if (!item.total && typeof detail.size === 'number') item.total = detail.size
    } else if (detail.state === 'error') {
      item.state = 'error'
      item.error = detail.error || '下载失败'
    } else {
      item.state = 'downloading'
    }
    emit()
  }) as EventListener)
}
