import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import axios from 'axios'
import Header from './components/Header.jsx'
import StatusBanner from './components/StatusBanner.jsx'
import SensorCards from './components/SensorCards.jsx'
import Scene3D from './components/Scene3D.jsx'
import Charts from './components/Charts.jsx'
import LogPanel from './components/LogPanel.jsx'
import StatsPanel from './components/StatsPanel.jsx'
import AIPredictionPanel from './components/AIPredictionPanel.jsx'

// Use relative path for API calls (proxied through dev server)
const API_BASE = ''
const LIVE_THRESHOLD_MS = 6000

function isLiveReading(data) {
  if (!data?.timestamp) {
    return false
  }

  const ts = new Date(data.timestamp).getTime()
  if (Number.isNaN(ts)) {
    return false
  }

  return Date.now() - ts <= LIVE_THRESHOLD_MS
}

function App() {
  const [sensorData, setSensorData] = useState(null)
  const [history, setHistory] = useState([])
  const [stats, setStats] = useState(null)
  const [connected, setConnected] = useState(false)
  const [logs, setLogs] = useState([])
  const [error, setError] = useState(null)
  const lastAiStatusRef = useRef(null)
  const lastAlertsRef = useRef('')
  const lastActionRef = useRef(null)
  const lastEtaRef = useRef(null)

  const addLog = useCallback((message, type = 'info') => {
    const entry = {
      id: Date.now() + Math.random(),
      time: new Date().toLocaleTimeString(),
      message,
      type
    }
    setLogs(prev => [entry, ...prev].slice(0, 50))
  }, [])

  const fetchLatest = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/data/latest`)
      if (res.data && !res.data.message) {
        setSensorData(res.data)
        setConnected(isLiveReading(res.data))
        setError(null)
      }
    } catch (err) {
      setConnected(false)
      setError('Backend unreachable')
      addLog('Failed to fetch latest data', 'error')
    }
  }, [addLog])

  const fetchHistory = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/data?limit=50`)
      if (Array.isArray(res.data)) {
        setHistory(res.data.reverse())
      }
    } catch (err) {
      // silent
    }
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/stats`)
      setStats(res.data)
    } catch (err) {
      // silent
    }
  }, [])

  useEffect(() => {
    addLog('Dashboard initialized', 'info')
    fetchLatest()
    fetchHistory()
    fetchStats()

    const interval = setInterval(() => {
      fetchLatest()
      fetchHistory()
      fetchStats()
    }, 3000)

    return () => clearInterval(interval)
  }, [fetchLatest, fetchHistory, fetchStats, addLog])

  useEffect(() => {
    if (!sensorData?.analysis) return
    const analysis = sensorData.analysis
    if (analysis.status && lastAiStatusRef.current !== analysis.status) {
      lastAiStatusRef.current = analysis.status
      const statusLabel = analysis.status.replace('_', ' ')
      const confidence = analysis.confidence != null ? Math.round(analysis.confidence * 100) : null
      const logMessage = confidence != null
        ? `AI Status: ${statusLabel} (${confidence}% confidence)`
        : `AI Status: ${statusLabel}`
      const logType = analysis.status === 'CRITICAL_FAILURE'
        ? 'danger'
        : analysis.status === 'FAILURE_LIKELY'
          ? 'warning'
          : analysis.status === 'RECOVERING'
            ? 'success'
            : analysis.status === 'STABILIZING'
              ? 'info'
              : 'info'
      addLog(logMessage, logType)
    }

    if (Array.isArray(analysis.alerts) && analysis.alerts.length) {
      const alertSignature = analysis.alerts.join('|')
      if (alertSignature !== lastAlertsRef.current) {
        lastAlertsRef.current = alertSignature
        analysis.alerts.forEach(alert => addLog(`AI Insight: ${alert}`, 'warning'))
      }
    }

    if (analysis.action && lastActionRef.current !== analysis.action) {
      lastActionRef.current = analysis.action
      if (analysis.action === 'STOP_MOTOR') {
        addLog('Emergency shutdown activated: motor stopped', 'danger')
      } else {
        addLog('System action: motor running', 'info')
      }
    }

    const tempMetrics = analysis.metrics?.temperature
    const showTempEtaLabel = tempMetrics
      && Number.isFinite(tempMetrics.latest)
      && tempMetrics.latest >= 32
      && Number.isFinite(tempMetrics.slopePerMin)
      && tempMetrics.slopePerMin > 0
      && Number.isFinite(analysis.failureEtaMinutes)
    if (showTempEtaLabel) {
      const etaSignature = `${analysis.failureEtaMinutes}-${tempMetrics.latest.toFixed(1)}`
      if (etaSignature !== lastEtaRef.current) {
        lastEtaRef.current = etaSignature
        addLog(`Estimated time to failure: ${analysis.failureEtaMinutes} minutes`, 'warning')
      }
    }
  }, [sensorData?.analysis, addLog])

  const isLive = isLiveReading(sensorData)
  const analysisStatus = sensorData?.analysis?.status
  const isEmergency = sensorData?.analysis?.emergency?.active
  const systemStatus = !isLive ? 'offline'
    : isEmergency ? 'critical'
    : analysisStatus === 'CRITICAL_FAILURE' ? 'critical'
    : analysisStatus === 'FAILURE_LIKELY' ? 'danger'
    : analysisStatus === 'WARNING' ? 'warning'
    : analysisStatus === 'RECOVERING' ? 'recovering'
    : analysisStatus === 'STABILIZING' ? 'stabilizing'
    : analysisStatus === 'NORMAL' ? 'normal'
    : sensorData.temperature > 45 || sensorData.current > 2.5 ? 'warning'
    : 'normal'

  return (
    <div className="min-h-screen grid-bg app-shell">
      <Header connected={connected} />

      <main className="relative max-w-[1650px] mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 space-y-6 md:space-y-7">
        <div className="space-y-8 top-stack">
          <StatusBanner status={systemStatus} data={sensorData} />
          <div className="section-separator" />
          <AIPredictionPanel analysis={sensorData?.analysis} isLive={isLive} />
        </div>

        {/* Top Row: 3D + Sensor Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 3D Visualization */}
          <motion.div
            className="lg:col-span-1 glass-card p-1.5 min-h-[350px]"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <div className="rounded-[18px] overflow-hidden h-full border border-white/10" style={{ minHeight: 340 }}>
              <Scene3D status={systemStatus} data={sensorData} isLive={isLive} />
            </div>
          </motion.div>

          {/* Sensor Cards */}
          <div className="lg:col-span-2">
            <SensorCards data={sensorData} status={systemStatus} isLive={isLive} />
          </div>
        </div>

        {/* Charts Row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <Charts history={history} isLive={isLive} />
        </motion.div>

        {/* Bottom Row: Stats + Logs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
          >
            <StatsPanel stats={stats} />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
          >
            <LogPanel logs={logs} />
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-8 text-xs sm:text-sm tracking-wide" style={{ color: 'var(--text-muted)' }}>
        AI Predictive Maintenance System v1.0 — Real-time Industrial Monitoring
      </footer>

      {/* Error Overlay */}
      <AnimatePresence>
        {error && !connected && (
          <motion.div
            className="fixed bottom-6 right-6 glass-card px-5 py-3 glow-red flex items-center gap-3 z-[60]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm text-red-300">{error}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App
