/**
 * AI Predictive Maintenance System - Backend Server
 * Express.js + MongoDB + AI Service Integration
 * Runs on 0.0.0.0:5000
 */

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/predictive_maintenance';
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:5001';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

const HISTORY_LIMIT = 80;
const SENSOR_THRESHOLDS = {
  temperature: { warn: 40, danger: 50, slopeWarnPerMin: 1.5 },
  vibration: { warn: 1, danger: 1, slopeWarnPerMin: 0 },
  sound: { warn: 1500, danger: 2000, slopeWarnPerMin: 160 },
  current: { warn: 2.0, danger: 3.0, slopeWarnPerMin: 0.25 }
};
const EMERGENCY_THRESHOLDS = {
  temperature: 60,
  vibration: 1,
  sound: 2600,
  current: 3.5
};
const SENSOR_WEIGHTS = {
  temperature: 0.3,
  vibration: 0.15,
  sound: 0.25,
  current: 0.3
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function levelScore(value, warn, danger) {
  if (!Number.isFinite(value)) return 0;
  if (value < warn) {
    return clamp((value / warn) * 0.4, 0, 0.4);
  }
  if (value < danger) {
    return 0.4 + clamp((value - warn) / (danger - warn), 0, 1) * 0.3;
  }
  return 0.7 + clamp((value - danger) / Math.max(danger, 1), 0, 1) * 0.3;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function slopePerMinute(values, timestamps) {
  if (values.length < 2) return 0;
  const first = values[0];
  const last = values[values.length - 1];
  const start = timestamps[0];
  const end = timestamps[timestamps.length - 1];
  let minutes = (end - start) / 60000;
  if (!Number.isFinite(minutes) || minutes <= 0) {
    minutes = (values.length - 1) * 3 / 60;
  }
  if (minutes <= 0) return 0;
  return (last - first) / minutes;
}

function trendDirection(slope, threshold) {
  if (slope > threshold) return 'RISING';
  if (slope < -threshold) return 'FALLING';
  return 'STABLE';
}

function buildAnalysis(history, aiPrediction, aiConfidence, aiFailureProbability) {
  const timestamps = history.map(d => new Date(d.timestamp).getTime());
  const metrics = {};
  const alerts = [];
  const driverScores = [];
  let weightedRisk = 0;
  let weightedTrend = 0;
  let weightedAnomaly = 0;
  let weightedSlope = 0;

  Object.keys(SENSOR_THRESHOLDS).forEach((key) => {
    const values = history.map(d => d[key]).filter(v => Number.isFinite(v));
    const recent = values.slice(-10);
    const long = values.slice(-50);
    const latestValue = values[values.length - 1] ?? null;
    const avgShort = average(recent);
    const avgLong = average(long);
    const slope = slopePerMinute(values, timestamps);
    const level = levelScore(latestValue, SENSOR_THRESHOLDS[key].warn, SENSOR_THRESHOLDS[key].danger);
    const deviation = avgLong > 0 ? Math.abs(latestValue - avgLong) / avgLong : 0;
    const anomaly = clamp(deviation, 0, 1);
    const slopeWarn = SENSOR_THRESHOLDS[key].slopeWarnPerMin;
    const slopeRatio = slopeWarn > 0 ? slope / slopeWarn : latestValue === 1 ? 1 : 0;
    const trendScore = slopeWarn > 0
      ? clamp(slopeRatio, 0, 1)
      : latestValue === 1 ? 1 : 0;

    metrics[key] = {
      latest: latestValue,
      avgShort: Number.isFinite(avgShort) ? Number(avgShort.toFixed(2)) : 0,
      avgLong: Number.isFinite(avgLong) ? Number(avgLong.toFixed(2)) : 0,
      slopePerMin: Number.isFinite(slope) ? Number(slope.toFixed(2)) : 0,
      level: Number(level.toFixed(3)),
      trend: trendDirection(slope, SENSOR_THRESHOLDS[key].slopeWarnPerMin * 0.35),
      anomaly: Number(anomaly.toFixed(3))
    };

    const driverScore = (level * 0.6) + (anomaly * 0.2) + (trendScore * 0.2);
    driverScores.push({ key, score: driverScore });

    weightedRisk += level * SENSOR_WEIGHTS[key];
    weightedTrend += trendScore * SENSOR_WEIGHTS[key];
    weightedAnomaly += anomaly * SENSOR_WEIGHTS[key];
    if (Number.isFinite(slopeRatio)) {
      weightedSlope += slopeRatio * SENSOR_WEIGHTS[key];
    }

    if (trendScore > 0.55 && level > 0.25) {
      alerts.push(`${key} trend increasing`);
    }

    if (key === 'temperature' && Number.isFinite(latestValue) && latestValue >= 35 && slope > 0) {
      alerts.push('Temperature rising above 35C');
    }
  });

  const modelRisk = Number.isFinite(aiFailureProbability)
    ? aiFailureProbability
    : (aiPrediction === 1 ? aiConfidence : 0);
  const riskScore = clamp(
    (weightedRisk * 0.5) + (weightedTrend * 0.2) + (weightedAnomaly * 0.1) + (modelRisk * 0.2),
    0,
    1
  );
  const trendStrength = clamp(weightedTrend * 1.1, 0, 1);
  const slopeStrength = clamp(weightedSlope, -1, 1);
  const historyConfidence = clamp(history.length / 20, 0, 1);
  const trendConfidence = clamp(trendStrength * historyConfidence, 0, 1);
  const modelConfidence = Number.isFinite(aiConfidence) ? aiConfidence : 0;
  const confidence = clamp((modelConfidence * 0.6) + (trendConfidence * 0.4), 0, 1);

  let status = 'NORMAL';
  if (riskScore >= 0.85 || (aiPrediction === 1 && modelConfidence >= 0.85)) {
    status = 'CRITICAL_FAILURE';
  } else if ((riskScore >= 0.65 || aiPrediction === 1) && slopeStrength > 0.12) {
    status = 'FAILURE_LIKELY';
  } else if (riskScore >= 0.4 && slopeStrength > 0.08) {
    status = 'WARNING';
  } else if (slopeStrength < -0.18 && riskScore < 0.55) {
    status = 'RECOVERING';
  } else if (Math.abs(slopeStrength) < 0.08 && riskScore < 0.35) {
    status = 'STABILIZING';
  }

  if (status === 'WARNING') alerts.unshift('Early warning: trends degrading');
  if (status === 'FAILURE_LIKELY') alerts.unshift('Failure likely soon');
  if (status === 'CRITICAL_FAILURE') alerts.unshift('Critical failure predicted');
  if (status === 'RECOVERING') alerts.unshift('System recovering - trend decreasing');
  if (status === 'STABILIZING') alerts.unshift('System stabilizing - trend steady');

  const etaCandidates = [];
  Object.keys(SENSOR_THRESHOLDS).forEach((key) => {
    const slope = metrics[key].slopePerMin;
    const latestValue = metrics[key].latest;
    if (!Number.isFinite(slope) || slope <= 0) return;
    const danger = SENSOR_THRESHOLDS[key].danger;
    if (!Number.isFinite(latestValue) || latestValue >= danger) return;
    const minutes = (danger - latestValue) / slope;
    if (Number.isFinite(minutes) && minutes > 0 && minutes < 240) {
      etaCandidates.push(minutes);
    }
  });
  let failureEtaMinutes = etaCandidates.length ? Math.round(Math.min(...etaCandidates)) : null;
  let tempEtaMinutes = null;
  const tempMetrics = metrics.temperature;
  if (tempMetrics && Number.isFinite(tempMetrics.latest) && Number.isFinite(tempMetrics.slopePerMin)) {
    if (tempMetrics.latest >= 32 && tempMetrics.slopePerMin > 0) {
      const temp = tempMetrics.latest;
      const slope = tempMetrics.slopePerMin;
      const dangerTemp = SENSOR_THRESHOLDS.temperature.danger;
      let range = null;

      if (temp >= 45) {
        range = { minTemp: 45, maxTemp: dangerTemp, minEta: 5, maxEta: 10 };
      } else if (temp >= 40) {
        range = { minTemp: 40, maxTemp: 45, minEta: 10, maxEta: 50 };
      } else if (temp >= 35) {
        range = { minTemp: 35, maxTemp: 40, minEta: 50, maxEta: 100 };
      } else if (temp >= 32) {
        range = { minTemp: 32, maxTemp: 35, minEta: 100, maxEta: 200 };
      }

      if (range) {
        const tempRatio = clamp((temp - range.minTemp) / Math.max(range.maxTemp - range.minTemp, 1), 0, 1);
        const slopeRatio = clamp(slope / 2, 0, 1);
        let eta = range.maxEta - ((range.maxEta - range.minEta) * tempRatio);
        eta -= (range.maxEta - range.minEta) * 0.2 * slopeRatio;
        tempEtaMinutes = Math.round(clamp(eta, range.minEta, range.maxEta));
      }
    }
  }

  const showTempEtaLabel = Number.isFinite(tempEtaMinutes)
    && tempEtaMinutes > 0
    && tempMetrics
    && Number.isFinite(tempMetrics.latest)
    && tempMetrics.latest >= 32
    && Number.isFinite(tempMetrics.slopePerMin)
    && tempMetrics.slopePerMin > 0;

  if (showTempEtaLabel) {
    failureEtaMinutes = tempEtaMinutes;
  }

  let failureEtaLabel = 'Monitoring trend';

  if (showTempEtaLabel) {
    failureEtaLabel = `Estimated to reach danger in ${tempEtaMinutes} min`;
  } else if (status === 'FAILURE_LIKELY' || status === 'CRITICAL_FAILURE') {
    failureEtaLabel = failureEtaMinutes != null
      ? `Failure likely within ${failureEtaMinutes} min`
      : 'Failure risk elevated';
  } else if (status === 'RECOVERING') {
    failureEtaLabel = 'System recovering';
  } else if (status === 'STABILIZING' || status === 'NORMAL') {
    failureEtaLabel = 'System stable';
  }

  const healthScore = Math.round(100 - (riskScore * 100));
  const riskProbability = Math.round(riskScore * 100);
  const overallTrend = slopeStrength > 0.2
    ? 'RISING'
    : slopeStrength < -0.2
      ? 'FALLING'
      : Math.abs(slopeStrength) < 0.08
        ? 'STABLE'
        : 'MODERATE';

  driverScores.sort((a, b) => b.score - a.score);
  const topDrivers = driverScores.slice(0, 2).map(item => item.key);
  const reasoning = [
    `Top drivers: ${topDrivers.length ? topDrivers.join(' + ') : 'stable baseline'}`,
    `Trend is ${overallTrend.toLowerCase()} with slope strength ${slopeStrength.toFixed(2)}`,
    `Model failure probability ${Math.round(modelRisk * 100)}%`
  ];

  return {
    status,
    confidence: Number(confidence.toFixed(3)),
    aiFailureProbability: Number.isFinite(modelRisk) ? Number(modelRisk.toFixed(3)) : null,
    riskScore: Number(riskScore.toFixed(3)),
    riskProbability,
    healthScore,
    failureEtaMinutes,
    failureEtaLabel,
    trendSummary: overallTrend,
    anomalyScore: Number(weightedAnomaly.toFixed(3)),
    metrics,
    alerts,
    reasoning,
    historyWindow: history.length
  };
}

function isEmergencyReading({ temperature, vibration, sound, current }) {
  const reasons = [];
  if (Number.isFinite(temperature) && temperature >= EMERGENCY_THRESHOLDS.temperature) {
    reasons.push('Temperature critical');
  }
  if (Number.isFinite(current) && current >= EMERGENCY_THRESHOLDS.current) {
    reasons.push('Current overload');
  }
  if (Number.isFinite(sound) && sound >= EMERGENCY_THRESHOLDS.sound) {
    reasons.push('Sound anomaly spike');
  }
  if (Number.isFinite(vibration) && vibration >= EMERGENCY_THRESHOLDS.vibration) {
    reasons.push('Severe vibration detected');
  }
  return { active: reasons.length > 0, reasons };
}

function shouldSendAlert(key, cooldownMs = 60000) {
  if (!key) return false;
  const now = Date.now();
  if (key !== lastAlertKey || now - lastAlertAt > cooldownMs) {
    lastAlertKey = key;
    lastAlertAt = now;
    return true;
  }
  return false;
}

async function sendTelegramAlert(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('[ALERT] Telegram config missing, skipping alert');
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message
    }, { timeout: 5000 });
  } catch (err) {
    console.error(`[ALERT] Telegram error: ${err.message}`);
  }
}

