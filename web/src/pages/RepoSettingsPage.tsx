import { useState } from 'react'
import type { Branch, Repository } from '../types'
import { useApi } from '../lib/hooks'
import { Octicon, type IconName } from '../components/Octicon'
import { ButtonLink } from '../components/ui'

type SettingsTab = 'general' | 'access' | 'branches' | 'tags' | 'actions' | 'webhooks' | 'environments' | 'codespaces' | 'pages' | 'security'

const TABS: { id: SettingsTab; label: string; icon: IconName }[] = [
  { id: 'general', label: '常规', icon: 'gear' },
  { id: 'access', label: '访问', icon: 'people' },
  { id: 'branches', label: '分支', icon: 'git-branch' },
  { id: 'tags', label: '标签', icon: 'tag' },
  { id: 'actions', label: 'Actions', icon: 'play' },
  { id: 'webhooks', label: 'Webhooks', icon: 'broadcast' },
  { id: 'environments', label: '环境', icon: 'server' },
  { id: 'codespaces', label: 'Codespaces', icon: 'device-desktop' },
  { id: 'pages', label: 'Pages', icon: 'globe' },
  { id: 'security', label: '安全', icon: 'shield' },
]

export function RepoSettingsPage({ repo, owner, repoName }: { repo: Repository; owner: string; repoName: string }) {
  const full = `${owner}/${repoName}`
  const [tab, setTab] = useState<SettingsTab>('general')
  const branchesState = useApi<Branch[]>(`/repos/${full}/branches?per_page=100`)
  const active = TABS.find((t) => t.id === tab)!

  return (
    <div className="settings-page">
      <div className="flash flash-warn settings-readonly">
        <Octicon name="info" size={16} />
        <span>这是 GitHub 设置页的只读预览。修改仓库设置请前往 github.com。</span>
        <a href={`https://github.com/${full}/settings`} target="_blank" rel="noreferrer">打开设置 <Octicon name="link-external" size={12} /></a>
      </div>

      <div className="settings-layout">
        <aside className="settings-nav">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              <Octicon name={t.icon} size={16} /> {t.label}
            </button>
          ))}
        </aside>

        <div className="settings-main">
          {tab === 'general' ? (
            <>
              <div className="settings-card card">
                <div className="settings-card-head">
                  <h3>仓库详情</h3>
                  <p>设置访客看到的仓库信息。</p>
                </div>
                <div className="settings-form">
                  <label className="settings-field">
                    <span className="settings-label">仓库名称</span>
                    <div className="input-group">
                      <span className="input-prefix">{owner} /</span>
                      <input className="form-input" value={repo.name} disabled />
                    </div>
                  </label>
                  <label className="settings-field">
                    <span className="settings-label">描述</span>
                    <textarea className="form-input" rows={2} value={repo.description || ''} disabled placeholder="暂无描述" />
                  </label>
                  <label className="settings-field">
                    <span className="settings-label">网站</span>
                    <input className="form-input" value={repo.homepage || ''} disabled placeholder="暂无网站" />
                  </label>
                  <label className="settings-field">
                    <span className="settings-label">话题</span>
                    <input className="form-input" value={(repo.topics || []).join(', ')} disabled placeholder="暂无话题" />
                  </label>
                </div>
              </div>

              <div className="settings-card card">
                <div className="settings-card-head">
                  <h3>功能</h3>
                  <p>选择此仓库启用的功能。</p>
                </div>
                <div className="settings-checks">
                  {[
                    { label: '议题', on: repo.has_issues ?? true, desc: '跟踪想法、反馈和 Bug' },
                    { label: '项目', on: repo.has_projects ?? true, desc: '规划和组织工作' },
                    { label: 'Wiki', on: repo.has_wiki ?? true, desc: '托管文档' },
                    { label: '讨论', on: repo.has_discussions ?? false, desc: '社区交流' },
                  ].map((f) => (
                    <label className="settings-check" key={f.label}>
                      <input type="checkbox" checked={f.on} disabled readOnly />
                      <span>
                        <strong>{f.label}</strong>
                        <span className="settings-check-desc">{f.desc}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="settings-card card">
                <div className="settings-card-head"><h3>默认分支</h3></div>
                <div className="settings-form">
                  <label className="settings-field">
                    <span className="settings-label">默认分支</span>
                    <select className="form-select" value={repo.default_branch} disabled>
                      {(branchesState.data || [{ name: repo.default_branch, commit: { sha: '' } }]).map((b) => (
                        <option key={b.name} value={b.name}>{b.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="settings-card card">
                <div className="settings-card-head">
                  <h3>危险区域</h3>
                  <p>不可逆的破坏性操作只能在 GitHub 上执行。</p>
                </div>
                <div className="danger-row">
                  <div>
                    <strong>更改仓库可见性</strong>
                    <p>此仓库当前为{repo.private ? '私有' : '公开'}。</p>
                  </div>
                  <a className="btn btn-danger btn-sm" href={`https://github.com/${full}/settings`} target="_blank" rel="noreferrer">更改可见性</a>
                </div>
                <div className="danger-row">
                  <div>
                    <strong>转移所有权</strong>
                    <p>将此仓库转移给其他用户或组织。</p>
                  </div>
                  <a className="btn btn-danger btn-sm" href={`https://github.com/${full}/settings`} target="_blank" rel="noreferrer">转移</a>
                </div>
                <div className="danger-row danger-row-last">
                  <div>
                    <strong>删除此仓库</strong>
                    <p>删除后无法恢复。</p>
                  </div>
                  <a className="btn btn-danger btn-sm" href={`https://github.com/${full}/settings`} target="_blank" rel="noreferrer">删除</a>
                </div>
              </div>
            </>
          ) : (
            <div className="settings-card card">
              <div className="settings-external">
                <span className="settings-external-icon"><Octicon name={active.icon} size={28} /></span>
                <h3>{active.label}</h3>
                <p>在 github.com 配置 {full} 的{active.label}设置。</p>
                <ButtonLink href={`https://github.com/${full}/settings`} external icon="link-external">
                  在 GitHub 打开
                </ButtonLink>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
