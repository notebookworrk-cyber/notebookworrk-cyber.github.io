import { useCallback, useEffect, useRef, useState } from 'react'

interface Sentinel {
  released: boolean
  release: () => Promise<void>
  addEventListener: (type: string, fn: () => void) => void
}

interface WakeLockLike {
  request: (type: 'screen') => Promise<Sentinel>
}

const KEY = 'meridian:wake-lock'

export function useWakeLock(active: boolean) {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator
  const sentinel = useRef<Sentinel | null>(null)
  const [enabled, setEnabledState] = useState(() => localStorage.getItem(KEY) !== 'off')
  const [locked, setLocked] = useState(false)

  const release = useCallback(async () => {
    if (!sentinel.current) return
    try { await sentinel.current.release() } catch { /* already released */ }
    sentinel.current = null
    setLocked(false)
  }, [])

  const request = useCallback(async () => {
    const wl = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock
    if (!wl) return
    try {
      const s = await wl.request('screen')
      sentinel.current = s
      setLocked(true)
      s.addEventListener('release', () => { sentinel.current = null; setLocked(false) })
    } catch {
      setLocked(false)
    }
  }, [])

  useEffect(() => {
    if (active && enabled) void request()
    else void release()
    return () => { void release() }
  }, [active, enabled, request, release])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && active && enabled && !sentinel.current) void request()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [active, enabled, request])

  const setEnabled = (value: boolean) => {
    localStorage.setItem(KEY, value ? 'on' : 'off')
    setEnabledState(value)
  }

  return { supported, enabled, locked, setEnabled }
}
