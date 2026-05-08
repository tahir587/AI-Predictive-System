import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const statusConfig = {
  normal: {
    label: 'System Normal',
    sub: 'All parameters within safe range',
    color: 'var(--accent-green)',
    bg: 'rgba(16, 185, 129, 0.08)',
    border: 'rgba(16, 185, 129, 0.25)',
    icon: '✅'
  },
  warning: {
    label: 'Warning',
    sub: 'Some parameters approaching threshold',
    color: 'var(--accent-yellow)',
    bg: 'rgba(245, 158, 11, 0.08)',
    border: 'rgba(245, 158, 11, 0.25)',
    icon: '⚠️'
  },
  recovering: {
    label: 'System Recovering',
    sub: 'Trend is improving — risk decreasing',
    color: 'var(--accent-blue)',
    bg: 'rgba(62, 165, 255, 0.1)',
    border: 'rgba(62, 165, 255, 0.3)',
    icon: '💧'
  },
  stabilizing: {
    label: 'System Stable',
    sub: 'Trends are steady with low risk',
    color: 'var(--accent-cyan)',
    bg: 'rgba(34, 199, 216, 0.1)',
    border: 'rgba(34, 199, 216, 0.3)',
    icon: '🧊'
  },
  danger: {
    label: 'Failure Likely',
    sub: 'AI model predicts maintenance required soon',
    color: 'var(--accent-red)',
    bg: 'rgba(239, 68, 68, 0.08)',
    border: 'rgba(239, 68, 68, 0.25)',
    icon: '🚨'
  },
  critical: {
    label: 'Critical Failure',
    sub: 'Immediate action required — system at high risk',
    color: 'var(--accent-red)',
    bg: 'rgba(239, 68, 68, 0.14)',
    border: 'rgba(239, 68, 68, 0.35)',
    icon: '🛑'
  },
  offline: {
    label: 'Waiting for Data',
    sub: 'Connecting to backend server...',
    color: 'var(--text-muted)',
    bg: 'rgba(100, 116, 139, 0.08)',
    border: 'rgba(100, 116, 139, 0.2)',
    icon: '⏳'
  }
}

export default function StatusBanner({ status, data }) {
  const cfg = statusConfig[status] || statusConfig.offline

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        className="glass-card status-banner px-5 py-4 sm:px-6 sm:py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        style={{
          background: cfg.bg,
          borderColor: cfg.border
        }}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl sm:text-3xl">{cfg.icon}</span>
          <div>
            <h2 className="text-base sm:text-lg font-semibold" style={{ color: cfg.color }}>
              {cfg.label}
            </h2>
            <p className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
              {cfg.sub}
            </p>
          </div>
        </div>

        {data && (
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono status-chips" style={{ color: 'var(--text-secondary)' }}>
            {data.analysis?.action && (
              <span className={`data-chip ${data.analysis.action === 'STOP_MOTOR' ? 'chip-critical' : ''}`}>
                Action: <span style={{ color: data.analysis.action === 'STOP_MOTOR' ? 'var(--accent-red)' : cfg.color }}>{data.analysis.action}</span>
              </span>
            )}
            {data.analysis?.emergency?.active && (
              <span className="data-chip chip-critical">
                Emergency: <span style={{ color: 'var(--accent-red)' }}>ACTIVE</span>
              </span>
            )}
            {data.analysis?.riskProbability != null && (
              <span className="data-chip">
                Risk: <span style={{ color: cfg.color }}>{data.analysis.riskProbability}%</span>
              </span>
            )}
            {data.analysis?.healthScore != null && (
              <span className="data-chip">
                Health: <span style={{ color: cfg.color }}>{data.analysis.healthScore}%</span>
              </span>
            )}
            {data.analysis?.confidence != null && (
              <span className="data-chip">
                AI Confidence: <span style={{ color: cfg.color }}>{(data.analysis.confidence * 100).toFixed(0)}%</span>
              </span>
            )}
            <span className="data-chip">
              {new Date(data.timestamp).toLocaleTimeString()}
            </span>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
