import type { ContributionCalendar } from '../types'
import { Skeleton } from '../components/ui'

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const LEVELS = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE']

function levelClass(level: string): string {
  const idx = LEVELS.indexOf(level)
  return `contrib-cell level-${idx < 0 ? 0 : idx}`
}

export function ContributionGraph({
  calendar, loading, title, compact,
}: {
  calendar: ContributionCalendar | null
  loading?: boolean
  title?: string
  compact?: boolean
}) {
  if (loading) {
    return (
      <div className={`contrib-card card ${compact ? 'contrib-compact' : ''}`}>
        <div className="contrib-head"><Skeleton width={240} height={18} /></div>
        <div className="contrib-loading">
          {Array.from({ length: compact ? 30 : 53 }).map((_, i) => (
            <Skeleton key={i} width={10} height={compact ? 60 : 86} />
          ))}
        </div>
      </div>
    )
  }

  if (!calendar || !calendar.weeks?.length) {
    return (
      <div className={`contrib-card card ${compact ? 'contrib-compact' : ''}`}>
        <div className="contrib-head">
          <span className="contrib-total">{title || '贡献日历暂不可用'}</span>
          <span className="contrib-note">GitHub GraphQL 暂未返回贡献日历</span>
        </div>
      </div>
    )
  }

  const weeks = calendar.weeks
  const months: { index: number; label: string }[] = []
  let lastMonth = -1
  weeks.forEach((w, i) => {
    const first = w.contributionDays[0]?.date
    if (!first) return
    const m = new Date(first + 'T00:00:00Z').getUTCMonth()
    if (m !== lastMonth) {
      if (i !== 0 || m !== months.length) months.push({ index: i, label: MONTHS[m] })
      lastMonth = m
    }
  })

  return (
    <div className={`contrib-card card ${compact ? 'contrib-compact' : ''}`}>
      <div className="contrib-head">
        <span className="contrib-total">
          过去一年共 {calendar.totalContributions.toLocaleString()} 次贡献
        </span>
        {title && <span className="contrib-note">{title}</span>}
        <span className="contrib-head-spacer" />
        <span className="contrib-settings" title="贡献统计来自 GitHub">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm0 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm0 2a.75.75 0 0 1 .75.75v3.19l2.72 1.57a.75.75 0 0 1-.75 1.3L7.25 8.3A.75.75 0 0 1 7.25 7V3.75A.75.75 0 0 1 8 3.5Z" />
          </svg>
        </span>
      </div>

      <div className="contrib-scroll">
        <div className="contrib-body">
          <div className="contrib-days">
            <span />
            <span>一</span>
            <span />
            <span>三</span>
            <span />
            <span>五</span>
            <span />
          </div>
          <div className="contrib-weeks">
            <div className="contrib-months" style={{ gridTemplateColumns: `repeat(${weeks.length}, var(--cell))` }}>
              {months.map((m) => (
                <span key={m.index} style={{ gridColumnStart: m.index + 1 }}>{m.label}</span>
              ))}
            </div>
            <div className="contrib-grid" style={{ gridTemplateColumns: `repeat(${weeks.length}, var(--cell))` }}>
              {weeks.map((w, wi) => (
                <div className="contrib-week" key={wi}>
                  {w.contributionDays.map((d) => (
                    <span
                      key={d.date}
                      className={levelClass(d.contributionLevel)}
                      title={`${new Date(d.date + 'T00:00:00Z').toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}：${d.contributionCount} 次贡献`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="contrib-foot">
        <span className="contrib-link" title="GitHub 根据提交、议题和拉取请求计算贡献">
          如何计算贡献
        </span>
        <span className="contrib-legend">
          少
          {[0, 1, 2, 3, 4].map((i) => <i key={i} className={`contrib-cell level-${i}`} />)}
          多
        </span>
      </div>
    </div>
  )
}
