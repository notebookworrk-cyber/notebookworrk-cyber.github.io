import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { haptic, tick } from './feedback'

const VB = 300
const C = VB / 2
const MIN = 5
const MAX = 90
const STEP = 5
const DETENTS = (MAX - MIN) / STEP + 1
const A0 = -135
const SWEEP = 270
const R_ARC = 132
const HOLD_MS = 600

function polar(r: number, angle: number): { x: number; y: number } {
  const rad = ((angle - 90) * Math.PI) / 180
  return { x: C + r * Math.cos(rad), y: C + r * Math.sin(rad) }
}

function arcPath(from: number, to: number, r: number): string {
  const a = polar(r, from)
  const b = polar(r, to)
  const large = to - from > 180 ? 1 : 0
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
}

function normAngle(x: number, y: number): number {
  const deg = (Math.atan2(x - C, C - y) * 180) / Math.PI
  return (deg + 360) % 360
}

function fractionOf(angle: number): number {
  if (angle >= 225) return (angle - 225) / 270
  if (angle <= 135) return (angle + 135) / 270
  return angle < 180 ? 1 : 0
}

export interface DialProps {
  minutes: number
  progress: number
  active: boolean
  display: string
  caption: string
  onTurn: (minutes: number) => void
  onPress: () => void
  onHold: () => void
  size?: number
}

export function Dial({ minutes, progress, active, display, caption, onTurn, onPress, onHold, size }: DialProps) {
  const [pressed, setPressed] = useState(false)
  const dragging = useRef(false)
  const pressing = useRef(false)
  const suppressed = useRef(false)
  const holdTimer = useRef<number | null>(null)
  const lastDetent = useRef(minutes)

  useEffect(() => {
    lastDetent.current = minutes
  }, [minutes])

  useEffect(() => {
    return () => {
      if (holdTimer.current != null) window.clearTimeout(holdTimer.current)
    }
  }, [])

  const fraction = Math.max(0.001, Math.min(1, progress))
  const end = A0 + SWEEP * fraction
  const arc = arcPath(A0, end, R_ARC)
  const pressDot = polar(137, 180)
  const pointerIn = polar(105, end)
  const pointerOut = polar(131, end)
  const pointerDot = polar(132, end)

  function point(e: ReactPointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * VB,
      y: ((e.clientY - rect.top) / rect.height) * VB,
    }
  }

  function turnTo(x: number, y: number) {
    const idx = Math.round(fractionOf(normAngle(x, y)) * (DETENTS - 1))
    const next = MIN + idx * STEP
    if (next === lastDetent.current) return
    lastDetent.current = next
    tick()
    haptic()
    onTurn(next)
  }

  function clearHold() {
    if (holdTimer.current != null) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
    setPressed(false)
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic pointers cannot be captured */
    }
    const p = point(e)
    if (Math.hypot(p.x - C, p.y - C) < 102) {
      pressing.current = true
      suppressed.current = false
      setPressed(true)
      holdTimer.current = window.setTimeout(() => {
        suppressed.current = true
        haptic(24)
        onHold()
      }, HOLD_MS)
    } else {
      dragging.current = true
      turnTo(p.x, p.y)
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging.current) return
    const p = point(e)
    turnTo(p.x, p.y)
  }

  function onPointerUp() {
    const shouldPress = pressing.current && !suppressed.current
    clearHold()
    dragging.current = false
    pressing.current = false
    if (shouldPress) onPress()
  }

  function onPointerCancel() {
    clearHold()
    dragging.current = false
    pressing.current = false
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(MAX, minutes + STEP)
      if (next !== minutes) { tick(); haptic(); onTurn(next) }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.max(MIN, minutes - STEP)
      if (next !== minutes) { tick(); haptic(); onTurn(next) }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPress()
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault()
      onHold()
    }
  }

  return (
    <div
      className={`dial-shell${active ? ' is-active' : ''}${pressed ? ' is-pressed' : ''}`}
      style={size ? { width: size, height: size } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="slider"
      aria-label="Session length in minutes. Turn to set, press to begin, hold to bank."
      aria-valuemin={MIN}
      aria-valuemax={MAX}
      aria-valuenow={active ? undefined : minutes}
      aria-valuetext={display}
    >
      <svg viewBox={`0 0 ${VB} ${VB}`} aria-hidden="true" className="dial-svg">
        <circle cx={C} cy={C} r={R_ARC} fill="none" className="dial-track" strokeWidth="1" />
        {Array.from({ length: DETENTS }, (_, i) => {
          const angle = A0 + (SWEEP * i) / (DETENTS - 1)
          const major = i % 6 === 0
          const a = polar(major ? 112 : 119, angle)
          const b = polar(126, angle)
          return (
            <line
              key={i}
              x1={a.x.toFixed(2)} y1={a.y.toFixed(2)}
              x2={b.x.toFixed(2)} y2={b.y.toFixed(2)}
              className={major ? 'dial-tick dial-tick-major' : 'dial-tick'}
              strokeWidth={major ? 1.4 : 1}
            />
          )
        })}
        <path d={arc} className="dial-arc" fill="none" strokeWidth="3" />
        <line
          x1={pointerIn.x.toFixed(2)} y1={pointerIn.y.toFixed(2)}
          x2={pointerOut.x.toFixed(2)} y2={pointerOut.y.toFixed(2)}
          className="dial-pointer" strokeWidth="2"
        />
        <circle cx={pointerDot.x} cy={pointerDot.y} r="3" className="dial-pointer-dot" />
        <circle cx={pressDot.x} cy={pressDot.y} r="2.1" className="dial-press-dot" />
        <circle cx={C} cy={C} r="103" className="dial-disc" strokeWidth="1" />
        <circle cx={C} cy={C} r="97" className="dial-disc-inner" strokeWidth="1" />
      </svg>
      <div className="dial-face">
        <div className="dial-value">{display}</div>
        <div className="dial-caption">{caption}</div>
      </div>
    </div>
  )
}

export const DIAL_MIN = MIN
export const DIAL_MAX = MAX
