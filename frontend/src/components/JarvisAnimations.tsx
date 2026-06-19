/**
 * JARVIS Animation Layer
 * Handles: Particle System, Data Streams, Full Waveform,
 *          Glitch Effect, Magnetic Cursor, 3D Panel Depth
 * All effects are subtle and professional — enhance without distracting
 */
import { useEffect, useRef, useCallback } from 'react'
import { useWebSocket } from '../contexts/WebSocketContext'

// ── 1. PARTICLE SYSTEM ───────────────────────────────────────────────────────

interface Particle {
  x: number; y: number; vx: number; vy: number
  size: number; alpha: number; life: number; maxLife: number
  color: string
}

export function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const mouseRef = useRef({ x: -1000, y: -1000 })
  const speakingRef = useRef(false)
  const threatRef = useRef(0)
  const animRef = useRef<number>()
  const { lastMessage } = useWebSocket()

  useEffect(() => {
    if (lastMessage?.event === 'jarvis_speaking') {
      speakingRef.current = (lastMessage.data as any)?.speaking ?? false
    }
    if (lastMessage?.event === 'threat_level') {
      threatRef.current = (lastMessage.data as any)?.score ?? 0
    }
  }, [lastMessage])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let W = window.innerWidth, H = window.innerHeight

    const resize = () => {
      W = canvas.width = window.innerWidth
      H = canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Spawn particles naturally (ambient drift)
    const spawnAmbient = () => {
      if (particlesRef.current.length < 120) {
        const threat = threatRef.current
        const color = threat > 60 ? `rgba(255,${Math.max(0,80-threat)},0,` :
                      threat > 30 ? `rgba(255,${150-threat},0,` :
                      `rgba(0,${180+Math.random()*75},255,`
        particlesRef.current.push({
          x: Math.random() * W, y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4 - 0.1,
          size: Math.random() * 1.5 + 0.3,
          alpha: 0, life: 0,
          maxLife: 200 + Math.random() * 300,
          color,
        })
      }
    }

    // Spawn burst when JARVIS speaks (from avatar position)
    const spawnBurst = () => {
      const ax = W - 120, ay = H - 120  // avatar position
      for (let i = 0; i < 20; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = 1 + Math.random() * 3
        particlesRef.current.push({
          x: ax, y: ay,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: Math.random() * 2 + 0.5,
          alpha: 0.8,
          life: 0, maxLife: 60 + Math.random() * 60,
          color: `rgba(0,212,255,`,
        })
      }
    }

    let wasSpeak = false
    let t = 0

    const draw = () => {
      t++
      ctx.clearRect(0, 0, W, H)

      // Spawn ambient
      if (t % 4 === 0) spawnAmbient()

      // Burst on speak start
      if (speakingRef.current && !wasSpeak) spawnBurst()
      wasSpeak = speakingRef.current

      const mx = mouseRef.current.x, my = mouseRef.current.y

      // Update + draw particles
      particlesRef.current = particlesRef.current.filter(p => p.life < p.maxLife)
      for (const p of particlesRef.current) {
        p.life++
        const progress = p.life / p.maxLife
        // Fade in/out
        p.alpha = progress < 0.1 ? progress * 10 :
                  progress > 0.8 ? (1 - progress) * 5 : 0.35 + Math.random() * 0.1

        // Mouse repulsion (subtle)
        const dx = p.x - mx, dy = p.y - my
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 80 && dist > 0) {
          const force = (80 - dist) / 80 * 0.3
          p.vx += (dx / dist) * force
          p.vy += (dy / dist) * force
        }

        // Speaking: pulse outward from avatar
        if (speakingRef.current) {
          const adx = p.x - (W - 120), ady = p.y - (H - 120)
          const adist = Math.sqrt(adx*adx + ady*ady)
          if (adist < 200 && adist > 0) {
            p.vx += (adx / adist) * 0.05
            p.vy += (ady / adist) * 0.05
          }
        }

        // Gentle drift
        p.vx *= 0.99; p.vy *= 0.99
        p.x += p.vx; p.y += p.vy

        // Wrap edges
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0

        // Draw
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `${p.color}${p.alpha.toFixed(2)})`
        if (p.alpha > 0.3) {
          ctx.shadowColor = p.color + '0.8)'
          ctx.shadowBlur = 4
        }
        ctx.fill()
        ctx.shadowBlur = 0
      }

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('mousemove', onMouseMove)

    return () => {
      cancelAnimationFrame(animRef.current!)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMouseMove)
    }
  }, [])

  return (
    <canvas ref={canvasRef} style={{
      position: 'fixed', inset: 0, pointerEvents: 'none',
      zIndex: 1, opacity: 0.6,
    }} />
  )
}

// ── 2. DATA STREAM LINES ─────────────────────────────────────────────────────

