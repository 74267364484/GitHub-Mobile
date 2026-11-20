import type { GHConfig } from '../types'

export interface NativeBridge {
  getConfig(): string
  setToken(token: string): string
  clearToken(): string
  setHost(json: string): string
  request(id: string, method: string, path: string, body: string): void
  graphql(id: string, body: string): void
  testHosts(id: string): void
  fetchImage(id: string, url: string): void
  openExternal(url: string): void
  startDownload?(id: string, url: string, filename: string, accept: string): void
  getDownloadDir?(): string
  chooseDownloadDir?(id: string): void
  setTheme?(theme: string): void
}

declare global {
  interface Window {
    OctoDeck?: NativeBridge
    __octoDeckResolve?: (id: string, payload: string, error: string) => void
    __octoDownloadProgress?: (id: string, payload: string) => void
  }
}

type Pending = {
  resolve: (value: any) => void
  reject: (reason: Error) => void
  timer: number
}

const pending = new Map<string, Pending>()
let seq = 0

export function isNative(): boolean {
  return typeof window !== 'undefined' && Boolean(window.OctoDeck)
}

export function initNativeBridge(): void {
  if (!isNative()) return
  window.__octoDeckResolve = (id: string, payload: string, error: string) => {
    const p = pending.get(id)
    if (!p) return
    pending.delete(id)
    window.clearTimeout(p.timer)
    if (error) {
      p.reject(new Error(error))
      return
    }
    try {
      p.resolve(JSON.parse(payload))
    } catch (e) {
      p.reject(e instanceof Error ? e : new Error(String(e)))
    }
  }
  window.__octoDownloadProgress = (id: string, payload: string) => {
    let detail: Record<string, unknown> = {}
    try {
      detail = JSON.parse(payload)
    } catch {}
    window.dispatchEvent(new CustomEvent('octo-download', { detail: { id, ...detail } }))
  }
}

function callAsync<T>(invoke: (id: string) => void, timeoutMs = 45000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (!isNative()) {
      reject(new Error('Native bridge unavailable'))
      return
    }
    const id = `r${Date.now().toString(36)}${(seq++).toString(36)}`
    const timer = window.setTimeout(() => {
      pending.delete(id)
      reject(new Error('原生桥接超时'))
    }, timeoutMs)
    pending.set(id, { resolve, reject, timer })
    try {
      invoke(id)
    } catch (e) {
      pending.delete(id)
      window.clearTimeout(timer)
      reject(e instanceof Error ? e : new Error(String(e)))
    }
  })
}

export function nativeConfig(): GHConfig | null {
  if (!isNative()) return null
  try {
    return JSON.parse(window.OctoDeck!.getConfig()) as GHConfig
  } catch {
    return null
  }
}

export function nativeSetToken(token: string): void {
  window.OctoDeck?.setToken(token)
}

export function nativeClearToken(): void {
  window.OctoDeck?.clearToken()
}

export function nativeSetHost(json: string): string {
  return window.OctoDeck?.setHost(json) || ''
}

export function nativeRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const payload = body == null ? '' : JSON.stringify(body)
  return callAsync<T>((id) => window.OctoDeck!.request(id, method, path, payload))
}

export function nativeGraphql<T>(body: unknown): Promise<T> {
  return callAsync<T>((id) => window.OctoDeck!.graphql(id, JSON.stringify(body)))
}

export function nativeTestHosts<T>(): Promise<T> {
  return callAsync<T>((id) => window.OctoDeck!.testHosts(id))
}

export function nativeFetchImage(url: string): Promise<string> {
  return callAsync<{ dataUrl?: string }>((id) => window.OctoDeck!.fetchImage(id, url), 30000).then((p) => p?.dataUrl || '')
}

export function nativeSetTheme(theme: string): void {
  window.OctoDeck?.setTheme?.(theme)
}

export function nativeOpenExternal(url: string): void {
  window.OctoDeck?.openExternal(url)
}

export interface DownloadDirInfo {
  configured: boolean
  uri: string
  label: string
}

export function nativeDownloadDir(): DownloadDirInfo | null {
  if (!isNative()) return null
  try {
    return JSON.parse(window.OctoDeck!.getDownloadDir?.() || 'null') as DownloadDirInfo
  } catch {
    return null
  }
}

export function nativeChooseDownloadDir(): Promise<DownloadDirInfo> {
  return callAsync<DownloadDirInfo>((id) => window.OctoDeck!.chooseDownloadDir!(id), 120000)
}
