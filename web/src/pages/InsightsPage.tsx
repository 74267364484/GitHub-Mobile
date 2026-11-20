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
              <a href={`https://github.com/${full}/graphs/contributors`} target="_blank" rel="noreferrer">在 GitHub 查看 <Octicon name="link-external" size={12} /></a>
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
                    <a className="commit-msg" href={`https://github.com/${full}/commit/${c.sha}`} target="_blank" rel="noreferrer">
                      {firstLine(c.commit.message, 90)}
                    </a>
                    <div className="commit-meta">{c.author?.login || c.commit.author?.name} · {timeAgo(c.commit.author?.date)}</div>
                  </div>
                  <code className="commit-sha">{c.sha.slice(0, 7)}</code>
                </div>
              ))}
            </div>
          </div>
        )}

        {['traffic', 'frequency', 'network', 'forks'].includes(tab) && (
          <div className="card insight-card insight-external">
            <Octicon name="graph" size={32} />
            <h3>此报告请在 GitHub 查看</h3>
            <p>
              {tab === 'traffic' && '流量洞察需要推送权限，仅在 github.com 展示。'}
              {tab === 'frequency' && '代码频率图需要完整提交历史和推送权限。'}
              {tab === 'network' && '提交网络图在 github.com 渲染。'}
              {tab === 'forks' && '分叉洞察在 github.com 展示。'}
            </p>
            <a className="btn btn-default" href={`https://github.com/${full}/graphs`} target="_blank" rel="noreferrer">
              在 GitHub 查看洞察 <Octicon name="link-external" size={14} />
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
