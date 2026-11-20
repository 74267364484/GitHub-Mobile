import { useCallback, useEffect, useRef, useState } from 'react'
import { gh } from './api'

export interface AsyncState<T> {
  data: T | null
  error: Error | null
  loading: boolean
  reload: () => void
}

export function useApi<T>(path: string | null): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(Boolean(path))
  const [tick, setTick] = useState(0)
  const seq = useRef(0)

  useEffect(() => {
    if (!path) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }
    const id = ++seq.current
    let alive = true
    setLoading(true)
    setError(null)
    gh<T>(path)
      .then((d) => {
        if (alive && id === seq.current) {
          setData(d)
          setLoading(false)
        }
      })
      .catch((e) => {
        if (alive && id === seq.current) {
          setError(e instanceof Error ? e : new Error(String(e)))
          setLoading(false)
        }
      })
    return () => { alive = false }
  }, [path, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, reload }
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · OctoMobile` : 'OctoMobile'
  }, [title])
}

export function useLocalStorage<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
      return fallback
    }
  })
  const set = useCallback((v: T) => {
    setValue(v)
    try { localStorage.setItem(key, JSON.stringify(v)) } catch {}
  }, [key])
  return [value, set]
}
