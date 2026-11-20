import { useEffect, useMemo, useRef, useState } from 'react'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import bash from 'highlight.js/lib/languages/bash'
import python from 'highlight.js/lib/languages/python'
import yaml from 'highlight.js/lib/languages/yaml'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import markdown from 'highlight.js/lib/languages/markdown'
import java from 'highlight.js/lib/languages/java'
import groovy from 'highlight.js/lib/languages/groovy'
import diff from 'highlight.js/lib/languages/diff'
import { Octicon } from '../components/Octicon'
import { Avatar } from '../components/Avatar'
import { Markdown } from '../components/Markdown'
import { BranchPicker } from '../components/BranchPicker'
import { GoToFileDialog } from '../components/GoToFileDialog'
import { FileDialog } from '../components/WriteDialogs'
import { Button, Dialog, Dropdown, EmptyState, Skeleton } from '../components/ui'
import { useApi } from '../lib/hooks'
import { gh, invalidateCache, loadImage } from '../lib/api'
import { copyText } from '../lib/clipboard'
import { startDownload } from '../lib/downloads'
import {
  b64DecodeUnicode, compact, formatBytes, languagePercent, languageColor,
  timeAgo, firstLine, relativeLevel,
} from '../lib/format'
import type { Branch, GitHubUser, Release, Repository, TreeEntry, GitCommit } from '../types'
import { useApp } from '../state/AppState'
import { navigate, repoHref, type Route } from '../lib/router'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('kotlin', kotlin)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('python', python)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('java', java)
hljs.registerLanguage('groovy', groovy)
hljs.registerLanguage('diff', diff)

function languageFor(pathName: string): string | null {
  const ext = (pathName.split('.').pop() || '').toLowerCase()
  const map: Record<string, string> = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    json: 'json', kt: 'kotlin', kts: 'kotlin', java: 'java',
    sh: 'bash', bash: 'bash', zsh: 'bash',
    py: 'python', yml: 'yaml', yaml: 'yaml',
    xml: 'xml', html: 'xml', svg: 'xml', css: 'css', scss: 'css',
    md: 'markdown', markdown: 'markdown',
    gradle: 'groovy', groovy: 'groovy', diff: 'diff', patch: 'diff',
  }
  return map[ext] || null
}

function isImage(pathName: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)$/i.test(pathName)
}

function pathSegments(path: string): string[] {
  return path.split('/').filter(Boolean)
}

function encodePath(p: string): string {
  return pathSegments(p).map(encodeURIComponent).join('/')
}

function treeHref(owner: string, repo: string, branch: string, path: string): string {
  return `#${repoHref(owner, repo, `/tree/${encodeURIComponent(branch)}${path ? '/' + encodePath(path) : ''}`)}`
}

function blobHref(owner: string, repo: string, branch: string, path: string): string {
  return `#${repoHref(owner, repo, `/blob/${encodeURIComponent(branch)}/${encodePath(path)}`)}`
}

function highlight(code: string, lang: string | null): string {
  try {
    if (lang) return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    return hljs.highlightAuto(code).value
  } catch {
    return code.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c))
  }
}

