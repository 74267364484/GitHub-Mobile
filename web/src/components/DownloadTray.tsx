import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { clearFinishedDownloads, dismissDownload, getDownloads, subscribeDownloads } from '../lib/downloads'
import { formatBytes } from '../lib/format'
import { Octicon } from './Octicon'

export function DownloadTray() {
  const items = useSyncExternalStore(subscribeDownloads, getDownloads)
  const [open, setOpen] = useState(false)
  const prevActive = useRef(0)
  const active = items.filter((i) => i.state === 'downloading' || i.state === 'queued').length

  useEffect(() => {
    if (active > prevActive.current) setOpen(true)
    prevActive.current = active
  }, [active])

  if (!items.length) return null

  return (
    <div className={`download-tray ${open ? 'is-open' : ''}`} role="region" aria-label="下载">
      <button className="download-tray-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={`download-tray-icon ${active ? 'is-active' : ''}`}>
          <Octicon name="download" size={16} />
        </span>
        <span className="download-tray-title">
          {active ? `正在下载 ${active} 个文件` : '下载完成'}
        </span>
        <span className="download-tray-count">{items.length}</span>
        <Octicon name="chevron-down" size={14} className="download-tray-caret" />
      </button>

      {open && (
        <div className="download-tray-list">
          {items.map((item) => {
            const percent = item.total > 0 ? Math.min(100, Math.round((item.received / item.total) * 100)) : 0
            return (
              <div className={`download-item state-${item.state}`} key={item.id}>
                <span className="download-item-icon">
                  <Octicon
                    name={item.state === 'done' ? 'check-circle-fill' : item.state === 'error' ? 'x-circle-fill' : 'download'}
                    size={16}
                  />
                </span>
                <div className="download-item-main">
                  <div className="download-item-name" title={item.name}>{item.name}</div>
                  <div className="download-item-meta">
                    {item.state === 'done' && (
                      <span>{item.total ? formatBytes(item.total) : '已完成'} · {item.local?.startsWith('content:') ? '已保存到下载目录' : '已保存'}</span>
                    )}
                    {item.state === 'error' && <span className="download-error">{item.error}</span>}
                    {item.state === 'downloading' && (
                      <span>
                        {formatBytes(item.received)}
                        {item.total > 0 ? ` / ${formatBytes(item.total)} · ${percent}%` : ''}
                      </span>
                    )}
                    {item.state === 'queued' && <span>排队中…</span>}
                  </div>
                  {item.state === 'downloading' && (
                    <div className="download-progress">
                      <span
                        className={item.total > 0 ? 'determinate' : 'indeterminate'}
                        style={item.total > 0 ? { width: `${Math.max(2, percent)}%` } : undefined}
                      />
                    </div>
                  )}
                </div>
                {item.state !== 'downloading' && (
                  <button className="download-item-close" onClick={() => dismissDownload(item.id)} aria-label="移除记录">
                    <Octicon name="x-circle-fill" size={14} />
                  </button>
                )}
              </div>
            )
          })}
          <button className="download-tray-clear" onClick={clearFinishedDownloads}>清除已完成</button>
        </div>
      )}
    </div>
  )
}
