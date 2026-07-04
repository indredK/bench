/**
 * 动画降级工具 — 系统开启"减少动画"偏好时，位移/缩放/旋转降级为纯 opacity。
 *
 * 用法：
 * ```tsx
 * const { reduce } = useReducedMotionProps()
 * <motion.div
 *   initial={reduce({ opacity: 0, y: 4 })}
 *   animate={reduce({ opacity: 1, y: 0 })}
 * >
 * ```
 *
 * 纯 opacity 动画无需调用此工具。
 */
import { useReducedMotion } from "motion/react"

type MotionValues = Record<string, number | string>

const TRANSFORM_KEYS = new Set(["x", "y", "scale", "rotate"])

export function useReducedMotionProps() {
  const shouldReduceMotion = useReducedMotion()

  function reduce(props: MotionValues): MotionValues {
    if (!shouldReduceMotion) return props
    const result: MotionValues = {}
    for (const key of Object.keys(props)) {
      if (!TRANSFORM_KEYS.has(key)) {
        result[key] = props[key]
      }
    }
    return result
  }

  return { shouldReduceMotion, reduce }
}
