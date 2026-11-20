import { useState } from 'react'
import type { Release, Repository } from '../types'
import { useApi } from '../lib/hooks'
import { Octicon } from '../components/Octicon'
import { Avatar } from '../components/Avatar'
import { Markdown } from '../components/Markdown'
import { NewReleaseDialog } from '../components/WriteDialogs'
import { Button, ButtonLink, EmptyState, Skeleton } from '../components/ui'
import { formatBytes, formatDate, timeAgo } from '../lib/format'
import { startDownload } from '../lib/downloads'
import { useApp } from '../state/AppState'
import { navigate } from '../lib/router'

export function ReleasesPage({ repo, owner, repoName }: { repo: Repository; owner: string; repoName: string }) {
  const full = `${owner}/${repoName}`
  const state = useApi<Release[]>(`/repos/${full}/releases?per_page=30`)
  const releases = state.data || []
  const { config, showToast } = useApp()
  const [createOpen, setCreateOpen] = useState(false)

  const openCreate = () => {
    if (!config?.hasToken) {
      showToast('登录 GitHub 后才能创建发行版', 'info')
      navigate('/settings')
      return
    }
    setCreateOpen(true)
  }

  return (
    <div className="releases-page">
      <div className="releases-head">
        <div>
          <h2>发行版</h2>
          <p>发行版是可部署的项目版本，包含说明和可下载的资源。</p>
        </div>
        <Button variant="primary" size="sm" icon="tag" onClick={openCreate}>
          起草新发行版
        </Button>
      </div>

      {state.loading && (
        <div className="card pad"><Skeleton height={120} /><Skeleton height={120} /></div>
      )}

      {!state.loading && state.error && (
        <div className="card blankslate-wrap">
          <EmptyState icon="alert" title="无法加载发行版">
            <p>{state.error.message}</p>
            {/rate limit|限流|403/i.test(state.error.message) && (
              <ButtonLink href="#/settings" icon="key" variant="primary">
                登录 GitHub 后继续
              </ButtonLink>
            )}
          </EmptyState>
        </div>
      )}

      {!state.loading && releases.map((r, i) => (
        <div className="release-card card" key={r.id}>
          <div className="release-card-head">
            <div className="release-card-title">
              <Octicon name="tag" size={16} />
              <a href={r.html_url} target="_blank" rel="noreferrer">{r.tag_name}</a>
              {i === 0 && !r.draft && <span className="latest-badge">最新</span>}
              {r.prerelease && <span className="pre-badge">预发行</span>}
              {r.draft && <span className="draft-badge">草稿</span>}
            </div>
            <a className="release-external" href={r.html_url} target="_blank" rel="noreferrer" aria-label="在 GitHub 打开发行版">
              <Octicon name="link-external" size={16} />
            </a>
          </div>
          <div className="release-card-meta">
            {r.author && (
              <>
                <Avatar user={r.author} size={20} />
                <a href={`#/user/${r.author.login}`}>{r.author.login}</a>
                {' '}发布了此版本 {timeAgo(r.published_at || r.created_at)}
              </>
            )}
            {!r.author && <>发布于 {formatDate(r.published_at || r.created_at)}</>}
          </div>
          {r.name && <h3 className="release-name">{r.name}</h3>}
          {r.body && (
            <div className="release-body">
              <Markdown text={r.body} owner={owner} repo={repoName} branch={repo.default_branch} />
            </div>
          )}
          {r.assets.length > 0 && (
            <div className="release-assets">
              <div className="release-assets-head">资源 <span>{r.assets.length}</span></div>
              {r.assets.map((a) => (
                <div className="release-asset" key={a.id}>
                  <Octicon name="package" size={16} />
                  <span className="release-asset-name">{a.name}</span>
                  <span className="release-asset-meta">{formatBytes(a.size)} · {a.download_count.toLocaleString()} 次下载</span>
                  <button
                    className="btn btn-sm btn-default"
                    onClick={() => startDownload({ kind: 'release-asset', repo: full, assetId: a.id, filename: a.name })}
                  >
                    <Octicon name="download" size={14} /> 下载
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="release-source">
            <span className="release-source-label">源码</span>
            <button
              className="btn btn-sm btn-default"
              onClick={() => startDownload({ kind: 'repo-zip', repo: full, ref: r.tag_name, filename: `${repoName}-${r.tag_name}.zip` })}
            >
              <Octicon name="download" size={14} /> ZIP
            </button>
            <button
              className="btn btn-sm btn-default"
              onClick={() => startDownload({ kind: 'repo-tar', repo: full, ref: r.tag_name, filename: `${repoName}-${r.tag_name}.tar.gz` })}
            >
              <Octicon name="download" size={14} /> TAR.GZ
            </button>
          </div>
        </div>
      ))}

      {!state.loading && releases.length === 0 && (
        <div className="card blankslate-wrap">
          <div className="blankslate">
            <span className="blankslate-icon"><Octicon name="tag" size={24} /></span>
            <h3>这里还没有发行版</h3>
            <p>创建发行版，打包软件、发行说明和二进制文件，供其他人使用。</p>
            <Button variant="primary" icon="plus" onClick={openCreate}>
              创建新发行版
            </Button>
          </div>
        </div>
      )}

      {createOpen && (
        <NewReleaseDialog
          repo={full}
          defaultBranch={repo.default_branch}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false)
            state.reload()
            showToast('发行版已发布', 'success')
          }}
        />
      )}
    </div>
  )
}
