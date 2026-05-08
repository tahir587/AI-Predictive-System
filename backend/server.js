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

    try {
      const aiResponse = await axios.post(`${AI_SERVICE_URL}/predict`, {
        temperature, vibration, sound, current
      }, { timeout: 5000 });

      prediction = aiResponse.data.prediction;
      confidence = aiResponse.data.confidence;
      label = aiResponse.data.label;
      console.log(`[AI] Prediction: ${label} (confidence: ${(confidence * 100).toFixed(1)}%)`);
    } catch (aiErr) {
      console.error(`[AI] Service error: ${aiErr.message}`);
      console.log('[AI] Continuing without prediction...');
    }

    // Store in MongoDB
    const sensorEntry = new SensorData({
      temperature, vibration, sound, current,
      prediction, confidence, label
    });
    await sensorEntry.save();
    console.log(`[DB] Data saved (id: ${sensorEntry._id})`);

    // Return response to ESP32
    res.json({
      status: 'ok',
      prediction: prediction,
      confidence: confidence,
      label: label,
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
      latest
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
app.listen(5000, "0.0.0.0", () => {
  console.log("Server running on port 5000 (0.0.0.0)");
});
