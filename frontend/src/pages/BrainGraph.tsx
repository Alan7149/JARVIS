// @ts-nocheck
/**
 * JARVIS Brain Knowledge Graph
 * Pure Canvas force-directed graph — no external dependencies
 * Like Obsidian's graph view
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { apiFetch } from '../lib/api'

interface GNode { id: string; label: string; type: string; size: number; color: string; tags: string[]; path: string; x: number; y: number; vx: number; vy: number }
interface GEdge { source: string; target: string; type: string; weight?: number }
interface GraphData { nodes: GNode[]; edges: GEdge[]; stats: Record<string, number> }

const TYPE_COLORS = { note:'#00d4ff', obsidian:'#a855f7', py:'#00ff88', js:'#ff9900', ts:'#00aaff', tag:'#ff6b6b', txt:'#4a7a99' }

export default function BrainGraph() {
  const canvasRef = useRef(null)
  const [graphData, setGraphData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [directory, setDirectory] = useState('')
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const animRef = useRef(null)
  const nodesRef = useRef([])
  const edgesRef = useRef([])
  const scaleRef = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })
  const draggingRef = useRef(null)
  const panRef = useRef(null)

  const loadGraph = useCallback(async (dir) => {
    setLoading(true)
    try {
      const url = dir ? `/api/brain/graph?directory=${encodeURIComponent(dir)}` : '/api/brain/graph'
      const data = await apiFetch(url).then(r => r.json())
      // Initialize positions — spread in a circle around the canvas center
      const N = data.nodes.length
      const CX = 600, CY = 350  // center of 1200x700 canvas
      const SPREAD = Math.max(250, Math.sqrt(N) * 60)
      data.nodes = data.nodes.map((n, i) => {
        const angle = i * 2.399963  // golden angle
        const radius = SPREAD * (0.3 + Math.sqrt(i / N) * 0.7)
        return {
          ...n,
          x: CX + Math.cos(angle) * radius,
          y: CY + Math.sin(angle) * radius,
          vx: Math.cos(angle) * 3,  // initial outward velocity
          vy: Math.sin(angle) * 3,
        }
      })
      setGraphData(data)
      nodesRef.current = data.nodes
      edgesRef.current = data.edges
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => { loadGraph() }, [])

  // Force simulation + render loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !graphData) return
    const ctx = canvas.getContext('2d')
    const nodes = nodesRef.current
    const edges = edgesRef.current
    let W = canvas.width, H = canvas.height

    const getPos = (id) => nodes.find(n => n.id === id)

    let frame = 0  // frame counter for phased physics

    const tick = () => {
      frame++
      // Phase 1 (0-120 frames): strong repulsion only — nodes spread out
      // Phase 2 (120+): add gentle edge attraction
      const linkStrength = Math.min(1, Math.max(0, (frame - 80) / 80)) * 0.03
      const repulsion = Math.max(2000, 18000 - frame * 80)  // decay from 18k to 2k
      const damping = frame < 80 ? 0.7 : 0.82
      const MIN_DIST = 40
      const step = Math.max(1, Math.floor(nodes.length / 60))

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        for (let j = i + step; j < nodes.length; j += step) {
          const b = nodes[j]
          let dx = b.x - a.x || 0.01, dy = b.y - a.y || 0.01
          let dist = Math.sqrt(dx*dx + dy*dy)
          if (dist < 1) { dx = Math.random()-0.5; dy = Math.random()-0.5; dist = 0.5 }
          const f = -repulsion / Math.max(dist*dist, 100) * step
          a.vx += (dx/dist)*f; a.vy += (dy/dist)*f
          b.vx -= (dx/dist)*f; b.vy -= (dy/dist)*f
        }
        // Gravity toward center
        a.vx += (600 - a.x) * 0.001
        a.vy += (350 - a.y) * 0.001
      }

      // Link attraction — phases in after frame 80
      if (linkStrength > 0) {
        for (const e of edges) {
          const s = getPos(typeof e.source === 'string' ? e.source : e.source?.id)
          const t = getPos(typeof e.target === 'string' ? e.target : e.target?.id)
          if (!s || !t) continue
          const dx = t.x - s.x, dy = t.y - s.y
          const dist = Math.sqrt(dx*dx+dy*dy) || 1
          const target = 130
          if (dist > 20) {
            const f = (dist - target) * linkStrength
            s.vx += (dx/dist)*f; s.vy += (dy/dist)*f
            t.vx -= (dx/dist)*f; t.vy -= (dy/dist)*f
          }
        }
      }

      for (const n of nodes) {
        if (n._pinned) { n.vx=0; n.vy=0; continue }
        n.vx *= damping; n.vy *= damping
        const spd = Math.sqrt(n.vx*n.vx+n.vy*n.vy)
        const maxSpd = frame < 80 ? 12 : 6
        if (spd > maxSpd) { n.vx=n.vx/spd*maxSpd; n.vy=n.vy/spd*maxSpd }
        n.x += n.vx; n.y += n.vy
      }
    }

    const draw = () => {
      W = canvas.width; H = canvas.height
      ctx.clearRect(0, 0, W, H)
      ctx.save()
      ctx.translate(offsetRef.current.x, offsetRef.current.y)
      ctx.scale(scaleRef.current, scaleRef.current)

      // Background grid dots
      ctx.fillStyle = 'rgba(13,74,110,0.2)'
      for (let x = -W; x < W * 3; x += 40)
        for (let y = -H; y < H * 3; y += 40)
          { ctx.beginPath(); ctx.arc(x, y, 0.8, 0, Math.PI*2); ctx.fill() }

      // Edges
      for (const e of edges) {
        const s = getPos(typeof e.source === 'string' ? e.source : e.source.id)
        const t = getPos(typeof e.target === 'string' ? e.target : e.target.id)
        if (!s || !t) continue
        ctx.beginPath()
        ctx.moveTo(s.x, s.y)
        ctx.lineTo(t.x, t.y)
        ctx.strokeStyle = e.type === 'tag' ? 'rgba(168,85,247,0.25)' : e.type === 'link' ? 'rgba(0,212,255,0.3)' : 'rgba(0,212,255,0.1)'
        ctx.lineWidth = e.type === 'link' ? 1.5 : 0.8
        ctx.stroke()
      }

      // Nodes
      for (const n of nodes) {
        const color = n.color || TYPE_COLORS[n.type] || '#4a7a99'
        const r = n.size || 6
        const isSel = selected?.id === n.id

        // Glow
        if (r > 8 || isSel) {
          const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 2.5)
          grad.addColorStop(0, `${color}30`)
          grad.addColorStop(1, 'transparent')
          ctx.fillStyle = grad
          ctx.beginPath(); ctx.arc(n.x, n.y, r * 2.5, 0, Math.PI*2); ctx.fill()
        }

        // Ring
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI*2)
        ctx.fillStyle = `${color}20`
        ctx.fill()
        ctx.strokeStyle = isSel ? '#ffffff' : color
        ctx.lineWidth = isSel ? 2 : 1.5
        ctx.stroke()

        // Center dot
        ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(2, r * 0.35), 0, Math.PI*2)
        ctx.fillStyle = color; ctx.fill()

        // Label
        if (r >= 6) {
          ctx.fillStyle = isSel ? '#ffffff' : color
          ctx.font = `${Math.max(8, Math.min(10, r))}px JetBrains Mono, monospace`
          ctx.textAlign = 'center'
          ctx.globalAlpha = 0.85
          ctx.fillText(n.label.length > 14 ? n.label.slice(0, 12) + '…' : n.label, n.x, n.y + r + 13)
          ctx.globalAlpha = 1
        }
      }

      ctx.restore()
      tick()
      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [graphData, selected])

  // Mouse/touch interactions
  const getNodeAt = (cx, cy) => {
    const nodes = nodesRef.current
    const ox = offsetRef.current.x, oy = offsetRef.current.y, s = scaleRef.current
    const wx = (cx - ox) / s, wy = (cy - oy) / s
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i]
      const dx = wx - n.x, dy = wy - n.y
      if (Math.sqrt(dx*dx+dy*dy) <= (n.size || 6) + 4) return n
    }
    return null
  }

  const handleMouseDown = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top
    const node = getNodeAt(cx, cy)
    if (node) {
      node._pinned = true // pin while dragging
      draggingRef.current = { node, startX: cx, startY: cy }
    } else {
      panRef.current = { startX: cx - offsetRef.current.x, startY: cy - offsetRef.current.y }
    }
  }

  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top
    if (draggingRef.current) {
      const { node } = draggingRef.current
      const ox = offsetRef.current.x, oy = offsetRef.current.y, s = scaleRef.current
      node.x = (cx - ox) / s; node.y = (cy - oy) / s
      node.vx = 0; node.vy = 0
    } else if (panRef.current) {
      offsetRef.current = { x: cx - panRef.current.startX, y: cy - panRef.current.startY }
    }
  }

  const handleMouseUp = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top
    if (draggingRef.current) {
      const { node } = draggingRef.current
      const dist = Math.hypot(cx - draggingRef.current.startX, cy - draggingRef.current.startY)
      if (dist < 5) {
        // Click: select and unpin
        node._pinned = false
        setSelected(s => s?.id === node.id ? null : node)
      }
      // Keep pinned if dragged (double-click to unpin)
      draggingRef.current = null
    }
    panRef.current = null
  }

  const handleDblClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top
    const node = getNodeAt(cx, cy)
    if (node) node._pinned = false // double-click unpins
  }

  const handleWheel = (e) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    scaleRef.current = Math.max(0.1, Math.min(8, scaleRef.current * factor))
  }

  const nodeTypes = graphData ? [...new Set(graphData.nodes.map(n => n.type))] : []

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Header */}
      <div style={{ padding:'12px 16px', borderBottom:'1px solid rgba(13,74,110,0.4)', background:'rgba(4,22,40,0.9)', display:'flex', alignItems:'center', gap:10, flexShrink:0, flexWrap:'wrap' }}>
        <div>
          <div className="font-orbitron text-sm font-bold glow-text">KNOWLEDGE GRAPH</div>
          <div className="text-[8px] text-jarvis-muted tracking-wider">
            {graphData ? `${graphData.stats?.nodes || 0} nodes · ${graphData.stats?.edges || 0} connections` : 'Load a vault to visualize'}
          </div>
        </div>
        <div style={{ display:'flex', gap:6, flex:1, marginLeft:8 }}>
          <input className="input-jarvis text-xs font-mono" style={{ flex:1, maxWidth:380 }}
            placeholder="Obsidian vault path e.g. C:\Users\alanb\Documents\MyVault"
            value={directory} onChange={e=>setDirectory(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&loadGraph(directory)} />
          <button onClick={()=>loadGraph(directory)} className="btn-primary text-[9px] px-3">
            {loading ? '...' : 'LOAD VAULT'}
          </button>
          <button onClick={()=>loadGraph()} className="btn-primary text-[9px] px-3"
            style={{ borderColor:'rgba(0,170,255,0.4)', color:'#00aaff' }}>
            KB INDEX
          </button>
        </div>
        <input className="input-jarvis text-xs" style={{ width:140 }}
          placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} />
        <div style={{ display:'flex', gap:3 }}>
          {['all',...nodeTypes.slice(0,4)].map(t=>(
            <button key={t} onClick={()=>nodesRef.current.forEach(n=>n._filtered=(t!=='all'&&n.type!==t))}
              className="text-[7px] font-orbitron px-2 py-1 rounded-sm"
              style={{ background:'rgba(4,22,40,0.6)', border:'1px solid rgba(13,74,110,0.4)', color:'#4a7a99' }}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={()=>{scaleRef.current=Math.min(8,scaleRef.current*1.2)}} className="btn-primary text-[9px] px-2">+</button>
          <button onClick={()=>{scaleRef.current=Math.max(0.1,scaleRef.current*0.8)}} className="btn-primary text-[9px] px-2">−</button>
          <button onClick={()=>{scaleRef.current=1;offsetRef.current={x:0,y:0}}} className="btn-primary text-[9px] px-2">RESET</button>
        </div>
      </div>

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* Canvas */}
        <div style={{ flex:1, position:'relative' }}>
          {loading && (
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12, zIndex:10 }}>
              <div style={{ width:44, height:44, border:'2px solid rgba(0,212,255,0.2)', borderTop:'2px solid #00d4ff', borderRadius:'50%', animation:'arcSpin1 1s linear infinite' }} />
              <div className="text-[9px] font-orbitron" style={{color:'#00d4ff'}}>BUILDING GRAPH...</div>
            </div>
          )}
          {!loading && !graphData && (
            <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10, color:'rgba(0,212,255,0.3)' }}>
              <div style={{ fontSize:48 }}>🧠</div>
              <div className="font-orbitron text-sm">Enter your Obsidian vault path above</div>
              <div className="text-[9px] text-jarvis-muted text-center max-w-xs">Or click KB INDEX to graph your indexed Second Brain documents</div>
            </div>
          )}
          <canvas ref={canvasRef} style={{ display:'block', width:'100%', height:'100%', cursor:'crosshair' }}
            width={1200} height={700}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
            onDoubleClick={handleDblClick}
            onWheel={handleWheel} />
          {/* Legend */}
          <div style={{ position:'absolute', bottom:12, left:12, background:'rgba(2,8,20,0.85)', border:'1px solid rgba(13,74,110,0.4)', borderRadius:4, padding:'8px 12px' }}>
            <div className="text-[7px] text-jarvis-muted tracking-widest mb-2 font-orbitron">LEGEND</div>
            {Object.entries(TYPE_COLORS).map(([t,c])=>(
              <div key={t} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                <div style={{ width:7, height:7, borderRadius:'50%', background:c, boxShadow:`0 0 4px ${c}` }} />
                <span style={{ fontSize:8, color:'rgba(168,216,234,0.6)', fontFamily:'Orbitron,monospace' }}>{t.toUpperCase()}</span>
              </div>
            ))}
          </div>
          <div style={{ position:'absolute', bottom:12, right:12, fontSize:8, color:'rgba(0,212,255,0.25)', fontFamily:'monospace', textAlign:'right' }}>
            Scroll=zoom · Drag canvas=pan · Click=details · Drag node=pin · Dbl-click=unpin
          </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={{ width:240, flexShrink:0, borderLeft:'1px solid rgba(13,74,110,0.4)', background:'rgba(4,22,40,0.95)', padding:16, overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <span className="text-[9px] font-orbitron tracking-widest" style={{color:'#00d4ff'}}>NODE DETAILS</span>
              <button onClick={()=>setSelected(null)} style={{ color:'#4a7a99', background:'none', border:'none', cursor:'pointer', fontSize:14 }}>✕</button>
            </div>
            <div style={{ width:36, height:36, borderRadius:'50%', border:`2px solid ${selected.color||'#00d4ff'}`, background:`${selected.color||'#00d4ff'}15`, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:10 }}>
              <div style={{ width:10, height:10, borderRadius:'50%', background:selected.color||'#00d4ff' }} />
            </div>
            <div style={{ color:'#a8d8ea', fontFamily:'Orbitron,monospace', fontSize:12, fontWeight:700, marginBottom:4 }}>{selected.label}</div>
            <div className="text-[8px] text-jarvis-muted mb-4 font-mono break-all">{selected.path}</div>
            {[['TYPE',selected.type?.toUpperCase()],['SIZE',`${selected.size} units`]].map(([l,v])=>(
              <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid rgba(13,74,110,0.3)' }}>
                <span style={{ color:'#4a7a99', fontSize:8, fontFamily:'Orbitron,monospace' }}>{l}</span>
                <span style={{ color:'#00d4ff', fontSize:9, fontFamily:'monospace' }}>{v}</span>
              </div>
            ))}
            {selected.tags?.length > 0 && (
              <div style={{ marginTop:10 }}>
                <div className="text-[7px] text-jarvis-muted tracking-widest mb-2 font-orbitron">TAGS</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                  {selected.tags.map(t=>(
                    <span key={t} style={{ padding:'2px 6px', borderRadius:10, background:'rgba(168,85,247,0.1)', border:'1px solid rgba(168,85,247,0.3)', color:'#a855f7', fontSize:8 }}>#{t}</span>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginTop:12 }}>
              <div className="text-[7px] text-jarvis-muted tracking-widest mb-2 font-orbitron">CONNECTED</div>
              {edgesRef.current
                .filter(e=>{const s=typeof e.source==='string'?e.source:e.source?.id,t=typeof e.target==='string'?e.target:e.target?.id;return s===selected.id||t===selected.id})
                .slice(0,8).map((e,i)=>{
                  const oid=(typeof e.source==='string'?e.source:e.source?.id)===selected.id?(typeof e.target==='string'?e.target:e.target?.id):(typeof e.source==='string'?e.source:e.source?.id)
                  const other=nodesRef.current.find(n=>n.id===oid)
                  return other?(<div key={i} style={{ padding:'2px 0', cursor:'pointer', borderBottom:'1px solid rgba(13,74,110,0.2)' }} onClick={()=>setSelected(other)}>
                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <div style={{ width:5, height:5, borderRadius:'50%', background:other.color||'#4a7a99' }} />
                      <span style={{ color:'#a8d8ea', fontSize:8, fontFamily:'monospace' }}>{other.label}</span>
                    </div>
                  </div>):null
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
