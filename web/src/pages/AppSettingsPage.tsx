import { useEffect, useState } from 'react'
import type React from 'react'
import { useApp } from '../state/AppState'
import { useDocumentTitle } from '../lib/hooks'
import { HostDialog } from '../components/HostCard'
import { Octicon } from '../components/Octicon'
import { Avatar } from '../components/Avatar'
import { Button, Spinner, Toggle } from '../components/ui'
import {
  HOST_LABELS, HOSTNAMES, effectiveHosts, hostSummary, mappingById,
} from '../lib/hosts'
import { invalidateCache, loadDemoData, refreshDemo } from '../lib/api'
import { isNative, nativeChooseDownloadDir, nativeDownloadDir, nativeOpenLinkSettings, type DownloadDirInfo } from '../lib/native'
import { dispatchOpenUrl, openGithubPage } from '../lib/deeplink'
import { copyText } from '../lib/clipboard'
import { compact } from '../lib/format'
import type { SnapshotData } from '../types'

type Section = 'account' | 'host' | 'links' | 'appearance' | 'data' | 'about'

const SECTIONS: { id: Section; label: string; icon: any }[] = [
  { id: 'account', label: '账户', icon: 'person' },
  { id: 'host', label: 'Host 映射', icon: 'server' },
  { id: 'links', label: '链接与授权', icon: 'link' },
  { id: 'appearance', label: '外观', icon: 'sun' },
  { id: 'data', label: '数据与缓存', icon: 'database' },
  { id: 'about', label: '关于', icon: 'info' },
]

