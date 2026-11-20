import type { Release, Repository } from '../types'
import { useApi } from '../lib/hooks'
import { Octicon } from '../components/Octicon'
import { Avatar } from '../components/Avatar'
import { Markdown } from '../components/Markdown'
import { ButtonLink, Skeleton } from '../components/ui'
import { formatBytes, formatDate, timeAgo } from '../lib/format'

export function ReleasesPage({ repo, owner, repoName }: { repo: Repository; owner: string; repoName: string }) {
  const full = `${owner}/${repoName}`
  const state = useApi<Release[]>(`/repos/${full}/releases?per_page=30`)
  const releases = state.data || []

  return (
    <div className="releases-page">
      <div className="releases-head">
        <div>
          <h2>发行版</h2>
          <p>发行版是可部署的项目版本，包含说明和可下载的资源。</p>
        </div>
        <ButtonLink href={`https://github.com/${full}/releases/new`} external variant="primary" size="sm" icon="tag">
          起草新发行版
        </ButtonLink>
      </div>

      {state.loading && (
        <div className="card pad"><Skeleton height={120} /><Skeleton height={120} /></div>
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
                  <a href={a.browser_download_url} target="_blank" rel="noreferrer">{a.name}</a>
                  <span className="release-asset-meta">{formatBytes(a.size)} · {a.download_count.toLocaleString()} 次下载</span>
                  <a className="btn btn-sm btn-default" href={a.browser_download_url} target="_blank" rel="noreferrer">
                    <Octicon name="download" size={14} /> 下载
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {!state.loading && releases.length === 0 && (
        <div className="card blankslate-wrap">
          <div className="blankslate">
            <span className="blankslate-icon"><Octicon name="tag" size={24} /></span>
            <h3>这里还没有发行版</h3>
            <p>创建发行版，打包软件、发行说明和二进制文件，供其他人使用。</p>
            <a className="btn btn-primary" href={`https://github.com/${full}/releases/new`} target="_blank" rel="noreferrer">
              <Octicon name="plus" size={16} /> 创建新发行版
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
