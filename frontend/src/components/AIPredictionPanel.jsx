import React from 'react'
import { motion } from 'framer-motion'

const statusStyles = {
  NORMAL: {
    label: 'AI Stable',
    color: 'var(--accent-green)',
    glow: 'var(--glow-green)',
    bg: 'rgba(16, 185, 129, 0.08)'
  },
  WARNING: {
    label: 'Early Warning',
    color: 'var(--accent-yellow)',
    glow: 'var(--glow-yellow)',
    bg: 'rgba(245, 158, 11, 0.08)'
  },
  RECOVERING: {
    label: 'System Recovering',
    color: 'var(--accent-blue)',
    glow: '0 0 24px rgba(62, 165, 255, 0.35)',
    bg: 'rgba(62, 165, 255, 0.12)'
  },
  STABILIZING: {
    label: 'System Stable',
    color: 'var(--accent-cyan)',
    glow: 'var(--glow-cyan)',
    bg: 'rgba(34, 199, 216, 0.12)'
  },
  FAILURE_LIKELY: {
    label: 'Failure Likely',
    color: 'var(--accent-orange)',
    glow: '0 0 24px rgba(255, 124, 53, 0.35)',
    bg: 'rgba(255, 124, 53, 0.08)'
  },
  CRITICAL_FAILURE: {
    label: 'Critical Failure',
    color: 'var(--accent-red)',
    glow: 'var(--glow-red)',
    bg: 'rgba(239, 68, 68, 0.12)'
  },
  OFFLINE: {
    label: 'AI Standby',
    color: 'var(--text-muted)',
    glow: 'none',
    bg: 'rgba(100, 116, 139, 0.08)'
  }
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '--'
  return `${Math.round(value)}%`
}

