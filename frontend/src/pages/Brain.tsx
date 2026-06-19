import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { Search, BookOpen, Plus, FileText, Brain, Loader, Share2, MessageSquare, Send, X, Link2, UploadCloud, FileSearch } from 'lucide-react'

interface SearchResult { id?: number; score: number; title: string; path: string; type: string; snippet: string; source: string }
interface BrainStats { total: number; sources: Record<string, number>; types: Record<string, number>; index_ready: boolean }
interface Source { n: number; id?: number; title: string; path: string; score: number; source: string }
interface ChatMsg { role: 'user' | 'assistant'; content: string; sources?: Source[] }

export default function BrainPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<BrainStats | null>(null)
  const [mode, setMode] = useState<'search' | 'chat'>('chat')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [aiAnswer, setAiAnswer] = useState('')
  const [searching, setSearching] = useState(false)
  const [indexing, setIndexing] = useState(false)
  const [indexMsg, setIndexMsg] = useState('')
  const [indexDir, setIndexDir] = useState('')
  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [showNoteForm, setShowNoteForm] = useState(false)
  // chat
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatting, setChatting] = useState(false)
  // reader
  const [reader, setReader] = useState<{ doc: any; related: any[] } | null>(null)
  // ingest
  const [url, setUrl] = useState('')
  const [ingestMsg, setIngestMsg] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const chatEnd = useRef<HTMLDivElement>(null)

  const refreshStats = () => apiFetch('/api/brain/stats').then(r => r.json()).then(setStats).catch(() => {})
  useEffect(() => { refreshStats() }, [])
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, chatting])

  const search = async () => {
    if (!query.trim()) return
    setSearching(true); setResults([]); setAiAnswer('')
    try {
      const data = await apiFetch(`/api/brain/search?q=${encodeURIComponent(query)}&limit=8`).then(r => r.json())
      setResults(data.results || []); setAiAnswer(data.ai_answer || '')
    } catch {}
    setSearching(false)
  }

  const sendChat = async () => {
    const q = chatInput.trim()
    if (!q || chatting) return
    const history = messages.map(m => ({ role: m.role, content: m.content }))
    setMessages(m => [...m, { role: 'user', content: q }]); setChatInput(''); setChatting(true)
    try {
      const d = await apiFetch('/api/brain/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, history }) }).then(r => r.json())
      setMessages(m => [...m, { role: 'assistant', content: d.answer || '(no answer)', sources: d.sources || [] }])
    } catch { setMessages(m => [...m, { role: 'assistant', content: 'Error reaching the knowledge base.', sources: [] }]) }
    setChatting(false)
  }

  const openDoc = async (idOrPath: string | number) => {
    try {
      const isId = typeof idOrPath === 'number'
      const docP = apiFetch(`/api/brain/document?${isId ? 'id=' + idOrPath : 'path=' + encodeURIComponent(String(idOrPath))}`).then(r => r.json())
      const relP = apiFetch(`/api/brain/related?${isId ? 'id=' + idOrPath : 'path=' + encodeURIComponent(String(idOrPath))}&limit=5`).then(r => r.json())
      const [doc, rel] = await Promise.all([docP, relP])
      if (!doc.error) setReader({ doc, related: rel.related || [] })
    } catch {}
  }

  const indexDirectory = async (obsidian = false) => {
    if (!indexDir.trim()) return
    setIndexing(true); setIndexMsg('Indexing...')
    try {
      const data = await apiFetch('/api/brain/index', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ directory: indexDir, obsidian }) }).then(r => r.json())
      setIndexMsg(`✓ Added ${data.added}, updated ${data.updated}, skipped ${data.skipped}. Total: ${data.total}`)
      refreshStats()
    } catch (e: any) { setIndexMsg(`✗ Error: ${e.message}`) }
    setIndexing(false)
  }

  const addNote = async () => {
    if (!noteTitle || !noteContent) return
    await apiFetch('/api/brain/note', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: noteTitle, content: noteContent }) })
    setNoteTitle(''); setNoteContent(''); setShowNoteForm(false); refreshStats()
  }

  const ingestUrl = async () => {
    if (!url.trim()) return
    setIngestMsg('Fetching…')
    try {
      const d = await apiFetch('/api/brain/ingest-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) }).then(r => r.json())
      setIngestMsg(d.error ? `✗ ${d.error}` : `✓ Indexed “${d.title}”`); if (!d.error) { setUrl(''); refreshStats() }
    } catch (e: any) { setIngestMsg(`✗ ${e.message}`) }
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    let ok = 0
    for (const f of files) {
      if (f.size > 2_000_000) { setIngestMsg(`✗ ${f.name} too large`); continue }
      try {
        const content = await f.text()
        if (!content.trim() || /�/.test(content.slice(0, 200))) { setIngestMsg(`✗ ${f.name}: not readable text (PDFs need folder-index)`); continue }
        const d = await apiFetch('/api/brain/ingest-text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: f.name.replace(/\.[^.]+$/, ''), content, filename: f.name }) }).then(r => r.json())
        if (!d.error) ok++
      } catch {}
    }
    if (ok) { setIngestMsg(`✓ Indexed ${ok} file${ok > 1 ? 's' : ''}`); refreshStats() }
  }

  // render answer text with clickable [n] citations
  const renderCited = (text: string, sources?: Source[]) => text.split(/(\[\d+\])/g).map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/)
    if (m && sources) {
      const s = sources.find(x => x.n === Number(m[1]))
      if (s) return <button key={i} onClick={() => openDoc(s.id ?? s.path)} className="align-super text-[8px] font-orbitron px-1 rounded" style={{ background: 'rgba(0,212,255,0.15)', color: '#00d4ff', border: '1px solid rgba(0,212,255,0.3)' }} title={s.title}>{m[1]}</button>
    }
    return <span key={i}>{part}</span>
  })

  return (
    <div className="p-6 space-y-5" onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}>
      {dragOver && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none" style={{ background: 'rgba(0,10,20,0.7)', border: '2px dashed rgba(0,212,255,0.6)' }}>
          <div className="text-center"><UploadCloud size={48} style={{ color: '#00d4ff' }} className="mx-auto mb-3" /><div className="font-orbitron tracking-widest" style={{ color: '#00d4ff' }}>DROP TO INDEX INTO YOUR BRAIN</div></div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-widest glow-text font-orbitron flex items-center gap-2"><Brain size={20} /> SECOND BRAIN</h1>
          <p className="text-[10px] text-jarvis-muted mt-1">{stats ? `${stats.total} documents · chat or search · drag files / paste a URL to add` : 'Loading...'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/brain-graph')} className="flex items-center gap-1.5 px-3 py-2 rounded-sm text-[9px] font-orbitron" style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.4)', color: '#a855f7' }}><Share2 size={11} /> GRAPH</button>
          <button onClick={() => setShowNoteForm(s => !s)} className="btn-primary flex items-center gap-2 text-[10px]"><Plus size={11} /> NOTE</button>
        </div>
      </div>

      {showNoteForm && (
        <div className="panel hud-corner p-4 space-y-3">
          <div className="text-[10px] font-orbitron tracking-widest text-jarvis-muted">NEW NOTE</div>
          <input className="input-jarvis" placeholder="Title..." value={noteTitle} onChange={e => setNoteTitle(e.target.value)} />
          <textarea className="input-jarvis resize-none" rows={4} placeholder="Content..." value={noteContent} onChange={e => setNoteContent(e.target.value)} />
          <div className="flex gap-2"><button onClick={addNote} className="btn-primary text-[10px]">SAVE</button><button onClick={() => setShowNoteForm(false)} className="btn-danger text-[10px]">CANCEL</button></div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left — index / ingest / stats */}
        <div className="space-y-4">
          <div className="panel hud-corner p-4 space-y-3">
            <div className="flex items-center gap-2"><BookOpen size={13} style={{ color: '#00d4ff' }} /><span className="text-[10px] font-orbitron tracking-widest">INDEX VAULT / FOLDER</span></div>
            <input className="input-jarvis text-xs" placeholder="C:\…\Obsidian Vault or any folder" value={indexDir} onChange={e => setIndexDir(e.target.value)} onKeyDown={e => e.key === 'Enter' && indexDirectory(false)} />
            <div className="flex gap-2">
              <button onClick={() => indexDirectory(true)} disabled={indexing} className="flex-1 text-[9px] py-1.5 rounded-sm font-orbitron" style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.3)', color: '#00d4ff' }}>{indexing ? '⏳…' : '📓 OBSIDIAN'}</button>
              <button onClick={() => indexDirectory(false)} disabled={indexing} className="flex-1 text-[9px] py-1.5 rounded-sm font-orbitron" style={{ background: 'rgba(0,100,180,0.08)', border: '1px solid rgba(0,100,180,0.3)', color: '#4a9acc' }}>📁 FOLDER</button>
            </div>
            {indexMsg && <div className="text-[9px] font-mono" style={{ color: indexMsg.startsWith('✓') ? '#00ff88' : '#ff3333' }}>{indexMsg}</div>}
          </div>

          {/* Drag-drop + URL ingest */}
          <div className="panel hud-corner p-4 space-y-2">
            <div className="flex items-center gap-2"><UploadCloud size={13} style={{ color: '#00ff88' }} /><span className="text-[10px] font-orbitron tracking-widest">QUICK CAPTURE</span></div>
            <div className="text-[9px] text-jarvis-muted">Drag a <span style={{ color: '#a8d8ea' }}>.md / .txt / code</span> file anywhere on this page to index it.</div>
            <div className="flex gap-1.5">
              <input className="input-jarvis flex-1 text-[10px]" placeholder="Paste a URL to save…" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && ingestUrl()} />
              <button onClick={ingestUrl} className="text-[8px] px-2 py-1 rounded-sm font-orbitron" style={{ border: '1px solid rgba(0,255,136,0.4)', color: '#00ff88' }}><Link2 size={11} /></button>
            </div>
            {ingestMsg && <div className="text-[9px] font-mono" style={{ color: ingestMsg.startsWith('✓') ? '#00ff88' : '#ff9900' }}>{ingestMsg}</div>}
          </div>

          {stats && (
            <div className="panel p-4 space-y-3">
              <div className="text-[9px] font-orbitron tracking-widest text-jarvis-muted">KNOWLEDGE BASE</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center py-2 rounded-sm" style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.15)' }}><div className="text-xl font-orbitron font-bold" style={{ color: '#00d4ff' }}>{stats.total}</div><div className="text-[8px] text-jarvis-muted">DOCUMENTS</div></div>
                <div className="text-center py-2 rounded-sm" style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.15)' }}><div className="text-xl font-orbitron font-bold" style={{ color: '#00ff88' }}>{stats.index_ready ? '✓' : '○'}</div><div className="text-[8px] text-jarvis-muted">INDEX {stats.index_ready ? 'READY' : 'BUILDING'}</div></div>
              </div>
              <div className="space-y-1">{Object.entries(stats.sources).map(([src, cnt]) => (<div key={src} className="flex justify-between text-[9px]"><span className="text-jarvis-muted capitalize">{src.replace('_', ' ')}</span><span style={{ color: '#00d4ff' }}>{cnt}</span></div>))}</div>
            </div>
          )}
        </div>

        {/* Right — chat / search */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex gap-1.5">
            {([['chat', MessageSquare, 'CHAT'], ['search', FileSearch, 'SEARCH']] as const).map(([k, Icon, lbl]) => (
              <button key={k} onClick={() => setMode(k)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[9px] font-orbitron" style={{ background: mode === k ? 'rgba(0,212,255,0.12)' : 'rgba(4,22,40,0.5)', border: `1px solid ${mode === k ? 'rgba(0,212,255,0.45)' : 'rgba(13,74,110,0.4)'}`, color: mode === k ? '#00d4ff' : '#4a7a99' }}><Icon size={11} /> {lbl}</button>
            ))}
          </div>

          {mode === 'chat' ? (
            <div className="panel hud-corner flex flex-col" style={{ height: 560 }}>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && <div className="text-center py-16 text-jarvis-muted"><MessageSquare size={32} className="mx-auto mb-3 opacity-20" /><div className="text-sm">Ask your notes anything.</div><div className="text-[10px] mt-1">Answers cite the sources they came from — click a [number] to open it.</div></div>}
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[85%] p-3 rounded-sm text-[11px] leading-relaxed" style={m.role === 'user' ? { background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.25)', color: '#a8d8ea' } : { background: 'rgba(4,22,40,0.6)', border: '1px solid rgba(13,74,110,0.4)', color: '#c8e0f0' }}>
                      {m.role === 'assistant' ? <div>{renderCited(m.content, m.sources)}</div> : m.content}
                      {m.sources && m.sources.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-jarvis-border/30">
                          {m.sources.map(s => <button key={s.n} onClick={() => openDoc(s.id ?? s.path)} className="text-[8px] px-1.5 py-0.5 rounded-sm flex items-center gap-1" style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.2)', color: '#4a9acc' }}><FileText size={8} />[{s.n}] {s.title.slice(0, 22)}</button>)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {chatting && <div className="flex items-center gap-2 text-[10px] text-jarvis-muted"><Loader size={12} className="animate-spin" /> consulting your notes…</div>}
                <div ref={chatEnd} />
              </div>
              <div className="p-3 border-t border-jarvis-border flex gap-2">
                <input className="input-jarvis flex-1 text-sm" placeholder="Ask your brain…" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()} />
                <button onClick={sendChat} disabled={chatting} className="btn-primary px-4 flex items-center gap-1.5 text-[10px]"><Send size={12} /></button>
              </div>
            </div>
          ) : (
            <>
              <div className="panel hud-corner p-4">
                <div className="flex gap-2">
                  <div className="relative flex-1"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-jarvis-muted" /><input className="input-jarvis pl-8 text-sm" placeholder="Search your knowledge base..." value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} /></div>
                  <button onClick={search} disabled={searching} className="btn-primary px-4 flex items-center gap-2 text-[10px]">{searching ? <Loader size={11} className="animate-spin" /> : <Search size={11} />} SEARCH</button>
                </div>
              </div>
              {aiAnswer && <div className="panel p-4" style={{ borderColor: 'rgba(0,212,255,0.3)' }}><div className="flex items-center gap-2 mb-2"><Brain size={12} style={{ color: '#00d4ff' }} /><span className="text-[9px] font-orbitron tracking-widest" style={{ color: '#00d4ff' }}>AI SYNTHESIS</span></div><p className="text-sm text-jarvis-text leading-relaxed">{aiAnswer}</p></div>}
              {results.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[9px] font-orbitron tracking-widest text-jarvis-muted">{results.length} SOURCE DOCUMENTS</div>
                  {results.map((r, i) => (
                    <div key={i} className="panel p-3 hover:border-jarvis-glow/30 transition-all cursor-pointer" onClick={() => openDoc(r.id ?? r.path)}>
                      <div className="flex items-center justify-between mb-1"><div className="flex items-center gap-2"><FileText size={11} style={{ color: r.source === 'obsidian' ? '#00d4ff' : '#4a7a99' }} /><span className="text-[11px] font-semibold text-jarvis-text">{r.title}</span></div><span className="text-[8px]" style={{ color: '#00d4ff' }}>{Math.round(r.score * 100)}% match</span></div>
                      <p className="text-[10px] text-jarvis-muted leading-relaxed line-clamp-3">{r.snippet}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Document reader */}
      {reader && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,8,18,0.8)' }} onClick={() => setReader(null)}>
          <div className="panel hud-corner w-full max-w-3xl flex flex-col" style={{ maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-jarvis-border">
              <div className="flex items-center gap-2"><FileText size={14} style={{ color: '#00d4ff' }} /><span className="text-sm font-orbitron" style={{ color: '#a8d8ea' }}>{reader.doc.title}</span></div>
              <button onClick={() => setReader(null)} className="text-jarvis-muted hover:text-jarvis-text"><X size={16} /></button>
            </div>
            <div className="text-[8px] text-jarvis-muted px-4 py-1 font-mono truncate">{reader.doc.path}</div>
            <div className="flex-1 overflow-y-auto p-4">
              <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-words font-mono" style={{ color: '#c8e0f0' }}>{reader.doc.content}</pre>
            </div>
            {reader.related.length > 0 && (
              <div className="p-3 border-t border-jarvis-border">
                <div className="label-jarvis mb-2 flex items-center gap-1"><Share2 size={10} /> RELATED NOTES</div>
                <div className="flex flex-wrap gap-1.5">
                  {reader.related.map((r, i) => <button key={i} onClick={() => openDoc(r.id ?? r.path)} className="text-[9px] px-2 py-1 rounded-sm flex items-center gap-1" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.3)', color: '#c89bf0' }}><FileText size={9} />{r.title.slice(0, 28)} · {Math.round(r.score * 100)}%</button>)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
