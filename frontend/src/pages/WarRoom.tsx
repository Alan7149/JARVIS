import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../lib/api'
import { Globe2, Satellite, Wifi, X, Plus, Minus, Locate, Newspaper, ExternalLink, RefreshCw, Search, Waves, Cloud, Box, Map as MapIcon, Image as ImageIcon, Play, Pause, Video } from 'lucide-react'
import * as satellite from 'satellite.js'
import { playNotification, playAlert } from '../lib/sounds'
import landData from '../data/land.json'

type Node = { lat: number; lon: number; city: string; country: string; country_code: string; ip: string; port: number; process: string; isp: string; severity: string }
type Home = { lat: number; lon: number; city: string; country: string; ip: string; isp?: string }
type Data = { home: Home; nodes: Node[]; threat_score: number; total_connections: number }
type Country = { name: string; capital: string; lat: number; lon: number; region: string; subregion?: string; languages?: string; currency?: string; area?: number; demonym?: string; flag?: string; note?: string }
type V3 = [number, number, number]
type Hit = { type: 'country' | 'sat' | 'conn' | 'home'; x: number; y: number; r: number; data: any }
type Tracer = { fromLL: [number, number]; toLL: [number, number]; t0: number; suspicious: boolean }
type View = '3d' | '2d' | 'sat'

const RAD = Math.PI / 180

const NOTES: Record<string, string> = {
  'United States': 'Largest economy; Virginia (Ashburn) routes much of the world’s cloud traffic.',
  'United Kingdom': 'London is a primary European internet exchange point.',
  'Germany': 'Frankfurt hosts DE-CIX, one of the world’s busiest internet exchanges.',
  'Netherlands': 'Amsterdam (AMS-IX) is a top global internet exchange.',
  'Singapore': 'One of the densest submarine-cable hubs on the planet.',
  'India': 'Fastest-growing internet user base; Mumbai is the key cable hub.',
  'Japan': 'Dense fibre and a major trans-Pacific cable landing.',
}
const INDEX: Record<string, string> = {
  'United States': 'S&P 500 / Nasdaq', 'United Kingdom': 'FTSE 100', 'Japan': 'Nikkei 225', 'Germany': 'DAX',
  'France': 'CAC 40', 'China': 'SSE Composite', 'India': 'NIFTY 50 / Sensex', 'Hong Kong': 'Hang Seng',
  'Canada': 'S&P/TSX', 'Australia': 'ASX 200', 'Brazil': 'Bovespa', 'South Korea': 'KOSPI',
  'Singapore': 'STI', 'Switzerland': 'SMI', 'Netherlands': 'AEX', 'Spain': 'IBEX 35', 'Italy': 'FTSE MIB',
  'Russia': 'MOEX', 'South Africa': 'JSE Top 40', 'Mexico': 'IPC', 'Indonesia': 'IDX Composite', 'Taiwan': 'TAIEX',
}

const FALLBACK: Country[] = [
  { name: 'United States', capital: 'Washington, D.C.', lat: 38.9, lon: -77.0, region: 'Americas', subregion: 'North America' },
  { name: 'United Kingdom', capital: 'London', lat: 51.5, lon: -0.13, region: 'Europe', subregion: 'Northern Europe' },
  { name: 'Germany', capital: 'Berlin', lat: 52.52, lon: 13.4, region: 'Europe', subregion: 'Western Europe' },
  { name: 'India', capital: 'New Delhi', lat: 28.6, lon: 77.2, region: 'Asia', subregion: 'Southern Asia' },
  { name: 'Japan', capital: 'Tokyo', lat: 35.68, lon: 139.7, region: 'Asia', subregion: 'Eastern Asia' },
  { name: 'Brazil', capital: 'Brasília', lat: -15.8, lon: -47.9, region: 'Americas', subregion: 'South America' },
  { name: 'Australia', capital: 'Canberra', lat: -35.3, lon: 149.1, region: 'Oceania', subregion: 'Australia and New Zealand' },
  { name: 'Singapore', capital: 'Singapore', lat: 1.35, lon: 103.8, region: 'Asia', subregion: 'South-Eastern Asia' },
]
const SAT_COLOR: Record<string, string> = { LEO: '#00ff88', MEO: '#00d4ff', GEO: '#ff3333', Polar: '#ff9900' }

