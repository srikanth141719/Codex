const express = require('express');
const { query } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/problems/:problemId/testcases — Add testcase (creator only)
router.post('/:problemId', authMiddleware, async (req, res) => {
  try {
    const { problemId } = req.params;
    const { input, expected_output, is_sample, is_hidden, sort_order } = req.body;

    // Verify ownership
    const check = await query(
      `SELECT c.creator_id FROM problems p
       JOIN contests c ON p.contest_id = c.id
       WHERE p.id = $1`,
      [problemId]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Problem not found' });
    if (check.rows[0].creator_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    if (input === undefined || expected_output === undefined) {
      return res.status(400).json({ error: 'Input and expected_output are required' });
    }

    let order = sort_order;
    if (order === undefined || order === null) {
      const countResult = await query('SELECT COUNT(*) FROM testcases WHERE problem_id = $1', [problemId]);
      order = parseInt(countResult.rows[0].count);
    }

    const result = await query(
      `INSERT INTO testcases (problem_id, input, expected_output, is_sample, is_hidden, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [problemId, input, expected_output, is_sample || false, is_hidden !== false, order]
    );

    res.status(201).json({ testcase: result.rows[0] });
  } catch (err) {
    console.error('Create testcase error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/testcases/:id — Update testcase (creator only)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { input, expected_output, is_sample, is_hidden, sort_order } = req.body;

    const check = await query(
      `SELECT c.creator_id FROM testcases tc
       JOIN problems p ON tc.problem_id = p.id
       JOIN contests c ON p.contest_id = c.id
       WHERE tc.id = $1`,
      [id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Testcase not found' });
    if (check.rows[0].creator_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const fields = [];
    const values = [];
    let idx = 1;

    if (input !== undefined) { fields.push(`input = $${idx++}`); values.push(input); }
    if (expected_output !== undefined) { fields.push(`expected_output = $${idx++}`); values.push(expected_output); }
    if (is_sample !== undefined) { fields.push(`is_sample = $${idx++}`); values.push(is_sample); }
    if (is_hidden !== undefined) { fields.push(`is_hidden = $${idx++}`); values.push(is_hidden); }
    if (sort_order !== undefined) { fields.push(`sort_order = $${idx++}`); values.push(sort_order); }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(id);
    const result = await query(
      `UPDATE testcases SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    res.json({ testcase: result.rows[0] });
  } catch (err) {
    console.error('Update testcase error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/testcases/:id — Delete testcase (creator only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const check = await query(
      `SELECT c.creator_id FROM testcases tc
       JOIN problems p ON tc.problem_id = p.id
       JOIN contests c ON p.contest_id = c.id
       WHERE tc.id = $1`,
      [id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Testcase not found' });
    if (check.rows[0].creator_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    await query('DELETE FROM testcases WHERE id = $1', [id]);
    res.json({ message: 'Testcase deleted' });
  } catch (err) {
    console.error('Delete testcase error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
