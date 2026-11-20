import { useMemo, useState } from 'react'
import type { GitCommit, GitHubUser, Repository, TreeEntry } from '../types'
import { useApi } from '../lib/hooks'
import { Octicon } from '../components/Octicon'
import { Avatar } from '../components/Avatar'
import { Skeleton } from '../components/ui'
import { compact, firstLine, languagePercent, timeAgo } from '../lib/format'

type InsightTab = 'community' | 'contributors' | 'pulse' | 'traffic' | 'commits' | 'frequency' | 'network' | 'forks'

const TABS: { id: InsightTab; label: string }[] = [
  { id: 'community', label: '社区' },
  { id: 'contributors', label: '贡献者' },
  { id: 'pulse', label: '脉搏' },
  { id: 'traffic', label: '流量' },
  { id: 'commits', label: '提交' },
  { id: 'frequency', label: '代码频率' },
  { id: 'network', label: '网络' },
  { id: 'forks', label: '分叉' },
]

export function InsightsPage({
  repo, owner, repoName,
}: {
  repo: Repository
  owner: string
  repoName: string
}) {
  const full = `${owner}/${repoName}`
  const [tab, setTab] = useState<InsightTab>('community')
  const treeState = useApi<{ tree: TreeEntry[] }>(`/repos/${full}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`)
  const languagesState = useApi<Record<string, number>>(`/repos/${full}/languages`)
  const contributorsState = useApi<GitHubUser[]>(`/repos/${full}/contributors?per_page=20`)
  const commitsState = useApi<GitCommit[]>(`/repos/${full}/commits?per_page=10`)
  const trafficViews = useApi<{ count: number; uniques: number; views: { timestamp: string; count: number; uniques: number }[] }>(
    tab === 'traffic' ? `/repos/${full}/traffic/views` : null,
  )
  const trafficClones = useApi<{ count: number; uniques: number }>(
    tab === 'traffic' ? `/repos/${full}/traffic/clones` : null,
  )
  const participation = useApi<{ all: number[] }>(tab === 'frequency' ? `/repos/${full}/stats/participation` : null)
  const forksState = useApi<{ id: number; full_name: string; owner: { login: string; avatar_url: string }; stargazers_count: number; updated_at: string }[]>(
    tab === 'forks' ? `/repos/${full}/forks?per_page=30&sort=newest` : null,
  )

  const tree = treeState.data?.tree || []
  const paths = useMemo(() => new Set(tree.map((e) => e.path.toLowerCase())), [tree])

  const checks = useMemo(() => {
    const exists = (pred: (p: string) => boolean) => tree.some((e) => pred(e.path.toLowerCase()))
    return [
      { label: '描述', ok: Boolean(repo.description) },
      { label: 'README', ok: exists((p) => /^readme(\.[a-z0-9]+)?$/.test(p)) },
      { label: '许可证', ok: Boolean(repo.license) || exists((p) => /^licen[cs]e(\.[a-z0-9]+)?$/.test(p)) },
      { label: '贡献指南', ok: exists((p) => /^contributing\.md$/.test(p) || p.includes('contributing')) },
      { label: '行为准则', ok: exists((p) => p.includes('code_of_conduct') || p.includes('code-of-conduct')) },
      { label: '议题模板', ok: tree.some((e) => e.path.startsWith('.github/ISSUE_TEMPLATE')) },
      { label: '拉取请求模板', ok: tree.some((e) => e.path.toLowerCase().includes('pull_request_template')) },
      { label: '安全策略', ok: exists((p) => p === 'security.md' || p === '.github/security.md') },
    ]
  }, [tree, repo])

  const done = checks.filter((c) => c.ok).length
  const pct = Math.round((done / checks.length) * 100)
  const langs = languagePercent(languagesState.data || {})
  const contributors = contributorsState.data || []
  const commits = commitsState.data || []

  return (
    <div className="insights-layout">
      <aside className="insights-side">
        {TABS.map((t) => (
          <button key={t.id} className={`insights-side-item ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </aside>
      <div className="insights-main">
        {tab === 'community' && (
          <>
            <div className="card insight-card">
              <div className="insight-head">
                <div>
                  <h3>社区标准</h3>
                  <p>帮助他人理解并参与你的项目。</p>
                </div>
                <div className="community-progress" title={`${done}/${checks.length}`}>
                  <div className="community-ring" style={{ background: `conic-gradient(var(--success-fg) ${pct * 3.6}deg, var(--border-default) 0)` }}>
                    <span>{pct}%</span>
                  </div>
                </div>
              </div>
              <div className="community-list">
                {checks.map((c) => (
                  <div className="community-item" key={c.label}>
                    <Octicon name={c.ok ? 'check-circle-fill' : 'x'} size={16} className={c.ok ? 'ok' : 'muted'} />
                    <span className={c.ok ? '' : 'muted'}>{c.label}</span>
                    {!c.ok && <a href={`https://github.com/${full}/community`} target="_blank" rel="noreferrer">添加</a>}
                  </div>
                ))}
              </div>
            </div>
            <div className="card insight-card">
              <div className="insight-head"><h3>语言</h3></div>
              {langs.length > 0 ? (
                <>
                  <div className="lang-bar lang-bar-lg">
                    {langs.map((l) => <span key={l.name} style={{ width: `${l.pct}%`, background: l.color }} title={`${l.name} ${l.pct.toFixed(1)}%`} />)}
                  </div>
                  <div className="lang-list">
                    {langs.map((l) => (
                      <span key={l.name} className="lang-item">
                        <i className="lang-dot" style={{ background: l.color }} />{l.name}
                        <span className="lang-pct">{l.pct.toFixed(1)}%</span>
                      </span>
                    ))}
                  </div>
                </>
              ) : <p className="muted">暂无语言数据。</p>}
            </div>
          </>
        )}

        {(tab === 'contributors' || tab === 'pulse') && (
          <div className="card insight-card">
            <div className="insight-head">
              <h3>{tab === 'contributors' ? '贡献者' : '脉搏'}</h3>
            </div>
            <div className="contributor-list">
              {contributors.map((c: any) => (
                <div className="contributor-row" key={c.login}>
                  <Avatar user={c} size={32} />
                  <a className="contributor-name" href={`#/user/${c.login}`}>{c.login}</a>
                  <span className="contributor-count">{compact(c.contributions)} commits</span>
                </div>
              ))}
              {contributorsState.loading && <Skeleton height={40} />}
              {!contributorsState.loading && contributors.length === 0 && <p className="muted">暂无贡献者数据。</p>}
            </div>
          </div>
        )}

        {(tab === 'commits' || tab === 'pulse') && (
          <div className="card insight-card">
            <div className="insight-head"><h3>最近提交</h3></div>
            <div className="commit-list">
              {commits.map((c) => (
                <div className="commit-row" key={c.sha}>
                  <Avatar user={c.author || undefined} login={c.commit.author?.name} size={24} />
                  <div className="commit-main">
                    <span className="commit-msg">{firstLine(c.commit.message, 90)}</span>
                    <div className="commit-meta">{c.author?.login || c.commit.author?.name} · {timeAgo(c.commit.author?.date)}</div>
                  </div>
                  <code className="commit-sha">{c.sha.slice(0, 7)}</code>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'traffic' && (
          <div className="card insight-card">
            <div className="insight-head"><h3>流量</h3></div>
            {trafficViews.loading && <Skeleton height={60} />}
            {trafficViews.error && <p className="form-hint">流量数据需要推送权限；未启用时此页不会跳转网页。</p>}
            {!trafficViews.loading && !trafficViews.error && (
              <div className="insight-stats">
                <span><strong>{compact(trafficViews.data?.count || 0)}</strong> 次浏览</span>
                <span><strong>{compact(trafficViews.data?.uniques || 0)}</strong> 位访客</span>
                <span><strong>{compact(trafficClones.data?.count || 0)}</strong> 次克隆</span>
                <span><strong>{compact(trafficClones.data?.uniques || 0)}</strong> 位克隆者</span>
              </div>
            )}
            {!trafficViews.loading && !trafficViews.error && (trafficViews.data?.views || []).length > 0 && (
              <div className="traffic-bars">
                {(trafficViews.data?.views || []).slice(-14).map((v) => {
                  const max = Math.max(...(trafficViews.data?.views || []).map((x) => x.count), 1)
                  return (
                    <div className="traffic-bar" key={v.timestamp} title={`${v.timestamp.slice(0, 10)} · ${v.count} 次`}>
                      <span style={{ height: `${Math.max(4, Math.round((v.count / max) * 100))}%` }} />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'frequency' && (
          <div className="card insight-card">
            <div className="insight-head"><h3>代码频率（最近 52 周）</h3></div>
            {participation.loading && <Skeleton height={60} />}
            {participation.error && <p className="form-hint">代码频率需要推送权限；未启用时此页不会跳转网页。</p>}
            {!participation.loading && !participation.error && (
              <div className="traffic-bars frequency-bars">
                {(participation.data?.all || []).map((count, i) => {
                  const max = Math.max(...(participation.data?.all || []), 1)
                  return <div className="traffic-bar" key={i} title={`第 ${i + 1} 周 · ${count} 次提交`}><span style={{ height: `${Math.max(4, Math.round((count / max) * 100))}%` }} /></div>
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'network' && (
          <div className="card insight-card">
            <div className="insight-head"><h3>提交网络（列表视图）</h3></div>
            <div className="commit-list">
              {commits.map((c) => (
                <div className="commit-row" key={c.sha}>
                  <Avatar user={c.author || undefined} login={c.commit.author?.name} size={24} />
                  <div className="commit-main">
                    <span className="commit-msg">{firstLine(c.commit.message, 90)}</span>
                    <div className="commit-meta">{c.author?.login || c.commit.author?.name} · {timeAgo(c.commit.author?.date)}</div>
                  </div>
                  <code className="commit-sha">{c.sha.slice(0, 7)}</code>
                </div>
              ))}
              {!commits.length && !commitsState.loading && <p className="muted">暂无提交数据。</p>}
            </div>
          </div>
        )}

        {tab === 'forks' && (
          <div className="card insight-card">
            <div className="insight-head"><h3>分叉</h3></div>
            {forksState.loading && <Skeleton height={50} />}
            {forksState.error && <p className="form-hint">{forksState.error.message}</p>}
            {!forksState.loading && !forksState.error && (
              <div className="contributor-list">
                {(forksState.data || []).map((f) => (
                  <a className="contributor-row" key={f.id} href={`#/${f.full_name}`}>
                    <img className="avatar" src={f.owner.avatar_url} alt={f.owner.login} width={24} height={24} />
                    <span className="contributor-name">{f.full_name}</span>
                    <span className="contributor-count">{compact(f.stargazers_count)} 星 · {timeAgo(f.updated_at)}</span>
                  </a>
                ))}
                {!(forksState.data || []).length && <p className="muted">还没有分叉。</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