const latLon = (lat: number, lon: number): V3 => {
  const la = lat * RAD, lo = lon * RAD
  return [Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)]
}
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
function hexA(hex: string, a: number): string {
  const h = hex.replace('#', ''); if (h.length < 6) return hex
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`
}
const SEV = (s: string, a = 1) => s === 'critical' ? `rgba(255,51,51,${a})` : `rgba(0,212,255,${a})`
function subsolar(d: Date): V3 {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0)
  const doy = (d.getTime() - start) / 86400000
  const decl = -23.44 * Math.cos(RAD * (360 / 365) * (doy + 10))
  const utcH = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600
  return latLon(decl, (12 - utcH) * 15)
}
const altFactor = (altKm: number) => 1 + Math.min(altKm || 0, 40000) / 40000 * 1.05

// Land coastline rings (lon/lat pairs)
const LAND_RINGS: { pts: [number, number][]; c: V3 }[] = (() => {
  const rings: { pts: [number, number][]; c: V3 }[] = []
  try {
    for (const f of (landData as any).features || []) {
      const g = f.geometry; if (!g) continue
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
      for (const poly of polys) for (const ring of poly) {
        const pts = (ring as any[]).map(c => [c[0], c[1]] as [number, number])
        if (pts.length < 3) continue
        let x = 0, y = 0, z = 0
        for (const [lon, lat] of pts) { const v = latLon(lat, lon); x += v[0]; y += v[1]; z += v[2] }
        const len = Math.hypot(x, y, z) || 1
        rings.push({ pts, c: [x / len, y / len, z / len] })
      }
    }
  } catch {}
  return rings
})()

export default function WarRoom() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const dataRef = useRef<Data | null>(null)
  const countriesRef = useRef<Country[]>(FALLBACK)
  const realSatsRef = useRef<any[]>([])
  const cablesRef = useRef<any[]>([])
  const tracersRef = useRef<Tracer[]>([])
  const prevKeysRef = useRef<Set<string> | null>(null)
  const hitsRef = useRef<Hit[]>([])
  const layersRef = useRef({ countries: true, sats: true, conns: true, cables: false })
  const zoomRef = useRef(1)
  const viewRef = useRef<View>('3d')
  const spinRef = useRef(false)
  const panRef = useRef({ x: 0, y: 0 })
  const flyTo = useRef<{ y: number; x: number; active: boolean } | null>(null)
  const rot = useRef({ y: 0, x: -0.32, drag: false, lx: 0, ly: 0, moved: 0 })
  const earthImg = useRef<HTMLImageElement | null>(null)
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState(false)
  const [layers, setLayers] = useState({ countries: true, sats: true, conns: true, cables: false })
  const [sel, setSel] = useState<Hit | null>(null)
  const [zoom, setZoom] = useState(1)
  const [view, setView] = useState<View>('3d')
  const [spin, setSpin] = useState(false)
  const [count, setCount] = useState(FALLBACK.length)
  const [satCount, setSatCount] = useState(0)
  const [issPass, setIssPass] = useState<number | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => { layersRef.current = layers }, [layers])
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { viewRef.current = view; panRef.current = { x: 0, y: 0 }; setZoom(1) }, [view])
  useEffect(() => { spinRef.current = spin }, [spin])

  // Earth texture for satellite view (lazy, optional)
  useEffect(() => {
    if (view !== 'sat' || earthImg.current) return
    const img = new Image(); img.crossOrigin = 'anonymous'
    img.onload = () => { earthImg.current = img }
    img.src = 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg'
  }, [view])

  // live connections + attack tracers
  useEffect(() => {
    let alive = true
    const poll = async () => {
      try {
        const r = await apiFetch('/api/warroom'); const d: Data = await r.json()
        if (!alive) return
        const keys = new Set(d.nodes.map(n => `${n.ip}:${n.port}`))
        if (prevKeysRef.current && d.home) {
          for (const n of d.nodes) {
            const k = `${n.ip}:${n.port}`
            if (!prevKeysRef.current.has(k) && (n.lat || n.lon)) {
              tracersRef.current.push({ fromLL: [d.home.lat, d.home.lon], toLL: [n.lat, n.lon], t0: performance.now(), suspicious: n.severity === 'critical' })
              n.severity === 'critical' ? playAlert() : playNotification()
            }
          }
        }
        prevKeysRef.current = keys
        dataRef.current = d; setData(d); setErr(false)
      } catch { if (alive) setErr(true) }
    }
    poll(); const id = setInterval(poll, 8000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  // all world locations
  useEffect(() => {
    let alive = true
    const first = (o: any) => (o && typeof o === 'object') ? Object.values(o)[0] as any : undefined
    fetch('https://cdn.jsdelivr.net/npm/world-countries@5.1.0/countries.json')
      .then(r => r.json()).then((arr: any[]) => {
        if (!alive || !Array.isArray(arr)) return
        const list: Country[] = arr.filter(c => Array.isArray(c?.latlng) && c.latlng.length === 2 && c?.capital?.length).map(c => {
          const cur = first(c.currencies)
          return { name: c.name?.common || '?', capital: c.capital[0], lat: c.latlng[0], lon: c.latlng[1], region: c.region || '', subregion: c.subregion || '', languages: c.languages ? Object.values(c.languages).join(', ') : '', currency: cur ? `${cur.name}${cur.symbol ? ' (' + cur.symbol + ')' : ''}` : '', area: c.area || 0, demonym: c.demonyms?.eng?.m || '', flag: c.flag || '', note: NOTES[c.name?.common] }
        }).sort((a, b) => (b.area || 0) - (a.area || 0))
        if (list.length > 30) { countriesRef.current = list; setCount(list.length) }
      }).catch(() => {})
    return () => { alive = false }
  }, [])

  // real satellites (TLE)
  useEffect(() => {
    let alive = true
    apiFetch('/api/satellites').then(r => r.json()).then(d => {
      if (!alive || !d?.satellites?.length) return
      const built = d.satellites.map((s: any) => { try { return { ...s, satrec: satellite.twoline2satrec(s.line1, s.line2), lat: 0, lon: 0, alt: 0, ok: false, path: [] } } catch { return null } }).filter(Boolean)
      realSatsRef.current = built; setSatCount(built.length)
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  // propagate positions (fast) + orbit paths (slower)
  useEffect(() => {
    const pos = () => {
      const now = new Date(); let gmst: number
      try { gmst = satellite.gstime(now) } catch { return }
      for (const s of realSatsRef.current) {
        try {
          const pv: any = satellite.propagate(s.satrec, now)
          if (!pv?.position) { s.ok = false; continue }
          const geo = satellite.eciToGeodetic(pv.position, gmst)
          s.lat = satellite.degreesLat(geo.latitude); s.lon = satellite.degreesLong(geo.longitude); s.alt = geo.height; s.ok = true
        } catch { s.ok = false }
      }
    }
    const paths = () => {
      for (const s of realSatsRef.current) {
        try {
          const no = s.satrec.no // rad/min
          const periodMin = no > 0 ? (2 * Math.PI) / no : 100
          const N = 60; const out: [number, number, number][] = []
          for (let i = 0; i <= N; i++) {
            const t = new Date(Date.now() + (i / N) * periodMin * 60000)
            const pv: any = satellite.propagate(s.satrec, t); if (!pv?.position) continue
            const geo = satellite.eciToGeodetic(pv.position, satellite.gstime(t))
            out.push([satellite.degreesLat(geo.latitude), satellite.degreesLong(geo.longitude), geo.height])
          }
          s.path = out
        } catch { s.path = [] }
      }
    }
    pos(); paths()
    const id1 = setInterval(pos, 2000); const id2 = setInterval(paths, 12000)
    return () => { clearInterval(id1); clearInterval(id2) }
  }, [satCount])

  // ISS overhead-pass countdown
  useEffect(() => {
    const calc = () => {
      const d = dataRef.current; const iss = realSatsRef.current.find(s => /ISS|ZARYA/i.test(s.name))
      if (!d || !iss) { setIssPass(null); return }
      const obs = { longitude: d.home.lon * RAD, latitude: d.home.lat * RAD, height: 0.1 }
      for (let m = 0; m < 95; m++) {
        const t = new Date(Date.now() + m * 60000)
        try {
          const pv: any = satellite.propagate(iss.satrec, t); if (!pv?.position) continue
          const la = satellite.ecfToLookAngles(obs, satellite.eciToEcf(pv.position, satellite.gstime(t)) as any)
          if (la.elevation > 10 * RAD) { setIssPass(m); return }
        } catch {}
      }
      setIssPass(null)
    }
    const id = setInterval(calc, 30000); const t = setTimeout(calc, 4000)
    return () => { clearInterval(id); clearTimeout(t) }
  }, [satCount])

  // submarine cables (lazy)
  useEffect(() => {
    if (!layers.cables || cablesRef.current.length) return
    apiFetch('/api/warroom/cables').then(r => r.json()).then(d => { if (d?.cables?.length) cablesRef.current = d.cables }).catch(() => {})
  }, [layers.cables])

  // ── render loop ──
  useEffect(() => {
    const canvas = canvasRef.current!, ctx = canvas.getContext('2d')!
    let raf = 0; const t0 = performance.now()
    const stars = Array.from({ length: 150 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + 0.2, tw: Math.random() * 6 }))

    const draw = (now: number) => {
      const t = (now - t0) / 1000
      const wrap = wrapRef.current!
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const W = wrap.clientWidth, H = wrap.clientHeight
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + 'px'; canvas.style.height = H + 'px' }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H)
      const hits: Hit[] = []; const L = layersRef.current; const Z = zoomRef.current; const V = viewRef.current
      const cx = W / 2, cy = H / 2
      const flat = V !== '3d'
      const sun = subsolar(new Date())

      // ── camera ──
      const R = Math.min(W, H) * 0.40 * Z
      if (!flat) {
        if (flyTo.current?.active) {
          let dy = flyTo.current.y - rot.current.y; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI
          rot.current.y += dy * 0.1; rot.current.x += (flyTo.current.x - rot.current.x) * 0.1
          if (Math.abs(dy) < 0.01) flyTo.current.active = false
        } else if (spinRef.current && !rot.current.drag) rot.current.y += 0.002
      }
      const ry = rot.current.y, rx = rot.current.x
      const cosY = Math.cos(ry), sinY = Math.sin(ry), cosX = Math.cos(rx), sinX = Math.sin(rx)
      // flat map rect
      const mapW = W * Z, mapH = mapW / 2
      const mx0 = cx - mapW / 2 + panRef.current.x, my0 = cy - mapH / 2 + panRef.current.y

      // unified projection → [sx, sy, visible(0/1), depth]
      const P = (lat: number, lon: number, alt = 1): [number, number, number, number] => {
        if (flat) {
          const sx = mx0 + ((lon + 180) / 360) * mapW
          const sy = my0 + ((90 - lat) / 180) * mapH
          return [sx, sy, sx > -30 && sx < W + 30 && sy > -30 && sy < H + 30 ? 1 : 0, 1]
        }
        const v = latLon(lat, lon); const vx = v[0] * alt, vy = v[1] * alt, vz = v[2] * alt
        const x = vx * cosY + vz * sinY, z = -vx * sinY + vz * cosY
        const y2 = vy * cosX - z * sinX, z2 = vy * sinX + z * cosX
        return [cx + x * R, cy - y2 * R, (z2 > 0 || alt > 1.02) ? 1 : 0, z2]
      }
      const behindGlobe = (sx: number, sy: number, depth: number) => !flat && depth < 0 && Math.hypot(sx - cx, sy - cy) < R * 0.98

      // stars (3D only)
      if (!flat) stars.forEach(s => { ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2); ctx.fillStyle = `rgba(120,180,220,${0.3 + Math.sin(t * 1.5 + s.tw) * 0.3})`; ctx.fill() })

      // ── base ──
      if (!flat) {
        const gg = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.28)
        gg.addColorStop(0, 'rgba(0,140,220,0.12)'); gg.addColorStop(1, 'rgba(2,11,24,0)')
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(cx, cy, R * 1.28, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,22,46,0.55)'; ctx.fill()
        ctx.strokeStyle = 'rgba(0,212,255,0.5)'; ctx.lineWidth = 1.2; ctx.stroke()
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip()
      } else {
        // ocean / texture
        if (V === 'sat' && earthImg.current) { ctx.globalAlpha = 0.92; ctx.drawImage(earthImg.current, mx0, my0, mapW, mapH); ctx.globalAlpha = 1 }
        else { ctx.fillStyle = 'rgba(0,20,42,0.85)'; ctx.fillRect(mx0, my0, mapW, mapH) }
        ctx.strokeStyle = 'rgba(0,150,210,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(mx0, my0, mapW, mapH)
        ctx.save(); ctx.beginPath(); ctx.rect(mx0, my0, mapW, mapH); ctx.clip()
      }

      // graticule
      ctx.lineWidth = 0.5
      const grat = (pts: [number, number][]) => { ctx.beginPath(); let st = false; for (const [la, lo] of pts) { const [sx, sy, vis, dep] = P(la, lo); if (!flat && dep <= 0) { st = false; continue } if (vis || flat) { st ? ctx.lineTo(sx, sy) : (ctx.moveTo(sx, sy), st = true) } } ctx.strokeStyle = `rgba(0,150,210,${flat ? 0.12 : 0.13})`; ctx.stroke() }
      for (let la = -60; la <= 60; la += 30) { const p: [number, number][] = []; for (let lo = -180; lo <= 180; lo += 6) p.push([la, lo]); grat(p) }
      for (let lo = -180; lo < 180; lo += 30) { const p: [number, number][] = []; for (let la = -90; la <= 90; la += 6) p.push([la, lo]); grat(p) }

      // ── land ──
      if (!(V === 'sat' && earthImg.current)) {
        for (const ring of LAND_RINGS) {
          const lit = Math.max(0, dot(ring.c, sun))
          // 3D front-face cull using the ring centroid
          if (!flat) {
            const cv = ring.c
            const cz = (-cv[0] * sinY + cv[2] * cosY) * sinX + cv[1] * cosX
            if (cz <= 0) continue
          }
          ctx.beginPath(); let prevLon = NaN, started = false
          for (let i = 0; i < ring.pts.length; i++) {
            const lo = ring.pts[i][0], la = ring.pts[i][1]
            const [sx, sy, , dep] = P(la, lo)
            if (!flat && dep <= 0) { started = false; continue }
            if (flat && !isNaN(prevLon) && Math.abs(lo - prevLon) > 180) { started = false } // antimeridian break
            if (!started) { ctx.moveTo(sx, sy); started = true } else ctx.lineTo(sx, sy)
            prevLon = lo
          }
          ctx.fillStyle = `rgba(${10 + lit * 20},${50 + lit * 70},${70 + lit * 70},${flat ? 0.5 : 0.45 + lit * 0.25})`
          ctx.fill()
          ctx.strokeStyle = `rgba(0,${170 + lit * 70},230,${flat ? 0.5 : 0.35 + lit * 0.45})`; ctx.lineWidth = 0.6; ctx.stroke()
        }
        // night veil (3D only) — darken the hemisphere opposite the sun
        if (!flat) {
          const proj3 = (v: V3): [number, number] => { const x = v[0] * cosY + v[2] * sinY, z = -v[0] * sinY + v[2] * cosY; const y2 = v[1] * cosX - z * sinX; return [cx + x * R, cy - y2 * R] }
          const [nx, ny] = proj3([-sun[0], -sun[1], -sun[2]])
          const nv = ctx.createRadialGradient(nx, ny, 0, nx, ny, R * 1.5)
          nv.addColorStop(0, 'rgba(0,4,12,0.55)'); nv.addColorStop(1, 'rgba(0,4,12,0)')
          ctx.fillStyle = nv; ctx.fillRect(cx - R, cy - R, R * 2, R * 2)
        }
      }

      // ── cables ──
      if (L.cables && cablesRef.current.length) {
        for (const cb of cablesRef.current) for (const line of cb.lines) {
          ctx.beginPath(); let started = false, any = false, prevLon = NaN
          for (const [lo, la] of line) { const [sx, sy, , dep] = P(la, lo); if (!flat && dep <= 0) { started = false; continue } if (flat && !isNaN(prevLon) && Math.abs(lo - prevLon) > 180) started = false; if (!started) { ctx.moveTo(sx, sy); started = true } else ctx.lineTo(sx, sy); any = true; prevLon = lo }
          if (any) { ctx.strokeStyle = hexA(cb.color || '#00d4ff', 0.5); ctx.lineWidth = 0.7; ctx.stroke() }
        }
      }

      // ── countries ──
      if (L.countries) {
        const labelBudget = flat ? 60 : Math.round(14 + (Z - 0.5) * 26)
        const front: { co: Country; sx: number; sy: number }[] = []
        for (const co of countriesRef.current) {
          const [sx, sy, vis] = P(co.lat, co.lon); if (!vis) continue
          const lit = dot(latLon(co.lat, co.lon), sun)
          ctx.beginPath(); ctx.arc(sx, sy, lit < 0.02 ? 2.4 : 2, 0, Math.PI * 2)
          ctx.fillStyle = lit < 0.02 ? 'rgba(255,200,120,0.95)' : 'rgba(130,205,255,0.9)'
          if (lit < 0.02) { ctx.shadowColor = 'rgba(255,180,90,0.9)'; ctx.shadowBlur = 6 }
          ctx.fill(); ctx.shadowBlur = 0
          hits.push({ type: 'country', x: sx, y: sy, r: 7, data: co }); front.push({ co, sx, sy })
          if (sel?.type === 'country' && sel.data.name === co.name) { ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(150,220,255,0.95)'; ctx.lineWidth = 1.4; ctx.stroke() }
        }
        ctx.font = '500 9px Orbitron, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(160,215,255,0.62)'
        front.slice(0, labelBudget).forEach(({ co, sx, sy }) => ctx.fillText(co.capital, sx, sy - 8))
      }

      // ── satellites + orbit paths ──
      if (L.sats) {
        const real = realSatsRef.current.filter(s => s.ok)
        for (const s of real) {
          const col = s.color || SAT_COLOR[s.kind] || '#00d4ff'
          // orbit path / ground track
          if (s.path?.length) {
            ctx.beginPath(); let started = false, prevLon = NaN
            for (const [la, lo, al] of s.path) {
              const [sx, sy, , dep] = P(la, lo, altFactor(al))
              if (!flat && dep <= 0) { started = false; continue }
              if (flat && !isNaN(prevLon) && Math.abs(lo - prevLon) > 180) started = false
              if (!started) { ctx.moveTo(sx, sy); started = true } else ctx.lineTo(sx, sy)
              prevLon = lo
            }
            ctx.strokeStyle = hexA(col, flat ? 0.45 : 0.3); ctx.lineWidth = 0.8; ctx.stroke()
          }
          // marker
          const [sx, sy, , dep] = P(s.lat, s.lon, altFactor(s.alt))
          if (behindGlobe(sx, sy, dep)) { ctx.beginPath(); ctx.arc(sx, sy, 1.6, 0, Math.PI * 2); ctx.fillStyle = hexA(col, 0.18); ctx.fill(); continue }
          ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.PI / 4); ctx.fillStyle = hexA(col, 0.95); ctx.shadowColor = col; ctx.shadowBlur = 7; ctx.fillRect(-2.4, -2.4, 4.8, 4.8); ctx.shadowBlur = 0; ctx.restore()
          hits.push({ type: 'sat', x: sx, y: sy, r: 8, data: s })
          if (/ISS|ZARYA/i.test(s.name)) { ctx.font = '600 9px Orbitron, monospace'; ctx.fillStyle = hexA(col, 0.9); ctx.textAlign = 'center'; ctx.fillText('ISS', sx, sy - 9) }
        }
      }

      // ── connections + home + tracers ──
      const d = dataRef.current
      if (d) {
        const arc = (fromLL: [number, number], toLL: [number, number], frac: number): [number, number, number] => {
          // great-circle interpolation in 3D, then project (works for both views)
          const a = latLon(fromLL[0], fromLL[1]), b = latLon(toLL[0], toLL[1])
          let dd = dot(a, b); dd = Math.max(-1, Math.min(1, dd)); const th = Math.acos(dd)
          let v: V3
          if (th < 1e-4) v = a
          else { const s = Math.sin(th), s0 = Math.sin((1 - frac) * th) / s, s1 = Math.sin(frac * th) / s; v = [a[0] * s0 + b[0] * s1, a[1] * s0 + b[1] * s1, a[2] * s0 + b[2] * s1] }
          const lat = Math.asin(Math.max(-1, Math.min(1, v[1]))) / RAD
          const lon = Math.atan2(v[2], v[0]) / RAD
          const [sx, sy, , dep] = P(lat, lon, flat ? 1 : 1 + Math.sin(frac * Math.PI) * 0.28)
          return [sx, sy, dep]
        }
        if (L.conns) {
          d.nodes.forEach(nd => {
            ctx.beginPath(); let started = false
            for (let k = 0; k <= 32; k++) { const [sx, sy, dep] = arc([d.home.lat, d.home.lon], [nd.lat, nd.lon], k / 32); if (!flat && dep < -0.2) { started = false; continue } if (!started) { ctx.moveTo(sx, sy); started = true } else ctx.lineTo(sx, sy) }
            ctx.strokeStyle = SEV(nd.severity, 0.4); ctx.lineWidth = 1; ctx.stroke()
          })
          d.nodes.forEach(nd => {
            const [sx, sy, vis] = P(nd.lat, nd.lon); if (!vis) return
            const pr = 2.2 + (Math.sin(t * 3) * 0.5 + 0.5) * 1.4
            ctx.beginPath(); ctx.arc(sx, sy, pr + 3, 0, Math.PI * 2); ctx.strokeStyle = SEV(nd.severity, 0.3); ctx.lineWidth = 1; ctx.stroke()
            ctx.beginPath(); ctx.arc(sx, sy, pr, 0, Math.PI * 2); ctx.fillStyle = SEV(nd.severity, 0.95); ctx.shadowColor = SEV(nd.severity); ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0
            hits.push({ type: 'conn', x: sx, y: sy, r: 9, data: nd })
          })
        }
        // tracers
        const TR = 1300, RIPPLE = 700
        tracersRef.current = tracersRef.current.filter(tr => now - tr.t0 < TR + RIPPLE)
        for (const tr of tracersRef.current) {
          const age = now - tr.t0; const col = tr.suspicious ? '#ff3333' : '#00ffcc'
          if (age < TR) {
            const p = age / TR; const N = 28; const head = Math.floor(p * N)
            for (let k = Math.max(0, head - 7); k <= head; k++) { const [sx, sy, dep] = arc(tr.fromLL, tr.toLL, k / N); if (!flat && dep < -0.2) continue; const a = (k - (head - 7)) / 7; ctx.beginPath(); ctx.arc(sx, sy, 2.4 * a + 0.4, 0, Math.PI * 2); ctx.fillStyle = hexA(col, a * 0.9); ctx.shadowColor = col; ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0 }
          } else { const rp = (age - TR) / RIPPLE; const [sx, sy] = P(tr.toLL[0], tr.toLL[1]); ctx.beginPath(); ctx.arc(sx, sy, 3 + rp * 16, 0, Math.PI * 2); ctx.strokeStyle = hexA(col, (1 - rp) * 0.8); ctx.lineWidth = 1.6; ctx.stroke() }
        }
        // home
        const [hx, hy, hvis] = P(d.home.lat, d.home.lon)
        if (hvis) {
          const hp = 4 + (Math.sin(t * 2) * 0.5 + 0.5) * 4
          ctx.beginPath(); ctx.arc(hx, hy, hp, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(0,255,136,0.4)'; ctx.lineWidth = 1.2; ctx.stroke()
          ctx.beginPath(); ctx.arc(hx, hy, 4, 0, Math.PI * 2); ctx.fillStyle = '#00ff88'; ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0
          ctx.font = '600 10px Orbitron, monospace'; ctx.fillStyle = 'rgba(0,255,136,0.85)'; ctx.textAlign = 'center'; ctx.fillText(d.home.city || 'HOME', hx, hy - 12)
          hits.push({ type: 'home', x: hx, y: hy, r: 10, data: d.home })
        }
      }
      ctx.restore()
      hitsRef.current = hits
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [sel])

  // interaction (drag = rotate in 3D / pan in 2D; click = select; wheel = zoom)
  useEffect(() => {
    const wrap = wrapRef.current!
    const down = (e: PointerEvent) => { rot.current.drag = true; if (flyTo.current) flyTo.current.active = false; rot.current.lx = e.clientX; rot.current.ly = e.clientY; rot.current.moved = 0 }
    const move = (e: PointerEvent) => {
      if (!rot.current.drag) return
      const dx = e.clientX - rot.current.lx, dy = e.clientY - rot.current.ly
      rot.current.moved += Math.abs(dx) + Math.abs(dy)
      if (viewRef.current === '3d') { rot.current.y += dx * 0.006; rot.current.x = Math.max(-1.2, Math.min(1.2, rot.current.x - dy * 0.006)) }
      else { panRef.current.x += dx; panRef.current.y += dy }
      rot.current.lx = e.clientX; rot.current.ly = e.clientY
    }
    const up = (e: PointerEvent) => {
      const wasClick = rot.current.moved < 6; rot.current.drag = false; if (!wasClick) return
      const rect = wrap.getBoundingClientRect(); const px = e.clientX - rect.left, py = e.clientY - rect.top
      let best: Hit | null = null, bd = 1e9
      for (const h of hitsRef.current) { const dd = Math.hypot(h.x - px, h.y - py); if (dd < h.r + 5 && dd < bd) { bd = dd; best = h } }
      setSel(best)
    }
    const wheel = (e: WheelEvent) => { e.preventDefault(); setZoom(z => Math.max(0.5, Math.min(viewRef.current === '3d' ? 4.5 : 8, z * (e.deltaY < 0 ? 1.12 : 0.892)))) }
    wrap.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); wrap.addEventListener('wheel', wheel, { passive: false })
    return () => { wrap.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); wrap.removeEventListener('wheel', wheel) }
  }, [])

  const flyToCountry = (co: Country) => {
    if (view === '3d') {
      const v = latLon(co.lat, co.lon); let ty = Math.atan2(-v[0], v[2])
      if (-v[0] * Math.sin(ty) + v[2] * Math.cos(ty) < 0) ty += Math.PI
      flyTo.current = { y: ty, x: Math.max(-1.1, Math.min(1.1, co.lat * RAD)), active: true }; setZoom(2.2)
    } else { setZoom(2.4); requestAnimationFrame(() => { const W = wrapRef.current!.clientWidth; const mapW = W * 2.4, mapH = mapW / 2; panRef.current = { x: (0.5 - (co.lon + 180) / 360) * mapW, y: (0.5 - (90 - co.lat) / 180) * mapH } }) }
    setSel({ type: 'country', x: 0, y: 0, r: 0, data: co })
  }
  const onSearch = (e: React.FormEvent) => { e.preventDefault(); const q = query.trim().toLowerCase(); if (!q) return; const m = countriesRef.current.find(c => c.name.toLowerCase().includes(q) || (c.capital || '').toLowerCase().includes(q)); if (m) flyToCountry(m) }

  const score = data?.threat_score ?? 0
  const scoreColor = score > 60 ? '#ff3333' : score > 30 ? '#ff9900' : '#00ff88'
  const toggle = (k: keyof typeof layers) => setLayers(s => ({ ...s, [k]: !s[k] }))
  const bump = (f: number) => setZoom(z => Math.max(0.5, Math.min(view === '3d' ? 4.5 : 8, z * f)))
  const connCount = (name: string) => (data?.nodes || []).filter(n => n.country === name).length

  return (
    <div className="p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-xl font-bold tracking-widest glow-text font-orbitron">WAR ROOM</h1>
          <p className="text-[10px] text-jarvis-muted mt-1">{count} locations · {satCount} live satellites · {data?.total_connections ?? 0} connections{issPass != null ? ` · 🛰 ISS overhead in ${issPass}m` : ''}{err ? ' · offline' : ''}</p>
        </div>
        <div className="text-right"><div className="text-[8px] font-orbitron tracking-widest" style={{ color: '#4a7a99' }}>THREAT SCORE</div><div className="font-orbitron text-2xl font-black" style={{ color: scoreColor, textShadow: `0 0 10px ${scoreColor}` }}>{score}</div></div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-3" style={{ minHeight: 380 }}>
        <div ref={wrapRef} className="lg:col-span-3 relative rounded-sm overflow-hidden cursor-grab active:cursor-grabbing" style={{ background: 'radial-gradient(ellipse at center, rgba(0,18,38,0.6), rgba(2,8,18,0.95))', border: '1px solid rgba(13,74,110,0.4)' }}>
          <canvas ref={canvasRef} className="absolute inset-0" />
          {/* top-left: view modes + layers */}
          <div className="absolute top-3 left-3 flex flex-col gap-1.5">
            <div className="flex gap-1.5">
              {([['3d', Box, '3D'], ['2d', MapIcon, '2D'], ['sat', ImageIcon, 'SAT']] as const).map(([k, Icon, lbl]) => (
                <button key={k} onClick={() => setView(k)} className="flex items-center gap-1 px-2 py-1 rounded-sm text-[7px] font-orbitron" style={{ background: view === k ? 'rgba(0,212,255,0.18)' : 'rgba(4,22,40,0.6)', border: `1px solid ${view === k ? 'rgba(0,212,255,0.6)' : 'rgba(13,74,110,0.4)'}`, color: view === k ? '#00d4ff' : '#4a7a99' }}><Icon size={9} /> {lbl}</button>
              ))}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {([['countries', Globe2, 'COUNTRIES'], ['sats', Satellite, 'SATELLITES'], ['conns', Wifi, 'CONNS'], ['cables', Waves, 'CABLES']] as const).map(([k, Icon, lbl]) => (
                <button key={k} onClick={() => toggle(k)} className="flex items-center gap-1 px-2 py-1 rounded-sm text-[7px] font-orbitron" style={{ background: layers[k] ? 'rgba(0,212,255,0.12)' : 'rgba(4,22,40,0.6)', border: `1px solid ${layers[k] ? 'rgba(0,212,255,0.45)' : 'rgba(13,74,110,0.4)'}`, color: layers[k] ? '#00d4ff' : '#4a7a99' }}><Icon size={9} /> {lbl}</button>
              ))}
            </div>
          </div>
          {/* top-right: search */}
          <form onSubmit={onSearch} className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-sm" style={{ background: 'rgba(4,22,40,0.75)', border: '1px solid rgba(0,212,255,0.3)' }}>
            <Search size={11} style={{ color: '#4a7a99' }} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Fly to…" className="bg-transparent outline-none text-[9px] w-24" style={{ color: '#a8d8ea' }} />
          </form>
          {/* bottom-right: zoom + spin */}
          <div className="absolute bottom-3 right-3 flex flex-col gap-1.5 items-center">
            {view === '3d' && (
              <button onClick={() => setSpin(s => !s)} className="w-7 h-7 rounded-sm flex items-center justify-center" style={{ background: 'rgba(4,22,40,0.7)', border: `1px solid ${spin ? 'rgba(0,255,136,0.5)' : 'rgba(0,212,255,0.35)'}`, color: spin ? '#00ff88' : '#00d4ff' }} title={spin ? 'Stop rotation' : 'Auto-rotate'}>{spin ? <Pause size={12} /> : <Play size={12} />}</button>
            )}
            <button onClick={() => bump(1.25)} className="w-7 h-7 rounded-sm flex items-center justify-center" style={{ background: 'rgba(4,22,40,0.7)', border: '1px solid rgba(0,212,255,0.35)', color: '#00d4ff' }}><Plus size={13} /></button>
            <div className="text-[7px] font-orbitron px-1 py-0.5 rounded-sm" style={{ color: '#4a7a99' }}>{zoom.toFixed(1)}×</div>
            <button onClick={() => bump(0.8)} className="w-7 h-7 rounded-sm flex items-center justify-center" style={{ background: 'rgba(4,22,40,0.7)', border: '1px solid rgba(0,212,255,0.35)', color: '#00d4ff' }}><Minus size={13} /></button>
            <button onClick={() => { setZoom(1); flyTo.current = null; panRef.current = { x: 0, y: 0 } }} className="w-7 h-7 rounded-sm flex items-center justify-center" style={{ background: 'rgba(4,22,40,0.7)', border: '1px solid rgba(0,212,255,0.2)', color: '#4a7a99' }} title="Reset"><Locate size={12} /></button>
          </div>
        </div>

        <div className="panel p-3 overflow-y-auto" style={{ maxHeight: 580 }}>
          {sel ? <DetailPanel hit={sel} onClose={() => setSel(null)} connCount={connCount} /> : (
            <>
              <div className="label-jarvis mb-2">INCOMING · {data?.nodes.length ?? 0}</div>
              <div className="space-y-1.5">
                {(data?.nodes ?? []).map((n, i) => (
                  <button key={i} onClick={() => setSel({ type: 'conn', x: 0, y: 0, r: 0, data: n })} className="w-full text-left p-2 rounded-sm" style={{ background: 'rgba(4,22,40,0.5)', border: `1px solid ${SEV(n.severity, 0.25)}` }}>
                    <div className="flex items-center justify-between"><span className="text-[10px] font-mono" style={{ color: '#a8d8ea' }}>{n.city || n.country}</span><span className="w-1.5 h-1.5 rounded-full" style={{ background: SEV(n.severity) }} /></div>
                    <div className="text-[8px] text-jarvis-muted truncate">{n.process} · {n.ip}:{n.port}</div>
                  </button>
                ))}
                {(!data || data.nodes.length === 0) && <div className="text-[9px] text-jarvis-muted text-center py-6">No geolocated connections</div>}
              </div>
              <div className="text-[8px] text-jarvis-muted mt-3 leading-relaxed">Switch <b style={{ color: '#00d4ff' }}>3D / 2D / SAT</b> views top-left. Rotation is off by default — drag to look around, click any capital, satellite, or connection.</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: any }) {
  return (<div className="flex justify-between gap-3 py-1 border-b border-jarvis-border/20"><span className="text-[8px] text-jarvis-muted font-orbitron tracking-wider">{k}</span><span className="text-[9px] font-mono text-right" style={{ color: '#a8d8ea' }}>{v}</span></div>)
}

const WEATHER: Record<number, string> = { 0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 61: 'Rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Snow', 73: 'Snow', 75: 'Snow', 80: 'Showers', 81: 'Showers', 82: 'Showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' }

function CountryDossier({ c, conns }: { c: Country; conns: number }) {
  const [wx, setWx] = useState<any>(null)
  useEffect(() => {
    let alive = true; setWx(null)
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current_weather=true`).then(r => r.json()).then(d => { if (alive) setWx(d.current_weather || null) }).catch(() => {})
    return () => { alive = false }
  }, [c.name])
  const offsetH = Math.round(c.lon / 15)
  const localTime = new Date(Date.now() + new Date().getTimezoneOffset() * 60000 + offsetH * 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <div className="mt-3 pt-3 border-t border-jarvis-border/30">
      <div className="label-jarvis mb-2 flex items-center gap-1"><Cloud size={10} /> DOSSIER</div>
      <Row k="LOCAL TIME" v={`~${localTime} (UTC${offsetH >= 0 ? '+' : ''}${offsetH})`} />
      <Row k="WEATHER" v={wx ? `${Math.round(wx.temperature)}°C · ${WEATHER[wx.weathercode] || '—'}` : 'loading…'} />
      <Row k="MARKET INDEX" v={INDEX[c.name] || '—'} />
      <Row k="YOUR CONNECTIONS" v={conns} />
    </div>
  )
}