let lastAction = {
  action: 'CONTINUE',
  state: 'NORMAL',
  message: 'Monitoring',
  emergency: false,
  updatedAt: Date.now()
};
let lastAlertKey = '';
let lastAlertAt = 0;

// ===== Middleware =====
app.use(cors({
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ===== MongoDB Schema =====
const sensorDataSchema = new mongoose.Schema({
  temperature: { type: Number, required: true },
  vibration:   { type: Number, required: true },
  sound:       { type: Number, required: true },
  current:     { type: Number, required: true },
  prediction:  { type: Number, default: null },   // 0 = normal, 1 = failure
  confidence:  { type: Number, default: null },
  label:       { type: String, default: null },
  analysis: {
    status: { type: String, default: null },
    confidence: { type: Number, default: null },
    aiFailureProbability: { type: Number, default: null },
    riskScore: { type: Number, default: null },
    riskProbability: { type: Number, default: null },
    healthScore: { type: Number, default: null },
    failureEtaMinutes: { type: Number, default: null },
    failureEtaLabel: { type: String, default: null },
    trendSummary: { type: String, default: null },
    anomalyScore: { type: Number, default: null },
    metrics: { type: Object, default: null },
    alerts: { type: [String], default: [] },
    reasoning: { type: [String], default: [] },
    emergency: {
      active: { type: Boolean, default: false },
      reasons: { type: [String], default: [] }
    },
    action: { type: String, default: 'CONTINUE' },
    historyWindow: { type: Number, default: 0 }
  },
  timestamp:   { type: Date, default: Date.now }
});

sensorDataSchema.index({ timestamp: -1 });
const SensorData = mongoose.model('SensorData', sensorDataSchema);

// ===== MongoDB Connection =====
mongoose.connect(MONGO_URI)
  .then(() => console.log('[DB] Connected to MongoDB'))
  .catch(err => {
    console.error('[DB] MongoDB connection error:', err.message);
    console.log('[DB] Make sure MongoDB is running on localhost:27017');
  });

// ===== API Routes =====

// POST /api/data - Receive ESP32 data, store, get AI prediction
app.post('/api/data', async (req, res) => {
  try {
    const { temperature, vibration, sound, current } = req.body;

    // Validate
    if (temperature === undefined || vibration === undefined ||
        sound === undefined || current === undefined) {
      console.log('[API] Missing fields in request body');
      return res.status(400).json({ error: 'Missing required fields: temperature, vibration, sound, current' });
    }

    console.log(`[API] Received: temp=${temperature}, vib=${vibration}, sound=${sound}, curr=${current}`);

    // Get AI prediction
    let prediction = null;
    let confidence = null;
    let label = null;
    let failureProbability = null;

    try {
      const aiResponse = await axios.post(`${AI_SERVICE_URL}/predict`, {
        temperature, vibration, sound, current
      }, { timeout: 5000 });

      prediction = aiResponse.data.prediction;
      confidence = aiResponse.data.confidence;
      label = aiResponse.data.label;
      failureProbability = aiResponse.data.failure_probability;
      console.log(`[AI] Prediction: ${label} (confidence: ${(confidence * 100).toFixed(1)}%)`);
    } catch (aiErr) {
      console.error(`[AI] Service error: ${aiErr.message}`);
      console.log('[AI] Continuing without prediction...');
    }

    const now = new Date();
    const recent = await SensorData.find()
      .sort({ timestamp: -1 })
      .limit(HISTORY_LIMIT - 1)
      .lean();
    const history = [...recent.reverse(), {
      temperature,
      vibration,
      sound,
      current,
      timestamp: now
    }];

    const analysis = buildAnalysis(history, prediction, confidence, failureProbability);
    const emergencyCheck = isEmergencyReading({ temperature, vibration, sound, current });
    const requestEmergency = req.body?.emergency === true;
    const emergencyReasons = [
      ...emergencyCheck.reasons,
      ...(Array.isArray(req.body?.emergencyReasons) ? req.body.emergencyReasons : [])
    ];
    const isEmergency = emergencyCheck.active || requestEmergency;

    if (isEmergency) {
      analysis.status = 'CRITICAL_FAILURE';
      analysis.failureEtaLabel = 'Emergency shutdown triggered';
    }

    analysis.emergency = {
      active: isEmergency,
      reasons: emergencyReasons
    };
    analysis.action = isEmergency ? 'STOP_MOTOR' : 'CONTINUE';

    // Store in MongoDB
    const sensorEntry = new SensorData({
      temperature, vibration, sound, current,
      prediction, confidence, label,
      analysis,
      timestamp: now
    });
    await sensorEntry.save();
    console.log(`[DB] Data saved (id: ${sensorEntry._id})`);

    const actionMessage = isEmergency
      ? 'Critical motor failure detected! Motor stopped automatically.'
      : analysis.failureEtaLabel;

    lastAction = {
      action: analysis.action,
      state: analysis.status,
      message: actionMessage,
      emergency: isEmergency,
      updatedAt: Date.now()
    };

    const tempMetrics = analysis.metrics?.temperature;
    const tempRising = tempMetrics
      && Number.isFinite(tempMetrics.latest)
      && tempMetrics.latest >= 32
      && Number.isFinite(tempMetrics.slopePerMin)
      && tempMetrics.slopePerMin > 0
      && Number.isFinite(analysis.failureEtaMinutes);

    if (isEmergency && shouldSendAlert('EMERGENCY')) {
      await sendTelegramAlert(`🚨 Critical motor failure detected! Motor stopped automatically. Reasons: ${emergencyReasons.join(', ') || 'Sensor spike'}`);
    } else if (analysis.status === 'FAILURE_LIKELY' && shouldSendAlert('FAILURE_LIKELY')) {
      await sendTelegramAlert(`⚠️ Failure likely within ${analysis.failureEtaMinutes ?? 'N/A'} minutes. ${analysis.failureEtaLabel}`);
    } else if (tempRising && shouldSendAlert('TEMP_RISING')) {
      await sendTelegramAlert(`⚠️ ${analysis.failureEtaLabel}`);
    } else if (analysis.status === 'WARNING' && shouldSendAlert('WARNING')) {
      await sendTelegramAlert(`⚠️ Early warning: system trends degrading. ${analysis.failureEtaLabel}`);
    }

    // Return response to ESP32
    res.json({
      status: 'ok',
      prediction: prediction,
      confidence: confidence,
      label: label,
      analysis,
      action: analysis.action,
      id: sensorEntry._id
    });

  } catch (err) {
    console.error('[API] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data - Return latest sensor data
app.get('/api/data', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const data = await SensorData.find()
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    console.log(`[API] Returning ${data.length} records`);
    res.json(data);
  } catch (err) {
    console.error('[API] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data/latest - Return single latest reading
app.get('/api/data/latest', async (req, res) => {
  try {
    const latest = await SensorData.findOne().sort({ timestamp: -1 }).lean();
    if (!latest) {
      return res.json({ message: 'No data yet' });
    }
    res.json(latest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats - Return statistics
app.get('/api/stats', async (req, res) => {
  try {
    const total = await SensorData.countDocuments();
    const failures = await SensorData.countDocuments({ prediction: 1 });
    const latest = await SensorData.findOne().sort({ timestamp: -1 }).lean();

    // Get averages from last 100 readings
    const recent = await SensorData.find().sort({ timestamp: -1 }).limit(100).lean();
    let avgTemp = 0, avgSound = 0, avgCurrent = 0;
    if (recent.length > 0) {
      avgTemp = recent.reduce((s, d) => s + d.temperature, 0) / recent.length;
      avgSound = recent.reduce((s, d) => s + d.sound, 0) / recent.length;
      avgCurrent = recent.reduce((s, d) => s + d.current, 0) / recent.length;
    }

    res.json({
      totalReadings: total,
      totalFailures: failures,
      failureRate: total > 0 ? ((failures / total) * 100).toFixed(1) + '%' : '0%',
      averages: {
        temperature: parseFloat(avgTemp.toFixed(1)),
        sound: parseInt(avgSound),
        current: parseFloat(avgCurrent.toFixed(2))
      },
      healthScore: latest?.analysis?.healthScore ?? null,
      riskProbability: latest?.analysis?.riskProbability ?? null,
      latest
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/action - Return latest action for ESP32
app.get('/api/action', (req, res) => {
  res.json(lastAction);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

// Root endpoint for quick browser checks (avoids 404 at /)
app.get('/', (req, res) => {
  res.json({
    service: 'predictive-maintenance-backend',
    status: 'ok',
    health: '/api/health'
  });
});

// Optional devtools probe endpoint seen in some browser contexts
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  res.status(204).end();
});

// Root handler
app.get('/', (req, res) => {
  res.json({ status: 'Backend running', port: 5000 });
});

// Browser favicon request handler (prevents console 404 at localhost:5000/favicon.ico)
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// ===== Start Server =====
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} (0.0.0.0)`);
});
