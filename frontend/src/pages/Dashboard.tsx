import { useEffect, useState } from 'react'
import { Cpu, HardDrive, MemoryStick, Activity, AlertTriangle, Zap, Thermometer, Wind, Droplets, MapPin, Wifi, ArrowUp, ArrowDown, Grid3x3, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useWebSocket } from '../contexts/WebSocketContext'
import { apiFetch } from '../lib/api'
import { useCountUp } from '../hooks/useCountUp'

interface Vitals {
  cpu: number; per_core: number[]; ram: number; ram_used_gb: number; ram_total_gb: number
  disk: number; net_up_kbps: number; net_down_kbps: number
  gpu?: { percent: number; temp_c: number; mem_percent: number } | null
  battery?: { percent: number; plugged: boolean } | null; cores: number
}

function fmtRate(kbps: number) {
  if (kbps >= 1024) return `${(kbps / 1024).toFixed(1)} MB/s`
  return `${Math.round(kbps)} KB/s`
}

// Computed system health — penalty-based, so it actually reflects load
function computeHealth(cpu: number, ram: number, disk: number, gpuTemp: number | undefined, alerts: number) {
  let s = 100
  s -= Math.max(0, cpu - 50) * 0.55
  s -= Math.max(0, ram - 60) * 0.6
  s -= Math.max(0, disk - 80) * 1.2
  if (gpuTemp) s -= Math.max(0, gpuTemp - 78) * 1.6
  s -= alerts * 5
  s = Math.max(0, Math.min(100, Math.round(s)))
  const state = s >= 75 ? 'NOMINAL' : s >= 45 ? 'ELEVATED' : 'CRITICAL'
  const color = s >= 75 ? '#00ff88' : s >= 45 ? '#ff9900' : '#ff3333'
  const Icon = s >= 75 ? ShieldCheck : s >= 45 ? ShieldAlert : ShieldX
  return { score: s, state, color, Icon }
}