export function DataStreams({ isProcessing }: { isProcessing?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>()
  const processingRef = useRef(isProcessing)

  useEffect(() => { processingRef.current = isProcessing }, [isProcessing])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    // Lines travel from sidebar (x=160) to main content
    interface Stream { x: number; y: number; len: number; speed: number; alpha: number; active: boolean }
    const streams: Stream[] = Array.from({ length: 8 }, (_, i) => ({
      x: 160, y: 80 + i * 100 + Math.random() * 60,
      len: 30 + Math.random() * 50,
      speed: 3 + Math.random() * 3,
      alpha: 0.3 + Math.random() * 0.4,
      active: Math.random() > 0.5,
    }))

    let t = 0
    const draw = () => {
      t++
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const baseSpeed = processingRef.current ? 2 : 0.3

      for (const s of streams) {
        if (!s.active) {
          if (Math.random() < 0.01) { s.active = true; s.x = 160; s.y = 80 + Math.random() * (canvas.height - 160) }
          continue
        }
        s.x += s.speed * baseSpeed
        if (s.x > canvas.width - 200) { s.active = false; s.x = 160; continue }

        // Draw traveling line segment
        const grad = ctx.createLinearGradient(s.x - s.len, s.y, s.x, s.y)
        grad.addColorStop(0, 'transparent')
        grad.addColorStop(0.5, `rgba(0,212,255,${s.alpha * 0.4})`)
        grad.addColorStop(1, `rgba(0,212,255,${s.alpha})`)
        ctx.beginPath()
        ctx.moveTo(s.x - s.len, s.y)
        ctx.lineTo(s.x, s.y)
        ctx.strokeStyle = grad
        ctx.lineWidth = 1
        ctx.stroke()

        // Leading dot
        ctx.beginPath()
        ctx.arc(s.x, s.y, 1.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(0,212,255,${s.alpha})`
        ctx.shadowColor = '#00d4ff'; ctx.shadowBlur = 6
        ctx.fill(); ctx.shadowBlur = 0
      }

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current!)
  }, [])

  return (
    <canvas ref={canvasRef} style={{
      position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 2,
    }} />
  )
}

// ── 4. FULL-WIDTH REACTIVE WAVEFORM ──────────────────────────────────────────

export function FullWaveform() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>()
  const { lastMessage } = useWebSocket()
  const speakingRef = useRef(false)
  const phaseRef = useRef(0)

  useEffect(() => {
    if (lastMessage?.event === 'jarvis_speaking') {
      speakingRef.current = (lastMessage.data as any)?.speaking ?? false
    }
  }, [lastMessage])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = window.innerWidth, H = 60
    canvas.width = W; canvas.height = H
    const BARS = 200

    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      phaseRef.current += 0.08

      if (!speakingRef.current) {
        // Idle: tiny baseline pulse
        const barW = W / BARS
        for (let i = 0; i < BARS; i++) {
          const h = 1 + Math.sin(i * 0.3 + phaseRef.current) * 0.5
          const alpha = 0.15 + Math.sin(i * 0.1 + phaseRef.current) * 0.05
          ctx.fillStyle = `rgba(0,212,255,${alpha})`
          ctx.fillRect(i * barW, H / 2 - h / 2, barW - 1, h)
        }
      } else {
        // Speaking: full animated waveform
        const barW = W / BARS
        for (let i = 0; i < BARS; i++) {
          // Multi-frequency wave for natural sound look
          const h = (
            Math.sin(i * 0.15 + phaseRef.current * 1.7) * 14 +
            Math.sin(i * 0.08 + phaseRef.current * 2.3) * 10 +
            Math.sin(i * 0.3 + phaseRef.current * 0.9) * 6 +
            Math.random() * 4
          ) * Math.abs(Math.sin(phaseRef.current * 0.3 + i * 0.02))

          const absH = Math.max(2, Math.abs(h))
          const intensity = absH / 30
          const alpha = 0.5 + intensity * 0.5

          // Color gradient: cyan center, blue edges
          const distFromCenter = Math.abs(i - BARS / 2) / (BARS / 2)
          const r = Math.round(distFromCenter * 20)
          const g = Math.round(180 + intensity * 75)
          const b = 255

          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
          if (intensity > 0.6) {
            ctx.shadowColor = `rgba(0,212,255,0.6)`
            ctx.shadowBlur = 6
          }
          ctx.fillRect(i * barW, H / 2 - absH / 2, Math.max(1, barW - 1), absH)
          ctx.shadowBlur = 0
        }

        // Center glow line
        const glowGrad = ctx.createLinearGradient(0, H/2, W, H/2)
        glowGrad.addColorStop(0, 'transparent')
        glowGrad.addColorStop(0.3, 'rgba(0,212,255,0.1)')
        glowGrad.addColorStop(0.5, 'rgba(0,212,255,0.2)')
        glowGrad.addColorStop(0.7, 'rgba(0,212,255,0.1)')
        glowGrad.addColorStop(1, 'transparent')
        ctx.fillStyle = glowGrad
        ctx.fillRect(0, H/2 - 1, W, 2)
      }

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current!)
  }, [])

  return (
    <canvas ref={canvasRef} style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      pointerEvents: 'none', zIndex: 50,
      opacity: speakingRef.current ? 1 : 0.4,
      transition: 'opacity 0.5s',
    }} />
  )
}

// ── 5. GLITCH EFFECT ─────────────────────────────────────────────────────────

export function GlitchOverlay() {
  const { lastMessage } = useWebSocket()
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!lastMessage) return
    const isCritical = (
      lastMessage.event === 'proactive_alert' && (lastMessage.data as any)?.severity === 'critical'
    ) || (
      lastMessage.event === 'code_review' && (lastMessage.data as any)?.severity === 'CRITICAL'
    )

    if (isCritical && overlayRef.current) {
      const el = overlayRef.current
      el.classList.add('glitching')
      setTimeout(() => el.classList.remove('glitching'), 400)
    }
  }, [lastMessage])

  return (
    <>
      <style>{`
        .glitch-overlay { position:fixed;inset:0;pointer-events:none;z-index:9998;opacity:0;transition:none; }
        .glitch-overlay.glitching { animation: glitchAnim 0.4s steps(1) forwards; }
        @keyframes glitchAnim {
          0%   { opacity:0; }
          5%   { opacity:1; background:rgba(255,0,50,0.06); clip-path:inset(0 0 85% 0); transform:translateX(-4px); }
          10%  { clip-path:inset(30% 0 40% 0); transform:translateX(4px) skewX(-1deg); }
          15%  { clip-path:inset(60% 0 15% 0); transform:translateX(-2px); background:rgba(0,212,255,0.05); }
          20%  { clip-path:none; transform:translateX(0) scaleX(1.002); background:rgba(255,255,0,0.03); }
          25%  { transform:none; clip-path:inset(0 0 70% 0); background:rgba(255,0,50,0.04); }
          30%  { clip-path:inset(0); transform:translateX(-1px) skewX(0.5deg); }
          100% { opacity:0; }
        }
        .scanline-glitch { position:fixed;inset:0;pointer-events:none;z-index:9997;opacity:0;transition:none; }
        .glitch-overlay.glitching ~ .scanline-glitch {
          animation: scanGlitch 0.4s steps(1) forwards;
          background: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,212,255,0.03) 3px, rgba(0,212,255,0.03) 4px);
        }
        @keyframes scanGlitch { 0%,100%{opacity:0} 5%,25%{opacity:1} }
      `}</style>
      <div ref={overlayRef} className="glitch-overlay" />
      <div className="scanline-glitch" />
    </>
  )
}

// ── 6 & 8. MAGNETIC CURSOR + 3D DEPTH ────────────────────────────────────────

export function useMagneticEffect() {
  const mouseRef = useRef({ x: 0, y: 0 })
  const tiltRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
      // Calculate tilt based on mouse position relative to center
      const cx = window.innerWidth / 2, cy = window.innerHeight / 2
      const maxTilt = 1.5
      tiltRef.current = {
        x: ((e.clientY - cy) / cy) * maxTilt,
        y: -((e.clientX - cx) / cx) * maxTilt,
      }
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  return { mouseRef, tiltRef }
}

export function Panel3D({ children, className, style, intensity=1 }: {
  children: React.ReactNode; className?: string; style?: React.CSSProperties; intensity?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const mouse = useRef({ x: 0, y: 0 })
  const raf = useRef<number>()
  const current = useRef({ rx: 0, ry: 0 })

  useEffect(() => {
    const onMove = (e: MouseEvent) => { mouse.current = { x: e.clientX, y: e.clientY } }
    window.addEventListener('mousemove', onMove, { passive: true })

    const animate = () => {
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const dx = (mouse.current.x - cx) / (window.innerWidth / 2)
        const dy = (mouse.current.y - cy) / (window.innerHeight / 2)
        const targetRx = -dy * 2 * intensity
        const targetRy = dx * 2 * intensity
        // Smooth interpolation
        current.current.rx += (targetRx - current.current.rx) * 0.06
        current.current.ry += (targetRy - current.current.ry) * 0.06
        ref.current.style.transform = `perspective(800px) rotateX(${current.current.rx}deg) rotateY(${current.current.ry}deg)`
      }
      raf.current = requestAnimationFrame(animate)
    }
    raf.current = requestAnimationFrame(animate)
    return () => { window.removeEventListener('mousemove', onMove); cancelAnimationFrame(raf.current!) }
  }, [intensity])

  return (
    <div ref={ref} className={className}
      style={{ ...style, transformStyle: 'preserve-3d', willChange: 'transform', transition: 'box-shadow 0.3s' }}>
      {children}
    </div>
  )
}
