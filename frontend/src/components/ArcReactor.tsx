import { JarvisSystemState, STATE_COLORS, STATE_SPEED } from '../contexts/JarvisStateContext'

export default function ArcReactor({ size = 56, className = '', state = 'idle' }: {
  size?: number; className?: string; state?: JarvisSystemState
}) {
  const cx = size / 2
  const r1 = size * 0.44
  const r2 = size * 0.32
  const r3 = size * 0.20
  const r4 = size * 0.10

  const [r, g, b] = STATE_COLORS[state]
  const speed = STATE_SPEED[state]
  const c = (a: number) => `rgba(${r},${g},${b},${a})`
  const hex = `rgb(${r},${g},${b})`

  const ring1Style = { transformOrigin: `${cx}px ${cx}px`, animationDuration: `${8 / speed}s` }
  const ring2Style = { transformOrigin: `${cx}px ${cx}px`, animationDuration: `${5 / speed}s` }
  const ring3Style = { transformOrigin: `${cx}px ${cx}px`, animationDuration: `${12 / speed}s` }
  const coreStyle = { animationDuration: `${2 / speed}s` }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className} style={{ overflow: 'visible' }}>
      <defs>
        <filter id="arc-glow">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id="coreGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="50%" stopColor={hex} stopOpacity="1" />
          <stop offset="100%" stopColor={hex} stopOpacity="0.4" />
        </radialGradient>
      </defs>

      {/* Outer ring with dashes */}
      <g className="arc-ring-1" style={ring1Style}>
        <circle cx={cx} cy={cx} r={r1} fill="none" stroke={c(0.3)} strokeWidth="1" />
        {Array.from({ length: 16 }).map((_, i) => {
          const angle = (i / 16) * Math.PI * 2
          const x1 = cx + (r1 - 3) * Math.cos(angle)
          const y1 = cx + (r1 - 3) * Math.sin(angle)
          const x2 = cx + (r1 + 3) * Math.cos(angle)
          const y2 = cx + (r1 + 3) * Math.sin(angle)
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={hex} strokeWidth="1" opacity="0.6" />
        })}
      </g>

      {/* Mid ring */}
      <g className="arc-ring-2" style={ring2Style}>
        <circle cx={cx} cy={cx} r={r2} fill="none" stroke={c(0.5)} strokeWidth="1.5"
          strokeDasharray="4 3" />
        {Array.from({ length: 6 }).map((_, i) => {
          const angle = (i / 6) * Math.PI * 2
          const x1 = cx + (r2 - 2) * Math.cos(angle)
          const y1 = cx + (r2 - 2) * Math.sin(angle)
          const x2 = cx + r2 * Math.cos(angle)
          const y2 = cx + r2 * Math.sin(angle)
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={hex} strokeWidth="1.5" opacity="0.8" />
        })}
      </g>

      {/* Inner ring */}
      <g className="arc-ring-3" style={ring3Style}>
        <circle cx={cx} cy={cx} r={r3} fill={c(0.15)} stroke={c(0.7)} strokeWidth="1.5" />
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i / 8) * Math.PI * 2
          const x = cx + r3 * Math.cos(angle)
          const y = cx + r3 * Math.sin(angle)
          return <circle key={i} cx={x} cy={y} r="1.5" fill={hex} opacity="0.8" />
        })}
      </g>

      {/* Core glow */}
      <circle className="arc-core" style={coreStyle} cx={cx} cy={cx} r={r4 + 2} fill={c(0.15)}
        filter="url(#arc-glow)" />
      <circle cx={cx} cy={cx} r={r4} fill="url(#coreGrad)"
        style={{ filter: `drop-shadow(0 0 4px ${hex})` }} />

      {/* Center dot */}
      <circle cx={cx} cy={cx} r="2" fill="white" opacity="0.9" />
    </svg>
  )
}
