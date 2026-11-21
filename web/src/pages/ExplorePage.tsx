import { useMemo } from 'react'
import type { Repository } from '../types'
import { useApi, useDocumentTitle } from '../lib/hooks'
import { Octicon, type IconName } from '../components/Octicon'
import { Skeleton } from '../components/ui'
import { compact, languageColor, timeAgo } from '../lib/format'
import { navigate } from '../lib/router'

const TOPICS: { name: string; icon: IconName; color: string; desc: string }[] = [
  { name: 'javascript', icon: 'code', color: '#f1e05a', desc: 'Web、Node.js 等' },
  { name: 'typescript', icon: 'code', color: '#3178c6', desc: '大规模类型化 JavaScript' },
  { name: 'python', icon: 'code', color: '#3572A5', desc: '数据、AI 与脚本' },
  { name: 'android', icon: 'device-desktop', color: '#3ddc84', desc: 'Android 应用' },
  { name: 'kotlin', icon: 'code', color: '#A97BFF', desc: '现代 JVM 语言' },
  { name: 'ai', icon: 'sparkle', color: '#8250df', desc: '模型与智能体' },
  { name: 'react', icon: 'code', color: '#61dafb', desc: 'UI 组件' },
  { name: 'rust', icon: 'cpu', color: '#dea584', desc: '快速、安全的系统' },
  { name: 'golang', icon: 'server', color: '#00ADD8', desc: '简单可靠的服务' },
  { name: 'docker', icon: 'package', color: '#2496ed', desc: '容器与镜像' },
]

export function ExplorePage() {
  useDocumentTitle('探索')
  const popular = useApi<{ items: Repository[] }>(
    `/search/repositories?q=${encodeURIComponent('stars:>50000')}&sort=stars&order=desc&per_page=12`,
  )
  const starred = useApi<Repository[]>('/user/starred?per_page=6')
  const repos = popular.data?.items || []

  const topicCards = useMemo(() => TOPICS.map((t, i) => ({ ...t, rank: i })), [])

  return (
    <div className="explore-page">
      <div className="explore-hero">
        <div className="explore-hero-icon"><Octicon name="telescope" size={26} /></div>
        <div>
          <h1>探索 GitHub</h1>
          <p>发现仓库、话题，以及社区正在构建的项目。</p>
        </div>
      </div>

      <section className="explore-section">
        <div className="explore-section-head">
          <h2>话题</h2>
          <span>点击话题在 GitHub Mobile 中搜索仓库</span>
        </div>
        <div className="topic-grid">
          {topicCards.map((t) => (
            <button
              key={t.name}
              className="topic-card"
              onClick={() => navigate(`/search?q=${encodeURIComponent(`topic:${t.name}`)}&type=repositories`)}
            >
              <span className="topic-icon" style={{ color: t.color, background: `${t.color}1f` }}>
                <Octicon name={t.icon} size={18} />
              </span>
              <span className="topic-name">{t.name}</span>
              <span className="topic-desc">{t.desc}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="explore-section">
        <div className="explore-section-head">
          <h2>热门仓库</h2>
          <span>按 GitHub 搜索的累计星标数</span>
        </div>
        {popular.loading && <div className="card pad"><Skeleton height={60} /><Skeleton height={60} /><Skeleton height={60} /></div>}
        {!popular.loading && (
          <div className="explore-repo-grid">
            {repos.map((r) => (
              <a className="explore-repo-card card" key={r.id} href={`#/${r.owner.login}/${r.name}`}>
                <div className="explore-repo-head">
                  <Octicon name="repo" size={16} />
                  <span className="explore-repo-name">{r.full_name}</span>
                  <span className="explore-repo-stars"><Octicon name="star" size={12} /> {compact(r.stargazers_count)}</span>
                </div>
                {r.description && <p className="explore-repo-desc">{r.description}</p>}
                <div className="explore-repo-meta">
                  {r.language && <><i className="lang-dot" style={{ background: languageColor(r.language) }} />{r.language}</>}
                  <span>更新于 {timeAgo(r.updated_at)}</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="explore-section">
        <div className="explore-section-head">
          <h2>你星标的仓库</h2>
          <span>{starred.data?.length ? `最近星标了 ${starred.data.length} 个` : '还没有星标仓库'}</span>
        </div>
        {starred.loading && <Skeleton height={50} />}
        {!starred.loading && (starred.data || []).length > 0 && (
          <div className="explore-starred-list card">
            {(starred.data || []).map((r) => (
              <a className="explore-starred-item" key={r.id} href={`#/${r.owner.login}/${r.name}`}>
                <Octicon name="star" size={16} className="starred-icon" />
                <span className="explore-starred-name">{r.full_name}</span>
                {r.description && <span className="explore-starred-desc">{r.description}</span>}
                <span className="explore-starred-meta">{r.language || ''}</span>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
