import { useEffect, useState, useRef } from 'react'
import { apiFetch } from '../lib/api'
import { Shield, AlertTriangle, Wifi, Globe } from 'lucide-react'

interface Connection { ip:string;port:number;process:string;country:string;country_code:string;city:string;lat:number;lon:number;suspicious:boolean;status:string }
interface ThreatData {
  threat_score:number
  connections:Connection[]
  suspicious_processes:{name:string;pid:number;risk:string;reason:string}[]
  open_ports:{port:number;process:string;risk:string}[]
  vpn:{connected:boolean;type?:string}
  alerts:{type:string;severity:string;msg:string}[]
  total_connections:number
}

function ThreatDial({ score }: { score: number }) {
  const r = 56, cx = 70, cy = 70
  const circ = 2 * Math.PI * r
  const arc = circ * 0.75
  const filled = arc * (score / 100)
  const color = score > 70 ? '#ff3333' : score > 40 ? '#ff9900' : score > 20 ? '#ff6600' : '#00ff88'
  const startAngle = 225 * Math.PI / 180
  const endAngle = startAngle + (score / 100) * (270 * Math.PI / 180)
  const x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle)
  const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle)
  const largeArc = score > 55 ? 1 : 0

  return (
    <div className="flex flex-col items-center">
      <svg width={140} height={140} style={{filter:`drop-shadow(0 0 8px ${color}40)`}}>
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(13,74,110,0.4)" strokeWidth="8"
          strokeDasharray={`${arc} ${circ}`} strokeDashoffset={-(circ * 0.125)}
          strokeLinecap="round" transform={`rotate(0,${cx},${cy})`} />
        {/* Fill */}
        {score > 0 && (
          <path d={`M ${cx + r * Math.cos(startAngle)} ${cy + r * Math.sin(startAngle)} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
            fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" />
        )}
        <text x={cx} y={cy-6} textAnchor="middle" fill={color}
          style={{fontFamily:'Orbitron,monospace',fontSize:28,fontWeight:900}}>
          {score}
        </text>
        <text x={cx} y={cy+14} textAnchor="middle" fill="rgba(168,216,234,0.5)"
          style={{fontFamily:'Orbitron,monospace',fontSize:8}}>
          THREAT SCORE
        </text>
        <text x={cx} y={cy+28} textAnchor="middle"
          fill={score>70?'#ff3333':score>40?'#ff9900':score>20?'#ff6600':'#00ff88'}
          style={{fontFamily:'Orbitron,monospace',fontSize:9,fontWeight:700}}>
          {score>70?'CRITICAL':score>40?'HIGH':score>20?'ELEVATED':'NOMINAL'}
        </text>
      </svg>
    </div>
  )
}

// Simple SVG world map heatmap
function WorldMap({ connections }: { connections: Connection[] }) {
  return (
    <div style={{position:'relative',background:'rgba(0,0,0,0.3)',borderRadius:4,overflow:'hidden',height:140,border:'1px solid rgba(13,74,110,0.4)'}}>
      <div className="text-[7px] font-orbitron tracking-widest p-2 pb-0" style={{color:'rgba(0,212,255,0.5)'}}>LIVE CONNECTIONS</div>
      <div style={{padding:'4px 8px',display:'flex',flexWrap:'wrap',gap:4,maxHeight:110,overflow:'auto'}}>
        {connections.slice(0,16).map((c,i) => (
          <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-sm"
            style={{background: c.suspicious?'rgba(255,51,51,0.1)':'rgba(0,212,255,0.05)',
                    border:`1px solid ${c.suspicious?'rgba(255,51,51,0.3)':'rgba(13,74,110,0.3)'}`,
                    fontSize:8,fontFamily:'monospace',color:c.suspicious?'#ff9999':'#4a7a99',whiteSpace:'nowrap'}}>
            <span>{c.country_code||'??'}</span>
            <span style={{color:c.suspicious?'#ff3333':'#00d4ff'}}>{c.ip.split('.').slice(0,2).join('.')}.*</span>
            <span>:{c.port}</span>
            <span style={{color:'rgba(168,216,234,0.4)'}}>{c.process}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ThreatMatrix() {
  const [data, setData] = useState<ThreatData | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const intervalRef = useRef<any>(null)

  const load = async (showScan=false) => {
    if (showScan) setScanning(true)
    try {
      const d = await apiFetch('/api/threat/matrix').then(r => r.json())
      setData(d)
    } catch {}
    setLoading(false); setScanning(false)
  }

  useEffect(() => {
    load(true)
    intervalRef.current = setInterval(() => load(), 30000)
    return () => clearInterval(intervalRef.current)
  }, [])

  const score = data?.threat_score || 0
  const scoreColor = score>70?'#ff3333':score>40?'#ff9900':score>20?'#ff6600':'#00ff88'

  return (
    <div style={{height:'100%',overflowY:'auto',padding:16}}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-orbitron text-xl font-black tracking-widest" style={{color:'#ff3333',textShadow:'0 0 20px rgba(255,51,51,0.4)'}}>
            THREAT MATRIX
          </h1>
          <div className="text-[8px] text-jarvis-muted font-mono tracking-wider mt-0.5">
            SECURITY WAR ROOM · {data?.total_connections||0} active connections · Scans every 30s
          </div>
        </div>
        <button onClick={() => load(true)} disabled={scanning}
          className="flex items-center gap-1.5 px-3 py-2 rounded-sm font-orbitron text-[8px] transition-all"
          style={{background:'rgba(255,51,51,0.08)',border:'1px solid rgba(255,51,51,0.3)',color:'#ff6666',
                  animation:scanning?'statusPulse 0.5s ease-in-out infinite':'none'}}>
          <Shield size={10} /> {scanning?'SCANNING...':'SCAN NOW'}
        </button>
      </div>

      {loading ? (
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:200,flexDirection:'column',gap:12}}>
          <div style={{width:44,height:44,border:'2px solid rgba(255,51,51,0.2)',borderTop:'2px solid #ff3333',borderRadius:'50%',animation:'arcSpin1 1s linear infinite'}} />
          <div className="font-orbitron text-[9px]" style={{color:'#ff3333'}}>SCANNING THREATS...</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Left — Connections */}
          <div className="space-y-3">
            <div className="panel p-4">
              <div className="flex items-center gap-2 mb-3 pb-1" style={{borderBottom:'1px solid rgba(255,51,51,0.15)'}}>
                <Globe size={11} style={{color:'#ff6666'}} />
                <span className="text-[9px] font-orbitron tracking-widest" style={{color:'rgba(255,102,102,0.7)'}}>LIVE CONNECTIONS</span>
              </div>
              <WorldMap connections={data?.connections||[]} />
            </div>

            <div className="panel p-4">
              <div className="text-[8px] font-orbitron mb-2" style={{color:'rgba(255,102,102,0.6)'}}>OPEN PORTS</div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {(data?.open_ports||[]).map((p,i)=>(
                  <div key={i} className="flex items-center justify-between px-2 py-1 rounded-sm"
                    style={{background:`rgba(${p.risk==='HIGH'?'255,51,51':p.risk==='MEDIUM'?'255,153,0':'0,212,255'},0.06)`,
                            border:`1px solid rgba(${p.risk==='HIGH'?'255,51,51':p.risk==='MEDIUM'?'255,153,0':'0,212,255'},0.2)`}}>
                    <span className="font-mono text-[9px]" style={{color:'#a8d8ea'}}>:{p.port}</span>
                    <span className="font-mono text-[8px]" style={{color:'#4a7a99'}}>{p.process}</span>
                    <span className="text-[7px] font-orbitron px-1" style={{color:p.risk==='HIGH'?'#ff3333':p.risk==='MEDIUM'?'#ff9900':'#4a7a99'}}>
                      {p.risk}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Center — Threat Score */}
          <div className="space-y-3">
            <div className="panel p-4 hud-corner text-center">
              <ThreatDial score={score} />
              <div className="grid grid-cols-3 gap-2 mt-3 text-[8px] text-center">
                {[
                  ['VPN',data?.vpn?.connected?'ACTIVE':'INACTIVE',data?.vpn?.connected?'#00ff88':'#ff3333'],
                  ['SUSPICIOUS',data?.suspicious_processes?.length||0,'#ff9900'],
                  ['ALERTS',data?.alerts?.length||0,data?.alerts?.length?'#ff6600':'#00ff88'],
                ].map(([l,v,c])=>(
                  <div key={l} className="p-2 rounded-sm" style={{background:'rgba(0,0,0,0.3)',border:'1px solid rgba(13,74,110,0.4)'}}>
                    <div className="font-orbitron text-lg font-black" style={{color:c as string}}>{v}</div>
                    <div style={{color:'rgba(168,216,234,0.4)'}}>{l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Alert feed */}
            <div className="panel p-4">
              <div className="flex items-center gap-2 mb-3 pb-1" style={{borderBottom:'1px solid rgba(255,51,51,0.15)'}}>
                <AlertTriangle size={11} style={{color:'#ff6666'}} />
                <span className="text-[9px] font-orbitron tracking-widest" style={{color:'rgba(255,102,102,0.7)'}}>LIVE ALERTS</span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {(data?.alerts||[]).length===0 ? (
                  <div className="text-[9px] text-center py-4" style={{color:'#00ff88'}}>✓ No active threats</div>
                ) : (data?.alerts||[]).map((a,i)=>(
                  <div key={i} className="flex items-start gap-2 p-2 rounded-sm"
                    style={{background:`rgba(${a.severity==='critical'?'255,51,51':a.severity==='warning'?'255,153,0':'0,212,255'},0.07)`,
                            border:`1px solid rgba(${a.severity==='critical'?'255,51,51':a.severity==='warning'?'255,153,0':'0,212,255'},0.2)`}}>
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-0.5"
                      style={{background:a.severity==='critical'?'#ff3333':a.severity==='warning'?'#ff9900':'#00d4ff'}} />
                    <span className="text-[8px] font-mono" style={{color:'#a8d8ea'}}>{a.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right — Suspicious processes + stats */}
          <div className="space-y-3">
            <div className="panel p-4">
              <div className="text-[8px] font-orbitron mb-3" style={{color:'rgba(255,102,102,0.6)'}}>SUSPICIOUS PROCESSES</div>
              {(data?.suspicious_processes||[]).length===0 ? (
                <div className="text-[9px] py-4 text-center" style={{color:'#00ff88'}}>✓ All processes nominal</div>
              ) : (data?.suspicious_processes||[]).map((p,i)=>(
                <div key={i} className="p-2 rounded-sm mb-2"
                  style={{background:'rgba(255,51,51,0.06)',border:'1px solid rgba(255,51,51,0.2)'}}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[10px] font-bold" style={{color:'#ff9999'}}>{p.name}</span>
                    <span className="text-[7px] font-orbitron px-1.5 py-0.5 rounded"
                      style={{background:p.risk==='HIGH'?'rgba(255,51,51,0.2)':'rgba(255,153,0,0.15)',
                              color:p.risk==='HIGH'?'#ff3333':'#ff9900'}}>{p.risk}</span>
                  </div>
                  <div className="text-[8px] font-mono" style={{color:'#4a7a99'}}>{p.reason}</div>
                  <div className="text-[7px]" style={{color:'rgba(168,216,234,0.3)'}}>PID {p.pid}</div>
                </div>
              ))}
            </div>

            <div className="panel p-4">
              <div className="text-[8px] font-orbitron mb-2" style={{color:'rgba(0,212,255,0.6)'}}>NETWORK COUNTRIES</div>
              <div className="flex flex-wrap gap-1.5">
                {[...new Set((data?.connections||[]).map(c=>c.country_code).filter(Boolean))].slice(0,12).map(cc=>(
                  <div key={cc} className="px-2 py-1 rounded text-[9px] font-orbitron"
                    style={{background:'rgba(0,212,255,0.07)',border:'1px solid rgba(0,212,255,0.2)',color:'#00d4ff'}}>
                    {cc}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