function VideoSection({ subject }: { subject: string }) {
  const [vids, setVids] = useState<any[] | null>(null)
  useEffect(() => {
    let alive = true; setVids(null)
    apiFetch(`/api/videos?q=${encodeURIComponent(subject)}`).then(r => r.json()).then(d => { if (alive) setVids(d.videos || []) }).catch(() => { if (alive) setVids([]) })
    return () => { alive = false }
  }, [subject])
  return (
    <div className="mt-3 pt-3 border-t border-jarvis-border/30">
      <div className="label-jarvis mb-2 flex items-center gap-1"><Video size={10} /> VIDEOS</div>
      {vids === null && <div className="text-[9px] text-jarvis-muted py-2 text-center">Finding videos…</div>}
      {vids?.length === 0 && <div className="text-[9px] text-jarvis-muted py-2 text-center">No videos found.</div>}
      <div className="space-y-1.5">
        {vids?.map((v, i) => (
          <a key={i} href={v.url} target="_blank" rel="noreferrer" className="flex gap-2 p-1.5 rounded-sm hover:brightness-125" style={{ background: 'rgba(4,22,40,0.5)', border: '1px solid rgba(13,74,110,0.4)' }}>
            {v.thumbnail ? <img src={v.thumbnail} alt="" style={{ width: 60, height: 34, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} /> : <div style={{ width: 60, height: 34, background: 'rgba(0,0,0,0.4)', borderRadius: 2, flexShrink: 0 }} className="flex items-center justify-center"><Video size={12} style={{ color: '#4a7a99' }} /></div>}
            <span className="text-[9px] leading-snug line-clamp-2" style={{ color: '#a8d8ea' }}>{v.title}</span>
          </a>
        ))}
      </div>
    </div>
  )
}

function NewsSection({ subject, kind }: { subject: string; kind: 'country' | 'sat' }) {
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true); const [nonce, setNonce] = useState(0)
  useEffect(() => { let alive = true; setLoading(true); setData(null); apiFetch(`/api/news?q=${encodeURIComponent(subject)}&kind=${kind}`).then(r => r.json()).then(d => { if (alive) { setData(d); setLoading(false) } }).catch(() => { if (alive) setLoading(false) }); return () => { alive = false } }, [subject, kind, nonce])
  return (
    <div className="mt-3 pt-3 border-t border-jarvis-border/30">
      <div className="flex items-center justify-between mb-2"><div className="label-jarvis flex items-center gap-1"><Newspaper size={10} /> LATEST NEWS</div><button onClick={() => setNonce(n => n + 1)} className="text-jarvis-muted hover:text-jarvis-text"><RefreshCw size={10} style={loading ? { animation: 'arcSpin1 0.8s linear infinite' } : {}} /></button></div>
      {loading && <div className="text-[9px] text-jarvis-muted py-3 text-center">Fetching the latest headlines…</div>}
      {!loading && data?.empty && <div className="text-[9px] text-jarvis-muted py-3 text-center">No headlines found.</div>}
      {!loading && data?.sections?.map((sec: any, i: number) => sec.items.length > 0 && (
        <div key={i} className="mb-3">
          <div className="text-[8px] font-orbitron tracking-widest mb-1.5" style={{ color: '#00d4ff' }}>{sec.label.toUpperCase()}</div>
          <div className="space-y-1.5">
            {sec.items.map((it: any, j: number) => (
              <a key={j} href={it.url || '#'} target="_blank" rel="noreferrer" className="block p-2 rounded-sm hover:brightness-125" style={{ background: 'rgba(4,22,40,0.5)', border: '1px solid rgba(13,74,110,0.4)' }}>
                <div className="flex items-start gap-1"><span className="text-[10px] leading-snug" style={{ color: '#a8d8ea' }}>{it.title}</span>{it.url && <ExternalLink size={9} className="flex-shrink-0 mt-0.5" style={{ color: '#4a7a99' }} />}</div>
                {it.snippet && <div className="text-[8px] text-jarvis-muted mt-0.5 leading-snug">{it.snippet}</div>}
                {it.source && <div className="text-[7px] font-orbitron tracking-wider mt-1" style={{ color: '#00aaff' }}>{it.source}</div>}
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function DetailPanel({ hit, onClose, connCount }: { hit: Hit; onClose: () => void; connCount: (n: string) => number }) {
  const d = hit.data
  const head = hit.type === 'sat' ? d.name : hit.type === 'country' ? d.name : hit.type === 'home' ? `${d.city} (You)` : (d.city || d.country)
  const color = hit.type === 'sat' ? (d.color || '#00d4ff') : hit.type === 'conn' ? (d.severity === 'critical' ? '#ff3333' : '#00d4ff') : hit.type === 'home' ? '#00ff88' : '#78c8ff'
  const fmt = (n?: number) => n ? Math.round(n).toLocaleString() : '—'
  return (
    <div>
      <div className="flex items-start justify-between mb-2"><div className="text-[8px] font-orbitron tracking-widest px-2 py-0.5 rounded-sm" style={{ background: hexA(color, 0.12), border: `1px solid ${hexA(color, 0.4)}`, color }}>{hit.type.toUpperCase()}</div><button onClick={onClose} className="text-jarvis-muted hover:text-jarvis-text"><X size={13} /></button></div>
      <h3 className="font-orbitron text-sm mb-2" style={{ color }}>{head}</h3>
      {hit.type === 'sat' && <>
        <Row k="OPERATOR" v={d.operator} /><Row k="ORBIT" v={d.kind} /><Row k="ALTITUDE" v={d.alt ? `${Math.round(d.alt).toLocaleString()} km (live)` : '—'} />
        {d.lat != null && d.ok !== false && <Row k="POSITION" v={`${d.lat.toFixed(1)}, ${d.lon.toFixed(1)}`} />}
        <p className="text-[9px] leading-relaxed mt-2" style={{ color: '#b8d8e8' }}>{d.purpose}</p>
        <NewsSection subject={String(d.name).replace(/\s*\(.*\)/, '')} kind="sat" />
      </>}
      {hit.type === 'country' && <>
        <Row k="CAPITAL" v={d.capital} /><Row k="REGION" v={d.region || '—'} /><Row k="SUBREGION" v={d.subregion || '—'} />
        {d.languages && <Row k="LANGUAGES" v={d.languages} />}{d.currency && <Row k="CURRENCY" v={d.currency} />}{d.demonym && <Row k="PEOPLE" v={d.demonym} />}{d.area ? <Row k="AREA" v={`${fmt(d.area)} km²`} /> : null}
        <p className="text-[9px] leading-relaxed mt-2" style={{ color: '#b8d8e8' }}>{d.flag ? d.flag + '  ' : ''}{d.note || `${d.capital} is the capital of ${d.name}.`}</p>
        <CountryDossier c={d} conns={connCount(d.name)} />
        <VideoSection subject={d.name} />
        <NewsSection subject={d.name} kind="country" />
      </>}
      {hit.type === 'conn' && <>
        <Row k="LOCATION" v={`${d.city || '—'}, ${d.country}`} /><Row k="IP : PORT" v={`${d.ip}:${d.port}`} /><Row k="PROCESS" v={d.process} /><Row k="ISP" v={d.isp || '—'} /><Row k="STATUS" v={d.severity === 'critical' ? 'FLAGGED' : 'Normal'} />
        <p className="text-[9px] leading-relaxed mt-2" style={{ color: d.severity === 'critical' ? '#ffb0b0' : '#b8d8e8' }}>{d.severity === 'critical' ? `Outbound connection from "${d.process}" to ${d.country} was flagged.` : `Normal outbound connection from "${d.process}" to ${d.city || d.country}.`}</p>
      </>}
      {hit.type === 'home' && <>
        <Row k="LOCATION" v={`${d.city}, ${d.country}`} /><Row k="PUBLIC IP" v={d.ip} /><Row k="ISP" v={d.isp || '—'} />
        <p className="text-[9px] leading-relaxed mt-2" style={{ color: '#b8e0d4' }}>This is your machine — the origin of every connection arc.</p>
      </>}
    </div>
  )
}
