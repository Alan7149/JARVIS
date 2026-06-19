/**
 * JARVIS Voice Waveform — animates when JARVIS is speaking
 * Listens for 'jarvis_speaking' WebSocket events
 */
import { useEffect, useRef, useState } from 'react'
import { useWebSocket } from '../contexts/WebSocketContext'

export default function VoiceWave() {
  const { lastMessage } = useWebSocket()
  const [speaking, setSpeaking] = useState(false)
  const [bars, setBars] = useState<number[]>(Array(12).fill(3))
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (lastMessage?.event === 'jarvis_speaking') {
      const isSpeaking = (lastMessage.data as any)?.speaking ?? false
      setSpeaking(isSpeaking)
    }
  }, [lastMessage])

  useEffect(() => {
    if (speaking) {
      animRef.current = setInterval(() => {
        setBars(Array(12).fill(0).map(() => 3 + Math.random() * 28))
      }, 80)
    } else {
      if (animRef.current) clearInterval(animRef.current)
      setBars(Array(12).fill(3))
    }
    return () => { if (animRef.current) clearInterval(animRef.current) }
  }, [speaking])

  if (!speaking) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 90,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      alignItems: 'flex-end',
      gap: 3,
      height: 40,
      zIndex: 1000,
      padding: '6px 14px',
      background: 'rgba(2,8,20,0.85)',
      border: '1px solid rgba(0,212,255,0.3)',
      borderRadius: 4,
      backdropFilter: 'blur(8px)',
    }}>
      {/* Label */}
      <div style={{
        position: 'absolute',
        top: -18,
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: 7,
        color: 'rgba(0,212,255,0.6)',
        letterSpacing: '0.2em',
        fontFamily: 'Orbitron, monospace',
        whiteSpace: 'nowrap',
      }}>
        JARVIS SPEAKING
      </div>
      {bars.map((h, i) => (
        <div key={i} style={{
          width: 4,
          height: h,
          background: `rgba(0,212,255,${0.5 + (h / 31) * 0.5})`,
          borderRadius: 2,
          boxShadow: `0 0 ${Math.round(h / 5)}px rgba(0,212,255,0.6)`,
          transition: 'height 0.07s ease',
          minHeight: 3,
        }} />
      ))}
    </div>
  )
}
