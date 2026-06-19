import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import { RefreshCw, Plus, ExternalLink, Zap, Play } from 'lucide-react'

interface NewsItem { title:string;url:string;snippet:string;source?:string }
interface VideoItem { title:string;url:string;thumbnail:string;duration:string;publisher:string;views?:number }
interface IntelData {
  summary:string
  tech_news:NewsItem[]
  trending:NewsItem[]
  videos:VideoItem[]
  competitor_intel:NewsItem[]
  fetched_at:string
  next_refresh_mins:number
  cached:boolean
  age_mins?:number
  refreshing?:boolean
}

function NewsCard({ item, accent='#00d4ff' }: { item:NewsItem; accent?:string }) {
  return (
    <div className="p-3 rounded-sm transition-all cursor-pointer group"
      style={{ background:'rgba(4,22,40,0.6)', border:`1px solid rgba(13,74,110,0.4)` }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = `${accent}50`)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(13,74,110,0.4)')}
      onClick={() => item.url && window.open(item.url, '_blank')}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="text-[10px] font-mono leading-tight flex-1" style={{color:'#a8d8ea'}}>
          {item.title}
        </div>
        {item.url && (
          <ExternalLink size={9} style={{color:`${accent}60`,flexShrink:0,marginTop:2}} />
        )}
      </div>
      <div className="text-[8px] font-mono leading-relaxed line-clamp-2" style={{color:'rgba(74,122,153,0.8)'}}>
        {item.snippet}
      </div>
    </div>
  )
}

function VideoCard({ v }: { v:VideoItem }) {
  return (
    <div className="flex-shrink-0 rounded-sm overflow-hidden cursor-pointer transition-all group"
      style={{ width:200, background:'rgba(4,22,40,0.7)', border:'1px solid rgba(13,74,110,0.4)' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,68,68,0.5)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(13,74,110,0.4)')}
      onClick={() => v.url && window.open(v.url, '_blank')}>
      <div style={{ position:'relative', height:112, background:'rgba(0,0,0,0.4)' }}>
        {v.thumbnail
          ? <img src={v.thumbnail} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}
              onError={e => { (e.currentTarget as HTMLImageElement).style.display='none' }} />
          : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, opacity:0.3 }}>🎬</div>}
        {/* Play overlay */}
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
          background:'rgba(2,8,20,0.15)', opacity:0, transition:'opacity 0.2s' }}
          className="group-hover:!opacity-100">
          <div style={{ width:34, height:34, borderRadius:'50%', background:'rgba(255,0,50,0.85)',
            display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 14px rgba(255,0,50,0.6)' }}>
            <Play size={15} style={{ color:'#fff', marginLeft:2 }} fill="#fff" />
          </div>
        </div>
        {v.duration && (
          <div style={{ position:'absolute', bottom:4, right:4, fontSize:8, fontFamily:'monospace',
            background:'rgba(0,0,0,0.8)', color:'#fff', padding:'1px 4px', borderRadius:2 }}>
            {v.duration}
          </div>
        )}
      </div>
      <div style={{ padding:'6px 8px' }}>
        <div className="line-clamp-2 leading-tight" style={{ fontSize:9, fontFamily:'monospace', color:'#a8d8ea', minHeight:24 }}>
          {v.title}
        </div>
        <div style={{ fontSize:7, color:'rgba(74,122,153,0.8)', marginTop:3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {v.publisher}{v.views ? ` · ${Intl.NumberFormat('en',{notation:'compact'}).format(v.views)} views` : ''}
        </div>
      </div>
    </div>
  )
}

function Column({ title, items, accent, icon }: { title:string; items:NewsItem[]; accent:string; icon:string }) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 mb-2 pb-2" style={{borderBottom:`1px solid ${accent}20`}}>
        <span className="text-sm">{icon}</span>
        <span className="text-[9px] font-orbitron tracking-[0.2em] font-bold" style={{color:accent}}>{title}</span>
        <div className="text-[8px] px-1.5 py-0.5 rounded font-orbitron"
          style={{background:`${accent}15`,border:`1px solid ${accent}30`,color:accent,marginLeft:'auto'}}>
          {items.length}
        </div>
      </div>
      <div className="space-y-2 flex-1 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="text-[9px] text-jarvis-muted text-center py-8">No items yet</div>
        ) : items.map((item, i) => (
          <NewsCard key={i} item={item} accent={accent} />
        ))}
      </div>
    </div>
  )
}

