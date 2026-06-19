import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { useWebSocket } from '../contexts/WebSocketContext'
import { Eye, Monitor, Clipboard, Shield, Gamepad2, Users, Camera, Power, PowerOff, Activity, Pin, Trash2, EyeOff, SlidersHorizontal, Globe, ChevronDown, ChevronRight, CheckSquare } from 'lucide-react'

interface FeaturesStatus {
  context: { mode: string; active_app: string; hours_worked_today: number; in_meeting: boolean; gaming: boolean }
  face: { status: string; user_present: boolean; confidence: number }
  network: { bandwidth: { sent_mbps: number; recv_mbps: number }; alerts: number }
  gaming: { active: boolean; game: string }
  meeting: { active: boolean }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] font-orbitron tracking-[0.25em] mb-2" style={{ color: 'rgba(0,212,255,0.55)' }}>{title}</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">{children}</div>
    </div>
  )
}

function FeatureCard({ icon, title, status, active, children, onStart, onStop }: {
  icon: React.ReactNode; title: string; status: string; active: boolean
  children?: React.ReactNode; onStart?: () => void; onStop?: () => void
}) {
  return (
    <div className="panel hud-corner p-4" style={{ borderColor: active ? 'rgba(0,212,255,0.3)' : 'rgba(13,74,110,0.4)', boxShadow: active ? '0 0 15px rgba(0,212,255,0.05)' : 'none' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span style={{ color: active ? '#00d4ff' : '#4a7a99' }}>{icon}</span>
          <span className="text-[10px] font-orbitron font-bold tracking-widest" style={{ color: active ? '#a8d8ea' : '#4a7a99' }}>{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: active ? '#00ff88' : '#4a7a99', boxShadow: active ? '0 0 6px #00ff88' : 'none', animation: active ? 'statusPulse 2s ease-in-out infinite' : 'none' }} />
          <span className="text-[8px] font-mono" style={{ color: active ? '#00ff88' : '#4a7a99' }}>{active ? 'ACTIVE' : 'STANDBY'}</span>
          {onStart && !active && <button onClick={onStart} className="text-[8px] px-2 py-0.5 rounded-sm font-orbitron" style={{ border: '1px solid rgba(0,212,255,0.3)', color: '#00d4ff' }}>START</button>}
          {onStop && active && <button onClick={onStop} className="text-[8px] px-2 py-0.5 rounded-sm font-orbitron" style={{ border: '1px solid rgba(255,51,51,0.3)', color: '#ff3333' }}>STOP</button>}
        </div>
      </div>
      <div className="text-[9px] text-jarvis-muted mb-2 font-mono">{status}</div>
      {children}
    </div>
  )
}

function StatBar({ label, value, max = 100, color = '#00d4ff' }: { label: string; value: number; max?: number; color?: string }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="mb-1.5">
      <div className="flex justify-between text-[8px] font-mono mb-0.5"><span style={{ color: '#4a7a99' }}>{label}</span><span style={{ color }}>{value.toFixed(1)}</span></div>
      <div className="h-1 rounded-full" style={{ background: 'rgba(13,74,110,0.3)' }}><div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 4px ${color}` }} /></div>
    </div>
  )
}

function Spark({ data, color = '#00d4ff', w = 120, h = 28 }: { data: number[]; color?: string; w?: number; h?: number }) {
  if (data.length < 2) return <svg width={w} height={h} />
  const max = Math.max(...data, 0.01), min = Math.min(...data, 0), rng = max - min || 1
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / rng) * (h - 2) - 1}`).join(' ')
  return <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"><polyline points={pts} fill="none" stroke={color} strokeWidth={1.3} /></svg>
}

