// Simple Express server for Vercel
const express = require('express');
const cors = require('cors');

const app = express();

// Enable CORS for all routes
app.use(cors({
  origin: true,
  credentials: true
}));

// Parse JSON bodies
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    message: 'API is working!'
  });
});

// Auth endpoints
app.post('/auth/register', (req, res) => {
  res.json({ 
    message: 'Register endpoint working',
    method: req.method,
    body: req.body
  });
});

app.post('/auth/login', (req, res) => {
  res.json({ 
    message: 'Login endpoint working',
    method: req.method,
    body: req.body
  });
});

// Catch all other routes
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl 
  });
});

module.exports = app;