function Sparkline({ data, color, w = 80, h = 24 }: { data: number[]; color: string; w?: number; h?: number }) {
  if (data.length < 2) return <svg width={w} height={h} />
  const max = Math.max(...data, 1), min = Math.min(...data, 0), rng = max - min || 1
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / rng) * (h - 2) - 1}`).join(' ')
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.3} opacity={0.9} strokeLinejoin="round" />
    </svg>
  )
}

function HeroCell({ label, value, unit, color, spark, sub }: { label: string; value: number; unit: string; color: string; spark?: number[]; sub?: string }) {
  const a = useCountUp(value, 500)
  return (
    <div className="panel hud-corner p-3 flex flex-col gap-1" style={{ minHeight: 92 }}>
      <div className="text-[8px] tracking-[0.18em] font-orbitron text-jarvis-muted">{label}</div>
      <div className="flex items-end justify-between gap-2">
        <div className="font-orbitron font-black leading-none" style={{ fontSize: 26, color, textShadow: `0 0 12px ${color}55` }}>
          {a.toFixed(0)}<span style={{ fontSize: 12, opacity: 0.6 }}>{unit}</span>
        </div>
        {spark && <Sparkline data={spark} color={color} />}
      </div>
      {sub && <div className="text-[8px] text-jarvis-muted/70">{sub}</div>}
    </div>
  )
}

function PerCoreHeatmap({ cores }: { cores: number[] }) {
  return (
    <div className="panel hud-corner p-4">
      <div className="flex items-center gap-2 mb-3">
        <Grid3x3 size={11} style={{ color: '#00d4ff' }} />
        <span className="text-[9px] tracking-[0.15em] font-orbitron text-jarvis-muted">PER-CORE CPU</span>
        <span className="ml-auto text-[9px] font-orbitron" style={{ color: '#4a7a99' }}>{cores.length} CORES</span>
      </div>
      <div className="flex items-end gap-[3px]" style={{ height: 88 }}>
        {cores.length === 0 && <div className="text-jarvis-muted text-[10px] font-mono self-center">AWAITING DATA...</div>}
        {cores.map((c, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end items-center" style={{ height: '100%' }} title={`Core ${i}: ${c.toFixed(0)}%`}>
            <div style={{ width: '100%', height: `${Math.max(4, c)}%`, background: getColor(c), boxShadow: `0 0 6px ${getColor(c)}99`, borderRadius: '2px 2px 0 0', transition: 'height 0.45s ease, background 0.3s' }} />
          </div>
        ))}
      </div>
      {cores.length > 0 && (
        <div className="flex justify-between mt-1.5 text-[7px] font-mono text-jarvis-muted/50">
          <span>C0</span><span>C{cores.length - 1}</span>
        </div>
      )}
    </div>
  )
}

function NetworkGraph({ data }: { data: { i: number; up: number; down: number }[] }) {
  const last = data[data.length - 1]
  return (
    <div className="panel hud-corner p-4">
      <div className="flex items-center gap-2 mb-2">
        <Wifi size={11} style={{ color: '#00d4ff' }} />
        <span className="text-[9px] tracking-[0.15em] font-orbitron text-jarvis-muted">NETWORK THROUGHPUT</span>
        <div className="ml-auto flex items-center gap-3 text-[9px] font-orbitron">
          <span className="flex items-center gap-1" style={{ color: '#00ff88' }}><ArrowUp size={9} />{last ? fmtRate(last.up) : '0 KB/s'}</span>
          <span className="flex items-center gap-1" style={{ color: '#00d4ff' }}><ArrowDown size={9} />{last ? fmtRate(last.down) : '0 KB/s'}</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={88}>
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: -34 }}>
          <defs>
            <linearGradient id="netDown" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00d4ff" stopOpacity={0.3} /><stop offset="95%" stopColor="#00d4ff" stopOpacity={0} /></linearGradient>
            <linearGradient id="netUp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00ff88" stopOpacity={0.25} /><stop offset="95%" stopColor="#00ff88" stopOpacity={0} /></linearGradient>
          </defs>
          <XAxis dataKey="i" tick={false} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 8, fill: '#4a7a99' }} axisLine={false} tickLine={false} width={34} />
          <Tooltip contentStyle={{ background: '#041628', border: '1px solid #00d4ff', fontSize: 10, borderRadius: 2 }} formatter={(v: number, n: string) => [fmtRate(v), n === 'down' ? 'Down' : 'Up']} labelFormatter={() => ''} />
          <Area type="monotone" dataKey="down" stroke="#00d4ff" strokeWidth={1.4} fill="url(#netDown)" dot={false} isAnimationActive={false} />
          <Area type="monotone" dataKey="up" stroke="#00ff88" strokeWidth={1.4} fill="url(#netUp)" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

interface Weather {
  location: string
  temperature_c: number
  feels_like_c: number
  humidity: number
  wind_speed_kmh: number
  description: string
  forecast_5day: { date: string; max: number; min: number; description: string }[]
}

interface SystemStatus {
  cpu_percent: number
  ram_percent: number
  ram_used_gb: number
  ram_total_gb: number
  disks: { mount: string; percent: number; free_gb: number; total_gb: number }[]
  battery?: { percent: number; plugged: boolean }
  timestamp: string
}

interface AlertItem {
  id: number; title: string; message: string; severity: string; time: string
}

const MAX_HISTORY = 40

function getColor(pct: number) {
  if (pct > 85) return '#ff3333'
  if (pct > 65) return '#ff9900'
  return '#00d4ff'
}

function CircularGauge({ value, max = 100, label, sublabel, icon }: {
  value: number; max?: number; label: string; sublabel?: string; icon?: React.ReactNode
}) {
  const animated = useCountUp(value)
  const pct = Math.min(animated / max, 1)
  const color = getColor(pct * 100)
  const R = 38
  const circumference = 2 * Math.PI * R
  const stroke = circumference * (1 - pct)

  return (
    <div className="panel hud-corner flex flex-col items-center justify-center p-4 gap-1"
      style={{ minHeight: 150 }}>
      <div className="relative">
        <svg width="100" height="100" viewBox="0 0 100 100">
          {/* Background track */}
          <circle cx="50" cy="50" r={R} fill="none"
            stroke="rgba(13,74,110,0.4)" strokeWidth="6" />
          {/* Tick marks */}
          {Array.from({ length: 20 }).map((_, i) => {
            const a = (i / 20) * Math.PI * 2 - Math.PI / 2
            const x1 = 50 + (R + 4) * Math.cos(a)
            const y1 = 50 + (R + 4) * Math.sin(a)
            const x2 = 50 + (R + 8) * Math.cos(a)
            const y2 = 50 + (R + 8) * Math.sin(a)
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="rgba(0,212,255,0.2)" strokeWidth="1" />
          })}
          {/* Value arc */}
          <circle cx="50" cy="50" r={R} fill="none"
            stroke={color} strokeWidth="6"
            strokeDasharray={circumference}
            strokeDashoffset={stroke}
            strokeLinecap="round"
            className="gauge-ring"
            style={{
              filter: `drop-shadow(0 0 4px ${color})`,
              transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease',
            }}
          />
          {/* Center icon */}
          <foreignObject x="33" y="28" width="34" height="24">
            <div style={{ display: 'flex', justifyContent: 'center', color: color, opacity: 0.8 }}>
              {icon}
            </div>
          </foreignObject>
          {/* Value text */}
          <text x="50" y="60" textAnchor="middle"
            style={{ fontFamily: 'Orbitron,monospace', fontSize: 13, fontWeight: 700, fill: color,
              filter: `drop-shadow(0 0 3px ${color})` }}>
            {animated.toFixed(0)}%
          </text>
        </svg>
      </div>
      <div className="text-[9px] tracking-[0.15em] font-orbitron text-jarvis-muted text-center">{label}</div>
      {sublabel && <div className="text-[8px] text-jarvis-muted/60 text-center">{sublabel}</div>}
    </div>
  )
}

function MiniChart({ title, data, color }: { title: string; data: {t:string;v:number}[]; color: string }) {
  return (
    <div className="panel hud-corner p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={11} style={{ color }} />
        <span className="text-[9px] tracking-[0.15em] font-orbitron text-jarvis-muted">{title}</span>
        <span className="ml-auto font-orbitron text-[10px]" style={{ color }}>
          {data.length ? data[data.length-1].v.toFixed(1) : '0.0'}%
        </span>
      </div>
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: -28 }}>
          <defs>
            <linearGradient id={`g${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" tick={false} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 8, fill: '#4a7a99' }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: '#041628', border: `1px solid ${color}`, fontSize: 10, borderRadius: 2 }}
            itemStyle={{ color }}
            formatter={(v: number) => [`${v.toFixed(1)}%`, '']}
          />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
            fill={`url(#g${color.replace('#','')})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function WeatherWidget({ weather }: { weather: Weather | null }) {
  if (!weather) return (
    <div className="panel hud-corner p-4 flex items-center justify-center" style={{ minHeight: 100 }}>
      <div className="text-jarvis-muted text-xs font-mono animate-pulse">FETCHING WEATHER...</div>
    </div>
  )
  if ('error' in (weather as any)) return null

  return (
    <div className="panel hud-corner p-4">
      <div className="flex items-center gap-2 mb-3">
        <MapPin size={11} style={{ color: '#00d4ff' }} />
        <span className="text-[9px] tracking-[0.15em] font-orbitron text-jarvis-muted">WEATHER — {weather.location?.toUpperCase()}</span>
      </div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-orbitron text-3xl font-bold" style={{ color: '#00d4ff', textShadow: '0 0 10px rgba(0,212,255,0.5)' }}>
            {Math.round(weather.temperature_c)}°C
          </div>
          <div className="text-xs text-jarvis-muted mt-0.5">{weather.description}</div>
        </div>
        <div className="text-right space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] text-jarvis-muted justify-end">
            <Droplets size={10} style={{ color: '#00aaff' }} />
            {weather.humidity}% humidity
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-jarvis-muted justify-end">
            <Wind size={10} style={{ color: '#00aaff' }} />
            {Math.round(weather.wind_speed_kmh)} km/h
          </div>
          <div className="text-[9px] text-jarvis-muted">Feels {Math.round(weather.feels_like_c)}°C</div>
        </div>
      </div>
      {/* 5-day forecast */}
      <div className="flex gap-1.5 overflow-x-auto">
        {weather.forecast_5day?.slice(0, 5).map((day, i) => (
          <div key={i} className="flex-1 text-center px-1 py-1.5 rounded-sm min-w-0"
            style={{ background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.1)' }}>
            <div className="text-[8px] text-jarvis-muted font-mono">
              {i === 0 ? 'TODAY' : new Date(day.date).toLocaleDateString('en', { weekday: 'short' }).toUpperCase()}
            </div>
            <div className="text-[9px] font-orbitron mt-0.5" style={{ color: '#00d4ff' }}>{Math.round(day.max)}°</div>
            <div className="text-[8px] text-jarvis-muted">{Math.round(day.min)}°</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { lastMessage } = useWebSocket()
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [cpuHistory, setCpuHistory] = useState<{t:string;v:number}[]>([])
  const [ramHistory, setRamHistory] = useState<{t:string;v:number}[]>([])
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [alertId, setAlertId] = useState(0)
  const [weather, setWeather] = useState<Weather | null>(null)
  const [vitals, setVitals] = useState<Vitals | null>(null)
  const [netHist, setNetHist] = useState<{ i: number; up: number; down: number }[]>([])
  const [gpuHist, setGpuHist] = useState<number[]>([])

  // Fast vitals poll (CPU/per-core/RAM/disk/net/GPU) for the live telemetry
  useEffect(() => {
    let alive = true, i = 0
    const poll = async () => {
      try {
        const r = await apiFetch('/api/reactor/vitals'); const v: Vitals = await r.json()
        if (!alive) return
        setVitals(v)
        setNetHist(h => [...h.slice(-39), { i: i++, up: v.net_up_kbps || 0, down: v.net_down_kbps || 0 }])
        if (v.gpu) setGpuHist(h => [...h.slice(-39), v.gpu!.percent])
      } catch { /* offline */ }
    }
    poll(); const id = setInterval(poll, 1500)
    return () => { alive = false; clearInterval(id) }
  }, [])

  useEffect(() => {
    // Fetch initial system status immediately (don't wait for WebSocket)
    apiFetch('/api/health/system').then(r => r.json()).then((s: SystemStatus) => {
      setStatus(s)
      const t = new Date().toLocaleTimeString('en', { hour12: false })
      setCpuHistory([{ t, v: s.cpu_percent }])
      setRamHistory([{ t, v: s.ram_percent }])
    }).catch(() => {})
    // Refresh every 30s via REST as fallback when WebSocket is down
    const sysT = setInterval(() => {
      apiFetch('/api/health/system').then(r => r.json()).then((s: SystemStatus) => {
        setStatus(prev => prev ?? s) // only fill if WS hasn't given us data
      }).catch(() => {})
    }, 30000)
    // Weather
    apiFetch('/api/weather/current').then(r => r.json()).then(setWeather).catch(() => {})
    const weatherT = setInterval(() => {
      apiFetch('/api/weather/current').then(r => r.json()).then(setWeather).catch(() => {})
    }, 10 * 60 * 1000)
    return () => { clearInterval(sysT); clearInterval(weatherT) }
  }, [])

  useEffect(() => {
    if (!lastMessage) return
    if (lastMessage.event === 'system_status') {
      const s = lastMessage.data as SystemStatus
      setStatus(s)
      const t = new Date().toLocaleTimeString('en', { hour12: false })
      setCpuHistory(h => [...h.slice(-MAX_HISTORY+1), { t, v: s.cpu_percent }])
      setRamHistory(h => [...h.slice(-MAX_HISTORY+1), { t, v: s.ram_percent }])
    }
    if (lastMessage.event === 'notification') {
      const n = lastMessage.data as { title: string; message: string; severity: string }
      setAlertId(id => id + 1)
      setAlerts(prev => [
        { id: alertId + 1, ...n, time: new Date().toLocaleTimeString() },
        ...prev.slice(0, 9),
      ])
    }
  }, [lastMessage])

  const cpu = vitals?.cpu ?? status?.cpu_percent ?? 0
  const ram = vitals?.ram ?? status?.ram_percent ?? 0
  const disk = vitals?.disk ?? status?.disks?.[0]?.percent ?? 0
  const battery = vitals?.battery?.percent ?? status?.battery?.percent ?? null
  const alertCount = useCountUp(alerts.length, 300)

  const health = computeHealth(cpu, ram, disk, vitals?.gpu?.temp_c, alerts.length)
  const animHealth = useCountUp(health.score, 600)
  const cpuSpark = cpuHistory.map(h => h.v)
  const ramSpark = ramHistory.map(h => h.v)
  const netDownSpark = netHist.map(h => h.down)

  return (
    <div className="p-5 h-full overflow-auto space-y-4">

      {/* Header — dynamic health */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-orbitron text-lg font-bold tracking-[0.25em] glow-text">SYSTEM STATUS</h1>
          <p className="text-[9px] text-jarvis-muted mt-1 tracking-widest">
            REAL-TIME DIAGNOSTICS — {new Date().toLocaleDateString('en', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}
          </p>
        </div>
        <div className="flex items-center gap-3 px-4 py-2 rounded-sm transition-colors duration-500"
          style={{ border: `1px solid ${health.color}44`, background: `${health.color}0d`, boxShadow: `0 0 16px ${health.color}22` }}>
          <health.Icon size={22} style={{ color: health.color, filter: `drop-shadow(0 0 5px ${health.color})` }} />
          <div className="text-right">
            <div className="font-orbitron font-black leading-none" style={{ fontSize: 30, color: health.color, textShadow: `0 0 14px ${health.color}66` }}>
              {animHealth.toFixed(0)}<span style={{ fontSize: 13, opacity: 0.55 }}>/100</span>
            </div>
            <div className="font-orbitron text-[9px] tracking-[0.2em] mt-0.5" style={{ color: health.color }}>{health.state}</div>
          </div>
        </div>
      </div>

      {/* Hero vitals strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <HeroCell label="HEALTH" value={health.score} unit="" color={health.color} sub={health.state} />
        <HeroCell label="CPU LOAD" value={cpu} unit="%" color={getColor(cpu)} spark={cpuSpark} sub={vitals ? `${vitals.cores} cores` : undefined} />
        <HeroCell label="MEMORY" value={ram} unit="%" color={getColor(ram)} spark={ramSpark} sub={vitals ? `${vitals.ram_used_gb}/${vitals.ram_total_gb} GB` : undefined} />
        {vitals?.gpu
          ? <HeroCell label="GPU" value={vitals.gpu.percent} unit="%" color={getColor(vitals.gpu.percent)} spark={gpuHist} sub={`${Math.round(vitals.gpu.temp_c)}°C`} />
          : <HeroCell label="NET DOWN" value={vitals?.net_down_kbps ?? 0} unit="" color="#00d4ff" spark={netDownSpark} sub={vitals ? fmtRate(vitals.net_down_kbps) : 'KB/s'} />}
        <HeroCell label="DISK" value={disk} unit="%" color={getColor(disk)} sub={status?.disks?.[0] ? `${status.disks[0].free_gb} GB free` : undefined} />
      </div>

      {/* Circular gauges */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <CircularGauge value={cpu} label="CPU LOAD" icon={<Cpu size={14} />} />
        <CircularGauge value={ram} label="RAM USAGE"
          sublabel={status ? `${status.ram_used_gb} / ${status.ram_total_gb} GB` : undefined}
          icon={<MemoryStick size={14} />} />
        <CircularGauge value={disk} label="DISK USAGE"
          sublabel={status?.disks?.[0] ? `${status.disks[0].free_gb} GB FREE` : undefined}
          icon={<HardDrive size={14} />} />
        {battery !== null ? (
          <CircularGauge value={battery} label="BATTERY"
            sublabel={status?.battery?.plugged ? 'CHARGING' : 'ON BATTERY'}
            icon={<Zap size={14} />} />
        ) : (
          <div className="panel hud-corner flex flex-col items-center justify-center p-4 gap-2"
            style={{ minHeight: 150 }}>
            <Thermometer size={20} style={{ color: '#4a7a99' }} />
            <div className="text-[9px] tracking-widest font-orbitron text-jarvis-muted">TEMP</div>
            <div className="text-jarvis-muted text-xs">N/A</div>
          </div>
        )}
      </div>

      {/* Per-core heatmap + live network throughput */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <PerCoreHeatmap cores={vitals?.per_core ?? []} />
        <NetworkGraph data={netHist} />
      </div>

      {/* Charts + Weather */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <MiniChart title="CPU LOAD HISTORY" data={cpuHistory} color="#00d4ff" />
        <MiniChart title="RAM USAGE HISTORY" data={ramHistory} color="#00aaff" />
        <WeatherWidget weather={weather} />
      </div>

      {/* Storage + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Storage */}
        <div className="panel hud-corner p-4">
          <div className="flex items-center gap-2 mb-4">
            <HardDrive size={11} style={{ color: '#00d4ff' }} />
            <span className="text-[9px] tracking-[0.15em] font-orbitron text-jarvis-muted">STORAGE MATRIX</span>
          </div>
          <div className="space-y-3">
            {status?.disks?.map(disk => (
              <div key={disk.mount} className="space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="font-mono text-jarvis-text">{disk.mount}</span>
                  <span style={{ color: getColor(disk.percent) }}>
                    {disk.percent.toFixed(1)}% — {disk.free_gb} GB FREE
                  </span>
                </div>
                <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(13,74,110,0.4)' }}>
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${disk.percent}%`,
                      background: getColor(disk.percent),
                      boxShadow: `0 0 6px ${getColor(disk.percent)}`,
                    }} />
                </div>
              </div>
            ))}
            {!status?.disks?.length && (
              <div className="text-jarvis-muted text-xs font-mono">AWAITING DATA...</div>
            )}
          </div>
        </div>

        {/* Alerts */}
        <div className="panel hud-corner p-4">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={11} style={{ color: '#ff9900' }} />
            <span className="text-[9px] tracking-[0.15em] font-orbitron text-jarvis-muted">RECENT ALERTS</span>
            {alerts.length > 0 && (
              <span className="ml-auto text-[8px] font-orbitron px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(255,153,0,0.1)', border: '1px solid rgba(255,153,0,0.3)', color: '#ff9900' }}>
                {alertCount.toFixed(0)}
              </span>
            )}
          </div>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="text-jarvis-muted text-[10px] font-mono">NO ACTIVE ALERTS</div>
            ) : alerts.map(n => (
              <div key={n.id}
                className="text-[10px] p-2 rounded-sm border"
                style={{
                  borderColor: n.severity === 'error' ? 'rgba(255,51,51,0.3)' : n.severity === 'warning' ? 'rgba(255,153,0,0.3)' : 'rgba(0,212,255,0.2)',
                  background: n.severity === 'error' ? 'rgba(255,51,51,0.05)' : n.severity === 'warning' ? 'rgba(255,153,0,0.05)' : 'rgba(0,212,255,0.03)',
                  color: n.severity === 'error' ? '#ff3333' : n.severity === 'warning' ? '#ff9900' : '#a8d8ea',
                }}>
                <div className="font-orbitron font-semibold text-[9px]">{n.title}</div>
                <div className="opacity-70 mt-0.5">{n.message}</div>
                <div className="text-[8px] opacity-40 mt-1 font-mono">{n.time}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
