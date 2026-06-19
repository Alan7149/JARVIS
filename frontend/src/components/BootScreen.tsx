import { useEffect, useState, useRef } from 'react'
import ArcReactor from './ArcReactor'

const BOOT_SEQUENCE = [
  { delay: 0,    text: '[ JARVIS v1.0 ] INITIALIZING...', color: '#00d4ff' },
  { delay: 300,  text: 'NEURAL INTERFACE............. ONLINE', color: '#00ff88' },
  { delay: 550,  text: 'GROQ AI ENGINE............... ACTIVE', color: '#00ff88' },
  { delay: 750,  text: 'TAILSCALE MESH............... CONNECTED', color: '#00ff88' },
  { delay: 950,  text: 'WAKE WORD LISTENER........... ARMED', color: '#00ff88' },
  { delay: 1100, text: 'CONTEXT AWARENESS............ RUNNING', color: '#00ff88' },
  { delay: 1250, text: 'NETWORK GUARDIAN............. WATCHING', color: '#00ff88' },
  { delay: 1400, text: 'FACE RECOGNITION............. READY', color: '#00ff88' },
  { delay: 1550, text: 'PROACTIVE MONITORING......... ENABLED', color: '#00ff88' },
  { delay: 1700, text: 'WEBSOCKET CORE............... LIVE', color: '#00ff88' },
  { delay: 1850, text: 'iPHONE LINK.................. SYNCED', color: '#00d4ff' },
  { delay: 2000, text: '━━━ ALL SYSTEMS NOMINAL ━━━', color: '#00d4ff' },
  { delay: 2200, text: 'GOOD DAY, SIR.', color: '#ffffff' },
]

export default function BootScreen({ onDone }: { onDone: () => void }) {
  const [lines, setLines] = useState<{text:string,color:string}[]>([])
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const [particles, setParticles] = useState<{x:number,y:number,vx:number,vy:number,life:number}[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>()

  // Particle arc reactor animation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let t = 0
    const draw = () => {
      t += 0.02
      ctx.clearRect(0, 0, 200, 200)
      const cx = 100, cy = 100
      // Outer ring
      ctx.strokeStyle = `rgba(0,212,255,${0.3 + Math.sin(t)*0.1})`
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(cx, cy, 80, 0, Math.PI*2); ctx.stroke()
      // Rotating dashed ring
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(t*0.3)
      ctx.strokeStyle = 'rgba(0,212,255,0.4)'; ctx.setLineDash([6,4])
      ctx.beginPath(); ctx.arc(0,0,65,0,Math.PI*2); ctx.stroke()
      ctx.setLineDash([]); ctx.restore()
      // Counter-rotating ring
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(-t*0.5)
      ctx.strokeStyle = 'rgba(0,180,255,0.5)'; ctx.lineWidth=1.5
      for(let i=0;i<3;i++){const a=(i/3)*Math.PI*2; ctx.beginPath();ctx.arc(0,0,48,a,a+1);ctx.stroke()}
      ctx.restore()
      // Core
      const g=ctx.createRadialGradient(cx,cy,0,cx,cy,22)
      g.addColorStop(0,'rgba(200,255,255,0.9)');g.addColorStop(0.4,'rgba(0,212,255,0.8)');g.addColorStop(1,'rgba(0,80,180,0.1)')
      ctx.fillStyle=g; ctx.shadowColor='#00d4ff'; ctx.shadowBlur=20
      ctx.beginPath();ctx.arc(cx,cy,18,0,Math.PI*2);ctx.fill()
      ctx.shadowBlur=0
      animRef.current=requestAnimationFrame(draw)
    }
    animRef.current=requestAnimationFrame(draw)
    return ()=>cancelAnimationFrame(animRef.current!)
  }, [])

  useEffect(() => {
    BOOT_SEQUENCE.forEach(({ delay, text, color }) => {
      setTimeout(() => setLines(l => [...l, {text,color}]), delay)
    })
    const prog = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { clearInterval(prog); return 100 }
        return p + 1
      })
    }, 25)
    setTimeout(() => { setDone(true); setTimeout(onDone, 600) }, 2900)
    return () => clearInterval(prog)
  }, [])

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-50"
      style={{
        background: '#020b18',
        opacity: done ? 0 : 1,
        transition: 'opacity 0.6s ease',
      }}
    >
      <div className="hex-grid" />

      {/* Arc reactor canvas */}
      <div className="mb-6">
        <canvas ref={canvasRef} width={200} height={200}
          style={{ filter: 'drop-shadow(0 0 30px rgba(0,212,255,0.6))' }} />
      </div>

      {/* JARVIS title */}
      <div className="font-orbitron text-5xl font-black tracking-[0.4em] mb-1"
        style={{ color: '#00d4ff', textShadow: '0 0 40px rgba(0,212,255,0.9), 0 0 80px rgba(0,212,255,0.4)' }}>
        J.A.R.V.I.S
      </div>
      <div className="text-[9px] tracking-[0.6em] mb-8 font-orbitron" style={{ color: 'rgba(0,212,255,0.5)' }}>
        JUST A RATHER VERY INTELLIGENT SYSTEM
      </div>

      {/* Boot log — two columns */}
      <div className="w-96 mb-6 font-mono text-[10px] space-y-0.5">
        {lines.map((line, i) => (
          <div key={i} className="boot-line flex items-center gap-2"
            style={{ animationDelay: `${i * 0.03}s` }}>
            <span style={{ color: line.color === '#00ff88' ? '#00ff88' : '#00d4ff', flexShrink: 0 }}>
              {line.color === '#00ff88' ? '✓' : line.color === '#ffffff' ? '▶' : '›'}
            </span>
            <span style={{ color: line.color }}>{line.text}</span>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="w-96 space-y-1">
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(13,74,110,0.4)' }}>
          <div className="h-full rounded-full transition-all duration-100"
            style={{
              width: `${progress}%`,
              background: `linear-gradient(90deg, #003399, #0066cc, #00d4ff)`,
              boxShadow: '0 0 12px #00d4ff',
            }}
          />
        </div>
        <div className="flex justify-between text-[8px] font-mono" style={{ color: 'rgba(0,212,255,0.4)' }}>
          <span>DEPLOYING SYSTEMS</span>
          <span>{progress}%</span>
        </div>
      </div>
    </div>
  )
}