export default function AIPredictionPanel({ analysis, isLive }) {
  const statusKey = isLive ? analysis?.status || 'NORMAL' : 'OFFLINE'
  const cfg = statusStyles[statusKey] || statusStyles.NORMAL
  const statusClass = statusKey.toLowerCase().replace(/_/g, '-')
  const confidence = analysis?.confidence != null ? analysis.confidence * 100 : null
  const emergencyActive = analysis?.emergency?.active
  const actionLabel = analysis?.action === 'STOP_MOTOR' ? 'SHUTDOWN' : 'RUNNING'
  const tempMetrics = analysis?.metrics?.temperature
  const showTempEtaLabel = tempMetrics
    && Number.isFinite(tempMetrics.latest)
    && tempMetrics.latest >= 32
    && Number.isFinite(tempMetrics.slopePerMin)
    && tempMetrics.slopePerMin > 0
    && Number.isFinite(analysis?.failureEtaMinutes)
  const showRemainingLife = showTempEtaLabel
  let displayEtaMinutes = analysis?.failureEtaMinutes
  if (showRemainingLife && Number.isFinite(displayEtaMinutes)) {
    const temp = tempMetrics.latest
    const slope = tempMetrics.slopePerMin
    let range = null

    if (temp >= 45) {
      range = { minTemp: 45, maxTemp: 50, minEta: 5, maxEta: 10 }
    } else if (temp >= 40) {
      range = { minTemp: 40, maxTemp: 45, minEta: 10, maxEta: 50 }
    } else if (temp >= 35) {
      range = { minTemp: 35, maxTemp: 40, minEta: 50, maxEta: 100 }
    } else if (temp >= 32) {
      range = { minTemp: 32, maxTemp: 35, minEta: 100, maxEta: 200 }
    }

    if (range) {
      const tempRatio = Math.min(Math.max((temp - range.minTemp) / Math.max(range.maxTemp - range.minTemp, 1), 0), 1)
      const slopeRatio = Math.min(Math.max(slope / 2, 0), 1)
      let eta = range.maxEta - ((range.maxEta - range.minEta) * tempRatio)
      eta -= (range.maxEta - range.minEta) * 0.2 * slopeRatio
      displayEtaMinutes = Math.round(Math.min(Math.max(eta, range.minEta), range.maxEta))
    }
  }
  const etaLabel = showTempEtaLabel && Number.isFinite(displayEtaMinutes)
    ? `Estimated to reach danger in ${displayEtaMinutes} min`
    : null
  const trendArrow = analysis?.trendSummary === 'RISING'
    ? '↗'
    : analysis?.trendSummary === 'FALLING'
      ? '↘'
      : '→'

  return (
    <motion.div
      className={`glass-card ai-panel p-6 md:p-7 ai-status-${statusClass}`}
      style={{ background: cfg.bg }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="ai-header">
        <div className="flex items-center gap-3">
          <div className="ai-ring" style={{ boxShadow: cfg.glow, borderColor: cfg.color }}>
            <span className="ai-dot" style={{ background: cfg.color }} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>AI Prediction</p>
            <h3 className="text-lg md:text-xl font-semibold" style={{ color: cfg.color }}>{cfg.label}</h3>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {showTempEtaLabel
                ? (etaLabel || analysis?.failureEtaLabel)
                : (isLive ? 'Monitoring system' : 'Waiting for live data')}
            </p>
          </div>
        </div>

        <div className="ai-chip-row text-xs">
          <span className="data-chip">Health: <strong style={{ color: cfg.color }}>{formatPercent(analysis?.healthScore)}</strong></span>
          <span className="data-chip">Risk: <strong style={{ color: cfg.color }}>{formatPercent(analysis?.riskProbability)}</strong></span>
          <span className="data-chip">Confidence: <strong style={{ color: cfg.color }}>{formatPercent(confidence)}</strong></span>
          <span className="data-chip">Trend: <strong style={{ color: cfg.color }}>{trendArrow} {analysis?.trendSummary || 'STABLE'}</strong></span>
          <span className={`data-chip ${emergencyActive ? 'chip-critical' : ''}`}>
            Emergency: <strong style={{ color: emergencyActive ? 'var(--accent-red)' : cfg.color }}>{emergencyActive ? 'ACTIVE' : 'CLEAR'}</strong>
          </span>
        </div>
      </div>

      <div className="ai-grid mt-5">
        <div className="ai-metric">
          <span className="ai-label">Anomaly Score</span>
          <span className="ai-value">{analysis?.anomalyScore != null ? analysis.anomalyScore.toFixed(2) : '--'}</span>
        </div>
        <div className="ai-metric">
          <span className="ai-label">Remaining Useful Life</span>
          <span className="ai-value">{showRemainingLife ? `${displayEtaMinutes} min` : 'Monitoring'}</span>
        </div>
        <div className="ai-metric">
          <span className="ai-label">Action</span>
          <span className="ai-value">{actionLabel}</span>
        </div>
        <div className="ai-metric">
          <span className="ai-label">Recovery Signal</span>
          <span className="ai-value">{analysis?.status === 'RECOVERING' ? 'DETECTED' : 'NONE'}</span>
        </div>
        <div className="ai-metric">
          <span className="ai-label">History Window</span>
          <span className="ai-value">{analysis?.historyWindow || 0} samples</span>
        </div>
        <div className="ai-metric">
          <span className="ai-label">Risk Drivers</span>
          <span className="ai-value ai-multi">
            {analysis?.alerts?.length ? analysis.alerts.slice(0, 2).join(' • ') : 'None detected'}
          </span>
        </div>
      </div>

      <div className="ai-reasoning mt-5">
        <p className="ai-reasoning-title">AI Reasoning</p>
        <ul className="ai-reasoning-list">
          {(analysis?.reasoning?.length
            ? analysis.reasoning.filter(item => !item.startsWith('Estimated RUL'))
            : ['Awaiting enough history for reasoning']).map((item, idx) => (
            <li key={`${item}-${idx}`}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="ai-progress mt-5">
        <div className="ai-progress-label">
          <span>Failure Probability</span>
          <span>{formatPercent(analysis?.riskProbability)}</span>
        </div>
        <div className="ai-progress-track">
          <span
            className="ai-progress-fill"
            style={{ width: `${analysis?.riskProbability || 0}%`, background: cfg.color }}
          />
        </div>
      </div>
    </motion.div>
  )
}
