import { useState } from 'react'
import { Search, Mic, HelpCircle } from 'lucide-react'

const COMMANDS = [
  // System
  { cat: 'SYSTEM', cmd: 'What\'s my CPU usage?', desc: 'Live CPU, RAM, disk, battery status', tag: 'status' },
  { cat: 'SYSTEM', cmd: 'Show running processes', desc: 'List processes sorted by CPU usage', tag: 'status' },
  { cat: 'SYSTEM', cmd: 'Check if port 8000 is in use', desc: 'Port and process check', tag: 'status' },
  { cat: 'SYSTEM', cmd: 'What\'s the disk space on C:?', desc: 'Disk usage breakdown', tag: 'status' },
  // Weather
  { cat: 'WEATHER', cmd: 'What\'s the weather?', desc: 'Current weather for your location', tag: 'weather' },
  { cat: 'WEATHER', cmd: 'Weather in Mumbai tomorrow', desc: 'Forecast for any city', tag: 'weather' },
  // Intelligence
  { cat: 'INTELLIGENCE', cmd: 'ELI5 quantum entanglement', desc: 'Explain any topic simply', tag: 'intel' },
  { cat: 'INTELLIGENCE', cmd: 'Fact check: humans use 10% of their brain', desc: 'Verify any claim', tag: 'intel' },
  { cat: 'INTELLIGENCE', cmd: 'Argue against my startup idea: [idea]', desc: 'Devil\'s advocate mode', tag: 'intel' },
  { cat: 'INTELLIGENCE', cmd: 'First principles analysis of [problem]', desc: 'Break down to fundamentals', tag: 'intel' },
  { cat: 'INTELLIGENCE', cmd: 'Research brief on transformer models', desc: 'Comprehensive topic brief', tag: 'intel' },
  { cat: 'INTELLIGENCE', cmd: 'Summarize Atomic Habits by James Clear', desc: 'Book summary with takeaways', tag: 'intel' },
  { cat: 'INTELLIGENCE', cmd: 'Summarize this YouTube video: [url]', desc: 'Video/podcast summary', tag: 'intel' },
  { cat: 'INTELLIGENCE', cmd: 'Is my app idea patented: [idea]', desc: 'Patent conflict check', tag: 'intel' },
  { cat: 'INTELLIGENCE', cmd: 'Check my email tone: [email text]', desc: 'Tone analysis + rewrite', tag: 'intel' },
  { cat: 'INTELLIGENCE', cmd: 'Help me prepare for salary negotiation', desc: 'Full negotiation strategy', tag: 'intel' },
  { cat: 'INTELLIGENCE', cmd: 'Draft a response to this complaint: [text]', desc: 'Crisis response drafting', tag: 'intel' },
  { cat: 'INTELLIGENCE', cmd: 'Build a 10-slide presentation on AI trends', desc: 'Presentation outline', tag: 'intel' },
  // Music
  { cat: 'MUSIC DJ', cmd: 'Play lo-fi beats', desc: 'Opens YouTube Music with search', tag: 'music' },
  { cat: 'MUSIC DJ', cmd: 'Play something for coding', desc: 'Context-aware music', tag: 'music' },
  { cat: 'MUSIC DJ', cmd: 'Play [song name] by [artist]', desc: 'Specific track search', tag: 'music' },
  { cat: 'MUSIC DJ', cmd: 'Pause music', desc: 'Pause current track', tag: 'music' },
  { cat: 'MUSIC DJ', cmd: 'Next track', desc: 'Skip to next song', tag: 'music' },
  { cat: 'MUSIC DJ', cmd: 'Set volume to 60', desc: 'Adjust system volume', tag: 'music' },
  // Memory
  { cat: 'MEMORY', cmd: 'Remember that my name is Alan', desc: 'Store persistent fact', tag: 'memory' },
  { cat: 'MEMORY', cmd: 'Remember I prefer dark themes', desc: 'Store preference', tag: 'memory' },
  { cat: 'MEMORY', cmd: 'What do you know about me?', desc: 'Recall all stored memories', tag: 'memory' },
  { cat: 'MEMORY', cmd: 'Forget my name', desc: 'Delete a specific memory', tag: 'memory' },
  // Focus
  { cat: 'FOCUS', cmd: 'Lock me in for 2 hours', desc: 'Activate Focus Shield — silences everything', tag: 'focus' },
  { cat: 'FOCUS', cmd: 'Focus shield for 45 minutes', desc: 'Custom focus duration', tag: 'focus' },
  { cat: 'FOCUS', cmd: 'Disable focus mode', desc: 'End focus shield early', tag: 'focus' },
  // Security
  { cat: 'SECURITY', cmd: 'Check if alan@email.com was breached', desc: 'HaveIBeenPwned check', tag: 'security' },
  { cat: 'SECURITY', cmd: 'Is my VPN on?', desc: 'Tailscale/VPN status', tag: 'security' },
  { cat: 'SECURITY', cmd: 'Audit my app permissions', desc: 'Suspicious processes with network access', tag: 'security' },
  // Files & Code
  { cat: 'FILES & CODE', cmd: 'Read the file at C:/path/to/file.py', desc: 'Read any file', tag: 'files' },
  { cat: 'FILES & CODE', cmd: 'Search for TODO in my project', desc: 'Code search across files', tag: 'files' },
  { cat: 'FILES & CODE', cmd: 'Show git status of D:/Projects/JARVIS', desc: 'Git status', tag: 'files' },
  { cat: 'FILES & CODE', cmd: 'Show recent commits', desc: 'Git log', tag: 'files' },
  { cat: 'FILES & CODE', cmd: 'Run npm build in my project', desc: 'Execute build command', tag: 'files' },
  // Brain
  { cat: 'SECOND BRAIN', cmd: 'Search my notes for React hooks', desc: 'Semantic search across your knowledge base', tag: 'brain' },
  { cat: 'SECOND BRAIN', cmd: 'What do I know about authentication?', desc: 'AI-synthesized answer from your notes', tag: 'brain' },
  { cat: 'SECOND BRAIN', cmd: 'Note: fix the Redis cache bug tomorrow', desc: 'Add quick note to knowledge base + Obsidian', tag: 'brain' },
  // WhatsApp
  { cat: 'WHATSAPP', cmd: 'Do I have any WhatsApp messages?', desc: 'Check unread messages', tag: 'whatsapp' },
  { cat: 'WHATSAPP', cmd: 'Send a WhatsApp to Mom: I\'ll be home at 8', desc: 'Send message by contact name', tag: 'whatsapp' },
  // Web Search
  { cat: 'WEB SEARCH', cmd: 'Search for the latest React 19 features', desc: 'Real-time web search', tag: 'search' },
  { cat: 'WEB SEARCH', cmd: 'What\'s the latest news on AI?', desc: 'Current events search', tag: 'search' },
  // Notifications
  { cat: 'NOTIFICATIONS', cmd: 'Send me a push notification: meeting in 5 min', desc: 'Push to iPhone via ntfy', tag: 'notify' },
  { cat: 'NOTIFICATIONS', cmd: 'Send push: reminder to drink water', desc: 'Custom push to phone', tag: 'notify' },
  // Voice / TTS
  { cat: 'VOICE', cmd: 'Say hello in British accent', desc: 'JARVIS speaks through speakers', tag: 'voice' },
  { cat: 'VOICE', cmd: 'Read me my morning briefing', desc: 'Full briefing via TTS', tag: 'voice' },
  // Language Learning
  { cat: 'LANGUAGE', cmd: 'Start my Hindi lesson', desc: '5-word daily vocabulary session', tag: 'language' },
  { cat: 'LANGUAGE', cmd: 'Quiz me on Hindi', desc: 'Test previously learned words', tag: 'language' },
  { cat: 'LANGUAGE', cmd: 'How many words have I learned?', desc: 'Language learning progress', tag: 'language' },
]

