const express = require('express');
const { query } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/contests — Create a contest (any authenticated user)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description, start_time, end_time, allowlist } = req.body;

    if (!title || !start_time || !end_time) {
      return res.status(400).json({ error: 'Title, start_time, and end_time are required' });
    }

    const start = new Date(start_time);
    const end = new Date(end_time);
    if (end <= start) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    // Normalize allowlist emails to lowercase, always include the creator
    let emails = Array.isArray(allowlist) ? allowlist.map(e => e.toLowerCase().trim()).filter(Boolean) : [];
    if (!emails.includes(req.user.email.toLowerCase())) {
      emails.push(req.user.email.toLowerCase());
    }

    const result = await query(
      `INSERT INTO contests (title, description, start_time, end_time, creator_id, allowlist)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [title, description || '', start, end, req.user.id, emails]
    );

    res.status(201).json({ contest: result.rows[0] });
  } catch (err) {
    console.error('Create contest error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/contests — List contests visible to the user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*, u.username as creator_name,
              (SELECT COUNT(*) FROM problems WHERE contest_id = c.id) as problem_count
       FROM contests c
       JOIN users u ON c.creator_id = u.id
       WHERE c.creator_id = $1 OR $2 = ANY(c.allowlist)
       ORDER BY c.start_time DESC`,
      [req.user.id, req.user.email.toLowerCase()]
    );

    res.json({ contests: result.rows });
  } catch (err) {
    console.error('List contests error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/contests/:id — Get contest detail (with problems)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const contestResult = await query(
      `SELECT c.*, u.username as creator_name
       FROM contests c
       JOIN users u ON c.creator_id = u.id
       WHERE c.id = $1`,
      [id]
    );

    if (contestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Contest not found' });
    }

    const contest = contestResult.rows[0];

    // Check access: creator or in allowlist
    const userEmail = req.user.email.toLowerCase();
    if (contest.creator_id !== req.user.id && !contest.allowlist.includes(userEmail)) {
      return res.status(403).json({ error: 'You are not allowed to view this contest' });
    }

    // Get problems
    const problemsResult = await query(
      `SELECT id, contest_id, title, description, sample_input, sample_output, sort_order
       FROM problems WHERE contest_id = $1 ORDER BY sort_order ASC, created_at ASC`,
      [id]
    );

    // Get sample testcases for each problem (non-hidden ones for regular users)
    const isCreator = contest.creator_id === req.user.id;
    const problems = [];
    for (const prob of problemsResult.rows) {
      let tcQuery;
      if (isCreator) {
        tcQuery = await query(
          'SELECT * FROM testcases WHERE problem_id = $1 ORDER BY sort_order ASC',
          [prob.id]
        );
      } else {
        tcQuery = await query(
          'SELECT id, problem_id, input, expected_output, is_sample, is_hidden, sort_order FROM testcases WHERE problem_id = $1 AND is_sample = true ORDER BY sort_order ASC',
          [prob.id]
        );
      }
      problems.push({ ...prob, testcases: tcQuery.rows });
    }

    // Check if user has accepted submissions
    const acceptedResult = await query(
      `SELECT DISTINCT problem_id FROM submissions
       WHERE contest_id = $1 AND user_id = $2 AND verdict = 'Accepted'`,
      [id, req.user.id]
    );
    const acceptedProblems = acceptedResult.rows.map(r => r.problem_id);

    res.json({
      contest: { ...contest, problems },
      isCreator: contest.creator_id === req.user.id,
      acceptedProblems,
    });
  } catch (err) {
    console.error('Get contest error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/contests/:id — Update contest (creator only)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, start_time, end_time, allowlist } = req.body;

    // Verify ownership
    const existing = await query('SELECT creator_id FROM contests WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Contest not found' });
    }
    if (existing.rows[0].creator_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the contest creator can edit this contest' });
    }

    const fields = [];
    const values = [];
    let idx = 1;

    if (title) { fields.push(`title = $${idx++}`); values.push(title); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
    if (start_time) { fields.push(`start_time = $${idx++}`); values.push(new Date(start_time)); }
    if (end_time) { fields.push(`end_time = $${idx++}`); values.push(new Date(end_time)); }
    if (allowlist) {
      let emails = allowlist.map(e => e.toLowerCase().trim()).filter(Boolean);
      if (!emails.includes(req.user.email.toLowerCase())) {
        emails.push(req.user.email.toLowerCase());
      }
      fields.push(`allowlist = $${idx++}`);
      values.push(emails);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const result = await query(
      `UPDATE contests SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    res.json({ contest: result.rows[0] });
  } catch (err) {
    console.error('Update contest error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/contests/:id — Delete contest (creator only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await query('SELECT creator_id FROM contests WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Contest not found' });
    }
    if (existing.rows[0].creator_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the contest creator can delete this contest' });
    }
    await query('DELETE FROM contests WHERE id = $1', [id]);
    res.json({ message: 'Contest deleted' });
  } catch (err) {
    console.error('Delete contest error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
