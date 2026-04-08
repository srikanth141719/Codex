const { getLeaderboard } = require('../services/leaderboard');

function setupWebSocket(io) {
  // Authentication middleware for Socket.io
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'codex_jwt_super_secret_key_2026');
        socket.user = decoded;
      } catch (err) {
        // Allow connection even without valid token for public leaderboard viewing
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id} (user: ${socket.user?.username || 'anonymous'})`);

    // Join a contest room
    socket.on('join:contest', async (contestId) => {
      socket.join(`contest:${contestId}`);
      console.log(`${socket.user?.username || socket.id} joined contest room: ${contestId}`);

      // Send current leaderboard state
      try {
        const leaderboard = await getLeaderboard(contestId);
        socket.emit('leaderboard:update', { contestId, leaderboard });
      } catch (err) {
        console.error('Error sending initial leaderboard:', err);
      }
    });

    // Leave a contest room
    socket.on('leave:contest', (contestId) => {
      socket.leave(`contest:${contestId}`);
    });

    // Worker events — relay submission results to clients
    socket.on('worker:submission_result', (data) => {
      console.log(`Worker result: ${data.is_run ? `run ${data.run_id}` : `submission ${data.submission_id}`} → ${data.verdict}`);
      // Broadcast to all clients (filtered client-side by user_id)
      io.emit('submission:status', data);
    });

    // Worker events — relay leaderboard updates
    socket.on('worker:leaderboard_update', (data) => {
      console.log(`Leaderboard update for contest ${data.contest_id}`);
      io.to(`contest:${data.contest_id}`).emit('leaderboard:update', {
        contestId: data.contest_id,
        leaderboard: data.leaderboard,
      });
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  console.log('✓ WebSocket service initialized');
}

/**
 * Emit a submission status update to a specific user
 */
function emitSubmissionStatus(io, userId, submission) {
  io.emit('submission:status', { userId, submission });
}

/**
 * Broadcast leaderboard update to all clients in a contest room
 */
function emitLeaderboardUpdate(io, contestId, leaderboard) {
  io.to(`contest:${contestId}`).emit('leaderboard:update', { contestId, leaderboard });
}

module.exports = { setupWebSocket, emitSubmissionStatus, emitLeaderboardUpdate };
