import { useState } from 'react'
import type React from 'react'
import { useApp } from '../state/AppState'
import { Octicon } from '../components/Octicon'
import { HostDialog } from '../components/HostCard'
import { Button, Spinner } from '../components/ui'
import { hostSummary } from '../lib/hosts'

export function AuthLoading() {
  return (
    <div className="auth-page auth-loading-page">
      <div className="auth-loading">
        <span className="auth-loading-logo"><Octicon name="mark-github" size={56} /></span>
        <div className="auth-loading-brand">OctoMobile</div>
        <div className="auth-loading-spinner"><Spinner size={22} /></div>
        <div className="auth-loading-text">正在加载 OctoMobile…</div>
      </div>
    </div>
  )
}

export function AuthPage() {
  const { connectToken, enterDemo, fatal, host, theme, setTheme, reload } = useApp()
  const [token, setToken] = useState('')
  const [show, setShow] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hostOpen, setHostOpen] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token.trim() || submitting) return
    setError(null)
    setSubmitting(true)
    try {
      await connectToken(token)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '登录失败'
      setError(msg.includes('Bad credentials') ? 'Token 无效或已过期，请重新创建。' : msg)
    } finally {
      setSubmitting(false)
    }
  }

  const demo = async () => {
    setDemoLoading(true)
    setError(null)
    try {
      await enterDemo()
    } catch (e) {
      setError(e instanceof Error ? e.message : '演示加载失败')
      setDemoLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <header className="auth-top">
        <div className="auth-brand">
          <span className="auth-brand-mark"><Octicon name="mark-github" size={34} /></span>
          <span className="auth-brand-name">OctoMobile</span>
          <span className="auth-brand-cn">章鱼移动</span>
        </div>
        <div className="auth-theme" role="group" aria-label="主题">
          <button className={`auth-theme-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')} title="浅色">
            <Octicon name="sun" size={16} />
          </button>
          <button className={`auth-theme-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')} title="深色">
            <Octicon name="moon" size={16} />
          </button>
          <button className={`auth-theme-btn ${theme === 'auto' ? 'active' : ''}`} onClick={() => setTheme('auto')} title="跟随系统">
            <Octicon name="device-desktop" size={16} />
          </button>
        </div>
      </header>

      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-logo"><Octicon name="mark-github" size={48} /></div>
          <h1>登录到 OctoMobile</h1>
          <p className="auth-sub">
            使用 GitHub 个人访问令牌（Token）登录。登录状态保存在本机，下次启动自动恢复；登录后可查看并下载你的私有仓库。
          </p>

          {fatal && (
            <div className="flash flash-error auth-alert">
              <Octicon name="alert" size={16} />
              <span>{fatal}</span>
              <button className="auth-alert-action" onClick={() => reload()}>重试</button>
            </div>
          )}

          <form onSubmit={submit} className="auth-form">
            <label htmlFor="auth-token">GitHub 令牌（Token）</label>
            <div className="auth-token-wrap">
              <Octicon name="key" size={16} className="auth-token-icon" />
              <input
                id="auth-token"
                type={show ? 'text' : 'password'}
                placeholder="ghp_… / github_pat_…"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                disabled={submitting}
              />
              <button
                type="button"
                className="auth-eye"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? '隐藏 Token' : '显示 Token'}
              >
                <Octicon name={show ? 'eye-closed' : 'eye'} size={16} />
              </button>
            </div>
            {error && <div className="form-error">{error}</div>}
            <Button type="submit" variant="primary" className="auth-submit" disabled={submitting || !token.trim()}>
              {submitting ? <><Spinner size={14} /> 正在登录…</> : '登录'}
            </Button>
          </form>

          <div className="auth-help">
            <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">
              创建个人访问令牌 <Octicon name="link-external" size={12} />
            </a>
            <span>需要 <code>repo</code>、<code>read:user</code> 权限；读取 Actions 加 <code>workflow</code>，通知加 <code>notifications</code></span>
          </div>

          <div className="auth-divider"><span>或</span></div>

          <Button className="auth-demo" onClick={demo} disabled={demoLoading}>
            {demoLoading ? <><Spinner size={14} /> 正在进入演示…</> : <><Octicon name="telescope" size={16} /> 浏览演示（公开数据）</>}
          </Button>

          <div className="auth-host">
            <div className="auth-host-main">
              <span className="auth-host-icon"><Octicon name="broadcast" size={14} /></span>
              <div>
                <div className="auth-host-title">Host 映射已开启</div>
                <div className="auth-host-sub">{hostSummary(host)}</div>
              </div>
            </div>
            <button className="auth-host-manage" onClick={() => setHostOpen(true)}>管理</button>
          </div>

          <div className="auth-security">
            <span><Octicon name="shield-check" size={14} /> Token 只保存在本机</span>
            <span><Octicon name="lock" size={14} /> Android 版使用 Keystore 加密</span>
            <span><Octicon name="info" size={14} /> GitHub API 不支持账号密码登录</span>
          </div>
        </div>

        <div className="auth-foot">
          <span>OctoMobile v1.2.0</span>
          <span>·</span>
          <a href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
          <span>·</span>
          <span>与 GitHub, Inc. 无隶属关系</span>
        </div>
      </main>

      {hostOpen && <HostDialog onClose={() => setHostOpen(false)} />}
    </div>
  )
}
