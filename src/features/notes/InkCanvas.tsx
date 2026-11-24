import { useCallback, useEffect, useRef, useState } from 'react'
import type { InkStroke } from '../../db/types'

export type InkTool = 'pen' | 'highlighter' | 'eraser'

interface Props {
  strokes: InkStroke[]
  page: number
  tool: InkTool
  color: string
  width: number
  enabled: boolean
  onChange: (strokes: InkStroke[]) => void
}

function draw(ctx: CanvasRenderingContext2D, stroke: InkStroke, w: number, h: number) {
  const pts = stroke.points
  if (!pts.length) return
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = stroke.color
  ctx.lineWidth = stroke.width * (stroke.tool === 'highlighter' ? 3.4 : 1) * (w / 700)
  if (stroke.tool === 'highlighter') {
    ctx.globalAlpha = 0.3
    ctx.globalCompositeOperation = 'multiply'
  }
  ctx.beginPath()
  const p = (i: number): [number, number] => [pts[i][0] * w, pts[i][1] * h]
  if (pts.length === 1) {
    const [x, y] = p(0)
    ctx.moveTo(x, y)
    ctx.lineTo(x + 0.1, y + 0.1)
  } else {
    const [x0, y0] = p(0)
    ctx.moveTo(x0, y0)
    for (let i = 1; i < pts.length - 1; i++) {
      const [x, y] = p(i)
      const [nx, ny] = p(i + 1)
      ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2)
    }
    const [lx, ly] = p(pts.length - 1)
    ctx.lineTo(lx, ly)
  }
  ctx.stroke()
  ctx.restore()
}

/** Normalised ink layer. Strokes survive zoom, page changes and reloads. */
export function InkCanvas({ strokes, page, tool, color, width, enabled, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const draft = useRef<InkStroke | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return
    const observer = new ResizeObserver(() => {
      const rect = parent.getBoundingClientRect()
      setSize({ w: rect.width, h: rect.height })
    })
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size.w || !size.h) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(size.w * dpr)
    canvas.height = Math.round(size.h * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)
    for (const stroke of strokes) if (stroke.page === page) draw(ctx, stroke, size.w, size.h)
    if (draft.current?.page === page) draw(ctx, draft.current, size.w, size.h)
  }, [strokes, page, size])

  const point = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return [
      Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
      Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))),
      event.pressure || 0.5,
    ] as [number, number, number]
  }, [])

  function down(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!enabled) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const xy = point(event)
    if (tool === 'eraser') {
      onChange(strokes.filter((s) => s.page !== page || !s.points.some((p) => Math.hypot(p[0] - xy[0], p[1] - xy[1]) < 0.025)))
      return
    }
    draft.current = { page, tool, color, width, points: [xy, [xy[0] + 0.0001, xy[1] + 0.0001, xy[2]]] }
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!draft.current) return
    const xy = point(event)
    const pts = draft.current.points
    const last = pts[pts.length - 1]
    if (Math.hypot(xy[0] - last[0], xy[1] - last[1]) < 0.004) return
    pts.push(xy)
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx && size.w) {
      ctx.setTransform(Math.min(2, window.devicePixelRatio || 1), 0, 0, Math.min(2, window.devicePixelRatio || 1), 0, 0)
      draw(ctx, draft.current, size.w, size.h)
    }
  }

  function up() {
    if (!draft.current) return
    const stroke = draft.current
    draft.current = null
    if (stroke.points.length > 1) onChange([...strokes, stroke])
  }

  return (
    <canvas
      ref={canvasRef}
      className="ink-canvas"
      style={{ pointerEvents: enabled ? 'auto' : 'none', touchAction: 'none', cursor: tool === 'eraser' ? 'cell' : 'crosshair' }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      aria-label="Write on the page"
      role="img"
    />
  )
}
