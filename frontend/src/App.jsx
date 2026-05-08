import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import axios from 'axios'
import Header from './components/Header.jsx'
import StatusBanner from './components/StatusBanner.jsx'
import SensorCards from './components/SensorCards.jsx'
import Scene3D from './components/Scene3D.jsx'
import Charts from './components/Charts.jsx'
import LogPanel from './components/LogPanel.jsx'
import StatsPanel from './components/StatsPanel.jsx'

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
    if (sensorData) {
      const pred = sensorData.prediction
      if (pred === 1) {
        addLog(`⚠️ FAILURE PREDICTED - Confidence: ${((sensorData.confidence || 0) * 100).toFixed(0)}%`, 'danger')
      } else if (pred === 0) {
        addLog(`✅ System Normal - T:${sensorData.temperature}°C`, 'success')
      }
    }
  }, [sensorData?.timestamp])

  const isLive = isLiveReading(sensorData)
  const systemStatus = !isLive ? 'offline'
    : sensorData.prediction === 1 ? 'danger'
    : sensorData.temperature > 45 || sensorData.current > 2.5 ? 'warning'
    : 'normal'

  return (
    <div className="min-h-screen grid-bg app-shell">
      <Header connected={connected} />

      <main className="relative max-w-[1650px] mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 space-y-6 md:space-y-7">
        <StatusBanner status={systemStatus} data={sensorData} />

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
            <SensorCards data={sensorData} status={systemStatus} />
          </div>
        </div>

        {/* Charts Row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <Charts history={history} />
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
