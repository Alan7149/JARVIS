import { useState, useEffect, useRef } from 'react'
import { Code2, Zap, ShieldAlert, TrendingUp, Eye, FolderOpen, History, RefreshCw, Copy, CheckCircle, GitBranch, AlertTriangle, Search, BookOpen, Layers, Cpu, MessageSquare, BarChart2, Wand2, Sparkles, Save, Lightbulb } from 'lucide-react'
import { apiFetch } from '../lib/api'
import { useWebSocket } from '../contexts/WebSocketContext'

// ── Types ────────────────────────────────────────────────────────────────────
type ReviewMode = 'review'|'explain'|'improve'|'security'|'performance'
type Feature = 'analyze'|'refactor'|'secscan'|'complexity'|'smells'|'dead'|'duplicates'|'architecture'|'git'|'docs'|'patterns'|'comments'|'explain-level'|'time-complexity'|'codebase'

const SEV_COLORS: Record<string, string> = { CRITICAL:'#ff3333',HIGH:'#ff6600',WARNING:'#ff9900',MEDIUM:'#ff9900',INFO:'#00d4ff',LOW:'#00aaff',SAFE:'#00ff88',CLEAN:'#00ff88' }

// ── Sub-components ───────────────────────────────────────────────────────────

function DiffViewer({ hunks }: { hunks: any[] }) {
  if (!hunks?.length) return <div className="text-jarvis-muted text-[10px] text-center py-8">No diff hunks to display</div>
  return (
    <div className="space-y-4">
      {hunks.map((h, i) => (
        <div key={i}>
          <div className="text-[9px] font-orbitron mb-2 px-2 py-1 rounded" style={{ background:'rgba(0,212,255,0.08)', color:'#00d4ff' }}>{h.file}</div>
          <div className="grid grid-cols-2 gap-1 font-mono text-[9px]">
            <div>
              <div className="text-[7px] text-jarvis-muted mb-1 text-center">BEFORE</div>
              {h.before?.slice(0,30).map((l: any, j: number) => (
                <div key={j} className="px-2 py-0.5 leading-relaxed" style={{
                  background: l.type==='removed'?'rgba(255,51,51,0.12)':l.type==='empty'?'rgba(0,0,0,0.1)':'transparent',
                  borderLeft: l.type==='removed'?'2px solid rgba(255,51,51,0.5)':'2px solid transparent',
                  color: l.type==='removed'?'#ff9999':l.type==='empty'?'transparent':'#4a7a99',
                }}>
                  {l.text || ' '}
                </div>
              ))}
            </div>
            <div>
              <div className="text-[7px] text-jarvis-muted mb-1 text-center">AFTER</div>
              {h.after?.slice(0,30).map((l: any, j: number) => (
                <div key={j} className="px-2 py-0.5 leading-relaxed" style={{
                  background: l.type==='added'?'rgba(0,255,136,0.1)':l.type==='empty'?'rgba(0,0,0,0.1)':'transparent',
                  borderLeft: l.type==='added'?'2px solid rgba(0,255,136,0.4)':'2px solid transparent',
                  color: l.type==='added'?'#88ffcc':l.type==='empty'?'transparent':'#4a7a99',
                }}>
                  {l.text || ' '}
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ComplexityHeatmap({ data }: { data: any }) {
  if (!data?.functions?.length) return <div className="text-jarvis-muted text-[10px] text-center py-8">No functions found</div>
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2 text-center text-[8px] mb-4">
        {[['Score', data.score+'/100','#00d4ff'],['Functions',data.total_functions,'#a8d8ea'],['Avg CC',data.avg_complexity,'#ff9900'],['Critical',data.critical_count,'#ff3333']].map(([l,v,c],i)=>(
          <div key={i} className="p-2 rounded-sm" style={{background:'rgba(4,22,40,0.6)',border:'1px solid rgba(13,74,110,0.4)'}}>
            <div style={{color:c as string,fontSize:18,fontWeight:700,fontFamily:'Orbitron,monospace'}}>{v}</div>
            <div style={{color:'#4a7a99',fontSize:7,letterSpacing:'0.1em'}}>{l}</div>
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        {data.functions.map((f: any, i: number) => (
          <div key={i} className="flex items-center gap-3 p-2 rounded-sm" style={{background:'rgba(4,22,40,0.4)',border:`1px solid ${f.color}25`}}>
            <div className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold"
              style={{background:`${f.color}20`,border:`1px solid ${f.color}50`,color:f.color}}>
              {f.complexity}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-[10px]" style={{color:'#a8d8ea'}}>{f.name}</div>
              <div className="text-[8px]" style={{color:'#4a7a99'}}>Line {f.line} · {f.level.toUpperCase()}</div>
            </div>
            <div className="flex-shrink-0" style={{width:80,height:6,background:'rgba(13,74,110,0.3)',borderRadius:3}}>
              <div style={{width:`${Math.min(100,f.complexity*4)}%`,height:'100%',background:f.color,borderRadius:3,boxShadow:`0 0 4px ${f.color}`}} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SmellsDashboard({ data }: { data: any }) {
  if (!data?.smells) return null
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 mb-4">
        <div className="text-center">
          <div className="font-orbitron text-3xl font-black" style={{color:data.score>70?'#00ff88':data.score>40?'#ff9900':'#ff3333',textShadow:`0 0 10px currentColor`}}>{data.score}</div>
          <div className="text-[8px] text-jarvis-muted tracking-widest">QUALITY SCORE</div>
        </div>
        <div className="flex-1 h-2 rounded-full" style={{background:'rgba(13,74,110,0.3)'}}>
          <div className="h-full rounded-full" style={{width:`${data.score}%`,background:data.score>70?'#00ff88':data.score>40?'#ff9900':'#ff3333',boxShadow:`0 0 8px currentColor`}} />
        </div>
      </div>
      {data.smells.length === 0
        ? <div className="text-center py-6 text-jarvis-success text-[11px]">✅ No code smells detected — clean code!</div>
        : data.smells.map((s: any, i: number) => (
          <div key={i} className="p-3 rounded-sm" style={{background:'rgba(4,22,40,0.6)',border:`1px solid ${SEV_COLORS[s.severity]||'#0d4a6e'}30`}}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <AlertTriangle size={11} style={{color:SEV_COLORS[s.severity]||'#ff9900'}} />
                <span className="text-[10px] font-orbitron font-bold" style={{color:'#a8d8ea'}}>{s.type}</span>
              </div>
              <span className="text-[7px] px-1.5 py-0.5 rounded font-orbitron"
                style={{background:`${SEV_COLORS[s.severity]||'#ff9900'}15`,border:`1px solid ${SEV_COLORS[s.severity]||'#ff9900'}40`,color:SEV_COLORS[s.severity]||'#ff9900'}}>
                {s.severity}
              </span>
            </div>
            <div className="text-[9px] font-mono" style={{color:'#00d4ff'}}>{s.name} {s.line>0?`(line ${s.line})`:''}</div>
            <div className="text-[9px] text-jarvis-muted mt-0.5">{s.detail}</div>
          </div>
        ))
      }
    </div>
  )
}

function ArchitectureDiagram({ data }: { data: any }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (data?.mermaid && ref.current && (window as any).mermaid) {
      ref.current.innerHTML = `<div class="mermaid">${data.mermaid}</div>`
      ;(window as any).mermaid.run()
    }
  }, [data])
  if (!data) return null
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 text-center text-[8px]">
        {[['Files', data.file_count],['Connections',data.connection_count]].map(([l,v],i)=>(
          <div key={i} className="p-2 rounded-sm" style={{background:'rgba(4,22,40,0.6)',border:'1px solid rgba(13,74,110,0.4)'}}>
            <div className="font-orbitron text-lg font-black" style={{color:'#00d4ff'}}>{v}</div>
            <div style={{color:'#4a7a99'}}>{l}</div>
          </div>
        ))}
      </div>
      {data.mermaid && (
        <div>
          <div className="label-jarvis mb-2">DEPENDENCY GRAPH</div>
          <div ref={ref} className="rounded overflow-x-auto p-3"
            style={{background:'rgba(0,0,0,0.3)',border:'1px solid rgba(0,212,255,0.15)',minHeight:100,color:'#00d4ff',fontFamily:'monospace',fontSize:10,lineHeight:1.6}}>
            <pre className="text-[9px]">{data.mermaid}</pre>
          </div>
        </div>
      )}
      {data.file_tree && (
        <div>
          <div className="label-jarvis mb-2">FILE TREE</div>
          <pre className="text-[9px] font-mono p-3 rounded overflow-x-auto"
            style={{background:'rgba(0,0,0,0.3)',border:'1px solid rgba(0,212,255,0.1)',color:'#4a7a99',maxHeight:200}}>
            {data.file_tree}
          </pre>
        </div>
      )}
    </div>
  )
}

function ProviderBadge({ provider, model }: { provider?: string; model?: string }) {
  if (!provider) return null
  const isClaude = provider === 'claude'
  const c = isClaude ? '#00ff88' : '#ff9900'
  return (
    <span className="inline-flex items-center gap-1 text-[7px] font-orbitron px-1.5 py-0.5 rounded"
      style={{ background:`${c}12`, border:`1px solid ${c}40`, color:c }}
      title={model || ''}>
      <Sparkles size={8}/> {isClaude ? 'CLAUDE' : 'GROQ'}
    </span>
  )
}

// Security scan: real secret/dep findings (not LLM prose)
function SecScanResult({ data }: { data: any }) {
  const counts = data.counts || {}
  const score = data.score ?? 0
  const scoreColor = score >= 80 ? '#00ff88' : score >= 50 ? '#ff9900' : '#ff3333'
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 mb-1">
        <div className="text-center">
          <div className="font-orbitron text-3xl font-black" style={{ color: scoreColor, textShadow: '0 0 10px currentColor' }}>{score}</div>
          <div className="text-[8px] text-jarvis-muted tracking-widest">SECURITY SCORE</div>
        </div>
        <div className="flex-1 grid grid-cols-4 gap-1.5 text-center text-[8px]">
          {[['CRITICAL', counts.CRITICAL || 0, '#ff3333'], ['HIGH', counts.HIGH || 0, '#ff6600'], ['MEDIUM', counts.MEDIUM || 0, '#ff9900'], ['LOW', counts.LOW || 0, '#00aaff']].map(([l, v, c], i) => (
            <div key={i} className="p-2 rounded-sm" style={{ background: 'rgba(4,22,40,0.6)', border: `1px solid ${c}30` }}>
              <div style={{ color: c as string, fontSize: 16, fontWeight: 700, fontFamily: 'Orbitron,monospace' }}>{v as number}</div>
              <div style={{ color: '#4a7a99', fontSize: 7 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="text-[8px] text-jarvis-muted">{data.files_scanned} files scanned · {data.total} findings</div>
      {(!data.findings || data.findings.length === 0) ? (
        <div className="text-center py-6 text-jarvis-success text-[11px]">✅ No hardcoded secrets or risky dependencies found.</div>
      ) : data.findings.map((f: any, i: number) => {
        const c = SEV_COLORS[f.severity] || '#ff9900'
        return (
          <div key={i} className="p-2.5 rounded-sm" style={{ background: 'rgba(4,22,40,0.6)', border: `1px solid ${c}30` }}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <ShieldAlert size={11} style={{ color: c }} />
                <span className="text-[10px] font-orbitron font-bold" style={{ color: '#a8d8ea' }}>{f.type}</span>
              </div>
              <span className="text-[7px] px-1.5 py-0.5 rounded font-orbitron" style={{ background: `${c}15`, border: `1px solid ${c}40`, color: c }}>{f.severity}</span>
            </div>
            <div className="text-[9px] font-mono" style={{ color: '#00d4ff' }}>{f.file}{f.line ? `:${f.line}` : ''}</div>
            {f.preview && <div className="text-[9px] font-mono mt-0.5" style={{ color: '#ff9999' }}>{f.preview}</div>}
            <div className="text-[9px] text-jarvis-muted mt-0.5">{f.detail}</div>
          </div>
        )
      })}
    </div>
  )
}

// Repo file-tree browser — click a file to load it into the analysis box
function TreeBrowser({ onPick }: { onPick: (path: string) => void }) {
  const [root, setRoot] = useState('')
  const [tree, setTree] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const load = async () => {
    if (!root.trim()) return
    setLoading(true); setTree(null)
    try { const r = await apiFetch(`/api/code/tree?directory=${encodeURIComponent(root)}`); const j = await r.json(); setTree(j.tree || []) }
    catch { setTree([]) } finally { setLoading(false) }
  }

  const Node = ({ n, depth }: { n: any; depth: number }) => {
    if (n.type === 'dir') {
      const isOpen = open[n.path]
      return (
        <div>
          <button onClick={() => setOpen(o => ({ ...o, [n.path]: !o[n.path] }))}
            className="flex items-center gap-1 w-full text-left py-0.5 text-[9px] hover:brightness-125" style={{ paddingLeft: depth * 10, color: '#4a9acc' }}>
            <FolderOpen size={10} /> {n.name}
          </button>
          {isOpen && n.children?.map((c: any, i: number) => <Node key={i} n={c} depth={depth + 1} />)}
        </div>
      )
    }
    return (
      <button onClick={() => onPick(n.path)} className="flex items-center gap-1 w-full text-left py-0.5 text-[9px] hover:text-jarvis-text" style={{ paddingLeft: depth * 10 + 12, color: '#a8d8ea' }}>
        <Code2 size={9} style={{ color: '#4a7a99' }} /> {n.name}
      </button>
    )
  }

  return (
    <div className="panel p-3 mb-3">
      <div className="flex items-center gap-1.5 mb-2">
        <input className="input-jarvis flex-1 font-mono text-[9px]" placeholder="Repo folder…" value={root} onChange={e => setRoot(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} />
        <button onClick={load} className="text-[8px] px-2 py-1 rounded-sm font-orbitron" style={{ border: '1px solid rgba(0,212,255,0.4)', color: '#00d4ff' }}>{loading ? '…' : 'LOAD'}</button>
      </div>
      {tree && (
        <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
          {tree.length === 0 ? <div className="text-[9px] text-jarvis-muted py-2">No source files found.</div>
            : tree.map((n, i) => <Node key={i} n={n} depth={0} />)}
        </div>
      )}
    </div>
  )
}

// Refactor result: deterministic diff + what-changed + why-it's-better + apply
function RefactorResult({ data, applyPath }: { data: any; applyPath: string }) {
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState<any>(null)
  const [err, setErr] = useState('')

  const apply = async () => {
    if (!applyPath.trim()) { setErr('Set a file path above to apply changes'); return }
    setApplying(true); setErr('')
    try {
      const r = await apiFetch('/api/code/apply', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ path: applyPath, code: data.improved_code, confirm: true }),
      })
      const j = await r.json()
      if (j.error) setErr(j.error); else setApplied(j)
    } catch(e) { setErr(String(e)) }
    finally { setApplying(false) }
  }

  const d = data.diff || {}
  const canApply = !!data.improved_code && !data.parse_warning

  return (
    <div className="space-y-4">
      {/* Summary + provider */}
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px]" style={{color:'#a8d8ea'}}>{data.summary}</div>
        <ProviderBadge provider={data.provider} model={data.model}/>
      </div>

      {data.parse_warning && (
        <div className="text-[9px] p-2 rounded" style={{background:'rgba(255,153,0,0.08)',border:'1px solid rgba(255,153,0,0.3)',color:'#ff9900'}}>
          ⚠ The model returned unstructured output, so there's no applyable diff. Raw suggestion below.
        </div>
      )}

      {/* Diff stat bar */}
      {d.hunks?.length > 0 && (
        <div className="flex items-center gap-3 text-[8px] font-orbitron">
          <span style={{color:'#00ff88'}}>+{d.added_lines} added</span>
          <span style={{color:'#ff3333'}}>−{d.removed_lines} removed</span>
          {d.unchanged && <span style={{color:'#4a7a99'}}>· no effective change</span>}
        </div>
      )}

      {/* Before/After diff */}
      {d.hunks?.length > 0 && (
        <div>
          <div className="label-jarvis mb-2 flex items-center gap-1"><GitBranch size={10}/> BEFORE → AFTER</div>
          <DiffViewer hunks={d.hunks}/>
        </div>
      )}

      {/* What changed */}
      {data.changes?.length > 0 && (
        <div>
          <div className="label-jarvis mb-2 flex items-center gap-1"><CheckCircle size={10}/> WHAT CHANGED</div>
          <ul className="space-y-1">
            {data.changes.map((c: string, i: number) => (
              <li key={i} className="flex gap-2 text-[10px]" style={{color:'#a8d8ea'}}>
                <span style={{color:'#00ff88'}}>▸</span><span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Why it's better — the teaching section */}
      {data.why_better && (
        <div className="p-3 rounded-sm" style={{background:'rgba(0,255,136,0.05)',border:'1px solid rgba(0,255,136,0.2)'}}>
          <div className="label-jarvis mb-2 flex items-center gap-1" style={{color:'#00ff88'}}>
            <Lightbulb size={10}/> WHY IT'S BETTER
          </div>
          <div className="text-[10px] leading-relaxed whitespace-pre-wrap" style={{color:'#b8e0d4'}}>
            {data.why_better}
          </div>
        </div>
      )}

      {/* Apply */}
      {canApply && (
        <div className="pt-2 border-t border-jarvis-border/40">
          {applied ? (
            <div className="text-[10px] p-2 rounded" style={{background:'rgba(0,255,136,0.08)',border:'1px solid rgba(0,255,136,0.3)',color:'#00ff88'}}>
              ✅ Applied to {applied.path} ({applied.bytes_written} bytes). Backup: {applied.backup?.split(/[\\/]/).pop()}
            </div>
          ) : (
            <>
              <button onClick={apply} disabled={applying}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-sm font-orbitron text-[9px] tracking-widest transition-all"
                style={{background:'rgba(0,255,136,0.12)',border:'1.5px solid rgba(0,255,136,0.5)',color:'#00ff88'}}>
                {applying ? <><RefreshCw size={11} style={{animation:'arcSpin1 0.8s linear infinite'}}/> APPLYING...</>
                          : <><Save size={11}/> APPLY TO FILE</>}
              </button>
              <div className="text-[8px] text-jarvis-muted mt-1.5 text-center">
                Writes to the path above · a <span style={{color:'#a8d8ea'}}>.jarvis.bak</span> backup is created first
              </div>
            </>
          )}
          {err && <div className="text-[9px] mt-2" style={{color:'#ff3333'}}>❌ {err}</div>}
        </div>
      )}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

const REVIEW_MODES: {key:ReviewMode;label:string;color:string}[] = [
  {key:'review',label:'Full Review',color:'#00d4ff'},
  {key:'explain',label:'Explain Code',color:'#00aaff'},
  {key:'improve',label:'Improve It',color:'#00ff88'},
  {key:'security',label:'Security',color:'#ff3333'},
  {key:'performance',label:'Performance',color:'#ff9900'},
]

const FEATURES: {key:Feature;label:string;icon:React.ReactNode;color:string}[] = [
  {key:'analyze',       label:'AI Review',          icon:<Code2 size={12}/>,        color:'#00d4ff'},
  {key:'refactor',      label:'Refactor & Apply',   icon:<Wand2 size={12}/>,        color:'#00ff88'},
  {key:'secscan',       label:'Secret Scan',        icon:<ShieldAlert size={12}/>,  color:'#ff3333'},
  {key:'complexity',    label:'Complexity Heatmap', icon:<BarChart2 size={12}/>,    color:'#ff9900'},
  {key:'smells',        label:'Code Smells',        icon:<AlertTriangle size={12}/>,color:'#ff6600'},
  {key:'dead',          label:'Dead Code',          icon:<Eye size={12}/>,          color:'#ff3333'},
  {key:'duplicates',    label:'Duplicates',         icon:<Copy size={12}/>,         color:'#a855f7'},
  {key:'architecture',  label:'Architecture',       icon:<Layers size={12}/>,       color:'#00aaff'},
  {key:'git',           label:'Git Diff',           icon:<GitBranch size={12}/>,    color:'#00ff88'},
  {key:'docs',          label:'Write Docs',         icon:<BookOpen size={12}/>,     color:'#00d4ff'},
  {key:'patterns',      label:'Design Patterns',    icon:<Cpu size={12}/>,          color:'#a855f7'},
  {key:'comments',      label:'Comment Quality',    icon:<MessageSquare size={12}/>,color:'#ff9900'},
  {key:'explain-level', label:'Explain (Level)',    icon:<Search size={12}/>,       color:'#00aaff'},
  {key:'time-complexity',label:'Time Complexity',   icon:<Zap size={12}/>,          color:'#ff9900'},
  {key:'codebase',      label:'Understand Codebase',icon:<FolderOpen size={12}/>,   color:'#00ff88'},
]

export default function CodeReview() {
  const {lastMessage} = useWebSocket()
  const [feature, setFeature] = useState<Feature>('analyze')
  const [reviewMode, setReviewMode] = useState<ReviewMode>('review')
  const [code, setCode] = useState('')
  const [path, setPath] = useState('')
  const [gitCommits, setGitCommits] = useState(1)
  const [explainLevel, setExplainLevel] = useState('junior')
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [copied, setCopied] = useState(false)
  const [history, setHistory] = useState<{feature:string;time:string;preview:string}[]>([])
  const [applyPath, setApplyPath] = useState('')
  const [provider, setProvider] = useState<{provider?:string;model?:string;upgrade_hint?:string|null}>({})
  const [showTree, setShowTree] = useState(false)

  // Load a file picked from the repo browser into the analysis box
  const pickFile = async (p: string) => {
    try {
      const r = await apiFetch(`/api/code/file?path=${encodeURIComponent(p)}`)
      const j = await r.json()
      if (j.content !== undefined) { setCode(j.content); setApplyPath(p) }
    } catch {}
  }

  // Which AI provider is active (Claude preferred, Groq fallback)
  useEffect(()=>{
    apiFetch('/api/code/provider').then(r=>r.json()).then(setProvider).catch(()=>{})
  },[])

  // Live watcher events
  useEffect(()=>{
    if (lastMessage?.event==='code_review') {
      const d = lastMessage.data as any
      setHistory(h=>[{feature:'auto-review',time:new Date().toLocaleTimeString(),preview:`${d.file}: ${d.severity}`},...h.slice(0,9)])
    }
  },[lastMessage])

  const run = async () => {
    setLoading(true); setResult(null)
    try {
      let r: Response | null = null
      const json = (body:any)=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})

      switch(feature) {
        case 'analyze':      r=await apiFetch('/api/code-review/analyze', json({code,mode:reviewMode})); break
        case 'secscan':      r=await apiFetch('/api/code/secscan', json({directory:path})); break
        case 'refactor':     r=await apiFetch('/api/code/improve', json({code,filename:(applyPath.split(/[\\/]/).pop()||'code.py')})); break
        case 'complexity':   r=await apiFetch('/api/code/complexity', json({code})); break
        case 'smells':       r=await apiFetch('/api/code/smells', json({code})); break
        case 'dead':         r=await apiFetch('/api/code/dead-code', json({directory:path})); break
        case 'duplicates':   r=await apiFetch('/api/code/duplicates', json({directory:path})); break
        case 'architecture': r=await apiFetch('/api/code/architecture', json({directory:path})); break
        case 'git':          r=await apiFetch('/api/code/git-diff', json({repo:path,commits:gitCommits})); break
        case 'docs':         r=await apiFetch('/api/code/docs-writer', json({code})); break
        case 'patterns':     r=await apiFetch('/api/code/patterns', json({code,directory:path})); break
        case 'comments':     r=await apiFetch('/api/code/comments-check', json({code})); break
        case 'explain-level':r=await apiFetch('/api/code/explain-level', json({code,level:explainLevel})); break
        case 'time-complexity':r=await apiFetch('/api/code/time-complexity', json({code})); break
        case 'codebase':     r=await apiFetch('/api/code/codebase-understand', json({directory:path,question})); break
      }
      if (r) {
        const data = await r.json()
        setResult(data)
        setHistory(h=>[{feature,time:new Date().toLocaleTimeString(),preview:JSON.stringify(data).slice(0,80)},...h.slice(0,9)])
      }
    } catch(e) { setResult({error:String(e)}) }
    finally { setLoading(false) }
  }

  const copyResult = () => {
    navigator.clipboard.writeText(JSON.stringify(result,null,2))
    setCopied(true); setTimeout(()=>setCopied(false),2000)
  }

  const activeFeature = FEATURES.find(f=>f.key===feature)!
  const needsCode = ['analyze','refactor','complexity','smells','docs','patterns','comments','explain-level','time-complexity'].includes(feature)
  const canApply = ['refactor','docs'].includes(feature)
  const needsPath = ['dead','duplicates','architecture','git','codebase','patterns','secscan'].includes(feature)
  const canRun = (needsCode && code.trim()) || (needsPath && path.trim()) || (!needsCode && !needsPath)

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-widest glow-text font-orbitron">CODE INTELLIGENCE</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-[10px] text-jarvis-muted">16 AI-powered analysis tools</p>
            <ProviderBadge provider={provider.provider} model={provider.model}/>
          </div>
          {provider.upgrade_hint && (
            <p className="text-[8px] mt-1" style={{color:'#ff9900'}}>⤴ {provider.upgrade_hint}</p>
          )}
        </div>
        {history.length>0 && (
          <div className="text-[8px] font-orbitron px-2 py-1 rounded-sm"
            style={{background:'rgba(0,255,136,0.07)',border:'1px solid rgba(0,255,136,0.3)',color:'#00ff88'}}>
            {history.length} ANALYSES TODAY
          </div>
        )}
      </div>

      {/* Feature selector */}
      <div className="grid grid-cols-4 md:grid-cols-7 gap-1.5">
        {FEATURES.map(f=>(
          <button key={f.key} onClick={()=>setFeature(f.key)}
            className="flex flex-col items-center gap-1 p-2 rounded-sm text-center transition-all"
            style={{
              background:feature===f.key?`rgba(0,0,0,0.4)`:'rgba(4,22,40,0.5)',
              border:`1px solid ${feature===f.key?f.color:'rgba(13,74,110,0.35)'}`,
              color:feature===f.key?f.color:'#4a7a99',
              boxShadow:feature===f.key?`0 0 8px ${f.color}25`:'none',
            }}>
            <span style={{color:feature===f.key?f.color:'#4a7a99'}}>{f.icon}</span>
            <span className="text-[7px] font-orbitron tracking-wider leading-tight">{f.label.toUpperCase()}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Input panel */}
        <div className="lg:col-span-2 space-y-3">
          <div className="panel p-4 hud-corner">
            <div className="flex items-center gap-2 mb-3">
              <span style={{color:activeFeature.color}}>{activeFeature.icon}</span>
              <span className="text-[9px] font-orbitron tracking-widest" style={{color:activeFeature.color}}>
                {activeFeature.label.toUpperCase()}
              </span>
            </div>

            {/* Mode selector for AI Review */}
            {feature==='analyze' && (
              <div className="flex flex-wrap gap-1 mb-3">
                {REVIEW_MODES.map(m=>(
                  <button key={m.key} onClick={()=>setReviewMode(m.key)}
                    className="px-2 py-1 rounded-sm text-[7px] font-orbitron transition-all"
                    style={{background:reviewMode===m.key?`${m.color}15`:'rgba(4,22,40,0.5)',
                      border:`1px solid ${reviewMode===m.key?m.color+'60':'rgba(13,74,110,0.3)'}`,
                      color:reviewMode===m.key?m.color:'#4a7a99'}}>
                    {m.label}
                  </button>
                ))}
              </div>
            )}

            {/* Level for explain */}
            {feature==='explain-level' && (
              <div className="flex gap-1 mb-3">
                {[['5yo','5 Year Old'],['junior','Junior Dev'],['senior','Senior Dev'],['non-technical','Non-Tech']].map(([k,l])=>(
                  <button key={k} onClick={()=>setExplainLevel(k)}
                    className="flex-1 py-1 rounded-sm text-[7px] font-orbitron transition-all"
                    style={{background:explainLevel===k?'rgba(0,212,255,0.1)':'rgba(4,22,40,0.5)',
                      border:`1px solid ${explainLevel===k?'rgba(0,212,255,0.4)':'rgba(13,74,110,0.3)'}`,
                      color:explainLevel===k?'#00d4ff':'#4a7a99'}}>
                    {l}
                  </button>
                ))}
              </div>
            )}

            {/* Code input + repo browser */}
            {needsCode && (
              <>
                <button onClick={()=>setShowTree(t=>!t)} className="flex items-center gap-1.5 text-[8px] font-orbitron px-2 py-1 rounded-sm mb-2"
                  style={{border:`1px solid ${showTree?'rgba(0,212,255,0.5)':'rgba(13,74,110,0.4)'}`, color:showTree?'#00d4ff':'#4a7a99'}}>
                  <FolderOpen size={10}/> {showTree?'HIDE REPO BROWSER':'BROWSE REPO — pick a file'}
                </button>
                {showTree && <TreeBrowser onPick={pickFile} />}
                <textarea
                  className="input-jarvis w-full font-mono text-[10px] leading-relaxed mb-3"
                  style={{minHeight:200,resize:'vertical'}}
                  placeholder="Paste code, or use BROWSE REPO to load a file..."
                  value={code} onChange={e=>setCode(e.target.value)}
                />
              </>
            )}

            {/* Apply target path (refactor & docs can write back) */}
            {canApply && (
              <div className="mb-3">
                <label className="text-[8px] text-jarvis-muted flex items-center gap-1 mb-1">
                  <Save size={9}/> FILE PATH (optional — required only to apply changes)
                </label>
                <input className="input-jarvis w-full font-mono text-[10px]"
                  placeholder="D:\\Projects\\myapp\\src\\file.py"
                  value={applyPath} onChange={e=>setApplyPath(e.target.value)} />
              </div>
            )}

            {/* Path input */}
            {needsPath && (
              <div className="space-y-2 mb-3">
                <input className="input-jarvis w-full font-mono text-xs"
                  placeholder={feature==='git'?'D:\\Projects\\myapp (git repo)':'D:\\Projects\\myapp\\src'}
                  value={path} onChange={e=>setPath(e.target.value)} />
                {feature==='git' && (
                  <div className="flex items-center gap-2">
                    <label className="text-[8px] text-jarvis-muted">Commits back:</label>
                    {[1,2,3,5].map(n=>(
                      <button key={n} onClick={()=>setGitCommits(n)}
                        className="w-7 h-7 rounded-sm text-[9px] font-orbitron"
                        style={{background:gitCommits===n?'rgba(0,212,255,0.1)':'rgba(4,22,40,0.5)',
                          border:`1px solid ${gitCommits===n?'rgba(0,212,255,0.4)':'rgba(13,74,110,0.3)'}`,
                          color:gitCommits===n?'#00d4ff':'#4a7a99'}}>
                        {n}
                      </button>
                    ))}
                  </div>
                )}
                {feature==='codebase' && (
                  <input className="input-jarvis w-full text-xs"
                    placeholder="Ask a question (optional)"
                    value={question} onChange={e=>setQuestion(e.target.value)} />
                )}
                {/* Quick paths */}
                <div className="grid grid-cols-1 gap-1">
                  {[
                    {l:'JARVIS Backend','p':'.\\backend'},
                    {l:'JARVIS Frontend','p':'.\\frontend\\src'},
                  ].map((s,i)=>(
                    <button key={i} onClick={()=>setPath(s.p)}
                      className="text-left px-2 py-1.5 rounded-sm transition-all text-[8px]"
                      style={{background:'rgba(4,22,40,0.4)',border:'1px solid rgba(13,74,110,0.3)',color:'#4a7a99'}}>
                      <span style={{color:'#a8d8ea'}}>{s.l}</span> — {s.p.split('\\').slice(-2).join('\\')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button onClick={run} disabled={loading||!canRun}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-sm font-orbitron text-[9px] tracking-widest transition-all"
              style={{
                background:canRun?`${activeFeature.color}15`:'rgba(4,22,40,0.5)',
                border:`1.5px solid ${canRun?activeFeature.color+'60':'rgba(13,74,110,0.3)'}`,
                color:canRun?activeFeature.color:'#4a7a99',
                boxShadow:canRun&&!loading?`0 0 12px ${activeFeature.color}20`:'none',
              }}>
              {loading
                ? <><RefreshCw size={11} style={{animation:'arcSpin1 0.8s linear infinite'}}/> ANALYZING...</>
                : <><Zap size={11}/> RUN {activeFeature.label.toUpperCase()}</>
              }
            </button>
          </div>

          {/* Recent */}
          {history.length>0 && (
            <div className="panel p-3">
              <div className="label-jarvis mb-2">RECENT</div>
              {history.slice(0,5).map((h,i)=>(
                <div key={i} className="flex items-center gap-2 py-1 text-[8px] border-b border-jarvis-border/30 last:border-0">
                  <div className="w-1 h-1 rounded-full bg-jarvis-glow flex-shrink-0" />
                  <span className="font-orbitron" style={{color:'#4a7a99'}}>{h.feature}</span>
                  <span className="ml-auto text-jarvis-muted">{h.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Results panel */}
        <div className="lg:col-span-3">
          <div className="panel hud-corner" style={{minHeight:500}}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-jarvis-border">
              <span className="text-[9px] font-orbitron tracking-widest" style={{color:'#a8d8ea'}}>RESULT</span>
              {result && !result.error && (
                <button onClick={copyResult} className="flex items-center gap-1 text-[8px] px-2 py-1 rounded-sm font-orbitron"
                  style={{border:'1px solid rgba(0,212,255,0.2)',color:copied?'#00ff88':'#4a7a99'}}>
                  {copied?<CheckCircle size={9}/>:<Copy size={9}/>} {copied?'COPIED':'COPY'}
                </button>
              )}
            </div>
            <div className="p-4 overflow-y-auto" style={{maxHeight:600}}>
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <div style={{width:60,height:60,border:'2px solid rgba(0,212,255,0.2)',borderTop:'2px solid #00d4ff',borderRadius:'50%',animation:'arcSpin1 1s linear infinite'}} />
                  <div className="text-[9px] font-orbitron tracking-widest" style={{color:'#00d4ff'}}>
                    {activeFeature.label.toUpperCase()}...
                  </div>
                </div>
              ) : !result ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Code2 size={40} style={{color:'rgba(0,212,255,0.15)'}} />
                  <div className="text-[10px] text-jarvis-muted text-center">Select a feature and run analysis</div>
                  <div className="mt-4 grid grid-cols-2 gap-1.5 w-full max-w-xs text-[8px]">
                    {FEATURES.slice(0,6).map(f=>(
                      <div key={f.key} className="flex items-center gap-1.5 px-2 py-1" style={{color:'rgba(0,212,255,0.35)'}}>
                        {f.icon} {f.label}
                      </div>
                    ))}
                  </div>
                </div>
              ) : result.error ? (
                <div className="text-jarvis-danger text-[10px] font-mono p-4">❌ {result.error}</div>
              ) : feature==='refactor' ? (
                <RefactorResult data={result} applyPath={applyPath} />
              ) : feature==='secscan' ? (
                <SecScanResult data={result} />
              ) : feature==='complexity' ? (
                <ComplexityHeatmap data={result} />
              ) : feature==='smells' ? (
                <SmellsDashboard data={result} />
              ) : feature==='architecture' ? (
                <ArchitectureDiagram data={result} />
              ) : feature==='git' && result.hunks ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2 text-center text-[8px] mb-3">
                    {[['Added',result.added_lines,'#00ff88'],['Removed',result.removed_lines,'#ff3333'],['Commits',result.commits,'#00d4ff']].map(([l,v,c],i)=>(
                      <div key={i} className="p-2 rounded-sm" style={{background:'rgba(4,22,40,0.6)',border:'1px solid rgba(13,74,110,0.4)'}}>
                        <div className="font-orbitron text-lg font-black" style={{color:c as string}}>{v}</div>
                        <div style={{color:'#4a7a99'}}>{l}</div>
                      </div>
                    ))}
                  </div>
                  <DiffViewer hunks={result.hunks} />
                </div>
              ) : feature==='dead' ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-center text-[8px]">
                    {[['Dead',result.dead_count,'#ff3333'],['Defined',result.defined_count,'#a8d8ea'],['Ratio',result.unreachable_ratio+'%','#ff9900']].map(([l,v,c],i)=>(
                      <div key={i} className="p-2 rounded-sm" style={{background:'rgba(4,22,40,0.6)',border:'1px solid rgba(13,74,110,0.4)'}}>
                        <div className="font-orbitron text-lg font-black" style={{color:c as string}}>{v}</div>
                        <div style={{color:'#4a7a99'}}>{l}</div>
                      </div>
                    ))}
                  </div>
                  {result.dead_code?.map((d: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded-sm" style={{background:'rgba(4,22,40,0.5)',border:'1px solid rgba(255,51,51,0.2)'}}>
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:'#ff3333'}} />
                      <div><div className="font-mono text-[10px]" style={{color:'#ff9999'}}>{d.name}</div>
                      <div className="text-[8px] text-jarvis-muted">{d.location}</div></div>
                    </div>
                  ))}
                </div>
              ) : feature==='duplicates' ? (
                <div className="space-y-3">
                  <div className="text-[10px] font-orbitron mb-3" style={{color:'#a855f7'}}>
                    {result.duplicate_count} duplicate blocks found
                  </div>
                  {result.duplicates?.map((d: any, i: number) => (
                    <div key={i} className="p-3 rounded-sm" style={{background:'rgba(4,22,40,0.5)',border:'1px solid rgba(168,85,247,0.2)'}}>
                      <div className="text-[9px] font-orbitron mb-2" style={{color:'#a855f7'}}>{d.copies}x DUPLICATE</div>
                      {d.locations.map((l: any, j: number) => (
                        <div key={j} className="text-[8px] font-mono text-jarvis-muted">📄 {l.file}:{l.line} — {l.preview}</div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : feature==='docs' && result.documented_code ? (
                <div className="space-y-4">
                  <RefactorResult data={result} applyPath={applyPath} />
                  <div>
                    <div className="text-[8px] text-jarvis-muted mb-2 font-orbitron">DOCUMENTED CODE</div>
                    <pre className="text-[9px] font-mono leading-relaxed whitespace-pre-wrap break-words p-3 rounded"
                      style={{background:'rgba(0,0,0,0.3)',border:'1px solid rgba(0,212,255,0.1)',color:'#a8d8ea',maxHeight:400,overflow:'auto'}}>
                      {result.documented_code}
                    </pre>
                  </div>
                </div>
              ) : (
                // Generic text result
                <pre className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap break-words" style={{color:'#a8d8ea'}}>
                  {typeof result === 'object'
                    ? (result.review || result.analysis || result.explanation || result.patterns || result.understanding || result.review || JSON.stringify(result, null, 2))
                    : result}
                </pre>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
