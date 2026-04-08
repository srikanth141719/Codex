const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Server } = require('socket.io');
const { pool } = require('./config/db');
const { connectRabbitMQ } = require('./services/publisher');
const { setupWebSocket } = require('./websocket');

// Routes
const authRoutes = require('./routes/auth');
const contestRoutes = require('./routes/contests');
const problemRoutes = require('./routes/problems');
const testcaseRoutes = require('./routes/testcases');
const submissionRoutes = require('./routes/submissions');

const app = express();
const server = http.createServer(app);

// Socket.io setup
// CORS origins — allow both production and dev
const CORS_ORIGINS = [
  process.env.CORS_ORIGIN || 'http://localhost',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const io = new Server(server, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// Make io accessible to routes
app.set('io', io);

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: CORS_ORIGINS,
  credentials: true,
}));
app.use(morgan('short'));
app.use(express.json({ limit: '5mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/contests', contestRoutes);
app.use('/api/problems', problemRoutes);
app.use('/api/testcases', testcaseRoutes);
app.use('/api/submissions', submissionRoutes);

// Leaderboard API (public)
const { getLeaderboard } = require('./services/leaderboard');
const { authMiddleware } = require('./middleware/auth');

app.get('/api/leaderboard/:contestId', authMiddleware, async (req, res) => {
  try {
    const leaderboard = await getLeaderboard(req.params.contestId);
    res.json({ leaderboard });
  } catch (err) {
    console.error('Leaderboard fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start
const PORT = process.env.PORT || 3001;

async function start() {
  try {
    // Test PostgreSQL
    await pool.query('SELECT 1');
    console.log('✓ PostgreSQL connected');

    // Connect RabbitMQ
    await connectRabbitMQ();

    // Setup WebSocket
    setupWebSocket(io);

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 Codex Backend running on port ${PORT}`);
      console.log(`   Health: http://localhost:${PORT}/api/health\n`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();

module.exports = { app, server, io };
