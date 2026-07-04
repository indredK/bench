import { useCallback, useRef, useState } from "react"

// Lock state lives in a ref because React 18+ does not guarantee setState
// updaters run synchronously at dispatch time. A ref check in the same
// tick as the click handler reliably gates re-entry; the mirrored React
// state is only for driving disabled / loading visuals.

export function useGuardedAsync() {
  const lockRef = useRef(false)
  const [pending, setPending] = useState(false)

  const run = useCallback(async (task: () => Promise<void>) => {
    if (lockRef.current) return
    lockRef.current = true
    setPending(true)
    try {
      await task()
    } finally {
      lockRef.current = false
      setPending(false)
    }
  }, [])

  return { pending, run }
}

export function useGuardedAsyncSet<K = string>() {
  const lockRef = useRef<Set<K>>(new Set())
  const [pendingKeys, setPendingKeys] = useState<Set<K>>(() => new Set())

  const run = useCallback(async (key: K, task: () => Promise<void>) => {
    if (lockRef.current.has(key)) return
    lockRef.current.add(key)
    setPendingKeys((prev) => {
      const next = new Set(prev)
      next.add(key)
      return next
    })
    try {
      await task()
    } finally {
      lockRef.current.delete(key)
      setPendingKeys((prev) => {
        if (!prev.has(key)) return prev
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }, [])

  return { pendingKeys, run }
}
