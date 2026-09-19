import { useCallback, useRef, useState } from "react"

// Lock state lives in a ref because React 18+ does not guarantee setState
// updaters run synchronously at dispatch time. A ref check in the same
// tick as the click handler reliably gates re-entry; the mirrored React
// state is only for driving disabled / loading visuals.

export function useGuardedAsync() {
  const lockRef = useRef(false)
  const [pending, setPending] = useState(false)

  // 返回任务结果，调用方才能区分「被锁挡下、根本没跑」和「跑了但返回空值」。
  // 之前固定返回 void，命令中心就据此给一条没执行过的命令弹了「执行成功」。
  const run = useCallback(async <T>(task: () => Promise<T>): Promise<T | undefined> => {
    if (lockRef.current) return undefined
    lockRef.current = true
    setPending(true)
    try {
      return await task()
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

  const run = useCallback(async <T>(key: K, task: () => Promise<T>): Promise<T | undefined> => {
    if (lockRef.current.has(key)) return undefined
    lockRef.current.add(key)
    setPendingKeys((prev) => {
      const next = new Set(prev)
      next.add(key)
      return next
    })
    try {
      return await task()
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
