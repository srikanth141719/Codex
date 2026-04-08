const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Server } = require('socket.io');
const { pool } = require('./config/db');
const { connectRabbitMQ } = require('./services/publisher');
const { runMigrations } = require('./services/migrate');
const { setupWebSocket } = require('./websocket');

// Routes
const authRoutes = require('./routes/auth');
const contestRoutes = require('./routes/contests');
const problemRoutes = require('./routes/problems');
const testcaseRoutes = require('./routes/testcases');
const submissionRoutes = require('./routes/submissions');
const runRoutes = require('./routes/runs');

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
app.use('/api/runs', runRoutes);

// Leaderboard API (public)
const { getLeaderboard } = require('./services/leaderboard');
const { getLeaderboardAt } = require('./services/leaderboard_db');
const { authMiddleware } = require('./middleware/auth');

app.get('/api/leaderboard/:contestId', authMiddleware, async (req, res) => {
  try {
    const { relative_timestamp } = req.query;

    // Virtual time-travel: if relative_timestamp is provided, reconstruct from Postgres
    // using cutoff = contest_start_time + relative_timestamp(ms).
    if (relative_timestamp !== undefined) {
      const contestRes = await pool.query('SELECT start_time FROM contests WHERE id = $1', [req.params.contestId]);
      if (contestRes.rows.length === 0) return res.status(404).json({ error: 'Contest not found' });
      const start = new Date(contestRes.rows[0].start_time);

      let cutoff;
      const raw = String(relative_timestamp);
      // Accept ISO datetime, unix ms timestamp, or ms offset from contest start.
      if (raw.includes('T') || raw.includes('-')) {
        cutoff = new Date(raw);
      } else {
        const n = Number(raw);
        if (!Number.isFinite(n)) return res.status(400).json({ error: 'relative_timestamp must be ISO datetime or a number' });
        // If n looks like an epoch ms, use it; otherwise treat as offset-ms from start.
        cutoff = n > 100000000000 ? new Date(n) : new Date(start.getTime() + n);
      }

      const leaderboard = await getLeaderboardAt(req.params.contestId, cutoff);
      return res.json({ leaderboard, mode: 'time_travel', cutoff: cutoff.toISOString() });
    }

    // Default: Redis live leaderboard
    const leaderboard = await getLeaderboard(req.params.contestId);
    res.json({ leaderboard, mode: 'live' });
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

    // Apply schema migrations (safe no-op if already applied)
    await runMigrations(pool);

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
