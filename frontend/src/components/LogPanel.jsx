import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const typeStyles = {
  info: { color: 'var(--accent-cyan)', dot: 'var(--accent-cyan)' },
  success: { color: 'var(--accent-green)', dot: 'var(--accent-green)' },
  danger: { color: 'var(--accent-red)', dot: 'var(--accent-red)' },
  error: { color: 'var(--accent-red)', dot: 'var(--accent-red)' },
  warning: { color: 'var(--accent-yellow)', dot: 'var(--accent-yellow)' }
}

export default function LogPanel({ logs }) {
  return (
    <div className="glass-card p-6 h-full">
      <h3 className="section-title mb-4 flex items-center gap-2">
        <span className="accent">📋</span> Activity Log
      </h3>

      <div className="panel-scroll space-y-2 max-h-[285px] overflow-y-auto pr-1">
        {logs.length === 0 && (
          <p className="text-xs text-center py-6" style={{ color: 'var(--text-muted)' }}>
            No activity yet...
          </p>
        )}

        <AnimatePresence initial={false}>
          {logs.map(log => {
            const style = typeStyles[log.type] || typeStyles.info
            return (
              <motion.div
                key={log.id}
                className="flex items-start gap-2.5 py-2 px-2.5 rounded-xl text-xs border log-row"
                style={{
                  background: 'rgba(255,255,255,0.018)',
                  borderColor: 'rgba(255,255,255,0.08)'
                }}
                initial={{ opacity: 0, x: -10, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                  style={{ background: style.dot }}
                />
                <span className="font-mono flex-shrink-0" style={{ color: 'var(--text-muted)', fontSize: 10.5 }}>
                  {log.time}
                </span>
                <span style={{ color: style.color }}>
                  {log.message}
                </span>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
