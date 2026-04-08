const express = require('express');
const { query } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { publishSubmission } = require('../services/publisher');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// POST /api/submissions — Submit code for judging
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { problem_id, contest_id, language, code, submission_type } = req.body;

    if (!problem_id || !contest_id || !language || !code) {
      return res.status(400).json({ error: 'problem_id, contest_id, language, and code are required' });
    }

    if (!['cpp', 'python', 'java'].includes(language)) {
      return res.status(400).json({ error: 'Unsupported language. Use cpp, python, or java.' });
    }

    // Verify contest exists and user has access
    const contestResult = await query(
      'SELECT * FROM contests WHERE id = $1',
      [contest_id]
    );
    if (contestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Contest not found' });
    }

    const contest = contestResult.rows[0];
    const userEmail = req.user.email.toLowerCase();

    // Check allowlist
    const isPublic = !contest.allowlist || contest.allowlist.length === 0;
    if (!isPublic && contest.creator_id !== req.user.id && !contest.allowlist.includes(userEmail)) {
      return res.status(403).json({ error: 'You are not allowed in this contest' });
    }

    // Check time boundaries
    const now = new Date();
    if (now < new Date(contest.start_time)) {
      return res.status(403).json({ error: 'Contest has not started yet' });
    }
    const hasEnded = now > new Date(contest.end_time);

    // Determine submission type:
    // - Default REAL during contest
    // - PRACTICE if contest ended (upsolving)
    // - VIRTUAL allowed explicitly (never affects official leaderboard)
    let st = submission_type ? String(submission_type).toUpperCase() : null;
    if (st && !['REAL', 'PRACTICE', 'VIRTUAL'].includes(st)) {
      return res.status(400).json({ error: 'submission_type must be REAL, PRACTICE, or VIRTUAL' });
    }
    if (!st) {
      st = hasEnded ? 'PRACTICE' : 'REAL';
    }
    if (hasEnded && st === 'REAL') {
      // Prevent accidental REAL after contest
      st = 'PRACTICE';
    }

    // Verify problem belongs to contest
    const problemResult = await query(
      'SELECT id FROM problems WHERE id = $1 AND contest_id = $2',
      [problem_id, contest_id]
    );
    if (problemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Problem not found in this contest' });
    }

    // Create submission record
    const submissionResult = await query(
      `INSERT INTO submissions (user_id, problem_id, contest_id, language, code, verdict, submission_type)
       VALUES ($1, $2, $3, $4, $5, 'Pending', $6) RETURNING *`,
      [req.user.id, problem_id, contest_id, language, code, st]
    );

    const submission = submissionResult.rows[0];

    // Publish to RabbitMQ for async processing
    publishSubmission({
      submission_id: submission.id,
      user_id: req.user.id,
      username: req.user.username,
      problem_id,
      contest_id,
      language,
      code,
      contest_start_time: contest.start_time,
      contest_end_time: contest.end_time,
      submission_type: st,
    });

    res.status(201).json({ submission });
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/submissions/run — Run code against sample/custom testcases (not recorded)
router.post('/run', authMiddleware, async (req, res) => {
  try {
    const { problem_id, contest_id, language, code, custom_input } = req.body;

    if (!language || !code) {
      return res.status(400).json({ error: 'language and code are required' });
    }

    if (!['cpp', 'python', 'java'].includes(language)) {
      return res.status(400).json({ error: 'Unsupported language' });
    }

    // Ephemeral run: do NOT write to submissions table.
    // We still validate contest access if contest_id is provided.
    if (contest_id) {
      const contestResult = await query('SELECT * FROM contests WHERE id = $1', [contest_id]);
      if (contestResult.rows.length === 0) return res.status(404).json({ error: 'Contest not found' });
      const contest = contestResult.rows[0];
      const userEmail = req.user.email.toLowerCase();
      const isPublic = !contest.allowlist || contest.allowlist.length === 0;
      if (!isPublic && contest.creator_id !== req.user.id && !contest.allowlist.includes(userEmail)) {
        return res.status(403).json({ error: 'You are not allowed in this contest' });
      }
      const now = new Date();
      if (now < new Date(contest.start_time)) {
        return res.status(403).json({ error: 'Contest has not started yet' });
      }
      // Runs are allowed even after contest end (for practice/debugging)
    }

    const run_id = uuidv4();

    // Publish to queue with run flag
    publishSubmission({
      run_id,
      user_id: req.user.id,
      username: req.user.username,
      problem_id,
      contest_id,
      language,
      code,
      is_run: true,
      custom_input: custom_input || null,
    });

    res.status(201).json({ run_id });
  } catch (err) {
    console.error('Run error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/submissions/:id — Get submission detail
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM submissions WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const submission = result.rows[0];
    // Users can only view their own submissions, or contest creator can view all
    if (submission.user_id !== req.user.id) {
      const contestCheck = await query('SELECT creator_id FROM contests WHERE id = $1', [submission.contest_id]);
      if (contestCheck.rows.length === 0 || contestCheck.rows[0].creator_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    res.json({ submission });
  } catch (err) {
    console.error('Get submission error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/submissions/problem/:problemId — Get user's submissions for a problem
router.get('/problem/:problemId', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, user_id, problem_id, contest_id, language, verdict, runtime_ms, memory_kb, 
              passed_count, total_count, submitted_at
       FROM submissions
       WHERE problem_id = $1 AND user_id = $2
       ORDER BY submitted_at DESC`,
      [req.params.problemId, req.user.id]
    );

    res.json({ submissions: result.rows });
  } catch (err) {
    console.error('Get problem submissions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/submissions/contest/:contestId — Get all submissions for a contest (creator only for all, user for own)
router.get('/contest/:contestId', authMiddleware, async (req, res) => {
  try {
    const contestCheck = await query('SELECT creator_id FROM contests WHERE id = $1', [req.params.contestId]);

    let result;
    if (contestCheck.rows.length > 0 && contestCheck.rows[0].creator_id === req.user.id) {
      // Creator can see all
      result = await query(
        `SELECT s.*, u.username FROM submissions s
         JOIN users u ON s.user_id = u.id
         WHERE s.contest_id = $1 ORDER BY s.submitted_at DESC`,
        [req.params.contestId]
      );
    } else {
      // Regular user sees only their own
      result = await query(
        `SELECT * FROM submissions
         WHERE contest_id = $1 AND user_id = $2 ORDER BY submitted_at DESC`,
        [req.params.contestId, req.user.id]
      );
    }

    res.json({ submissions: result.rows });
  } catch (err) {
    console.error('Get contest submissions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
