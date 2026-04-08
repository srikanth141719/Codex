const express = require('express');
const { query } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/contests/:contestId/problems — Add problem (creator only)
router.post('/:contestId', authMiddleware, async (req, res) => {
  try {
    const { contestId } = req.params;
    const { title, description, constraints, sample_input, sample_output, sort_order } = req.body;

    // Verify contest ownership
    const contest = await query('SELECT creator_id FROM contests WHERE id = $1', [contestId]);
    if (contest.rows.length === 0) {
      return res.status(404).json({ error: 'Contest not found' });
    }
    if (contest.rows[0].creator_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the contest creator can add problems' });
    }

    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    // Get next sort order if not provided
    let order = sort_order;
    if (order === undefined || order === null) {
      const countResult = await query('SELECT COUNT(*) FROM problems WHERE contest_id = $1', [contestId]);
      order = parseInt(countResult.rows[0].count);
    }

    const result = await query(
      `INSERT INTO problems (contest_id, title, description, constraints, sample_input, sample_output, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [contestId, title, description, constraints || '', sample_input || '', sample_output || '', order]
    );

    res.status(201).json({ problem: result.rows[0] });
  } catch (err) {
    console.error('Create problem error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/problems/:id — Update problem (creator only)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, constraints, sample_input, sample_output, sort_order } = req.body;

    // Verify ownership via join
    const check = await query(
      `SELECT c.creator_id FROM problems p
       JOIN contests c ON p.contest_id = c.id
       WHERE p.id = $1`,
      [id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }
    if (check.rows[0].creator_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the contest creator can edit problems' });
    }

    const fields = [];
    const values = [];
    let idx = 1;

    if (title) { fields.push(`title = $${idx++}`); values.push(title); }
    if (description) { fields.push(`description = $${idx++}`); values.push(description); }
    if (constraints !== undefined) { fields.push(`constraints = $${idx++}`); values.push(constraints); }
    if (sample_input !== undefined) { fields.push(`sample_input = $${idx++}`); values.push(sample_input); }
    if (sample_output !== undefined) { fields.push(`sample_output = $${idx++}`); values.push(sample_output); }
    if (sort_order !== undefined) { fields.push(`sort_order = $${idx++}`); values.push(sort_order); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const result = await query(
      `UPDATE problems SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    res.json({ problem: result.rows[0] });
  } catch (err) {
    console.error('Update problem error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/problems/:id — Delete problem (creator only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const check = await query(
      `SELECT c.creator_id FROM problems p JOIN contests c ON p.contest_id = c.id WHERE p.id = $1`,
      [id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Problem not found' });
    if (check.rows[0].creator_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    await query('DELETE FROM problems WHERE id = $1', [id]);
    res.json({ message: 'Problem deleted' });
  } catch (err) {
    console.error('Delete problem error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
