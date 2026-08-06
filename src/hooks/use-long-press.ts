"use client"

import { useCallback, useRef } from "react"

type Options = {
  /** משך לחיצה ארוכה במילישניות */
  delayMs?: number
  /** האם למנוע תפריט הקשר של הדפדפן */
  preventContextMenu?: boolean
}

/**
 * מטפל בלחיצה ארוכה במובייל (touch) + context menu כגיבוי.
 * מחזיר גם `didFire` כדי למנוע ניווט/לחיצה רגילה אחרי long-press.
 */
export function useLongPress(
  onLongPress: () => void,
  options: Options = {},
) {
  const { delayMs = 480, preventContextMenu = true } = options
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didFireRef = useRef(false)

  const clear = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const fire = useCallback(() => {
    didFireRef.current = true
    onLongPress()
  }, [onLongPress])

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return
      didFireRef.current = false
      clear()
      timerRef.current = setTimeout(fire, delayMs)
    },
    [clear, delayMs, fire],
  )

  const onTouchMove = useCallback(() => {
    clear()
  }, [clear])

  const onTouchEnd = useCallback(() => {
    clear()
  }, [clear])

  const onTouchCancel = useCallback(() => {
    clear()
  }, [clear])

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!preventContextMenu) return
      e.preventDefault()
      fire()
    },
    [fire, preventContextMenu],
  )

  /** קריאה לפני onClick — אם true יש לבטל ניווט */
  const consumeLongPress = useCallback(() => {
    if (!didFireRef.current) return false
    didFireRef.current = false
    return true
  }, [])

  return {
    bind: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel,
      onContextMenu,
    },
    consumeLongPress,
  }
}
