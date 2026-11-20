import { useEffect, useRef, useState } from 'react'
import { Octicon } from './Octicon'

export function LoadingBar() {
  const [pending, setPending] = useState(0)
  const [visible, setVisible] = useState(false)
  const [done, setDone] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    const onLoading = (e: Event) => {
      const value = Number((e as CustomEvent).detail) || 0
      setPending(value)
    }
    window.addEventListener('octo-loading', onLoading)
    return () => window.removeEventListener('octo-loading', onLoading)
  }, [])

  useEffect(() => {
    if (pending > 0) {
      if (timer.current) window.clearTimeout(timer.current)
      setVisible(true)
      setDone(false)
    } else if (visible) {
      setDone(true)
      timer.current = window.setTimeout(() => {
        setVisible(false)
        setDone(false)
      }, 420)
    }
  }, [pending, visible])

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])

  if (!visible) return null
  return (
    <div className={`loading-bar ${done ? 'loading-bar-done' : ''}`} aria-hidden="true">
      <span />
    </div>
  )
}
