import React from 'react'
import { motion } from 'framer-motion'

export default function StatsPanel({ stats }) {
  if (!stats) {
    return (
      <div className="glass-card p-6 h-full">
        <h3 className="section-title mb-4 flex items-center gap-2">
          <span className="accent">📈</span> System Statistics
        </h3>
        <div className="flex items-center justify-center py-8">
          <div className="spinner" />
        </div>
      </div>
    )
  }

  const items = [
    {
      label: 'Total Readings',
      value: stats.totalReadings?.toLocaleString() || '0',
      icon: '📡',
      color: 'var(--accent-cyan)'
    },
    {
      label: 'Failures Detected',
      value: stats.totalFailures?.toString() || '0',
      icon: '🚨',
      color: 'var(--accent-red)'
    },
    {
      label: 'Failure Rate',
      value: stats.failureRate || '0%',
      icon: '📉',
      color: 'var(--accent-yellow)'
    },
    {
      label: 'Avg Temperature',
      value: `${stats.averages?.temperature || 0}°C`,
      icon: '🌡️',
      color: 'var(--accent-orange)'
    },
    {
      label: 'Avg Sound',
      value: stats.averages?.sound?.toString() || '0',
      icon: '🔊',
      color: 'var(--accent-blue)'
    },
    {
      label: 'Avg Current',
      value: `${stats.averages?.current || 0}A`,
      icon: '⚡',
      color: 'var(--accent-purple)'
    }
  ]

  return (
    <div className="glass-card p-6 h-full">
      <h3 className="section-title mb-4 flex items-center gap-2">
        <span className="accent">📈</span> System Statistics
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
        {items.map((item, i) => (
          <motion.div
            key={item.label}
            className="metric-card rounded-2xl p-3.5"
            style={{
              borderColor: 'rgba(255,255,255,0.09)'
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-sm">{item.icon}</span>
              <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>{item.label}</span>
            </div>
            <p className="text-lg sm:text-xl font-bold font-mono leading-none" style={{ color: item.color }}>
              {item.value}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