export default function AdvancedFeatures() {
  const { lastMessage } = useWebSocket()
  const navigate = useNavigate()
  const [status, setStatus] = useState<FeaturesStatus | null>(null)
  const [clipboard, setClipboard] = useState<any[]>([])
  const [network, setNetwork] = useState<any>(null)
  const [gaming, setGaming] = useState<any>(null)
  const [faceTraining, setFaceTraining] = useState(false)
  const [faceMsg, setFaceMsg] = useState('')
  const [clipQuery, setClipQuery] = useState('')
  // new state
  const [meetings, setMeetings] = useState<any[]>([])
  const [gameSessions, setGameSessions] = useState<any[]>([])
  const [activity, setActivity] = useState<any[]>([])
  const [netHist, setNetHist] = useState<number[]>([])
  const [clipFilter, setClipFilter] = useState<'all' | 'url' | 'code' | 'text' | 'secret'>('all')
  const [mask, setMask] = useState(true)
  const [copied, setCopied] = useState('')
  const [pins, setPins] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('jarvis_clip_pins') || '[]') } catch { return [] } })
  const [openMeeting, setOpenMeeting] = useState<number | null>(null)
  const [settings, setSettings] = useState<any>(null)

  const load = async () => {
    try {
      const s = await apiFetch('/api/features/status').then(r => r.json()); setStatus(s)
      const n = await apiFetch('/api/network/status').then(r => r.json()); setNetwork(n)
      if (n?.bandwidth) setNetHist(h => [...h.slice(-39), (n.bandwidth.recv_mbps || 0)])
      const g = await apiFetch('/api/gaming/status').then(r => r.json()); setGaming(g)
    } catch {}
  }
  const loadClipboard = async () => { const d = await apiFetch(`/api/clipboard/history?limit=30${clipQuery ? `&q=${clipQuery}` : ''}`).then(r => r.json()).catch(() => []); setClipboard(d) }
  const loadAux = async () => {
    apiFetch('/api/meeting/history').then(r => r.json()).then(d => setMeetings(d.meetings || [])).catch(() => {})
    apiFetch('/api/gaming/history').then(r => r.json()).then(d => setGameSessions(d.sessions || [])).catch(() => {})
    apiFetch('/api/activity').then(r => r.json()).then(d => setActivity(d.events || [])).catch(() => {})
  }

  useEffect(() => {
    load(); loadClipboard(); loadAux()
    apiFetch('/api/settings').then(r => r.json()).then(setSettings).catch(() => {})
    const t = setInterval(() => { load(); loadClipboard() }, 5000)
    const t2 = setInterval(loadAux, 12000)
    return () => { clearInterval(t); clearInterval(t2) }
  }, [])

  useEffect(() => {
    if (lastMessage?.event === 'gaming_update') setGaming(lastMessage.data)
    if (lastMessage?.event === 'network_alert') load()
    if (lastMessage?.event === 'context_change') load()
    if (lastMessage?.event === 'meeting_event') loadAux()
  }, [lastMessage])

  const trainFace = async () => {
    setFaceTraining(true); setFaceMsg('Look at the camera — capturing for 5 seconds...')
    const r = await apiFetch('/api/face/train?seconds=5', { method: 'POST' }).then(x => x.json())
    setFaceMsg(r.success ? `✓ Face trained with ${r.samples} samples` : `✗ ${r.error}`); setFaceTraining(false)
    if (r.success) apiFetch('/api/face/start', { method: 'POST' })
  }

  const toggleModule = async (module: string, enable: boolean) => {
    await apiFetch('/api/features/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ module, enable }) })
    setTimeout(load, 600)
  }
  const startAll = async () => { await apiFetch('/api/features/start-all', { method: 'POST' }); setTimeout(load, 800) }
  const stopAll = async () => { await apiFetch('/api/features/stop-all', { method: 'POST' }); setTimeout(load, 800) }

  const copyClip = (text: string, id: string) => { navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(''), 1200) }
  const togglePin = (text: string) => setPins(p => { const np = p.includes(text) ? p.filter(x => x !== text) : [text, ...p].slice(0, 20); localStorage.setItem('jarvis_clip_pins', JSON.stringify(np)); return np })
  const clearClip = async () => { await apiFetch('/api/clipboard/history', { method: 'DELETE' }); loadClipboard() }
  const saveSetting = (patch: any) => { setSettings((s: any) => ({ ...s, ...patch })); apiFetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).catch(() => {}) }

  const ctx = status?.context, face = status?.face, meet = status?.meeting

  const filteredClip = clipboard.filter(it => clipFilter === 'all' ? true : clipFilter === 'secret' ? it.sensitive : it.type === clipFilter)
  const sortedClip = [...filteredClip].sort((a, b) => (pins.includes(b.text) ? 1 : 0) - (pins.includes(a.text) ? 1 : 0))

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-widest glow-text font-orbitron">ADVANCED SYSTEMS</h1>
          <p className="text-[10px] text-jarvis-muted mt-1 tracking-wider">Intelligent monitoring modules</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={startAll} className="flex items-center gap-1.5 text-[9px] px-3 py-1.5 rounded-sm font-orbitron" style={{ border: '1px solid rgba(0,255,136,0.4)', color: '#00ff88' }}><Power size={11} /> START ALL</button>
          <button onClick={stopAll} className="flex items-center gap-1.5 text-[9px] px-3 py-1.5 rounded-sm font-orbitron" style={{ border: '1px solid rgba(255,51,51,0.4)', color: '#ff3333' }}><PowerOff size={11} /> STOP ALL</button>
          <button onClick={() => { load(); loadAux() }} className="btn-primary text-[9px]">REFRESH</button>
        </div>
      </div>

      {/* ── AWARENESS ── */}
      <Section title="AWARENESS">
        <FeatureCard icon={<Camera size={14} />} title="FACE RECOGNITION"
          status={face?.user_present ? `You are present (${face?.confidence}% confidence)` : 'Watching for face...'}
          active={face?.status === 'user_present' || face?.status === 'watching'}
          onStart={() => toggleModule('face', true)} onStop={() => toggleModule('face', false)}>
          <div className="space-y-2">
            {faceMsg && <div className="text-[9px] font-mono" style={{ color: faceMsg.startsWith('✓') ? '#00ff88' : '#ff3333' }}>{faceMsg}</div>}
            <button onClick={trainFace} disabled={faceTraining} className="w-full text-[9px] py-1.5 rounded-sm font-orbitron" style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.25)', color: '#00d4ff' }}>{faceTraining ? 'CAPTURING...' : '📷 TRAIN MY FACE'}</button>
            <div className="text-[8px] text-jarvis-muted">Locks screen after 30s absence. Greets you when you return.</div>
          </div>
        </FeatureCard>

        <FeatureCard icon={<Monitor size={14} />} title="CONTEXT & FOCUS"
          status={ctx ? `Mode: ${ctx.mode.toUpperCase()} — ${ctx.active_app || 'no app'}` : 'Loading...'}
          active={!!ctx?.mode && ctx.mode !== 'idle'} onStart={() => toggleModule('context', true)} onStop={() => toggleModule('context', false)}>
          {ctx && (
            <div className="space-y-1.5">
              <div className="grid grid-cols-3 gap-2 text-[9px]">
                <div className="px-1 py-1 rounded-sm text-center font-orbitron" style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.15)' }}><div style={{ color: '#4a7a99' }}>MODE</div><div style={{ color: '#00d4ff' }}>{ctx.mode.toUpperCase()}</div></div>
                <div className="px-1 py-1 rounded-sm text-center font-orbitron" style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.15)' }}><div style={{ color: '#4a7a99' }}>WORKED</div><div style={{ color: '#00d4ff' }}>{ctx.hours_worked_today}h</div></div>
                <div className="px-1 py-1 rounded-sm text-center font-orbitron" style={{ background: face?.user_present ? 'rgba(0,255,136,0.06)' : 'rgba(74,122,153,0.1)', border: '1px solid rgba(0,212,255,0.15)' }}><div style={{ color: '#4a7a99' }}>PRESENT</div><div style={{ color: face?.user_present ? '#00ff88' : '#4a7a99' }}>{face?.user_present ? 'YES' : 'AWAY'}</div></div>
              </div>
              <div className="flex gap-2 text-[8px]">
                {ctx.in_meeting && <span className="px-2 py-0.5 rounded-sm" style={{ background: 'rgba(255,153,0,0.1)', color: '#ff9900', border: '1px solid rgba(255,153,0,0.3)' }}>IN MEETING</span>}
                {ctx.gaming && <span className="px-2 py-0.5 rounded-sm" style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.3)' }}>GAMING</span>}
              </div>
            </div>
          )}
        </FeatureCard>

        {/* Meeting hub */}
        <FeatureCard icon={<Users size={14} />} title="MEETING HUB"
          status={meet?.active ? 'Meeting in progress — transcribing…' : `${meetings.length} past meeting${meetings.length === 1 ? '' : 's'}`}
          active={!!meet?.active} onStart={() => toggleModule('meeting', true)} onStop={() => toggleModule('meeting', false)}>
          <div className="space-y-2 max-h-52 overflow-y-auto">
            {meetings.length === 0 && <div className="text-[9px] text-jarvis-muted">No meetings recorded yet. JARVIS auto-detects Teams/Zoom/Meet, transcribes, and extracts action items.</div>}
            {meetings.map((m, i) => (
              <div key={i} className="rounded-sm" style={{ background: 'rgba(4,22,40,0.6)', border: '1px solid rgba(13,74,110,0.3)' }}>
                <button onClick={() => setOpenMeeting(openMeeting === i ? null : i)} className="w-full flex items-center justify-between px-2 py-1.5">
                  <span className="text-[9px] font-mono" style={{ color: '#a8d8ea' }}>{m.app || 'Meeting'} · {m.duration_minutes}m</span>
                  <span className="flex items-center gap-1 text-[8px]" style={{ color: '#4a7a99' }}>{(m.action_items?.length || 0)} actions {openMeeting === i ? <ChevronDown size={10} /> : <ChevronRight size={10} />}</span>
                </button>
                {openMeeting === i && (
                  <div className="px-2 pb-2 space-y-1.5">
                    {m.summary && <div className="text-[9px]" style={{ color: '#b8d8e8' }}>{m.summary}</div>}
                    {m.action_items?.length > 0 && <div className="space-y-0.5">{m.action_items.map((a: string, j: number) => <div key={j} className="flex gap-1 text-[9px]" style={{ color: '#a8d8ea' }}><CheckSquare size={9} style={{ color: '#00ff88', flexShrink: 0, marginTop: 1 }} />{a}</div>)}</div>}
                    {m.transcript?.length > 0 && <div className="text-[8px] text-jarvis-muted max-h-20 overflow-y-auto mt-1 pt-1 border-t border-jarvis-border/30">{m.transcript.slice(-8).map((t: any, j: number) => <div key={j}>[{t.time}] {t.text}</div>)}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </FeatureCard>
      </Section>

      {/* ── SECURITY ── */}
      <Section title="SECURITY">
        <FeatureCard icon={<Shield size={14} />} title="NETWORK GUARDIAN"
          status={network ? `↑${network.bandwidth?.sent_mbps?.toFixed(2)} ↓${network.bandwidth?.recv_mbps?.toFixed(2)} MB/s` : 'Loading...'}
          active={!!network} onStart={() => toggleModule('network', true)} onStop={() => toggleModule('network', false)}>
          {network && (
            <div className="space-y-2">
              <Spark data={netHist} color="#00d4ff" />
              <div className="grid grid-cols-2 gap-1 text-[8px]">
                <div className="px-2 py-1 rounded-sm text-center" style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.1)' }}><div style={{ color: '#4a7a99' }}>CONNECTIONS</div><div style={{ color: '#00d4ff' }}>{network.connections?.length ?? 0}</div></div>
                <div className="px-2 py-1 rounded-sm text-center" style={{ background: network.alerts?.length > 0 ? 'rgba(255,51,51,0.08)' : 'rgba(0,255,136,0.05)', border: `1px solid ${network.alerts?.length > 0 ? 'rgba(255,51,51,0.2)' : 'rgba(0,255,136,0.1)'}` }}><div style={{ color: '#4a7a99' }}>ALERTS</div><div style={{ color: network.alerts?.length > 0 ? '#ff3333' : '#00ff88' }}>{network.alerts?.length ?? 0}</div></div>
              </div>
              <button onClick={() => navigate('/warroom')} className="w-full flex items-center justify-center gap-1.5 text-[8px] py-1.5 rounded-sm font-orbitron" style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.25)', color: '#00d4ff' }}><Globe size={10} /> OPEN IN WAR ROOM</button>
            </div>
          )}
        </FeatureCard>

        <FeatureCard icon={<Clipboard size={14} />} title="SMART CLIPBOARD"
          status={`${clipboard.length} items · ${pins.length} pinned`} active={clipboard.length > 0}
          onStart={() => toggleModule('clipboard', true)} onStop={() => toggleModule('clipboard', false)}>
          <div className="space-y-2">
            <div className="flex gap-1">
              <input value={clipQuery} onChange={e => setClipQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadClipboard()} placeholder="Search…" className="input-jarvis flex-1 text-[10px] py-1" />
              <button onClick={() => setMask(m => !m)} title="Mask secrets" className="px-2 rounded-sm" style={{ background: 'rgba(4,22,40,0.6)', border: '1px solid rgba(13,74,110,0.4)', color: mask ? '#ff9900' : '#4a7a99' }}><EyeOff size={11} /></button>
              <button onClick={clearClip} title="Clear all" className="px-2 rounded-sm" style={{ background: 'rgba(4,22,40,0.6)', border: '1px solid rgba(255,51,51,0.3)', color: '#ff6464' }}><Trash2 size={11} /></button>
            </div>
            <div className="flex gap-1">
              {(['all', 'url', 'code', 'text', 'secret'] as const).map(f => (
                <button key={f} onClick={() => setClipFilter(f)} className="text-[7px] px-1.5 py-0.5 rounded-sm font-orbitron" style={{ background: clipFilter === f ? 'rgba(0,212,255,0.15)' : 'rgba(4,22,40,0.5)', border: `1px solid ${clipFilter === f ? 'rgba(0,212,255,0.4)' : 'rgba(13,74,110,0.3)'}`, color: clipFilter === f ? '#00d4ff' : '#4a7a99' }}>{f.toUpperCase()}</button>
              ))}
            </div>
            <div className="space-y-1 max-h-44 overflow-y-auto">
              {sortedClip.slice(0, 12).map((item, i) => {
                const id = `${item.id}-${i}`; const pinned = pins.includes(item.text)
                return (
                  <div key={id} className="flex items-start gap-1.5 px-2 py-1.5 rounded-sm group" style={{ background: pinned ? 'rgba(0,212,255,0.06)' : 'rgba(4,22,40,0.6)', border: `1px solid ${pinned ? 'rgba(0,212,255,0.3)' : 'rgba(13,74,110,0.3)'}` }}>
                    <span className="text-[8px] mt-0.5" style={{ color: item.sensitive ? '#ff3333' : '#4a7a99' }}>{item.type === 'url' ? '🔗' : item.type === 'code' ? '💻' : item.sensitive ? '🔐' : '📋'}</span>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => copyClip(item.text, id)}>
                      <div className="text-[9px] font-mono truncate" style={{ color: item.sensitive ? '#ff9900' : '#a8d8ea' }}>{item.sensitive && mask ? '••••••••••' : item.preview}</div>
                      <div className="text-[7px] text-jarvis-muted">{copied === id ? '✓ Copied!' : `${item.app} · ${item.time}`}</div>
                    </div>
                    <button onClick={() => togglePin(item.text)} className="opacity-60 hover:opacity-100"><Pin size={10} style={{ color: pinned ? '#00d4ff' : '#4a7a99', fill: pinned ? '#00d4ff' : 'none' }} /></button>
                  </div>
                )
              })}
              {sortedClip.length === 0 && <div className="text-[9px] text-jarvis-muted text-center py-3">No items match this filter.</div>}
            </div>
          </div>
        </FeatureCard>
      </Section>

      {/* ── PERFORMANCE ── */}
      <Section title="PERFORMANCE">
        <FeatureCard icon={<Gamepad2 size={14} />} title="GAMING COMPANION"
          status={gaming?.active ? `${gaming.game} — live` : `${gameSessions.length} past session${gameSessions.length === 1 ? '' : 's'}`}
          active={!!gaming?.active} onStart={() => toggleModule('gaming', true)} onStop={() => toggleModule('gaming', false)}>
          <div className="space-y-1.5">
            {gaming?.active ? (
              <>
                <StatBar label="CPU TEMP (°C)" value={gaming.cpu_temp} max={100} color={gaming.cpu_temp > 80 ? '#ff3333' : '#00d4ff'} />
                <StatBar label="GPU TEMP (°C)" value={gaming.gpu_temp} max={100} color={gaming.gpu_temp > 80 ? '#ff9900' : '#00aaff'} />
                <StatBar label="CPU %" value={gaming.cpu_percent} color="#00d4ff" />
                <div className="flex justify-between text-[8px] font-mono"><span style={{ color: '#4a7a99' }}>PING</span><span style={{ color: gaming.ping_ms > 100 ? '#ff3333' : '#00ff88' }}>{gaming.ping_ms}ms</span></div>
              </>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {gameSessions.length === 0 && <div className="text-[8px] text-jarvis-muted">Auto-detects Valorant, CS2, GTA V + more. Tracks temps & ping; logs each session.</div>}
                {gameSessions.map((s, i) => (
                  <div key={i} className="px-2 py-1 rounded-sm text-[8px]" style={{ background: 'rgba(4,22,40,0.6)', border: '1px solid rgba(13,74,110,0.3)' }}>
                    <div className="flex justify-between"><span style={{ color: '#a8d8ea' }}>{s.game}</span><span style={{ color: '#4a7a99' }}>{s.duration_minutes}m · {s.ended_at?.split(' ')[1] || ''}</span></div>
                    <div className="flex gap-2 text-[7px]" style={{ color: '#4a7a99' }}><span>peak CPU <b style={{ color: s.peak_cpu_temp > 80 ? '#ff6464' : '#00d4ff' }}>{s.peak_cpu_temp}°</b></span><span>GPU <b style={{ color: '#00aaff' }}>{s.peak_gpu_temp}°</b></span><span>ping <b style={{ color: '#00ff88' }}>{s.peak_ping}ms</b></span></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </FeatureCard>

        {/* Tuning */}
        <FeatureCard icon={<SlidersHorizontal size={14} />} title="MONITOR TUNING" status="Thresholds & intervals" active={true}>
          {settings ? (
            <div className="space-y-2.5">
              {[['break_interval_mins', 'Break reminder (min)', 30, 240], ['cpu_alert_threshold', 'CPU alert %', 50, 100], ['ram_alert_threshold', 'RAM alert %', 50, 100]].map(([key, label, min, max]) => (
                <div key={key as string}>
                  <div className="flex justify-between text-[8px] mb-0.5"><span style={{ color: '#4a7a99' }}>{label}</span><span style={{ color: '#00d4ff' }}>{settings[key as string]}</span></div>
                  <input type="range" min={min as number} max={max as number} value={settings[key as string] ?? min} onChange={e => saveSetting({ [key as string]: Number(e.target.value) })} className="w-full" style={{ accentColor: '#00d4ff' }} />
                </div>
              ))}
              <div className="text-[8px] text-jarvis-muted">Saved instantly. More options in Settings.</div>
            </div>
          ) : <div className="text-[9px] text-jarvis-muted">Loading settings…</div>}
        </FeatureCard>
      </Section>

      {/* ── INTEGRATIONS ── */}
      <Section title="INTEGRATIONS">
        <FeatureCard icon={<Eye size={14} />} title="OBS HUD OVERLAY" status="Browser source for OBS streaming" active={true}>
          <div className="space-y-2">
            <div className="text-[9px] text-jarvis-muted">Add as a Browser Source in OBS:</div>
            <div className="flex items-center gap-1">
              <code className="flex-1 text-[9px] px-2 py-1 rounded-sm font-mono break-all" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,212,255,0.2)', color: '#00d4ff' }}>http://localhost:8000/obs-overlay</code>
              <button onClick={() => { navigator.clipboard.writeText('http://localhost:8000/obs-overlay'); setCopied('obs'); setTimeout(() => setCopied(''), 1200) }} className="px-2 py-1 text-[8px] rounded-sm flex-shrink-0" style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', color: '#00d4ff' }}>{copied === 'obs' ? '✓' : 'COPY'}</button>
            </div>
            <a href="http://localhost:8000/obs-overlay" target="_blank" rel="noreferrer" className="block text-center text-[9px] py-1.5 rounded-sm font-orbitron" style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.25)', color: '#00d4ff' }}>PREVIEW OVERLAY →</a>
          </div>
        </FeatureCard>
      </Section>

      {/* ── ACTIVITY FEED ── */}
      <div>
        <div className="text-[9px] font-orbitron tracking-[0.25em] mb-2 flex items-center gap-1.5" style={{ color: 'rgba(0,212,255,0.55)' }}><Activity size={11} /> ACTIVITY FEED</div>
        <div className="panel p-3">
          {activity.length === 0 ? <div className="text-[9px] text-jarvis-muted text-center py-3">No detections yet. Meetings, games, and alerts will appear here.</div> : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {activity.map((e, i) => {
                const c = e.severity === 'success' ? '#00ff88' : e.severity === 'warning' ? '#ff9900' : '#00d4ff'
                const kindIcon = e.kind === 'meeting' ? '👥' : e.kind === 'gaming' ? '🎮' : e.kind === 'network' ? '🛡' : '•'
                return (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-sm text-[9px]" style={{ background: 'rgba(4,22,40,0.4)' }}>
                    <span>{kindIcon}</span>
                    <span className="flex-1" style={{ color: '#a8d8ea' }}>{e.message}</span>
                    <span className="text-[7px] font-mono" style={{ color: c }}>{new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
