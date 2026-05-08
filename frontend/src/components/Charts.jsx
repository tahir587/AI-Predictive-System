import React, { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const chartConfigs = [
  {
    key: 'temperature',
    label: 'Temperature (°C)',
    borderColor: '#f97316',
    bgColor: 'rgba(249, 115, 22, 0.1)',
    threshold: 50
  },
  {
    key: 'sound',
    label: 'Sound Level',
    borderColor: '#06b6d4',
    bgColor: 'rgba(6, 182, 212, 0.1)',
    threshold: 2000
  },
  {
    key: 'current',
    label: 'Current (A)',
    borderColor: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    threshold: 3.0
  }
]

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 400 },
  interaction: { intersect: false, mode: 'index' },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(17, 24, 39, 0.95)',
      borderColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      titleFont: { family: 'Outfit', size: 12 },
      bodyFont: { family: 'JetBrains Mono', size: 11 },
      padding: 10,
      cornerRadius: 8
    }
  },
  scales: {
    x: {
      grid: { color: 'rgba(255,255,255,0.03)' },
      ticks: { color: '#64748b', font: { size: 9, family: 'JetBrains Mono' }, maxTicksLimit: 8 },
      border: { color: 'rgba(255,255,255,0.05)' }
    },
    y: {
      grid: { color: 'rgba(255,255,255,0.03)' },
      ticks: { color: '#64748b', font: { size: 10, family: 'JetBrains Mono' } },
      border: { color: 'rgba(255,255,255,0.05)' }
    }
  },
  elements: {
    point: { radius: 0, hoverRadius: 4 },
    line: { tension: 0.4, borderWidth: 2 }
  }
}

function SingleChart({ config, history }) {
  const chartData = useMemo(() => {
    const labels = history.map(d => new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    const values = history.map(d => d[config.key])

    return {
      labels,
      datasets: [
        {
          label: config.label,
          data: values,
          borderColor: config.borderColor,
          backgroundColor: config.bgColor,
          fill: true
        },
        {
          label: 'Threshold',
          data: Array(values.length).fill(config.threshold),
          borderColor: 'rgba(239, 68, 68, 0.4)',
          borderDash: [5, 5],
          borderWidth: 1,
          pointRadius: 0,
          fill: false
        }
      ]
    }
  }, [history, config])

  const latestValue = history[history.length - 1]?.[config.key]

  return (
    <div className="glass-card metric-card p-4" style={{ minHeight: 230 }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-3 h-0.5 rounded-full" style={{ background: config.borderColor }} />
        <span className="text-xs uppercase tracking-[0.09em]" style={{ color: 'var(--text-secondary)' }}>
          {config.label}
        </span>
        <span className="data-chip ml-auto font-mono" style={{ borderColor: 'rgba(255,255,255,0.14)' }}>
          Latest: {latestValue != null ? Number(latestValue).toFixed(config.key === 'current' ? 2 : 1) : '--'}
        </span>
        <span className="ml-auto text-[10px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
          <span className="w-4 h-0 border-t border-dashed" style={{ borderColor: 'rgba(239,68,68,0.5)' }} />
          Threshold
        </span>
      </div>
      <div style={{ height: 175 }}>
        <Line data={chartData} options={baseOptions} />
      </div>
    </div>
  )
}

export default function Charts({ history }) {
  if (!history || history.length === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <div className="spinner mx-auto mb-3" />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Waiting for sensor data...</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="section-title mb-3 flex items-center gap-2">
        <span className="accent">📊</span> Real-Time Sensor Trends
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {chartConfigs.map(cfg => (
          <SingleChart key={cfg.key} config={cfg} history={history} />
        ))}
      </div>
    </div>
  )
}
