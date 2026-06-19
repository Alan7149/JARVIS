/**
 * JARVIS Arc Reactor Eye Avatar
 * Matches Iron Man HUD style — central glowing orb + circuit lines
 * Animates when JARVIS speaks, and shifts color/speed with system state
 * (idle = cyan, speaking = green, processing = amber, alert = red)
 */
import { useEffect, useRef, useState } from 'react'
import { useWebSocket } from '../contexts/WebSocketContext'
import { useJarvisState, STATE_COLORS, STATE_SPEED } from '../contexts/JarvisStateContext'

const W = 220
const H = 220
const CX = W / 2
const CY = H / 2

// Circuit line segments branching from center
const CIRCUITS = [
  // Top
  { sx:CX, sy:CY-55, points:[[0,-18],[14,0],[0,-8],[8,0],[0,-6]] },
  { sx:CX+10, sy:CY-55, points:[[0,-14],[20,0],[0,-6]] },
  { sx:CX-12, sy:CY-55, points:[[0,-10],[-18,0],[0,-10],[-8,0]] },
  // Top-right
  { sx:CX+50, sy:CY-28, points:[[18,-8],[22,0],[0,-6],[10,0]] },
  { sx:CX+50, sy:CY-18, points:[[14,0],[0,-12],[16,0],[0,-6]] },
  // Right
  { sx:CX+55, sy:CY, points:[[18,-6],[12,0],[0,-8],[10,0],[0,-6]] },
  { sx:CX+55, sy:CY+10, points:[[20,0],[0,8],[12,0]] },
  // Bottom-right
  { sx:CX+48, sy:CY+30, points:[[16,10],[18,0],[0,8],[8,0]] },
  { sx:CX+44, sy:CY+44, points:[[10,10],[14,0],[0,8]] },
  // Bottom
  { sx:CX, sy:CY+55, points:[[0,16],[-10,0],[0,10],[8,0],[0,8]] },
  { sx:CX+12, sy:CY+55, points:[[0,12],[18,0],[0,8]] },
  { sx:CX-10, sy:CY+55, points:[[0,14],[-14,0],[0,8],[-10,0]] },
  // Bottom-left
  { sx:CX-48, sy:CY+30, points:[[-16,10],[-12,0],[0,10],[-8,0]] },
  // Left
  { sx:CX-55, sy:CY, points:[[-18,0],[0,8],[-14,0],[0,-6],[-8,0]] },
  { sx:CX-55, sy:CY-12, points:[[-22,-6],[-10,0],[0,-8],[-12,0]] },
  // Top-left
  { sx:CX-48, sy:CY-28, points:[[-18,-10],[-16,0],[0,-8],[-10,0]] },
  { sx:CX-44, sy:CY-40, points:[[-12,-10],[-8,0],[0,-8]] },
]

