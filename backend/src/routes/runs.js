const express = require('express');
const { redis } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const RUN_RESULT_KEY = (runId) => `run:${runId}`;

// GET /api/runs/:runId — fetch ephemeral run results (TTL-backed)
router.get('/:runId', authMiddleware, async (req, res) => {
  try {
    const runId = req.params.runId;
    const raw = await redis.get(RUN_RESULT_KEY(runId));
    if (!raw) return res.status(404).json({ error: 'Run result not found (expired or pending)' });
    const parsed = JSON.parse(raw);
    if (parsed.user_id && parsed.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json({ run: parsed });
  } catch (err) {
    console.error('Run result fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

