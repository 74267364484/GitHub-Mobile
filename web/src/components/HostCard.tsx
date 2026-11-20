import { useMemo, useState } from 'react'
import { useApp } from '../state/AppState'
import {
  HOST_LABELS, HOST_MAPPINGS, HOSTNAMES, hostSummary, hostsFileText,
  mappingById, validateCustomHosts,
} from '../lib/hosts'
import { Octicon } from './Octicon'
import { Button, Dialog, Spinner, Toggle } from './ui'
import type { HostMapping } from '../lib/hosts'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

function Latency({ id }: { id: string }) {
  const { hostResults, testingHosts } = useApp()
  const r = hostResults[id]
  if (testingHosts && !r) return <span className="latency latency-idle">测试中…</span>
  if (!r) return <span className="latency latency-idle">未测速</span>
  if (!r.ok) return <span className="latency latency-bad" title={r.error || '不可用'}>不可用</span>
  return <span className="latency latency-ok">{r.ms ?? r.elapsed} ms</span>
}

export function HostCard() {
  const { host, updateHost, runHostTests, testingHosts, config } = useApp()
  const [open, setOpen] = useState(false)
  const mapping = mappingById(host.mappingId)
  const result = useApp().hostResults[host.mappingId]
  const hosts = useMemo(() => {
    if (!host.enabled) return {}
    if (mapping.id === 'custom') return host.custom
    return mapping.hosts
  }, [host, mapping])
  const apiIp = hosts['api.github.com']

  return (
    <>
      <div className={`host-card ${host.enabled ? 'host-card-on' : 'host-card-off'}`}>
        <div className="host-card-head">
          <div className="host-card-eyebrow">
            <span className={`host-pulse ${host.enabled ? 'on' : ''}`} />
            <Octicon name="broadcast" size={12} />
            <span>GITHUB HOST</span>
          </div>
          <Toggle
            checked={host.enabled}
            onChange={(v) => updateHost({ enabled: v })}
            label="启用 Host 映射"
          />
        </div>

        <button className="host-current" onClick={() => setOpen(true)}>
          <span className="host-current-text">
            <span className="host-current-name">
              {host.enabled ? mapping.name : '官方直连'}
              {mapping.recommended && host.enabled && <span className="host-badge">推荐</span>}
            </span>
            <span className="host-current-sub">
              {host.enabled ? hostSummary(host) : '系统 DNS · 映射已关闭'}
            </span>
          </span>
          <Octicon name="chevron-down" size={16} className="host-chevron" />
        </button>

        <div className="host-ip-row">
          <span className="host-ip-label">api.github.com</span>
          <span className="host-ip-value">{apiIp || '系统 DNS'}</span>
          {result?.ok && typeof result.ms === 'number' && (
            <span className="host-ip-latency">{result.ms}ms</span>
          )}
        </div>

        <div className="host-card-actions">
          <button
            className="host-action"
            onClick={() => runHostTests()}
            disabled={testingHosts}
          >
            {testingHosts ? <Spinner size={12} /> : <Octicon name="sync" size={12} />} 测速
          </button>
          <span className="host-action-sep" />
          <button className="host-action" onClick={() => setOpen(true)}>
            <Octicon name="server" size={12} /> 管理
          </button>
          <span className="host-action-sep" />
          <span className="host-action-meta">{HOST_MAPPINGS.length} 条线路</span>
        </div>
      </div>

      {open && <HostDialog onClose={() => setOpen(false)} />}
    </>
  )
}

