import { useState } from 'react'
import type { DeepLinkAction } from '../lib/deeplink'
import { openGithubPage } from '../lib/deeplink'
import { copyText } from '../lib/clipboard'
import { Button, Dialog } from './ui'
import { Octicon } from './Octicon'

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  return (
    <div className="oauth-copy-row">
      <span className="oauth-copy-label">{label}</span>
      <code className="oauth-copy-value">{value}</code>
      <button
        className="btn btn-sm btn-default"
        onClick={async () => {
          await copyText(value)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1600)
        }}
      >
        <Octicon name={copied ? 'check' : 'copy'} size={14} /> {copied ? '已复制' : '复制'}
      </button>
    </div>
  )
}

export function DeepLinkDialog({ action, onClose }: { action: DeepLinkAction; onClose: () => void }) {
  if (action.kind === 'oauth-callback') {
    return (
      <Dialog title="已收到 GitHub 授权回调" subtitle="githubmobile://oauth/callback" onClose={onClose} width={620}
        footer={(
          <div className="dialog-actions">
            <Button icon="copy" onClick={async () => { await copyText(action.raw) }}>复制完整回调</Button>
            <Button variant="primary" icon="check" onClick={onClose}>完成</Button>
          </div>
        )}
      >
        <div className="oauth-dialog">
          {action.error ? (
            <div className="form-error">
              授权失败：{action.error}{action.errorDescription ? ` — ${action.errorDescription}` : ''}
            </div>
          ) : (
            <p className="settings-paragraph">
              GitHub 已把授权码带回 GitHub Mobile。第三方服务需要在它自己的后端用 <code>client_secret</code>
              将 <code>code</code> 兑换为访问令牌；本应用不会保存任何 <code>client_secret</code>。
            </p>
          )}
          <CopyRow label="code" value={action.code} />
          <CopyRow label="state" value={action.state} />
          <p className="form-hint">
            <Octicon name="info" size={14} /> 如果这是其他应用的绑定流程，请回到原应用完成最后一步；授权码通常只能使用一次。
          </p>
        </div>
      </Dialog>
    )
  }

  if (action.kind === 'oauth-authorize') {
    return (
      <Dialog title="GitHub 授权请求" subtitle="来自其他应用的绑定请求" onClose={onClose} width={640}
        footer={(
          <div className="dialog-actions">
            <Button onClick={onClose}>取消</Button>
            <Button
              variant="primary"
              icon="shield-check"
              onClick={() => {
                openGithubPage(action.url)
                onClose()
              }}
            >
              在应用内继续授权
            </Button>
          </div>
        )}
      >
        <div className="oauth-dialog">
          <p className="settings-paragraph">
            某个应用请求访问你的 GitHub 账号。确认这是你信任的应用后再继续；授权页会在 GitHub Mobile
            内置的网页视图中打开，完成后会自动返回。
          </p>
          <div className="oauth-facts">
            <div className="oauth-fact"><span>Client ID</span><code>{action.clientId || '未提供'}</code></div>
            <div className="oauth-fact"><span>回调地址</span><code>{action.redirectUri || 'GitHub 默认'}</code></div>
            {action.state && <div className="oauth-fact"><span>state</span><code>{action.state}</code></div>}
          </div>
          <div className="oauth-scopes">
            <span className="settings-label">请求的权限</span>
            <div className="oauth-scope-list">
              {(action.scopes.length ? action.scopes : ['（未声明 scope）']).map((s) => (
                <span className="oauth-scope" key={s}>{s}</span>
              ))}
            </div>
          </div>
          <p className="form-hint">
            <Octicon name="alert" size={14} /> 请不要在不理解权限范围时授权；应用不会代替你输入 GitHub 密码。
          </p>
        </div>
      </Dialog>
    )
  }

  return null
}
