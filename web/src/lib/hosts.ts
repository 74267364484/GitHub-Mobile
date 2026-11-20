import hostsJson from '../data/hosts.json'
import type { HostState } from '../types'

export interface HostMapping {
  id: string
  name: string
  short: string
  region: string
  description: string
  recommended?: boolean
  hosts: Record<string, string>
}

export const HOST_CONFIG = hostsJson as {
  defaultMappingId: string
  testHost: string
  hostnames: Record<string, string>
  mappings: HostMapping[]
}

export const HOST_MAPPINGS = HOST_CONFIG.mappings
export const HOSTNAMES = Object.keys(HOST_CONFIG.hostnames)
export const HOST_LABELS = HOST_CONFIG.hostnames
export const DEFAULT_MAPPING_ID = HOST_CONFIG.defaultMappingId

export function mappingById(id: string): HostMapping {
  return HOST_MAPPINGS.find((m) => m.id === id) || HOST_MAPPINGS[0]
}

export function defaultHostState(): HostState {
  const custom: Record<string, string> = {}
  for (const h of HOSTNAMES) custom[h] = ''
  return { enabled: true, mappingId: DEFAULT_MAPPING_ID, custom, updatedAt: null }
}

export function effectiveHosts(state: HostState): Record<string, string> {
  if (!state.enabled) return {}
  const mapping = mappingById(state.mappingId)
  if (mapping.id === 'official') return {}
  if (mapping.id === 'custom') {
    const out: Record<string, string> = {}
    for (const h of HOSTNAMES) {
      const ip = (state.custom || {})[h]?.trim()
      if (ip) out[h] = ip
    }
    return out
  }
  return mapping.hosts
}

export function hostSummary(state: HostState): string {
  if (!state.enabled) return '已关闭 · 使用系统 DNS'
  const m = mappingById(state.mappingId)
  if (m.id === 'custom') {
    const hosts = effectiveHosts(state)
    const count = Object.keys(hosts).length
    return count ? `自定义 · ${count} 个域名` : '自定义 · 尚未填写'
  }
  return `${m.short} · ${m.region.split(' · ')[0]}`
}

export function hostsFileText(state: HostState): string {
  const hosts = effectiveHosts(state)
  if (!Object.keys(hosts).length) return '# 官方直连：不覆盖任何域名'
  const lines = [
    '# OctoDeck GitHub Host 映射',
    `# ${new Date().toISOString()}`,
    '# 用法：合并到 /etc/hosts（需要管理员权限）',
  ]
  for (const name of HOSTNAMES) {
    if (hosts[name]) lines.push(`${hosts[name].padEnd(16)} ${name}`)
  }
  return lines.join('\n')
}

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/

export function validateCustomHosts(custom: Record<string, string>): string | null {
  for (const name of HOSTNAMES) {
    const ip = (custom[name] || '').trim()
    if (ip && !IPV4.test(ip)) return `${name} 的 IPv4 地址格式不正确`
  }
  return null
}