export function HostDialog({ onClose }: { onClose: () => void }) {
  const {
    host, updateHost, hostResults, testingHosts, runHostTests, autoSelectHost, showToast, config,
  } = useApp()
  const [custom, setCustom] = useState<Record<string, string>>({ ...host.custom })
  const [error, setError] = useState<string | null>(null)

  const select = (m: HostMapping) => {
    if (m.id === 'custom') {
      updateHost({ mappingId: 'custom' })
      return
    }
    updateHost({ mappingId: m.id })
  }

  const saveCustom = async () => {
    const err = validateCustomHosts(custom)
    if (err) {
      setError(err)
      return
    }
    setError(null)
    await updateHost({ mappingId: 'custom', custom })
    showToast('自定义 Hosts 已保存', 'success')
  }

  const copyHosts = async () => {
    const ok = await copyText(hostsFileText({ ...host, custom }))
    showToast(ok ? 'hosts 片段已复制' : '复制失败，请手动选择文本', ok ? 'success' : 'error')
  }

  return (
    <Dialog
      title="GitHub Host 映射"
      subtitle="为 GitHub 域名指定 IPv4 边缘节点，绕过本地 DNS 污染与解析缓慢。默认开启。"
      onClose={onClose}
      width={700}
      className="host-dialog"
      footer={
        <div className="host-dialog-footer">
          <div className="host-dialog-footer-left">
            <Button size="sm" icon="copy" onClick={copyHosts}>复制 hosts</Button>
          </div>
          <div className="host-dialog-footer-right">
            <Button size="sm" icon="zap" onClick={() => runHostTests()} disabled={testingHosts}>
              {testingHosts ? '测速中…' : '测试全部线路'}
            </Button>
            <Button size="sm" variant="primary" icon="sparkle" onClick={() => autoSelectHost()} disabled={testingHosts}>
              智能选择最快
            </Button>
            <Button size="sm" variant="primary" onClick={onClose}>完成</Button>
          </div>
        </div>
      }
    >
      <div className="host-toggle-row">
        <div>
          <div className="host-toggle-title">启用内置 Host 映射</div>
          <div className="host-toggle-desc">
            {config?.native
              ? 'Android 原生版：OkHttp 按映射解析 GitHub 域名，图片与 API 请求同样生效。'
              : '浏览器预览：由本地服务代理请求；映射测速会真实连接所选边缘 IP。'}
          </div>
        </div>
        <Toggle checked={host.enabled} onChange={(v) => updateHost({ enabled: v })} label="启用 Host 映射" />
      </div>

      <div className="host-section-title">
        线路
        <span className="host-section-meta">测速目标：{HOST_LABELS['api.github.com']}</span>
      </div>

      <div className="mapping-list">
        {HOST_MAPPINGS.map((m) => {
          const selected = host.mappingId === m.id
          const isCustom = m.id === 'custom'
          const ips = isCustom ? custom : m.hosts
          return (
            <div
              key={m.id}
              className={`mapping-card ${selected ? 'selected' : ''} ${host.enabled ? '' : 'mapping-card-muted'}`}
              onClick={() => select(m)}
              role="radio"
              aria-checked={selected}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') select(m) }}
            >
              <span className="mapping-radio">{selected && <span />}</span>
              <span className="mapping-main">
                <span className="mapping-title-row">
                  <span className="mapping-name">{m.name}</span>
                  {m.recommended && <span className="host-badge">推荐</span>}
                  {m.id === 'official' && <span className="mapping-tag">系统 DNS</span>}
                  <span className="mapping-spacer" />
                  <Latency id={m.id} />
                </span>
                <span className="mapping-desc">{m.description}</span>
                {Object.keys(ips).length > 0 ? (
                  <span className="mapping-ips">
                    {HOSTNAMES.filter((h) => ips[h]).map((h) => (
                      <span className="mapping-ip" key={h}>
                        <span className="mapping-ip-host">{h}</span>
                        <span className="mapping-ip-arrow">→</span>
                        <span className="mapping-ip-addr">{ips[h]}</span>
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="mapping-ips mapping-ips-empty">
                    {isCustom ? '在下方填写每个域名的 IPv4 地址，留空表示使用系统 DNS。' : '使用系统 DNS 解析，不覆盖任何域名。'}
                  </span>
                )}

                {isCustom && selected && (
                  <div className="custom-hosts" onClick={(e) => e.stopPropagation()}>
                    {HOSTNAMES.map((h) => (
                      <label className="custom-host-row" key={h}>
                        <span className="custom-host-name">{h}</span>
                        <input
                          className="custom-host-input"
                          inputMode="decimal"
                          placeholder="自动 / IPv4"
                          value={custom[h] || ''}
                          onChange={(e) => setCustom({ ...custom, [h]: e.target.value })}
                          spellCheck={false}
                        />
                      </label>
                    ))}
                    {error && <div className="form-error">{error}</div>}
                    <div className="custom-host-actions">
                      <Button size="sm" variant="primary" onClick={saveCustom}>保存自定义 IP</Button>
                      <span className="custom-host-hint">例：140.82.112.3</span>
                    </div>
                  </div>
                )}
              </span>
            </div>
          )
        })}
      </div>

      <div className="host-note">
        <Octicon name="info" size={16} />
        <span>
          Host 映射只影响 OctoMobile 自身的 GitHub 请求，不修改系统 hosts，也不需要 Root。
          线路 IP 为 GitHub 公开边缘节点，可能随官方调度变化；连接异常时点击「测速」或切回官方直连。
        </span>
      </div>
    </Dialog>
  )
}
