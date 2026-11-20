import { useState } from 'react'
import type { Branch, Repository } from '../types'
import { useApi } from '../lib/hooks'
import { gh, invalidateCache } from '../lib/api'
import { Octicon, type IconName } from '../components/Octicon'
import { Button, Dialog } from '../components/ui'
import { useApp } from '../state/AppState'
import { navigate } from '../lib/router'

type SettingsTab = 'general' | 'access' | 'branches' | 'tags' | 'actions' | 'webhooks' | 'environments' | 'codespaces' | 'pages' | 'security'
type DangerKind = 'visibility' | 'archive' | 'delete'

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
  const { showToast, reload } = useApp()
  const [tab, setTab] = useState<SettingsTab>('general')
  const branchesState = useApi<Branch[]>(`/repos/${full}/branches?per_page=100`)
  const active = TABS.find((t) => t.id === tab)!

  const [name, setName] = useState(repo.name)
  const [description, setDescription] = useState(repo.description || '')
  const [homepage, setHomepage] = useState(repo.homepage || '')
  const [topics, setTopics] = useState((repo.topics || []).join(', '))
  const [features, setFeatures] = useState({
    issues: repo.has_issues ?? true,
    projects: repo.has_projects ?? true,
    wiki: repo.has_wiki ?? true,
    discussions: repo.has_discussions ?? false,
  })
  const [defaultBranch, setDefaultBranch] = useState(repo.default_branch)
  const [saving, setSaving] = useState(false)

  const [danger, setDanger] = useState<DangerKind | null>(null)
  const [dangerText, setDangerText] = useState('')
  const [acting, setActing] = useState(false)

  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      const cleanName = name.trim()
      if (!cleanName || !/^[A-Za-z0-9._-]+$/.test(cleanName)) throw new Error('仓库名只能包含字母、数字、点、下划线和连字符')
      const updated = await gh<Repository>(`/repos/${full}`, {
        method: 'PATCH',
        body: {
          name: cleanName,
          description: description.trim(),
          homepage: homepage.trim() || null,
          topics: topics.split(',').map((t) => t.trim()).filter(Boolean),
          has_issues: features.issues,
          has_projects: features.projects,
          has_wiki: features.wiki,
          has_discussions: features.discussions,
          default_branch: defaultBranch,
        },
      })
      invalidateCache()
      await reload()
      showToast('仓库设置已保存', 'success')
      if (updated.name !== repo.name) navigate(`/${owner}/${updated.name}/settings`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const runDanger = async () => {
    if (!danger || acting) return
    if (danger === 'delete' && dangerText.trim() !== full) return
    setActing(true)
    try {
      if (danger === 'delete') {
        await gh(`/repos/${full}`, { method: 'DELETE' })
        invalidateCache()
        await reload()
        showToast('仓库已删除', 'success')
        navigate('/repos')
      } else if (danger === 'visibility') {
        await gh(`/repos/${full}`, { method: 'PATCH', body: { private: !repo.private } })
        invalidateCache()
        await reload()
        showToast(`仓库已设为${repo.private ? '公开' : '私有'}`, 'success')
      } else {
        await gh(`/repos/${full}`, { method: 'PATCH', body: { archived: !repo.archived } })
        invalidateCache()
        await reload()
        showToast(repo.archived ? '仓库已取消归档' : '仓库已归档', 'success')
      }
      setDanger(null)
      setDangerText('')
    } catch (e) {
      showToast(e instanceof Error ? e.message : '操作失败', 'error')
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="settings-page">
      <div className="flash settings-readonly">
        <Octicon name="info" size={16} />
        <span>常规设置、可见性、归档与删除均可直接在应用内完成；访问控制、Webhooks 等高级设置仍在 GitHub 网页。</span>
        <a href={`https://github.com/${full}/settings`} target="_blank" rel="noreferrer">打开高级设置 <Octicon name="link-external" size={12} /></a>
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
                      <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                  </label>
                  <label className="settings-field">
                    <span className="settings-label">描述</span>
                    <textarea className="form-input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="暂无描述" />
                  </label>
                  <label className="settings-field">
                    <span className="settings-label">网站</span>
                    <input className="form-input" value={homepage} onChange={(e) => setHomepage(e.target.value)} placeholder="https://example.com" />
                  </label>
                  <label className="settings-field">
                    <span className="settings-label">话题（逗号分隔）</span>
                    <input className="form-input" value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="react, android, github" />
                  </label>
                </div>
                <div className="dialog-actions settings-save">
                  <Button variant="primary" icon="check" onClick={save} disabled={saving}>
                    {saving ? '保存中…' : '保存设置'}
                  </Button>
                </div>
              </div>

              <div className="settings-card card">
                <div className="settings-card-head">
                  <h3>功能</h3>
                  <p>选择此仓库启用的功能。</p>
                </div>
                <div className="settings-checks">
                  {[
                    { key: 'issues' as const, label: '议题', desc: '跟踪想法、反馈和 Bug' },
                    { key: 'projects' as const, label: '项目', desc: '规划和组织工作' },
                    { key: 'wiki' as const, label: 'Wiki', desc: '托管文档' },
                    { key: 'discussions' as const, label: '讨论', desc: '社区交流' },
                  ].map((f) => (
                    <label className="settings-check" key={f.key}>
                      <input
                        type="checkbox"
                        checked={features[f.key]}
                        onChange={(e) => setFeatures((prev) => ({ ...prev, [f.key]: e.target.checked }))}
                      />
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
                    <select className="form-select" value={defaultBranch} onChange={(e) => setDefaultBranch(e.target.value)}>
                      {(branchesState.data || [{ name: repo.default_branch }]).map((b) => (
                        <option key={b.name} value={b.name}>{b.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="settings-card card">
                <div className="settings-card-head">
                  <h3>危险区域</h3>
                  <p>这些操作会立即生效。</p>
                </div>
                <div className="danger-row">
                  <div>
                    <strong>{repo.private ? '设为公开仓库' : '设为私有仓库'}</strong>
                    <p>此仓库当前为{repo.private ? '私有' : '公开'}。</p>
                  </div>
                  <Button size="sm" variant="danger" onClick={() => { setDanger('visibility'); setDangerText('') }}>
                    {repo.private ? '设为公开' : '设为私有'}
                  </Button>
                </div>
                <div className="danger-row">
                  <div>
                    <strong>{repo.archived ? '取消归档' : '归档仓库'}</strong>
                    <p>归档后仓库变为只读，可随时取消。</p>
                  </div>
                  <Button size="sm" variant="danger" onClick={() => { setDanger('archive'); setDangerText('') }}>
                    {repo.archived ? '取消归档' : '归档'}
                  </Button>
                </div>
                <div className="danger-row danger-row-last">
                  <div>
                    <strong>删除此仓库</strong>
                    <p>删除后无法恢复，需要输入完整仓库名确认。</p>
                  </div>
                  <Button size="sm" variant="danger" icon="trash" onClick={() => { setDanger('delete'); setDangerText('') }}>
                    删除
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="settings-card card">
              <div className="settings-external">
                <span className="settings-external-icon"><Octicon name={active.icon} size={28} /></span>
                <h3>{active.label}</h3>
                <p>{active.label} 属于高级设置，仍在 github.com 配置 {full}。</p>
                <a className="btn btn-default" href={`https://github.com/${full}/settings`} target="_blank" rel="noreferrer">
                  在 GitHub 打开
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {danger && (
        <Dialog
          title={danger === 'delete' ? '删除仓库' : danger === 'archive' ? (repo.archived ? '取消归档' : '归档仓库') : '更改仓库可见性'}
          subtitle={full}
          onClose={() => setDanger(null)}
          width={520}
          footer={(
            <div className="dialog-actions">
              <Button onClick={() => setDanger(null)} disabled={acting}>取消</Button>
              <Button
                variant="danger"
                onClick={runDanger}
                disabled={acting || (danger === 'delete' && dangerText.trim() !== full)}
              >
                {acting ? '处理中…' : danger === 'delete' ? '永久删除' : '确认'}
              </Button>
            </div>
          )}
        >
          {danger === 'delete' ? (
            <div className="write-form">
              <p className="settings-paragraph">此操作不可撤销。请输入 <code>{full}</code> 以确认。</p>
              <input className="form-input" value={dangerText} onChange={(e) => setDangerText(e.target.value)} placeholder={full} autoFocus />
            </div>
          ) : danger === 'archive' ? (
            <p className="settings-paragraph">
              {repo.archived ? '取消归档后仓库恢复可写。' : '归档后仓库变为只读，Issue、PR 与代码写入都会被禁用。'}
            </p>
          ) : (
            <p className="settings-paragraph">
              {repo.private ? '设为公开后，任何人都能查看此仓库。' : '设为私有后，只有你与协作者可见。'}
            </p>
          )}
        </Dialog>
      )}
    </div>
  )
}
