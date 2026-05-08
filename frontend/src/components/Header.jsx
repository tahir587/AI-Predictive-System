import React from 'react'
import { motion } from 'framer-motion'

export default function Header({ connected }) {
  return (
    <header className="sticky top-0 z-50 header-shell">
      <div className="max-w-[1650px] mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-3">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <motion.div
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg font-bold"
            style={{
              background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-orange))',
              boxShadow: '0 0 20px rgba(34, 199, 216, 0.35)'
            }}
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          >
            ⚙
          </motion.div>
          <div>
            <h1 className="text-lg md:text-xl font-semibold tracking-tight text-glow-cyan" style={{ color: 'var(--text-primary)' }}>
              Predictive Maintenance
            </h1>
            <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>
              AI-Powered Industrial Monitoring
            </p>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden md:flex items-center gap-2 data-chip">
            <span>ESP32</span>
            <span className="font-mono">→</span>
            <span>Backend</span>
            <span className="font-mono">→</span>
            <span>AI</span>
            <span className="font-mono">→</span>
            <span>Dashboard</span>
          </div>

          <motion.div
            className="status-pill flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
            style={{
              background: connected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${connected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              color: connected ? 'var(--accent-green)' : 'var(--accent-red)'
            }}
            animate={connected ? {} : { opacity: [1, 0.5, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <span className="w-2 h-2 rounded-full" style={{
              background: connected ? 'var(--accent-green)' : 'var(--accent-red)',
              boxShadow: connected ? 'var(--glow-green)' : 'var(--glow-red)'
            }} />
            {connected ? 'Live' : 'Disconnected'}
          </motion.div>
        </div>
      </div>
    </header>
  )
}
