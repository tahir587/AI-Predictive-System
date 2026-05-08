import React from 'react'
import { motion } from 'framer-motion'

const sensors = [
  {
    key: 'temperature',
    label: 'Temperature',
    unit: '°C',
    icon: '🌡️',
    color: '#f97316',
    gradient: 'linear-gradient(135deg, rgba(249,115,22,0.15), rgba(239,68,68,0.08))',
    thresholds: { warn: 40, danger: 50 },
    format: v => v?.toFixed(1) ?? '--'
  },
  {
    key: 'vibration',
    label: 'Vibration',
    unit: '',
    icon: '📳',
    color: '#8b5cf6',
    gradient: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.08))',
    thresholds: { warn: 1, danger: 1 },
    format: v => v === 1 ? 'ACTIVE' : v === 0 ? 'None' : '--'
  },
  {
    key: 'sound',
    label: 'Sound Level',
    unit: '',
    icon: '🔊',
    color: '#06b6d4',
    gradient: 'linear-gradient(135deg, rgba(6,182,212,0.15), rgba(59,130,246,0.08))',
    thresholds: { warn: 1500, danger: 2000 },
    format: v => v != null ? Math.round(v).toString() : '--'
  },
  {
    key: 'current',
    label: 'Current Draw',
    unit: 'A',
    icon: '⚡',
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(249,115,22,0.08))',
    thresholds: { warn: 2.0, danger: 3.0 },
    format: v => v?.toFixed(2) ?? '--'
  }
]

function getValueColor(value, thresholds) {
  if (value == null) return 'var(--text-secondary)'
  if (value >= thresholds.danger) return 'var(--accent-red)'
  if (value >= thresholds.warn) return 'var(--accent-yellow)'
  return 'var(--accent-green)'
}

function getBarWidth(key, value) {
  if (value == null) return 0
  const maxMap = { temperature: 80, vibration: 1, sound: 4095, current: 5 }
  return Math.min((value / maxMap[key]) * 100, 100)
}

function getStateLabel(value, thresholds) {
  if (value == null) return 'No data'
  if (value >= thresholds.danger) return 'Critical'
  if (value >= thresholds.warn) return 'Elevated'
  return 'Stable'
}

export default function SensorCards({ data, status }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
      {sensors.map((sensor, i) => {
        const value = data?.[sensor.key]
        const valColor = getValueColor(value, sensor.thresholds)
        const barW = getBarWidth(sensor.key, value)
        const stateLabel = getStateLabel(value, sensor.thresholds)

        return (
          <motion.div
            key={sensor.key}
            className="glass-card neon-border metric-card p-5"
            style={{ background: sensor.gradient }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.4 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{sensor.icon}</span>
                <span className="text-xs uppercase tracking-[0.1em]" style={{ color: 'var(--text-secondary)' }}>
                  {sensor.label}
                </span>
              </div>
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: valColor,
                  boxShadow: `0 0 8px ${valColor}`
                }}
              />
            </div>

            {/* Value */}
            <div className="flex items-baseline gap-1.5 mb-3">
              <motion.span
                key={value}
                className="sensor-value text-3xl md:text-4xl leading-none font-semibold"
                style={{ color: valColor }}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {sensor.format(value)}
              </motion.span>
              {sensor.unit && (
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {sensor.unit}
                </span>
              )}
            </div>

            {/* Progress bar */}
            <div className="h-1.5 rounded-full overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ background: valColor }}
                initial={{ width: 0 }}
                animate={{ width: `${barW}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px]">
              <span className="data-chip" style={{ borderColor: 'rgba(255,255,255,0.16)' }}>
                {stateLabel}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>
                {status === 'danger' ? 'Motor stop active' : 'Live reading'}
              </span>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
