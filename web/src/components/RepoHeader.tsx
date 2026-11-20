import { useEffect, useState } from 'react'
import type { RepoTab } from '../lib/router'
import { repoHref, navigate } from '../lib/router'
import type { Repository } from '../types'
import { useApp } from '../state/AppState'
import { gh, openExternal } from '../lib/api'
import { compact } from '../lib/format'
import { Octicon } from './Octicon'
import { Button, Counter, Dropdown, Skeleton, Spinner } from './ui'

export function RepoHeader({
  repo, tab, owner, repoName, issueCount, prCount, loading,
}: {
  repo: Repository | null
  tab: RepoTab
  owner: string
  repoName: string
  issueCount?: number | null
  prCount?: number | null
  loading?: boolean
}) {
  const { config, showToast, source } = useApp()
  const base = repoHref(owner, repoName)
  const [starred, setStarred] = useState(false)
  const [starCount, setStarCount] = useState(repo?.stargazers_count || 0)
  const [starLoading, setStarLoading] = useState(false)
  const full = `${owner}/${repoName}`

  useEffect(() => {
    setStarCount(repo?.stargazers_count || 0)
  }, [repo?.stargazers_count])

  useEffect(() => {
    let alive = true
    setStarred(false)
    if (!config?.hasToken || source === 'demo' || !repo) return
    gh<{ full_name: string }[]>('/user/starred?per_page=100')
      .then((list) => {
        if (alive) setStarred(list.some((r) => r.full_name.toLowerCase() === full.toLowerCase()))
      })
      .catch(() => {})
    return () => { alive = false }
  }, [config?.hasToken, source, full, repo?.id])

  const toggleStar = async () => {
    if (!config?.hasToken) {
      showToast('登录 GitHub 后才能星标仓库', 'info')
      navigate('/settings')
      return
    }
    const next = !starred
    setStarred(next)
    setStarCount((c) => Math.max(0, c + (next ? 1 : -1)))
    setStarLoading(true)
    try {
      await gh(`/user/starred/${owner}/${repoName}`, { method: next ? 'PUT' : 'DELETE' })
      showToast(next ? '已星标' : '已取消星标', 'success')
    } catch (e) {
      setStarred(!next)
      setStarCount((c) => Math.max(0, c + (next ? -1 : 1)))
      showToast(e instanceof Error ? e.message : '操作失败', 'error')
    } finally {
      setStarLoading(false)
    }
  }

  const subscription = async (subscribe: boolean) => {
    if (!config?.hasToken) {
      showToast('登录 GitHub 后才能设置关注', 'info')
      return
    }
    try {
      if (subscribe) {
        await gh(`/repos/${owner}/${repoName}/subscription`, { method: 'PUT', body: { subscribed: true } })
        showToast('已关注该仓库', 'success')
      } else {
        await gh(`/repos/${owner}/${repoName}/subscription`, { method: 'DELETE' })
        showToast('已取消关注', 'success')
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : '操作失败', 'error')
    }
  }

  return (
    <div className="repo-header">
      <div className="repo-title-row">
        <div className="repo-title">
          <Octicon name={repo?.private ? 'lock' : 'repo'} size={16} className="repo-title-icon" />
          {loading || !repo ? (
            <Skeleton width={220} height={24} />
          ) : (
            <>
              <a className="repo-owner" href={`#/user/${repo.owner.login}`}>{repo.owner.login}</a>
              <span className="repo-slash">/</span>
              <a className="repo-name" href={`#${base}`}>{repo.name}</a>
              <span className={`repo-visibility ${repo.private ? 'private' : ''}`}>
                {repo.private ? '私有' : '公开'}
              </span>
              {repo.fork && <span className="repo-forked">分叉</span>}
            </>
          )}
        </div>

        <div className="repo-actions">
          <Dropdown
            width={240}
            trigger={
              <button className="btn btn-default btn-sm repo-action-btn" disabled={!repo}>
                <Octicon name="eye" size={16} />
                <span className="repo-action-label">关注</span>
                <Counter>{(repo?.watchers_count || 0).toLocaleString()}</Counter>
                <Octicon name="triangle-down" size={8} />
              </button>
            }
          >
            {(close) => (
              <>
                <div className="dropdown-header">通知设置</div>
                <button className="dropdown-item" onClick={() => { close(); subscription(true) }}>
                  <Octicon name="eye" size={16} /> 全部活动
                </button>
                <button className="dropdown-item" onClick={() => { close(); subscription(false) }}>
                  <Octicon name="eye-closed" size={16} /> 忽略 / 取消关注
                </button>
                <div className="dropdown-divider" />
                <a className="dropdown-item" href={`https://github.com/${owner}/${repoName}/subscription`} target="_blank" rel="noreferrer" onClick={close}>
                  <Octicon name="gear" size={16} /> 在 GitHub 管理
                </a>
              </>
            )}
          </Dropdown>

          <Button
            size="sm"
            className="repo-action-btn"
            icon="repo-forked"
            disabled={!repo}
            onClick={() => openExternal(`https://github.com/${owner}/${repoName}/fork`)}
          >
            <span className="repo-action-label">分叉</span>
            <Counter>{(repo?.forks_count || 0).toLocaleString()}</Counter>
          </Button>

          <div className="star-split">
            <button
              className={`btn btn-sm repo-action-btn star-btn ${starred ? 'starred' : ''}`}
              onClick={toggleStar}
              disabled={starLoading || !repo}
              aria-pressed={starred}
            >
              {starLoading ? <Spinner size={14} /> : <Octicon name={starred ? 'star-fill' : 'star'} size={16} />}
              <span className="repo-action-label">{starred ? '已星标' : '星标'}</span>
              <Counter>{compact(starCount)}</Counter>
            </button>
          </div>
        </div>
      </div>

      <nav className="repo-tabs" aria-label="仓库导航">
        <a className={`repo-tab ${tab === 'code' ? 'active' : ''}`} href={`#${base}`}>
          <Octicon name="code" size={16} /> 代码
        </a>
        <a className={`repo-tab ${tab === 'issues' ? 'active' : ''}`} href={`#${base}/issues`}>
          <Octicon name="issue-opened" size={16} /> 议题
          {issueCount != null && <span className="repo-tab-count">{issueCount.toLocaleString()}</span>}
        </a>
        <a className={`repo-tab ${tab === 'pulls' ? 'active' : ''}`} href={`#${base}/pulls`}>
          <Octicon name="git-pull-request" size={16} /> 拉取请求
          {prCount != null && <span className="repo-tab-count">{prCount.toLocaleString()}</span>}
        </a>
        <a className={`repo-tab ${tab === 'actions' ? 'active' : ''}`} href={`#${base}/actions`}>
          <Octicon name="play" size={16} /> Actions
        </a>
        <a className={`repo-tab ${tab === 'projects' ? 'active' : ''}`} href={`#${base}/projects`}>
          <Octicon name="table" size={16} /> 项目
        </a>
        <a className={`repo-tab ${tab === 'wiki' ? 'active' : ''}`} href={`#${base}/wiki`}>
          <Octicon name="book" size={16} /> Wiki
        </a>
        <a className={`repo-tab ${tab === 'security' ? 'active' : ''}`} href={`#${base}/security`}>
          <Octicon name="shield" size={16} /> 安全
        </a>
        <a className={`repo-tab ${tab === 'insights' ? 'active' : ''}`} href={`#${base}/insights`}>
          <Octicon name="graph" size={16} /> 洞察
        </a>
        {tab === 'settings' && (
          <a className="repo-tab active" href={`#${base}/settings`}>
            <Octicon name="gear" size={16} /> 设置
          </a>
        )}
      </nav>
    </div>
  )
}
