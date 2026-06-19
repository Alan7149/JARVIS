import { useState, useEffect } from 'react'
import { Music, Play, SkipForward, Square, Volume2, Search, Zap, ExternalLink } from 'lucide-react'
import { apiFetch } from '../lib/api'
import { useWebSocket } from '../contexts/WebSocketContext'

const QUICK_PLAYLISTS = [
  { label: 'Lo-Fi Coding', query: 'lofi hip hop beats study coding 2024', emoji: '💻' },
  { label: 'Deep Focus', query: 'deep focus concentration music instrumental study', emoji: '🧠' },
  { label: 'Gaming Energy', query: 'epic gaming music intense electronic NCS', emoji: '🎮' },
  { label: 'Morning Boost', query: 'morning energy upbeat motivation playlist 2024', emoji: '☀️' },
  { label: 'Chill Vibes', query: 'chill acoustic relaxing evening playlist', emoji: '🌙' },
  { label: 'Workout', query: 'workout gym training high energy playlist', emoji: '💪' },
  { label: 'Classical Focus', query: 'classical music focus mozart beethoven study', emoji: '🎻' },
  { label: 'Jazz Chill', query: 'jazz coffee shop background chill lo-fi', emoji: '☕' },
]

export default function YouTubeMusic() {
  const { lastMessage } = useWebSocket()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [nowPlaying, setNowPlaying] = useState<{title?:string;artist?:string;query:string;url:string} | null>(null)
  const [status, setStatus] = useState<'idle'|'playing'|'paused'>('idle')
  const [volume, setVolume] = useState(70)
  const [error, setError] = useState('')
  const [activeQuery, setActiveQuery] = useState('')

  useEffect(() => {
    // Load current status
    apiFetch('/api/music/status').then(r => r.json()).then(d => {
      if (d.playing) { setStatus(d.status || 'playing'); setActiveQuery(d.current_query || '') }
    }).catch(() => {})
  }, [])

  const play = async (q: string) => {
    setLoading(true); setError('')
    try {
      const r = await apiFetch('/api/music/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      const data = await r.json()
      if (data.error) { setError(data.error); return }
      setNowPlaying({ title: data.title, artist: data.artist, query: q, url: data.url })
      setStatus('playing'); setActiveQuery(q)
    } catch (e) { setError('Failed to connect to music service') }
    finally { setLoading(false) }
  }

  const pause = async () => {
    await apiFetch('/api/music/pause', { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' })
    setStatus(status === 'playing' ? 'paused' : 'playing')
  }

  const next = async () => {
    await apiFetch('/api/music/next', { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' })
  }

  const handleVolume = async (v: number) => {
    setVolume(v)
    await apiFetch('/api/music/volume', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ level: v }),
    })
  }

  const spinStyle = status === 'playing' ? { animation: 'arcSpin1 4s linear infinite' } : {}

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-widest glow-text font-orbitron">YOUTUBE MUSIC DJ</h1>
          <p className="text-[10px] text-jarvis-muted mt-1 tracking-wider">Voice or dashboard control — opens YouTube Music in browser</p>
        </div>
        {status === 'playing' && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm font-orbitron text-[9px]"
            style={{ background: 'rgba(0,255,136,0.07)', border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88' }}>
            {[4,8,12,8,4].map((h,i) => (
              <div key={i} style={{ width: 3, background: '#00ff88', borderRadius: 2, height: h,
                animation: `waveBar${i%3} 0.5s ease-in-out infinite`, animationDelay: `${i*0.1}s` }} />
            ))}
            NOW PLAYING
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Left — Player */}
        <div className="space-y-4">
          <div className="panel hud-corner p-5">
            <div className="label-jarvis mb-4">NOW PLAYING</div>
            <div className="flex flex-col items-center gap-4 py-2">
              {/* Disc */}
              <div style={{ width: 100, height: 100, borderRadius: '50%', position: 'relative',
                background: 'rgba(0,0,0,0.6)',
                border: status === 'playing' ? '2px solid rgba(0,212,255,0.5)' : '2px solid rgba(13,74,110,0.4)',
                boxShadow: status === 'playing' ? '0 0 20px rgba(0,212,255,0.2)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                ...spinStyle }}>
                <Music size={30} style={{ color: status === 'playing' ? '#00d4ff' : '#4a7a99' }} />
                <div style={{ position: 'absolute', width: 14, height: 14, borderRadius: '50%',
                  background: '#020b18', border: '2px solid rgba(0,212,255,0.4)' }} />
              </div>

              <div className="text-center px-2">
                <div className="text-[11px] font-mono" style={{ color: '#a8d8ea', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {nowPlaying?.title || activeQuery || 'No track selected'}
                </div>
                {nowPlaying?.artist && (
                  <div className="text-[9px] text-jarvis-muted mt-0.5">{nowPlaying.artist}</div>
                )}
                <div className="text-[8px] font-orbitron tracking-widest mt-1"
                  style={{ color: status === 'playing' ? '#00ff88' : status === 'paused' ? '#ff9900' : '#4a7a99' }}>
                  {status.toUpperCase()}
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4 mb-4 mt-2">
              <button onClick={pause}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
                style={{ background: 'rgba(13,74,110,0.3)', border: '1px solid rgba(0,212,255,0.25)', color: '#4a7a99' }}>
                <Square size={12} />
              </button>
              <button onClick={() => (nowPlaying || activeQuery) && play(nowPlaying?.query || activeQuery)}
                className="w-14 h-14 rounded-full flex items-center justify-center transition-all"
                style={{ background: 'rgba(0,212,255,0.12)', border: '2px solid rgba(0,212,255,0.5)', color: '#00d4ff',
                  boxShadow: status === 'playing' ? '0 0 15px rgba(0,212,255,0.2)' : 'none' }}>
                <Play size={20} />
              </button>
              <button onClick={next}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
                style={{ background: 'rgba(13,74,110,0.3)', border: '1px solid rgba(0,212,255,0.25)', color: '#4a7a99' }}>
                <SkipForward size={12} />
              </button>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-2">
              <Volume2 size={11} style={{ color: '#4a7a99', flexShrink: 0 }} />
              <input type="range" min={0} max={100} value={volume}
                onChange={e => handleVolume(Number(e.target.value))}
                style={{ flex: 1, accentColor: '#00d4ff', height: 3 }} />
              <span className="text-[9px] font-mono text-jarvis-muted w-5 text-right">{volume}</span>
            </div>

            {nowPlaying?.url && (
              <a href={nowPlaying.url} target="_blank" rel="noreferrer"
                className="mt-3 flex items-center justify-center gap-1.5 text-[8px] font-orbitron tracking-wider py-1.5 rounded-sm transition-all"
                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(13,74,110,0.4)', color: '#4a7a99' }}>
                <ExternalLink size={9} /> OPEN IN YOUTUBE MUSIC
              </a>
            )}
          </div>

          {/* Search */}
          <div className="panel p-4">
            <div className="label-jarvis mb-3">SEARCH & PLAY</div>
            <div className="flex gap-2">
              <input className="input-jarvis flex-1 text-xs" placeholder="Song, artist, mood..."
                value={query} onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && query.trim() && play(query)} />
              <button onClick={() => query.trim() && play(query)} disabled={loading || !query.trim()}
                className="px-3 rounded-sm text-[9px] font-orbitron transition-all flex items-center gap-1"
                style={{ background: query ? 'rgba(0,212,255,0.1)' : 'rgba(4,22,40,0.5)',
                  border: `1px solid ${query ? 'rgba(0,212,255,0.4)' : 'rgba(13,74,110,0.3)'}`,
                  color: query ? '#00d4ff' : '#4a7a99' }}>
                {loading ? '...' : <><Search size={10} /> GO</>}
              </button>
            </div>
            {error && <div className="text-[9px] text-jarvis-danger mt-2 font-mono">{error}</div>}

            <div className="mt-3 p-2 rounded text-[8px] font-mono leading-relaxed"
              style={{ background: 'rgba(0,212,255,0.03)', border: '1px solid rgba(0,212,255,0.1)' }}>
              🎙️ <span style={{ color: '#00d4ff' }}>"Hey JARVIS, play lo-fi beats"</span><br/>
              🎙️ <span style={{ color: '#00d4ff' }}>"Play something for coding"</span><br/>
              🎙️ <span style={{ color: '#00d4ff' }}>"Pause music" / "Next track"</span>
            </div>
          </div>
        </div>

        {/* Right — Quick Playlists */}
        <div className="lg:col-span-2 space-y-4">
          <div className="panel hud-corner p-5">
            <div className="flex items-center gap-2 mb-5">
              <Zap size={13} style={{ color: '#00d4ff' }} />
              <span className="text-[10px] font-orbitron font-bold tracking-widest" style={{ color: '#a8d8ea' }}>
                QUICK PLAYLISTS
              </span>
              <span className="text-[8px] text-jarvis-muted ml-auto">Click any to play instantly in browser</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {QUICK_PLAYLISTS.map((p, i) => (
                <button key={i} onClick={() => play(p.query)} disabled={loading}
                  className="flex flex-col items-center gap-2 p-4 rounded-sm transition-all"
                  style={{
                    background: activeQuery === p.query ? 'rgba(0,212,255,0.1)' : 'rgba(4,22,40,0.6)',
                    border: `1px solid ${activeQuery === p.query ? 'rgba(0,212,255,0.5)' : 'rgba(13,74,110,0.4)'}`,
                    boxShadow: activeQuery === p.query ? '0 0 12px rgba(0,212,255,0.1)' : 'none',
                    opacity: loading ? 0.6 : 1,
                  }}>
                  <div className="text-2xl">{p.emoji}</div>
                  <div className="text-[9px] font-orbitron tracking-wide text-center"
                    style={{ color: activeQuery === p.query ? '#00d4ff' : '#4a7a99' }}>
                    {p.label.toUpperCase()}
                  </div>
                  {activeQuery === p.query && status === 'playing' && (
                    <div className="flex gap-0.5 items-end h-3">
                      {[1,2,3].map(b => (
                        <div key={b} style={{ width: 2, background: '#00d4ff', borderRadius: 1,
                          animation: `waveBar${b} 0.5s ease-in-out infinite`,
                          animationDelay: `${b*0.1}s`, height: 3 + b*3 }} />
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Auto DJ */}
          <div className="panel p-4">
            <div className="label-jarvis mb-3">AUTO DJ — CONTEXT AWARE</div>
            <div className="grid grid-cols-2 gap-2 text-[9px] mb-3">
              {[
                { ctx: 'Coding detected', music: '→ Lo-Fi Hip Hop', color: '#00d4ff' },
                { ctx: 'Gaming detected', music: '→ Epic Electronic', color: '#00ff88' },
                { ctx: 'Meeting starts', music: '→ Muted (if enabled)', color: '#ff9900' },
                { ctx: 'Focus mode (25m+)', music: '→ Deep Focus', color: '#00aaff' },
                { ctx: 'Late night (11pm+)', music: '→ Chill/Ambient', color: '#a8d8ea' },
                { ctx: 'Morning (6-9am)', music: '→ Morning Boost', color: '#ff9900' },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded-sm font-mono"
                  style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(13,74,110,0.3)' }}>
                  <span style={{ color: '#4a7a99' }}>{item.ctx}</span>
                  <span style={{ color: item.color }}>{item.music}</span>
                </div>
              ))}
            </div>
            <p className="text-[8px] text-jarvis-muted">
              Auto DJ uses Context Awareness monitor. Music opens in your default browser (YouTube Music).
              Make sure YouTube Music is set as your preferred music app.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
