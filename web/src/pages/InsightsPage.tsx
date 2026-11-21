import { useMemo, useState } from 'react'
import type { GitCommit, GitHubUser, Repository, TreeEntry } from '../types'
import { useApi } from '../lib/hooks'
import { Octicon } from '../components/Octicon'
import { Avatar } from '../components/Avatar'
import { Skeleton } from '../components/ui'
import { FileDialog } from '../components/WriteDialogs'
import { useApp } from '../state/AppState'
import { navigate } from '../lib/router'
import { compact, firstLine, languagePercent, timeAgo } from '../lib/format'

const MIT_LICENSE = `MIT License

Copyright (c) 2026 {{owner}}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`

const COMMUNITY_FILES: Record<string, { path: string; content: string }> = {
  README: {
    path: 'README.md',
    content: `# 项目名称

一句话介绍这个项目。

## 安装

    npm install

## 使用

    npm start

## 贡献

欢迎提交 Issue 与 Pull Request，详情见 CONTRIBUTING.md。

## 许可证

MIT
`,
  },
  '许可证': { path: 'LICENSE', content: MIT_LICENSE },
  '贡献指南': {
    path: 'CONTRIBUTING.md',
    content: `# 贡献指南

感谢你愿意为这个项目做出贡献。

## 报告问题

- 先搜索已有 Issue，避免重复。
- 描述复现步骤、期望结果和实际结果。

## 提交拉取请求

1. Fork 本仓库并创建分支。
2. 保持改动聚焦，补充必要的测试。
3. 在描述中说明改动原因和验证方式。

## 行为准则

参与本项目即表示同意遵守 CODE_OF_CONDUCT.md。
`,
  },
  '行为准则': {
    path: 'CODE_OF_CONDUCT.md',
    content: `# 贡献者行为准则

## 我们的承诺

为了营造开放、友好的环境，我们承诺让每个人都能无骚扰地参与本项目。

## 我们的标准

- 使用友好和包容的语言。
- 尊重不同的观点和经验。
- 优雅地接受建设性批评。
- 关注对社区最有利的事情。

## 不可接受的行为

- 性化语言或图像、人身攻击、侮辱或贬损性评论。
- 公开或私下的骚扰。
- 未经许可发布他人的私人信息。

## 执行

违反行为准则的行为可向项目维护者报告，维护者会及时、公正地处理。
`,
  },
  '议题模板': {
    path: '.github/ISSUE_TEMPLATE/bug_report.md',
    content: `---
name: Bug report
about: 报告一个问题
title: "[Bug] "
labels: bug
---

## 问题描述

## 复现步骤

1.
2.
3.

## 期望结果

## 实际结果

## 环境

- 版本：
- 系统：
`,
  },
  '拉取请求模板': {
    path: '.github/pull_request_template.md',
    content: `## 改动内容

## 关联 Issue

Closes #

## 验证方式

- [ ] 本地测试通过
- [ ] 已补充或更新测试
`,
  },
  '安全策略': {
    path: 'SECURITY.md',
    content: `# 安全策略

## 报告漏洞

请不要在公开 Issue 中披露安全漏洞。请通过项目维护者的邮箱或 GitHub Security Advisory 私下报告。

## 支持范围

我们只为默认分支的最新版本提供安全修复。

## 响应时间

我们会在 3 个工作日内确认收到报告，并在修复发布后公开说明。
`,
  },
}

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
  const { config, showToast } = useApp()
  const [communityFile, setCommunityFile] = useState<{ path: string; content: string } | null>(null)
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

  const openCommunityItem = (label: string) => {
    if (label === '描述') {
      navigate(`/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/settings`)
      return
    }
    if (!config?.hasToken) {
      showToast('登录 GitHub 后才能补全社区标准', 'info')
      navigate('/settings')
      return
    }
    const file = COMMUNITY_FILES[label]
    if (!file) return
    setCommunityFile({ path: file.path, content: file.content.replace('{{owner}}', owner) })
  }

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
                    {!c.ok && (
                      <button className="community-add" onClick={() => openCommunityItem(c.label)}>
                        {c.label === '描述' ? '设置' : '添加'}
                      </button>
                    )}
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

      {communityFile && (
        <FileDialog
          repo={full}
          branch={repo.default_branch}
          mode="create"
          path={communityFile.path}
          initialContent={communityFile.content}
          onClose={() => setCommunityFile(null)}
          onSaved={() => {
            setCommunityFile(null)
            treeState.reload()
            showToast('社区文件已创建，检查项会自动更新', 'success')
          }}
        />
      )}
    </div>
  )
}