const CATEGORIES = ['ALL', ...Array.from(new Set(COMMANDS.map(c => c.cat)))]

const CAT_COLORS: Record<string, string> = {
  'SYSTEM': '#00d4ff', 'WEATHER': '#00aaff', 'INTELLIGENCE': '#a855f7',
  'MUSIC DJ': '#00ff88', 'MEMORY': '#ff9900', 'FOCUS': '#ff6b6b',
  'SECURITY': '#ff3333', 'FILES & CODE': '#00d4ff', 'SECOND BRAIN': '#00aaff',
  'WHATSAPP': '#25d366', 'WEB SEARCH': '#00d4ff', 'NOTIFICATIONS': '#ff9900',
  'VOICE': '#00d4ff', 'LANGUAGE': '#a855f7',
}

export default function Help() {
  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState('ALL')

  const filtered = COMMANDS.filter(c => {
    const matchCat = activeCat === 'ALL' || c.cat === activeCat
    const matchSearch = !search || c.cmd.toLowerCase().includes(search.toLowerCase()) ||
      c.desc.toLowerCase().includes(search.toLowerCase()) || c.cat.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-widest glow-text font-orbitron">COMMAND REFERENCE</h1>
          <p className="text-[10px] text-jarvis-muted mt-1 tracking-wider">
            {COMMANDS.length} commands — say any of these to JARVIS or type in the Interface tab
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm text-[9px] font-orbitron"
          style={{ background: 'rgba(0,212,255,0.07)', border: '1px solid rgba(0,212,255,0.2)', color: '#00d4ff' }}>
          <Mic size={10} /> SAY "HEY JARVIS" + COMMAND
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#4a7a99' }} />
          <input className="input-jarvis w-full pl-8 text-xs" placeholder="Search commands..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <span className="text-[9px] font-mono text-jarvis-muted self-center">{filtered.length} commands</span>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setActiveCat(cat)}
            className="px-3 py-1 rounded-sm text-[8px] font-orbitron tracking-wider transition-all"
            style={{
              background: activeCat === cat ? `rgba(0,212,255,0.12)` : 'rgba(4,22,40,0.6)',
              border: `1px solid ${activeCat === cat ? 'rgba(0,212,255,0.5)' : 'rgba(13,74,110,0.4)'}`,
              color: activeCat === cat ? '#00d4ff' : '#4a7a99',
            }}>
            {cat}
          </button>
        ))}
      </div>

      {/* Commands grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
        {filtered.map((c, i) => (
          <div key={i} className="panel p-3 group cursor-default transition-all"
            style={{ borderColor: 'rgba(13,74,110,0.4)' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(0,212,255,0.3)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(13,74,110,0.4)')}>
            <div className="flex items-start gap-2">
              <div className="flex-shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full mt-1.5"
                style={{ background: CAT_COLORS[c.cat] || '#00d4ff', boxShadow: `0 0 4px ${CAT_COLORS[c.cat] || '#00d4ff'}` }} />
              <div className="flex-1 min-w-0">
                <div className="text-[9px] font-mono mb-0.5 truncate" style={{ color: CAT_COLORS[c.cat] || '#00d4ff' }}>
                  "{c.cmd}"
                </div>
                <div className="text-[8px] text-jarvis-muted">{c.desc}</div>
              </div>
              <div className="text-[7px] font-orbitron px-1.5 py-0.5 rounded flex-shrink-0"
                style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.15)', color: 'rgba(0,212,255,0.5)' }}>
                {c.cat.split(' ')[0]}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Brain tab guide */}
      <div className="panel p-5 hud-corner mt-4">
        <div className="flex items-center gap-2 mb-4">
          <HelpCircle size={13} style={{ color: '#00d4ff' }} />
          <span className="text-[10px] font-orbitron font-bold tracking-widest" style={{ color: '#a8d8ea' }}>
            HOW TO USE SECOND BRAIN (BRAIN TAB)
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[10px]">
          <div className="space-y-3">
            <div className="font-orbitron text-[9px] tracking-widest" style={{ color: '#00d4ff' }}>FINDING YOUR OBSIDIAN VAULT PATH</div>
            <div className="space-y-2 text-jarvis-muted">
              <div className="flex gap-2"><span style={{ color: '#00d4ff' }}>1.</span> Open Obsidian on your laptop</div>
              <div className="flex gap-2"><span style={{ color: '#00d4ff' }}>2.</span> Settings → About → Vault path shown at the top</div>
              <div className="flex gap-2"><span style={{ color: '#00d4ff' }}>3.</span> Or: in File Explorer, navigate to your vault folder</div>
              <div className="flex gap-2"><span style={{ color: '#00d4ff' }}>4.</span> Right-click the folder → Properties → copy the full path</div>
            </div>
            <div className="p-2 rounded text-[9px] font-mono"
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,212,255,0.15)', color: '#00d4ff' }}>
              Example: C:\Users\alanb\Documents\MyVault
            </div>
            <div className="flex gap-2 text-jarvis-muted"><span style={{ color: '#ff9900' }}>5.</span> Paste that path in the BRAIN tab → click INDEX AS OBSIDIAN</div>
          </div>
          <div className="space-y-3">
            <div className="font-orbitron text-[9px] tracking-widest" style={{ color: '#00d4ff' }}>WHAT GETS INDEXED</div>
            <div className="space-y-1 text-jarvis-muted">
              {['.md (Markdown notes)', '.txt (Text files)', '.py (Python files)', '.js/.ts (JavaScript)', '.json (Config files)', '.csv (Data files)'].map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full" style={{ background: '#00ff88' }} />
                  {f}
                </div>
              ))}
            </div>
            <div className="font-orbitron text-[9px] tracking-widest mt-3" style={{ color: '#00d4ff' }}>AFTER INDEXING — ASK JARVIS:</div>
            <div className="space-y-1">
              {[
                '"Search my notes for React hooks"',
                '"What do I know about authentication?"',
                '"Find my notes about the client meeting"',
                '"Note: remember to call dentist"',
              ].map((q, i) => (
                <div key={i} className="text-[9px] font-mono" style={{ color: '#4a7a99' }}>• {q}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