export default function JarvisAvatar() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const speakingRef = useRef(false)
  const animRef = useRef<number>()
  const tRef = useRef(0)
  const pulseRef = useRef(0)
  const [visible, setVisible] = useState(true)
  const { lastMessage } = useWebSocket()
  const { state } = useJarvisState()
  const stateRef = useRef(state)

  useEffect(() => { stateRef.current = state }, [state])

  useEffect(() => {
    if (lastMessage?.event === 'jarvis_speaking') {
      speakingRef.current = (lastMessage.data as any)?.speaking ?? false
    }
  }, [lastMessage])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const draw = () => {
      const [sr, sg, sb] = STATE_COLORS[stateRef.current]
      const speed = STATE_SPEED[stateRef.current]
      // Main state color at given alpha
      const c = (a: number) => `rgba(${sr},${sg},${sb},${a})`
      // Brighter/whiter variant (for highlights, iris, pupil)
      const cb = (a: number) => `rgba(${Math.min(255, sr+90)},${Math.min(255, sg+90)},${Math.min(255, sb+90)},${a})`
      // Darker variant (for pupil shadow)
      const cd = (a: number) => `rgba(${Math.round(sr*0.25)},${Math.round(sg*0.25)},${Math.round(sb*0.25)},${a})`

      tRef.current += 0.016 * speed
      const t = tRef.current
      const speaking = speakingRef.current

      if (speaking) pulseRef.current = Math.min(1, pulseRef.current + 0.05)
      else pulseRef.current = Math.max(0, pulseRef.current - 0.03)
      const pulse = pulseRef.current

      ctx.clearRect(0, 0, W, H)

      // ── Outer ambient glow ──────────────────────────────────────────
      const amb = ctx.createRadialGradient(CX, CY, 0, CX, CY, W * 0.5)
      amb.addColorStop(0, c(0.03 + pulse * 0.05))
      amb.addColorStop(0.6, c(0.02 + pulse * 0.02))
      amb.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = amb
      ctx.fillRect(0, 0, W, H)

      // ── Circuit lines ──────────────────────────────────────────────
      const circAlpha = 0.25 + pulse * 0.2
      ctx.strokeStyle = c(circAlpha)
      ctx.lineWidth = 0.8
      ctx.shadowColor = c(0.4)
      ctx.shadowBlur = 2

      CIRCUITS.forEach(({ sx, sy, points }) => {
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        let cx2 = sx, cy2 = sy
        points.forEach(([dx, dy]) => {
          cx2 += dx; cy2 += dy
          ctx.lineTo(cx2, cy2)
          // Small terminal dot
          ctx.fillStyle = c(circAlpha + 0.1)
          ctx.fillRect(cx2 - 1, cy2 - 1, 2, 2)
        })
        ctx.stroke()
        // Animate a traveling pulse along circuits
        const progress = ((t * 0.4 + sx * 0.01) % 1)
        const totalLen = points.reduce((acc, [dx, dy]) => acc + Math.sqrt(dx*dx+dy*dy), 0)
        let traveled = 0, gx = sx, gy = sy
        for (const [dx, dy] of points) {
          const segLen = Math.sqrt(dx*dx+dy*dy)
          if (traveled + segLen >= totalLen * progress) {
            const frac = (totalLen * progress - traveled) / segLen
            gx += dx * frac; gy += dy * frac; break
          }
          traveled += segLen; gx += dx; gy += dy
        }
        ctx.beginPath()
        ctx.arc(gx, gy, 1.5, 0, Math.PI * 2)
        ctx.fillStyle = cb(0.6 + pulse * 0.4)
        ctx.shadowBlur = 6
        ctx.fill()
        ctx.shadowBlur = 0
      })

      // ── Outer ring ─────────────────────────────────────────────────
      ctx.save()
      ctx.translate(CX, CY)
      ctx.rotate(t * 0.15)

      const outerR = 52
      ctx.strokeStyle = c(0.35 + pulse * 0.2)
      ctx.lineWidth = 1
      ctx.setLineDash([4, 2, 1, 2])
      ctx.beginPath()
      ctx.arc(0, 0, outerR, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])

      // Tick marks on outer ring
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2
        const len = i % 6 === 0 ? 6 : i % 3 === 0 ? 4 : 2
        const r1 = outerR - 2; const r2 = outerR - 2 - len
        ctx.strokeStyle = c(i % 6 === 0 ? 0.8 : 0.4)
        ctx.lineWidth = i % 6 === 0 ? 1.5 : 0.8
        ctx.beginPath()
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1)
        ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2)
        ctx.stroke()
      }
      ctx.restore()

      // ── Mid ring (counter-rotate) ───────────────────────────────────
      ctx.save()
      ctx.translate(CX, CY)
      ctx.rotate(-t * 0.25)

      const midR = 38
      ctx.strokeStyle = c(0.4 + pulse * 0.25)
      ctx.lineWidth = 1.5
      ctx.shadowColor = c(0.5); ctx.shadowBlur = 4
      ctx.beginPath()
      ctx.arc(0, 0, midR, 0, Math.PI * 2)
      ctx.stroke()
      ctx.shadowBlur = 0

      // Segments
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        ctx.strokeStyle = c(0.6 + pulse * 0.3)
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(Math.cos(a) * (midR - 4), Math.sin(a) * (midR - 4))
        ctx.lineTo(Math.cos(a) * (midR - 10), Math.sin(a) * (midR - 10))
        ctx.stroke()
      }
      ctx.restore()

      // ── Inner orbital ring ─────────────────────────────────────────
      ctx.save()
      ctx.translate(CX, CY)
      ctx.rotate(t * 0.6)

      const innerR = 22
      ctx.strokeStyle = c(0.5 + pulse * 0.4)
      ctx.lineWidth = 1
      ctx.shadowColor = c(0.8); ctx.shadowBlur = 6
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2
        ctx.beginPath()
        ctx.arc(0, 0, innerR, a, a + Math.PI / 3 - 0.3)
        ctx.stroke()
      }
      ctx.shadowBlur = 0
      ctx.restore()

      // ── Iris lines ───────────────────────────────────────────────
      const irisR = 16
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + t * 0.05
        const x1 = CX + Math.cos(a) * (irisR * 0.3)
        const y1 = CY + Math.sin(a) * (irisR * 0.3)
        const x2 = CX + Math.cos(a) * (irisR * 0.85)
        const y2 = CY + Math.sin(a) * (irisR * 0.85)
        const alpha = 0.4 + (i % 3 === 0 ? 0.4 : 0.1) + pulse * 0.2
        ctx.strokeStyle = cb(alpha)
        ctx.lineWidth = i % 3 === 0 ? 1.5 : 0.7
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }

      // ── Core glow (the eye) ────────────────────────────────────────
      const coreSize = 12 + pulse * 4 + Math.sin(t * 3) * (speaking ? 3 : 1)

      // Outer glow
      const coreGlow = ctx.createRadialGradient(CX, CY, 0, CX, CY, coreSize * 3)
      coreGlow.addColorStop(0, cb(0.15 + pulse * 0.15))
      coreGlow.addColorStop(0.5, c(0.08 + pulse * 0.08))
      coreGlow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = coreGlow
      ctx.beginPath()
      ctx.arc(CX, CY, coreSize * 3, 0, Math.PI * 2)
      ctx.fill()

      // Core ring
      const coreRing = ctx.createRadialGradient(CX, CY, coreSize * 0.5, CX, CY, coreSize * 1.3)
      coreRing.addColorStop(0, cb(0.9 + pulse * 0.1))
      coreRing.addColorStop(0.6, c(0.7 + pulse * 0.2))
      coreRing.addColorStop(1, cd(0.2 + pulse * 0.1))
      ctx.fillStyle = coreRing
      ctx.shadowColor = c(0.8 + pulse * 0.2)
      ctx.shadowBlur = 15 + pulse * 10
      ctx.beginPath()
      ctx.arc(CX, CY, coreSize, 0, Math.PI * 2)
      ctx.fill()

      // Inner dark pupil
      const pupilGrad = ctx.createRadialGradient(CX, CY, 0, CX, CY, coreSize * 0.6)
      pupilGrad.addColorStop(0, 'rgba(0,0,0,1)')
      pupilGrad.addColorStop(0.7, cd(0.8))
      pupilGrad.addColorStop(1, c(0))
      ctx.fillStyle = pupilGrad
      ctx.shadowBlur = 0
      ctx.beginPath()
      ctx.arc(CX, CY, coreSize * 0.6, 0, Math.PI * 2)
      ctx.fill()

      // Pupil center dot
      ctx.fillStyle = cb(0.9 + pulse * 0.1)
      ctx.shadowColor = cb(0.8); ctx.shadowBlur = 8
      ctx.beginPath()
      ctx.arc(CX, CY, 2 + pulse, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0

      // ── Speaking waveform around core ─────────────────────────────
      if (speaking) {
        for (let i = 0; i < 32; i++) {
          const a = (i / 32) * Math.PI * 2
          const wave = Math.sin(t * 8 + i * 0.8) * 5 * pulse
          const r1 = midR + 2, r2 = midR + 6 + wave
          ctx.strokeStyle = cb(0.3 + wave / 20)
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(CX + Math.cos(a) * r1, CY + Math.sin(a) * r1)
          ctx.lineTo(CX + Math.cos(a) * r2, CY + Math.sin(a) * r2)
          ctx.stroke()
        }
      }

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current!)
  }, [])

  if (!visible) return null

  return (
    <div
      style={{ position: 'fixed', bottom: 85, right: 12, zIndex: 500, cursor: 'pointer' }}
      onClick={() => setVisible(false)}
      title="Click to hide"
    >
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ display: 'block', filter: 'drop-shadow(0 0 8px rgba(0,212,255,0.3))' }}
      />
    </div>
  )
}