export default function IntelFeed() {
  const [data, setData] = useState<IntelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [newTopic, setNewTopic] = useState('')
  const [countdown, setCountdown] = useState(0)

  const load = async (force=false) => {
    if (force) setRefreshing(true)
    try {
      const d = await apiFetch(`/api/intel/feed${force?'?force_refresh=true':''}`).then(r => r.json())
      setData(d)
      setCountdown((d.next_refresh_mins || 30) * 60)
    } catch {}
    setLoading(false); setRefreshing(false)
  }

  useEffect(() => {
    load()
    const auto = setInterval(() => load(true), 30 * 60 * 1000)
    return () => clearInterval(auto)
  }, [])

  useEffect(() => {
    if (!countdown) return
    const t = setInterval(() => setCountdown(c => Math.max(0, c-1)), 1000)
    return () => clearInterval(t)
  }, [countdown])

  const addTopic = async () => {
    if (!newTopic.trim()) return
    await apiFetch('/api/intel/add-topic', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic:newTopic})})
    setNewTopic(''); load(true)
  }

  const countdownMin = Math.floor(countdown/60), countdownSec = countdown%60
  const videos = data?.videos || []
  const hasCompetitor = (data?.competitor_intel || []).length > 0

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',padding:16,gap:10}}>
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="font-orbitron text-xl font-black tracking-widest" style={{color:'#00aaff',textShadow:'0 0 20px rgba(0,170,255,0.4)'}}>
            INTEL FEED
          </h1>
          <div className="text-[8px] text-jarvis-muted font-mono mt-0.5">
            {data?.cached ? `CACHED · ${data.age_mins?.toFixed(0)}m ago · ` : 'LIVE · '}
            {data?.refreshing ? 'refreshing… · ' : ''}
            {(data?.tech_news?.length||0)+(data?.trending?.length||0)} articles · {videos.length} videos
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <input value={newTopic} onChange={e=>setNewTopic(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&addTopic()}
              className="input-jarvis text-xs py-1 px-2" style={{width:160}}
              placeholder="Track a topic..." />
            <button onClick={addTopic} className="px-2 py-1 rounded-sm"
              style={{background:'rgba(0,212,255,0.1)',border:'1px solid rgba(0,212,255,0.3)',color:'#00d4ff'}}>
              <Plus size={11} />
            </button>
          </div>
          <button onClick={()=>load(true)} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-sm font-orbitron text-[8px]"
            style={{background:'rgba(0,170,255,0.08)',border:'1px solid rgba(0,170,255,0.3)',color:'#00aaff',
                    opacity:refreshing?0.6:1}}>
            <RefreshCw size={9} style={{animation:refreshing?'arcSpin1 1s linear infinite':'none'}} />
            {refreshing?'FETCHING...':'REFRESH'}
          </button>
        </div>
      </div>

      {/* AI Summary */}
      {data?.summary && (
        <div className="panel flex-shrink-0 p-3 hud-corner"
          style={{borderColor:'rgba(0,170,255,0.2)',background:'rgba(0,40,80,0.3)'}}>
          <div className="flex items-center gap-2 mb-1.5">
            <Zap size={12} style={{color:'#00d4ff'}} />
            <span className="text-[9px] font-orbitron tracking-widest" style={{color:'#00d4ff'}}>JARVIS INTELLIGENCE BRIEF</span>
          </div>
          <div className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap" style={{color:'#a8d8ea'}}>
            {data.summary}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12}}>
          <div style={{width:40,height:40,border:'2px solid rgba(0,170,255,0.2)',borderTop:'2px solid #00aaff',borderRadius:'50%',animation:'arcSpin1 1.5s linear infinite'}} />
          <div className="font-orbitron text-[9px]" style={{color:'#00aaff'}}>SCANNING THE WEB...</div>
          <div className="text-[8px] text-jarvis-muted font-mono text-center max-w-xs">
            JARVIS is searching tech news, trends, videos, and intelligence for you...
          </div>
        </div>
      ) : (
        <>
          {/* News columns */}
          <div style={{flex:1,display:'grid',gridTemplateColumns: hasCompetitor ? '1fr 1fr 1fr' : '1fr 1fr',gap:16,overflow:'hidden',minHeight:0}}>
            <Column title="TECH INTELLIGENCE" items={data?.tech_news||[]} accent="#00d4ff" icon="💻" />
            <Column title="TRENDING NOW" items={data?.trending||[]} accent="#00ff88" icon="📈" />
            {hasCompetitor && <Column title="COMPETITOR INTEL" items={data?.competitor_intel||[]} accent="#a855f7" icon="🎯" />}
          </div>

          {/* Videos strip */}
          <div className="flex-shrink-0">
            <div className="flex items-center gap-2 mb-2 pb-1.5" style={{borderBottom:'1px solid rgba(255,68,68,0.2)'}}>
              <span className="text-sm">📺</span>
              <span className="text-[9px] font-orbitron tracking-[0.2em] font-bold" style={{color:'#ff4444'}}>VIDEO BRIEFINGS</span>
              <div className="text-[8px] px-1.5 py-0.5 rounded font-orbitron"
                style={{background:'rgba(255,68,68,0.12)',border:'1px solid rgba(255,68,68,0.3)',color:'#ff6666',marginLeft:'auto'}}>
                {videos.length} VIDEOS
              </div>
            </div>
            <div style={{ display:'flex', gap:12, overflowX:'auto', overflowY:'hidden', paddingBottom:6, height:182 }}>
              {videos.length === 0 ? (
                <div className="text-[9px] text-jarvis-muted py-8">No videos — refreshing...</div>
              ) : videos.map((v, i) => <VideoCard key={i} v={v} />)}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