export function AppSettingsPage() {
  const {
    config, user, source, host, updateHost, hostResults, testingHosts, runHostTests,
    theme, setTheme, connectToken, clearToken, showToast, reload, rateLimit,
  } = useApp()
  const [section, setSection] = useState<Section>('account')
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hostOpen, setHostOpen] = useState(false)
  const [snapshotMeta, setSnapshotMeta] = useState<SnapshotData | null>(null)
  const [downloadDir, setDownloadDir] = useState<DownloadDirInfo | null>(() => nativeDownloadDir())
  const [linkTest, setLinkTest] = useState('https://github.com/sindresorhus/awesome')
  useDocumentTitle('设置')

  useEffect(() => {
    loadDemoData().then(setSnapshotMeta).catch(() => {})
  }, [])

  const mapping = mappingById(host.mappingId)
  const hosts = effectiveHosts(host)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await connectToken(token)
      setToken('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '令牌校验失败')
    } finally {
      setSaving(false)
    }
  }

  const disconnect = async () => {
    await clearToken()
    setError(null)
  }

  return (
    <div className="settings-page app-settings">
      <div className="page-heading">
        <h1>设置</h1>
        <span className="page-heading-sub">GitHub Mobile v1.6.0</span>
      </div>

      <div className="settings-layout">
        <aside className="settings-nav">
          {SECTIONS.map((s) => (
            <button key={s.id} className={section === s.id ? 'active' : ''} onClick={() => setSection(s.id)}>
              <Octicon name={s.icon} size={16} /> {s.label}
            </button>
          ))}
          <div className="settings-nav-foot">
            <button onClick={() => openGithubPage('https://github.com/settings/tokens')}>
              GitHub token 管理 <Octicon name="link-external" size={12} />
            </button>
          </div>
        </aside>

        <div className="settings-main">
          {section === 'account' && (
            <>
              <div className="settings-card card">
                <div className="settings-card-head">
                  <h3>GitHub 连接</h3>
                  <p>使用 GitHub 个人访问令牌（Token）读取仓库、议题、拉取请求、Actions 与通知。</p>
                </div>
                {config?.hasToken ? (
                  <div className="account-connected">
                    <div className="account-connected-user">
                      {user ? <Avatar user={user} size={48} /> : <span className="avatar avatar-placeholder" style={{ width: 48, height: 48 }} />}
                      <div>
                        <strong>{user?.login || config.login || 'connected'}</strong>
                        <div className="account-connected-sub">
                          {config.tokenSource === 'server'
                            ? '当前使用服务端演示令牌（.env.local），仅本地开发可见'
                            : config.tokenSource === 'native'
                              ? '令牌已保存在 Android Keystore 加密存储'
                              : '令牌已保存在当前浏览器 localStorage'}
                        </div>
                      </div>
                      {source === 'live' && <span className="badge-live"><span className="status-dot" /> LIVE</span>}
                    </div>
                    <Button size="sm" variant="danger" icon="trash" onClick={disconnect}>清除令牌</Button>
                  </div>
                ) : (
                  <div className="account-disconnected">
                    <Octicon name="key" size={20} />
                    <span>当前为公开浏览，无需登录即可使用。粘贴 Token 后可访问私有仓库、通知与个人数据。</span>
                  </div>
                )}

                <form className="token-form" onSubmit={save}>
                  <label className="settings-label" htmlFor="token-input">
                    {config?.hasToken ? '替换个人访问令牌（Token）' : '个人访问令牌（Token）'}
                  </label>
                  <div className="token-row">
                    <input
                      id="token-input"
                      type="password"
                      className="form-input"
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <Button type="submit" variant="primary" disabled={saving || !token.trim()}>
                      {saving ? <><Spinner size={14} /> 验证中…</> : '保存并连接'}
                    </Button>
                  </div>
                  {error && <div className="form-error">{error}</div>}
                  <p className="form-hint">
                    需要 <code>repo</code>、<code>read:user</code>，读取 Actions 需 <code>workflow</code>，通知需 <code>notifications</code>。
                    令牌只保存在本机，不会上传到任何第三方。
                  </p>
                  <p className="form-hint">
                    <Octicon name="alert" size={14} /> 输入框中的令牌不会回显；清除后请重新粘贴。
                  </p>
                </form>
              </div>

              <div className="settings-card card">
                <div className="settings-card-head"><h3>安全建议</h3></div>
                <ul className="settings-list">
                  <li>为 GitHub Mobile 单独创建一个最小权限的 fine-grained token。</li>
                  <li>不要把令牌提交到 Git 仓库或截图分享；泄露后立即在 GitHub 撤销。</li>
                  <li>Android 原生版使用 OkHttp + Keystore 加密存储；浏览器预览版使用 localStorage。</li>
                  <li>本应用不向 GitHub 以外的域名发送令牌。</li>
                </ul>
              </div>
            </>
          )}

          {section === 'host' && (
            <>
              <div className="settings-card card">
                <div className="settings-card-head">
                  <h3>GitHub Host 映射</h3>
                  <p>置顶在左侧导航栏的内置线路。默认开启，开机即走选中的边缘 IP。</p>
                </div>
                <div className="host-settings-row">
                  <div>
                    <div className="host-settings-name">{host.enabled ? mapping.name : '官方直连'}</div>
                    <div className="host-settings-sub">{hostSummary(host)}</div>
                  </div>
                  <div className="host-settings-actions">
                    <Toggle checked={host.enabled} onChange={(v) => updateHost({ enabled: v })} label="启用 Host 映射" />
                    <Button size="sm" icon="server" onClick={() => setHostOpen(true)}>管理映射</Button>
                    <Button size="sm" icon="sync" onClick={() => runHostTests()} disabled={testingHosts}>
                      {testingHosts ? '测速中…' : '测速'}
                    </Button>
                  </div>
                </div>
                <div className="host-table">
                  {HOSTNAMES.map((h) => (
                    <div className="host-table-row" key={h}>
                      <span className="host-table-name">{h}</span>
                      <span className="host-table-label">{HOST_LABELS[h]}</span>
                      <code className="host-table-ip">{hosts[h] || '系统 DNS'}</code>
                    </div>
                  ))}
                </div>
                <div className="host-test-results">
                  {Object.values(hostResults).map((r) => (
                    <span key={r.id} className={`host-test-pill ${r.ok ? 'ok' : 'bad'}`}>
                      {mappingById(r.id).short} {r.ok ? `${r.ms ?? r.elapsed} ms` : '失败'}
                    </span>
                  ))}
                </div>
                <p className="form-hint">
                  {config?.native
                    ? '原生版通过 OkHttp 自定义 Dns 真实覆盖域名解析，API、图片、Raw 文件全部走映射。'
                    : config?.proxy
                      ? '浏览器预览版由本地服务代理转发；测速会经代理 CONNECT 到所选边缘 IP 并校验 TLS。'
                      : '浏览器预览版由本地服务发起请求；当前无代理，映射会直接生效。'}
                </p>
              </div>

              <div className="settings-card card">
                <div className="settings-card-head"><h3>工作方式</h3></div>
                <ul className="settings-list">
                  <li>只覆盖 GitHub Mobile 自身的网络请求，不修改系统 DNS，也不写入 /etc/hosts。</li>
                  <li>映射表包含 github.com、api.github.com、raw.githubusercontent.com、github.githubassets.com、codeload.github.com。</li>
                  <li>选择「官方直连」即使用系统 DNS；选择「自定义 Hosts」可为每个域名单独指定 IPv4。</li>
                  <li>线路 IP 可能随 GitHub 调度变化，连接异常时测速或切回官方直连。</li>
                </ul>
              </div>
            </>
          )}

          {section === 'links' && (
            <>
              <div className="settings-card card">
                <div className="settings-card-head">
                  <h3>GitHub 链接由应用接管</h3>
                  <p>从其他应用点击或分享 GitHub 链接时，直接进入 GitHub Mobile，而不是打开浏览器。</p>
                </div>
                <ul className="settings-list">
                  <li>已注册 <code>github.com</code>、<code>gist.github.com</code>、<code>githubmobile://</code> 与文本分享。</li>
                  <li>应用内所有 GitHub 链接会被路由到对应页面；没有原生页面的设置/授权页会在应用内网页视图中打开。</li>
                  <li>浏览器地址栏直接输入的网址无法被任何应用拦截，这是 Android 的系统限制；请把 GitHub 链接分享到 GitHub Mobile。</li>
                </ul>
                <div className="settings-button-row">
                  {isNative() && (
                    <Button size="sm" icon="gear" onClick={() => nativeOpenLinkSettings()}>
                      系统默认打开设置
                    </Button>
                  )}
                  <Button size="sm" icon="key" onClick={() => openGithubPage('https://github.com/settings/tokens')}>
                    在应用内管理 Token
                  </Button>
                  <Button
                    size="sm"
                    icon="copy"
                    onClick={async () => {
                      await copyText('githubmobile://oauth/callback')
                      showToast('OAuth 回调地址已复制', 'success')
                    }}
                  >
                    复制 OAuth 回调地址
                  </Button>
                </div>
              </div>

              <div className="settings-card card">
                <div className="settings-card-head">
                  <h3>第三方账号绑定</h3>
                  <p>其他平台要求绑定 GitHub 时，授权页会在本应用内打开，完成后自动回到原应用。</p>
                </div>
                <ul className="settings-list">
                  <li>收到 <code>github.com/login/oauth/authorize</code> 链接时，先显示权限确认对话框，再进入应用内授权页。</li>
                  <li>授权回调地址：<code>githubmobile://oauth/callback</code>；应用会展示 code 与 state，但不保存 client secret。</li>
                  <li>如果对方使用自己的自定义 scheme 回调，应用会询问是否把授权结果交回原应用。</li>
                </ul>
                <div className="link-test-row">
                  <input
                    className="form-input"
                    value={linkTest}
                    onChange={(e) => setLinkTest(e.target.value)}
                    placeholder="https://github.com/owner/repo"
                    spellCheck={false}
                  />
                  <Button size="sm" variant="primary" icon="arrow-right" onClick={() => dispatchOpenUrl(linkTest.trim())}>
                    测试打开
                  </Button>
                </div>
                <p className="form-hint">也可以用 <code>adb shell am start -a android.intent.action.VIEW -d "https://github.com/..." com.octodeck.app</code> 验证。</p>
              </div>
            </>
          )}

          {section === 'appearance' && (
            <div className="settings-card card">
              <div className="settings-card-head">
                <h3>主题</h3>
                <p>与 GitHub 一致的配色变量，支持浅色、深色与跟随系统。</p>
              </div>
              <div className="theme-preview-grid">
                {[
                  { id: 'light' as const, label: '浅色', icon: 'sun' as const },
                  { id: 'dark' as const, label: '深色', icon: 'moon' as const },
                  { id: 'auto' as const, label: '跟随系统', icon: 'device-desktop' as const },
                ].map((t) => (
                  <button key={t.id} className={`theme-preview ${theme === t.id ? 'active' : ''} theme-preview-${t.id}`} onClick={() => setTheme(t.id)}>
                    <span className="theme-preview-canvas">
                      <span className="theme-preview-head" />
                      <span className="theme-preview-line" />
                      <span className="theme-preview-line short" />
                      <span className="theme-preview-card" />
                    </span>
                    <span className="theme-preview-label"><Octicon name={t.icon} size={14} /> {t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {section === 'data' && (
            <>
              <div className="settings-card card">
                <div className="settings-card-head">
                  <h3>下载保存位置</h3>
                  <p>{isNative() ? 'Android 下载会直接保存到所选文件夹；选择一次后会记住，可随时更换。' : '浏览器下载由浏览器的下载设置决定。'}</p>
                </div>
                <div className="data-row">
                  <span className="data-label">
                    <Octicon name="file-directory" size={14} /> {isNative() ? (downloadDir?.label || '下载/GitHub Mobile') : '浏览器默认下载位置'}
                  </span>
                  {isNative() && (
                    <Button
                      size="sm"
                      icon="file-directory"
                      onClick={async () => {
                        try {
                          const next = await nativeChooseDownloadDir()
                          setDownloadDir(next)
                          showToast(`下载位置已改为 ${next.label}`, 'success')
                        } catch (e) {
                          showToast(e instanceof Error ? e.message : '未更改下载位置', 'info')
                        }
                      }}
                    >
                      更改文件夹
                    </Button>
                  )}
                </div>
              </div>
              <div className="settings-card card">
                <div className="settings-card-head"><h3>数据源</h3></div>
                <div className="data-row">
                  <span className="data-label">当前数据</span>
                  <span className={`data-badge ${source === 'live' ? 'live' : 'demo'}`}>
                    {source === 'live' ? <><span className="status-dot" /> GitHub 实时 API</> : <><Octicon name="sparkle" size={12} /> 公开演示数据</>}
                  </span>
                </div>
                {source === 'demo' && snapshotMeta && (
                  <div className="data-row">
                    <span className="data-label">演示数据生成时间</span>
                    <span>{new Date(snapshotMeta.generatedAt).toLocaleString()}</span>
                  </div>
                )}
                {rateLimit && (
                  <div className="data-row">
                    <span className="data-label">API 速率限制</span>
                    <span>{compact(rateLimit.remaining)} / {compact(rateLimit.limit)} 剩余</span>
                  </div>
                )}
                <div className="settings-button-row">
                  <Button size="sm" icon="sync" onClick={() => reload()}>重新加载数据</Button>
                  <Button size="sm" icon="trash" onClick={() => { invalidateCache(); showToast('API 缓存已清除', 'success') }}>清除 API 缓存</Button>
                  <Button size="sm" icon="cloud-offline" onClick={() => { refreshDemo().then(setSnapshotMeta); showToast('演示数据已重新读取', 'success') }}>重读演示数据</Button>
                </div>
              </div>
              <div className="settings-card card">
                <div className="settings-card-head"><h3>演示数据</h3></div>
                <p className="settings-paragraph">
                  GitHub Mobile 内置一份中性的公开数据（sindresorhus/awesome 与 microsoft/vscode），未登录时会自动加载；搜索与仓库页可直接浏览 GitHub 公共仓库。数据不包含任何个人账号、私有仓库或令牌。
                </p>
                {snapshotMeta && (
                  <div className="snapshot-stats">
                    <span><strong>{snapshotMeta.repos.length}</strong> 个公开仓库</span>
                    <span><strong>{Object.keys(snapshotMeta.repoData).length}</strong> 个演示仓库</span>
                    <span><strong>{(new Blob([JSON.stringify(snapshotMeta)]).size / 1024).toFixed(0)}</strong> KB</span>
                  </div>
                )}
              </div>
            </>
          )}

          {section === 'about' && (
            <div className="settings-card card about-app">
              <div className="about-app-head">
                <span className="about-app-logo"><Octicon name="mark-github" size={40} /></span>
                <div>
                  <h3>GitHub Mobile <span className="about-version">v1.6.0</span></h3>
                  <p>与 GitHub 网页同构的 Android 客户端，内置可切换的 Host 映射。</p>
                </div>
              </div>
              <div className="about-app-body">
                <p>
                  GitHub Mobile 用 React 复刻 GitHub 的页面结构、Typography、颜色和组件，并用 Android WebView 打包为 APK。
                  GitHub API 请求通过原生桥接，Host 映射由 OkHttp 自定义 Dns 实现，不修改系统 hosts。
                </p>
                <div className="about-app-grid">
                  <span><Octicon name="code" size={16} /> React 18 + TypeScript + Vite</span>
                  <span><Octicon name="device-desktop" size={16} /> Android WebView + OkHttp</span>
                  <span><Octicon name="server" size={16} /> 7 条内置 Host 线路 + 自定义</span>
                  <span><Octicon name="database" size={16} /> 公开演示数据</span>
                </div>
                <p className="about-disclaimer">
                  GitHub Mobile 是独立第三方项目，与 GitHub, Inc. 无隶属关系。GitHub、Octocat 是 GitHub, Inc. 的商标。
                </p>
                <div className="settings-button-row">
                  <Button size="sm" icon="link" onClick={() => openGithubPage('https://github.com')}>在应用内打开 github.com</Button>
                  <Button size="sm" icon="book" onClick={() => openGithubPage('https://docs.github.com/rest')}>REST API 文档</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {hostOpen && <HostDialog onClose={() => setHostOpen(false)} />}
    </div>
  )
}