function RemoteImage({ url, alt }: { url: string; alt: string }) {
  const [src, setSrc] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    loadImage(url)
      .then((d) => { if (alive) setSrc(d) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [url])
  if (failed) return <div className="blob-image-error"><Octicon name="file" size={16} /> {alt}</div>
  if (!src) return <Skeleton height={180} />
  return <img className="blob-image" src={src} alt={alt} />
}

export function RepoCodePage({
  repo, owner, repoName, route,
}: {
  repo: Repository
  owner: string
  repoName: string
  route: Extract<Route, { kind: 'repo' }>
}) {
  const { showToast, source, config } = useApp()
  const defaultBranch = repo.default_branch || 'main'
  const branch = route.branch || defaultBranch
  const currentPath = (route.path || '').replace(/^\/+|\/+$/g, '')
  const full = `${owner}/${repoName}`

  const treeState = useApi<{ tree: TreeEntry[]; truncated?: boolean }>(
    `/repos/${full}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  )
  const branchesState = useApi<Branch[]>(`/repos/${full}/branches?per_page=100`)
  const commitState = useApi<GitCommit[]>(`/repos/${full}/commits?per_page=1`)
  const languagesState = useApi<Record<string, number>>(`/repos/${full}/languages`)
  const contributorsState = useApi<GitHubUser[]>(`/repos/${full}/contributors?per_page=12`)
  const releasesState = useApi<Release[]>(`/repos/${full}/releases?per_page=5`)

  const tree = treeState.data?.tree || []
  const entry = tree.find((e) => e.path === currentPath)
  const isFile = Boolean(currentPath) && (entry?.type === 'blob' || route.mode === 'blob')
  const dirPrefix = currentPath ? currentPath + '/' : ''

  const entries = useMemo(() => {
    if (!currentPath || !isFile) {
      return tree
        .filter((e) => e.path.startsWith(dirPrefix) && !e.path.slice(dirPrefix.length).includes('/') && e.path !== currentPath)
        .sort((a, b) => (a.type === b.type ? a.path.localeCompare(b.path) : a.type === 'tree' ? -1 : 1))
    }
    return []
  }, [tree, dirPrefix, currentPath, isFile])

  // README: root uses /readme (handles renaming); subdirectory looks up the tree.
  const rootReadme = useApi<{ content: string; encoding: string; name: string; path: string; size: number }>(
    currentPath ? null : `/repos/${full}/readme`,
  )
  const subReadmeEntry = useMemo(() => {
    if (!currentPath) return null
    return entries.find((e) => e.type === 'blob' && /^readme(\.[a-z0-9]+)?$/i.test(e.path.slice(dirPrefix.length)))
  }, [entries, currentPath, dirPrefix])
  const subReadme = useApi<{ content: string; encoding: string; name: string; path: string; size: number }>(
    subReadmeEntry ? `/repos/${full}/contents/${encodePath(subReadmeEntry.path)}?ref=${encodeURIComponent(branch)}` : null,
  )
  const readmeData = currentPath ? subReadme.data : rootReadme.data
  const readmeText = readmeData?.content
    ? (readmeData.encoding === 'base64' ? b64DecodeUnicode(readmeData.content) : readmeData.content)
    : ''

  const fileState = useApi<{ content: string; encoding: string; size: number; name: string; path: string; sha?: string; download_url?: string }>(
    isFile ? `/repos/${full}/contents/${encodePath(currentPath)}?ref=${encodeURIComponent(branch)}` : null,
  )
  const fileText = fileState.data?.content
    ? (fileState.data.encoding === 'base64' ? b64DecodeUnicode(fileState.data.content) : fileState.data.content)
    : ''
  const fileLang = languageFor(currentPath)

  // Latest commit per visible entry (GitHub's file table right column).
  const [entryCommits, setEntryCommits] = useState<Record<string, GitCommit | null>>({})
  const [commitsLoading, setCommitsLoading] = useState(false)
  const entriesKey = entries.map((e) => e.path).slice(0, 20).join('|')
  useEffect(() => {
    let alive = true
    if (!entries.length || isFile) {
      setEntryCommits({})
      setCommitsLoading(false)
      return
    }
    setEntryCommits({})
    setCommitsLoading(true)
    const list = entries.slice(0, 20)
    Promise.all(list.map(async (e) => {
      try {
        const commits = await gh<GitCommit[]>(`/repos/${full}/commits?path=${encodeURIComponent(e.path)}&per_page=1`)
        return [e.path, commits[0] || null] as const
      } catch {
        return [e.path, null] as const
      }
    })).then((rows) => {
      if (alive) {
        setEntryCommits(Object.fromEntries(rows))
        setCommitsLoading(false)
      }
    })
    return () => { alive = false }
  }, [entriesKey, full, branch, isFile, source])

  const [branchOpen, setBranchOpen] = useState(false)
  const [goToFileOpen, setGoToFileOpen] = useState(false)
  const [fileDialog, setFileDialog] = useState<'create' | 'edit' | 'upload' | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const requireLogin = (): boolean => {
    if (config?.hasToken) return true
    showToast('登录 GitHub 后才能修改仓库文件', 'info')
    navigate('/settings')
    return false
  }

  const openFileDialog = (mode: 'create' | 'edit' | 'upload') => {
    if (!requireLogin()) return
    setFileDialog(mode)
  }

  const deleteFile = async () => {
    if (!fileState.data?.sha || deleting) return
    setDeleting(true)
    try {
      await gh(`/repos/${full}/contents/${encodePath(currentPath)}`, {
        method: 'DELETE',
        body: { message: `Delete ${currentPath}`, sha: fileState.data.sha, branch },
      })
      invalidateCache()
      setDeleteOpen(false)
      showToast('文件已删除', 'success')
      navigate(`/${owner}/${repoName}/tree/${encodeURIComponent(branch)}`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : '删除失败', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const breadcrumb = pathSegments(currentPath)
  const copy = async (text: string, label = '已复制') => {
    const ok = await copyText(text)
    showToast(ok ? label : '复制失败', ok ? 'success' : 'error')
  }

  const latest = commitState.data?.[0]
  const langs = languagePercent(languagesState.data || {})
  const release = releasesState.data?.[0]

  return (
    <div className="repo-code">
      <div className="code-toolbar">
        <div className="code-toolbar-left">
          <button className="btn btn-default btn-sm branch-button" onClick={() => setBranchOpen(true)}>
            <Octicon name="git-branch" size={16} />
            <span className="branch-button-name">{branch}</span>
            <Octicon name="triangle-down" size={8} />
          </button>

          <nav className="breadcrumb" aria-label="Breadcrumb">
            <a href={treeHref(owner, repoName, branch, '')} onClick={(e) => { e.preventDefault(); navigate(repoHref(owner, repoName)) }}>
              {repoName}
            </a>
            {breadcrumb.map((seg, i) => {
              const p = breadcrumb.slice(0, i + 1).join('/')
              const last = i === breadcrumb.length - 1
              return (
                <span key={p} className="breadcrumb-part">
                  <span className="breadcrumb-sep">/</span>
                  {last ? (
                    <span className="breadcrumb-current">{seg}</span>
                  ) : (
                    <a href={treeHref(owner, repoName, branch, p)}>{seg}</a>
                  )}
                </span>
              )
            })}
          </nav>
        </div>

        <div className="code-toolbar-right">
          <Button size="sm" icon="search" className="go-to-file-btn" onClick={() => setGoToFileOpen(true)}>
            <span className="hide-sm">转到文件</span>
          </Button>
          <Dropdown
            width={220}
            trigger={
              <Button size="sm" icon="plus">
                <span className="hide-sm">添加文件</span>
                <Octicon name="triangle-down" size={8} />
              </Button>
            }
          >
            {(close) => (
              <>
                <button className="dropdown-item" onClick={() => { close(); openFileDialog('create') }}>
                  <Octicon name="file" size={16} /> 创建新文件
                </button>
                <button className="dropdown-item" onClick={() => { close(); openFileDialog('upload') }}>
                  <Octicon name="upload" size={16} /> 上传文件
                </button>
              </>
            )}
          </Dropdown>
          <Dropdown
            width={460}
            trigger={
              <Button size="sm" variant="primary" icon="code">
                代码 <Octicon name="triangle-down" size={8} />
              </Button>
            }
          >
            {(close) => (
              <div className="clone-menu">
                <div className="clone-menu-title">克隆</div>
                <div className="clone-row">
                  <span className="clone-kind">HTTPS</span>
                  <code>https://github.com/{full}.git</code>
                  <button className="clone-copy" onClick={() => copy(`https://github.com/${full}.git`, 'HTTPS 克隆地址已复制')} aria-label="复制 HTTPS 克隆地址">
                    <Octicon name="copy" size={16} />
                  </button>
                </div>
                <div className="clone-row">
                  <span className="clone-kind">SSH</span>
                  <code>git@github.com:{full}.git</code>
                  <button className="clone-copy" onClick={() => copy(`git@github.com:${full}.git`, 'SSH 克隆地址已复制')} aria-label="复制 SSH 克隆地址">
                    <Octicon name="copy" size={16} />
                  </button>
                </div>
                <div className="clone-divider" />
                <button className="dropdown-item" onClick={() => { close(); startDownload({ kind: 'repo-zip', repo: full, ref: branch }) }}>
                  <Octicon name="download" size={16} /> 下载 ZIP（{branch}）
                </button>
                <button className="dropdown-item" onClick={() => { close(); startDownload({ kind: 'repo-tar', repo: full, ref: branch }) }}>
                  <Octicon name="download" size={16} /> 下载 TAR.GZ（{branch}）
                </button>
              </div>
            )}
          </Dropdown>
        </div>
      </div>

      <div className="code-layout">
        <div className="code-main">
          {treeState.loading && (
            <div className="file-table card">
              {[0, 1, 2, 3, 4].map((i) => (
                <div className="file-row" key={i}>
                  <div className="file-name-cell"><Skeleton width={8} circle height={16} /><Skeleton width={180} /></div>
                  <div className="file-commit-cell"><Skeleton width={260} /></div>
                </div>
              ))}
            </div>
          )}

          {treeState.error && (
            <div className="card blankslate-wrap">
              <EmptyState icon="alert" title="无法加载代码树">
                <p>{treeState.error.message}</p>
              </EmptyState>
            </div>
          )}

          {!treeState.loading && !treeState.error && isFile && (
            <div className="blob-card card">
              <div className="blob-meta">
                <div className="blob-meta-name">
                  <Octicon name="file" size={16} />
                  <span>{fileState.data?.name || currentPath.split('/').pop()}</span>
                  {fileLang && <span className="blob-lang">{fileLang}</span>}
                </div>
                <div className="blob-meta-right">
                  <span>{fileState.data?.size != null ? formatBytes(fileState.data.size) : ''}</span>
                  {fileState.data?.content && <span>{fileText.split('\n').length} 行</span>}
                  <a className="btn btn-sm btn-default" href={`https://raw.githubusercontent.com/${full}/${branch}/${encodePath(currentPath)}`} target="_blank" rel="noreferrer">
                    <Octicon name="link-external" size={14} /> 在 GitHub 查看
                  </a>
                  <button className="btn btn-sm btn-default" onClick={() => startDownload({ kind: 'file', repo: full, ref: branch, path: currentPath })}>
                    <Octicon name="download" size={14} /> 下载文件
                  </button>
                  <button className="btn btn-sm btn-default" onClick={() => openFileDialog('edit')}>
                    <Octicon name="pencil" size={14} /> 编辑
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => requireLogin() && setDeleteOpen(true)}>
                    <Octicon name="trash" size={14} /> 删除
                  </button>
                </div>
              </div>
              {fileState.loading && <div className="blob-loading"><Skeleton height={20} /><Skeleton height={16} width="70%" /><Skeleton height={16} width="85%" /></div>}
              {fileState.error && <div className="blob-error">无法读取该文件：{fileState.error.message}</div>}
              {!fileState.loading && !fileState.error && isImage(currentPath) && (
                <div className="blob-image-wrap">
                  <RemoteImage url={`https://raw.githubusercontent.com/${full}/${branch}/${encodePath(currentPath)}`} alt={currentPath} />
                </div>
              )}
              {!fileState.loading && !fileState.error && !isImage(currentPath) && fileText && (
                <div className="blob-code-view">
                  <div className="blob-gutter" aria-hidden="true">
                    {fileText.replace(/\n$/, '').split('\n').map((_, i) => <span key={i}>{i + 1}</span>)}
                  </div>
                  <pre className="blob-code-pre"><code dangerouslySetInnerHTML={{ __html: highlight(fileText, fileLang) }} /></pre>
                </div>
              )}
              {!fileState.loading && !fileState.error && !fileText && !isImage(currentPath) && (
                <div className="blob-empty">二进制或空文件，使用「原始文件」在 GitHub 查看</div>
              )}
            </div>
          )}

          {!treeState.loading && !treeState.error && !isFile && (
            <>
              {entries.length > 0 && latest && (
                <div className="latest-commit bar">
                  <Avatar user={latest.author || undefined} login={latest.commit.author?.name} size={20} />
                  <span className="latest-commit-author">{latest.author?.login || latest.commit.author?.name}</span>
                  <span className="latest-commit-msg">{firstLine(latest.commit.message, 80)}</span>
                  <span className="latest-commit-sha">{latest.sha.slice(0, 7)}</span>
                  <span className="latest-commit-time">{timeAgo(latest.commit.author?.date)}</span>
                  <a className="latest-commit-history" href={`https://github.com/${full}/commits/${encodeURIComponent(branch)}`} target="_blank" rel="noreferrer">
                    <Octicon name="history" size={14} /> 历史
                  </a>
                </div>
              )}

              <div className="file-table card">
                <div className="file-table-head">
                  <span>名称</span>
                  <span className="file-head-commit">最后提交信息</span>
                  <span className="file-head-time">最后提交时间</span>
                </div>
                {entries.map((e) => {
                  const c = entryCommits[e.path]
                  const name = e.path.slice(dirPrefix.length)
                  return (
                    <div className="file-row" key={e.path}>
                      <div className="file-name-cell">
                        <Octicon name={e.type === 'tree' ? 'file-directory-fill' : 'file'} size={16} className={e.type === 'tree' ? 'icon-dir' : 'icon-file'} />
                        <a className="file-name" href={e.type === 'tree' ? treeHref(owner, repoName, branch, e.path) : blobHref(owner, repoName, branch, e.path)}>
                          {name}
                        </a>
                      </div>
                      <div className="file-commit-cell">
                        {c ? (
                          <>
                            <a className="file-commit-msg" href={`https://github.com/${full}/commit/${c.sha}`} target="_blank" rel="noreferrer">{firstLine(c.commit.message, 64)}</a>
                            <span className="file-commit-author"><Avatar user={c.author || undefined} login={c.commit.author?.name} size={16} /> {c.author?.login || c.commit.author?.name || ''}</span>
                          </>
                        ) : c === null ? <span className="file-commit-empty">—</span> : commitsLoading ? <Skeleton width={160} height={14} /> : <span className="file-commit-empty">—</span>}
                      </div>
                      <div className="file-time-cell">
                        {c ? <span title={c.commit.author?.date}>{timeAgo(c.commit.author?.date)}</span> : null}
                      </div>
                    </div>
                  )
                })}
                {entries.length === 0 && (
                  <div className="file-empty">
                    <Octicon name="file-directory" size={16} /> 此目录为空。
                  </div>
                )}
              </div>

              {readmeText && (
                <div className="readme-card card">
                  <div className="readme-head">
                    <div className="readme-head-name">
                      <Octicon name="book" size={16} />
                      <span>{readmeData?.name || 'README.md'}</span>
                      <span className="readme-head-path">{readmeData?.path || 'README.md'}</span>
                    </div>
                    <div className="readme-head-actions">
                      <span>{readmeData?.size != null ? formatBytes(readmeData.size) : ''}</span>
                      <a className="btn btn-sm btn-default" href={`https://github.com/${full}/blob/${encodeURIComponent(branch)}/${encodePath(readmeData?.path || 'README.md')}`} target="_blank" rel="noreferrer">
                        <Octicon name="pencil" size={14} /> 编辑
                      </a>
                    </div>
                  </div>
                  <Markdown
                    text={readmeText}
                    owner={owner}
                    repo={repoName}
                    branch={branch}
                    baseDir={(readmeData?.path || '').includes('/') ? (readmeData?.path || '').split('/').slice(0, -1).join('/') : ''}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <aside className="repo-about">
          <div className="about-section">
            <h2 className="about-title">关于</h2>
            {repo.description ? (
              <p className="about-desc">{repo.description}</p>
            ) : (
              <p className="about-desc about-desc-empty">暂无描述、网站或话题。</p>
            )}
            {repo.homepage && (
              <a className="about-homepage" href={repo.homepage.startsWith('http') ? repo.homepage : `https://${repo.homepage}`} target="_blank" rel="noreferrer">
                <Octicon name="link" size={16} /> {repo.homepage.replace(/^https?:\/\//, '')}
              </a>
            )}
            {(repo.topics || []).length > 0 && (
              <div className="about-topics">
                {repo.topics!.map((t) => (
                  <a className="topic-tag" key={t} href={`https://github.com/topics/${encodeURIComponent(t)}`} target="_blank" rel="noreferrer">{t}</a>
                ))}
              </div>
            )}
            <div className="about-stats">
              <a href={`https://github.com/${full}/stargazers`} target="_blank" rel="noreferrer">
                <Octicon name="star" size={16} /> <strong>{compact(repo.stargazers_count)}</strong> 星标
              </a>
              <a href={`https://github.com/${full}/forks`} target="_blank" rel="noreferrer">
                <Octicon name="repo-forked" size={16} /> <strong>{compact(repo.forks_count)}</strong> 分叉
              </a>
              <a href={`https://github.com/${full}/watchers`} target="_blank" rel="noreferrer">
                <Octicon name="eye" size={16} /> <strong>{compact(repo.watchers_count)}</strong> 关注
              </a>
            </div>
            {repo.license && (
              <div className="about-row">
                <Octicon name="law" size={16} /> {repo.license.name}
              </div>
            )}
            {langs.length > 0 && (
              <div className="about-langs">
                <div className="lang-bar">
                  {langs.slice(0, 6).map((l) => (
                    <span key={l.name} style={{ width: `${l.pct}%`, background: l.color }} title={`${l.name} ${l.pct.toFixed(1)}%`} />
                  ))}
                </div>
                <div className="lang-list">
                  {langs.slice(0, 5).map((l) => (
                    <span key={l.name} className="lang-item">
                      <i className="lang-dot" style={{ background: l.color }} />
                      <span>{l.name}</span>
                      <span className="lang-pct">{l.pct.toFixed(1)}%</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {release && (
            <div className="about-section about-releases">
              <div className="about-section-head">
                <h2 className="about-title">发行版</h2>
                <a href={`#${repoHref(owner, repoName, '/releases')}`}>查看全部</a>
              </div>
              <a className="release-item" href={`#${repoHref(owner, repoName, '/releases')}`}>
                <span className="release-tag"><Octicon name="tag" size={14} /> {release.tag_name}</span>
                <span className="release-date">{timeAgo(release.published_at || release.created_at)}</span>
              </a>
            </div>
          )}

          <div className="about-section">
            <div className="about-section-head">
              <h2 className="about-title">贡献者</h2>
              <span>{contributorsState.data?.length || 0}</span>
            </div>
            <div className="contributors">
              {(contributorsState.data || []).slice(0, 10).map((c) => (
                <a href={`#/user/${c.login}`} key={c.login} title={c.login}>
                  <Avatar user={c} size={32} />
                </a>
              ))}
              {contributorsState.loading && <Skeleton width={32} circle height={32} />}
            </div>
          </div>

          <div className="about-section about-report">
            <a href={`https://github.com/${full}/issues/new/choose`} target="_blank" rel="noreferrer">
              <Octicon name="report" size={16} /> 报告仓库
            </a>
          </div>
        </aside>
      </div>

      {branchOpen && (
        <BranchPicker
          owner={owner}
          repo={repoName}
          branches={branchesState.data || []}
          current={branch}
          loading={branchesState.loading}
          onClose={() => setBranchOpen(false)}
          onSelect={(b) => {
            setBranchOpen(false)
            if (route.mode === 'blob' && currentPath) navigate(blobHref(owner, repoName, b, currentPath).slice(1))
            else if (currentPath) navigate(treeHref(owner, repoName, b, currentPath).slice(1))
            else navigate(repoHref(owner, repoName, `/tree/${encodeURIComponent(b)}`))
          }}
        />
      )}

      {goToFileOpen && (
        <GoToFileDialog
          owner={owner}
          repo={repoName}
          branch={branch}
          tree={tree}
          onClose={() => setGoToFileOpen(false)}
          onSelect={(p) => {
            setGoToFileOpen(false)
            navigate(blobHref(owner, repoName, branch, p).slice(1))
          }}
        />
      )}

      {fileDialog && (
        <FileDialog
          repo={full}
          branch={branch}
          mode={fileDialog}
          path={fileDialog === 'edit' ? currentPath : undefined}
          pathPrefix={currentPath && !isFile ? currentPath + '/' : ''}
          initialContent={fileDialog === 'edit' ? fileText : ''}
          sha={fileDialog === 'edit' ? fileState.data?.sha : undefined}
          onClose={() => setFileDialog(null)}
          onSaved={(p) => {
            setFileDialog(null)
            invalidateCache()
            showToast('更改已提交', 'success')
            treeState.reload()
            if (fileDialog === 'edit') fileState.reload()
            navigate(`/${owner}/${repoName}/blob/${encodeURIComponent(branch)}/${p.split('/').map(encodeURIComponent).join('/')}`)
          }}
        />
      )}

      {deleteOpen && (
        <Dialog
          title="删除文件"
          subtitle={`${full} · ${currentPath}`}
          onClose={() => setDeleteOpen(false)}
          width={480}
          footer={(
            <div className="dialog-actions">
              <Button onClick={() => setDeleteOpen(false)} disabled={deleting}>取消</Button>
              <Button variant="danger" icon="trash" onClick={deleteFile} disabled={deleting}>
                {deleting ? '删除中…' : '确认删除'}
              </Button>
            </div>
          )}
        >
          <p className="settings-paragraph">删除后会立即提交到 <code>{branch}</code> 分支，可从提交历史恢复。</p>
          <p className="settings-paragraph">{currentPath}</p>
        </Dialog>
      )}
    </div>
  )
}
