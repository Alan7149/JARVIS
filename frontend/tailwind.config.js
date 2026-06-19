/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        jarvis: {
          bg: '#020b18',
          panel: '#041628',
          border: '#0d4a6e',
          glow: '#00d4ff',
          accent: '#00aaff',
          warn: '#ff9900',
          danger: '#ff3333',
          success: '#00ff88',
          text: '#a8d8ea',
          muted: '#4a7a99',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        orbitron: ['Orbitron', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 20px rgba(0,212,255,0.3)',
        'glow-sm': '0 0 8px rgba(0,212,255,0.2)',
        'glow-lg': '0 0 40px rgba(0,212,255,0.4)',
        'glow-warn': '0 0 12px rgba(255,153,0,0.3)',
        'glow-success': '0 0 12px rgba(0,255,136,0.3)',
        'glow-danger': '0 0 12px rgba(255,51,51,0.3)',
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'spin-slow': 'spin 8s linear infinite',
        'spin-reverse': 'spinReverse 5s linear infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'scan-beam': 'scanBeam 6s linear infinite',
      },
      keyframes: {
        spinReverse: {
          from: { transform: 'rotate(360deg)' },
          to: { transform: 'rotate(0deg)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        scanBeam: {
          '0%': { top: '-2px', opacity: '0' },
          '5%': { opacity: '1' },
          '95%': { opacity: '1' },
          '100%': { top: '100vh', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}
