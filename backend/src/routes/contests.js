const express = require('express');
const { query } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/contests — Create a contest (any authenticated user)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description, start_time, end_time, allowlist, problems } = req.body;

    if (!title || !start_time || !end_time) {
      return res.status(400).json({ error: 'Title, start_time, and end_time are required' });
    }

    const start = new Date(start_time);
    const end = new Date(end_time);
    if (end <= start) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    // Public vs private:
    // - If allowlist is empty -> public contest (no restrictions)
    // - If allowlist has entries -> private contest (creator always included)
    let emails = Array.isArray(allowlist)
      ? allowlist.map(e => String(e).toLowerCase().trim()).filter(Boolean)
      : [];
    if (emails.length > 0 && !emails.includes(req.user.email.toLowerCase())) {
      emails.push(req.user.email.toLowerCase());
    }

    await query('BEGIN');
    const result = await query(
      `INSERT INTO contests (title, description, start_time, end_time, creator_id, allowlist)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [title, description || '', start, end, req.user.id, emails]
    );
    const contest = result.rows[0];

    // Hotfix: accept difficulty + solution payload during contest creation.
    if (Array.isArray(problems)) {
      for (let i = 0; i < problems.length; i++) {
        const p = problems[i] || {};
        if (!p.title || !p.description) {
          await query('ROLLBACK');
          return res.status(400).json({ error: `Problem ${i + 1} must include title and description` });
        }
        const difficulty = p.difficulty || 'Easy';
        if (!['Easy', 'Medium', 'Hard'].includes(difficulty)) {
          await query('ROLLBACK');
          return res.status(400).json({ error: `Problem ${i + 1} difficulty must be Easy, Medium, or Hard` });
        }

        const insertedProblem = await query(
          `INSERT INTO problems (contest_id, title, description, constraints, sample_input, sample_output, difficulty, solution, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            contest.id,
            p.title,
            p.description,
            p.constraints || '',
            p.sample_input || '',
            p.sample_output || '',
            difficulty,
            p.solution || null,
            p.sort_order ?? i,
          ]
        );

        const problemId = insertedProblem.rows[0].id;
        const tcs = Array.isArray(p.testcases) ? p.testcases : [];
        for (let j = 0; j < tcs.length; j++) {
          const tc = tcs[j] || {};
          await query(
            `INSERT INTO testcases (problem_id, input, expected_output, is_sample, is_hidden, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              problemId,
              tc.input ?? '',
              tc.expected_output ?? '',
              tc.is_sample === true,
              tc.is_hidden !== false,
              tc.sort_order ?? j,
            ]
          );
        }
      }
    }

    await query('COMMIT');
    res.status(201).json({ contest });
  } catch (err) {
    try { await query('ROLLBACK'); } catch (e) {}
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
       WHERE c.creator_id = $1
          OR COALESCE(array_length(c.allowlist, 1), 0) = 0
          OR $2 = ANY(c.allowlist)
       ORDER BY c.start_time DESC`,
      [req.user.id, req.user.email.toLowerCase()]
    );

    const contests = result.rows;
    const now = new Date();
    const live = [];
    const upcoming = [];
    const past = [];

    for (const c of contests) {
      const start = new Date(c.start_time);
      const end = new Date(c.end_time);
      if (now >= start && now <= end) {
        live.push(c);
      } else if (now < start) {
        upcoming.push(c);
      } else {
        past.push(c);
      }
    }

    res.json({
      contests,
      groups: { live, upcoming, past },
    });
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
    const isPublic = !contest.allowlist || contest.allowlist.length === 0;
    if (!isPublic && contest.creator_id !== req.user.id && !contest.allowlist.includes(userEmail)) {
      return res.status(403).json({ error: 'You are not allowed to view this contest' });
    }

    // Get problems
    const problemsResult = await query(
      `SELECT id, contest_id, title, description, constraints, sample_input, sample_output,
              difficulty, solution, sort_order
       FROM problems WHERE contest_id = $1 ORDER BY sort_order ASC, created_at ASC`,
      [id]
    );

    // Get sample testcases for each problem (non-hidden ones for regular users)
    const isCreator = contest.creator_id === req.user.id;
    const now = new Date();
    const contestEnded = now > new Date(contest.end_time);
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
      let safeProb = { ...prob, testcases: tcQuery.rows };
      // Strip solution field for non-creators while contest is live/upcoming
      if (!isCreator && !contestEnded) {
        delete safeProb.solution;
      }
      problems.push(safeProb);
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
    const { title, description, start_time, end_time, allowlist, problems } = req.body;

    // Verify ownership
    const existing = await query('SELECT creator_id FROM contests WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Contest not found' });
    }
    if (existing.rows[0].creator_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the contest creator can edit this contest' });
    }

    // If problems payload exists, treat as Global Save Changes (single transactional update).
    if (Array.isArray(problems)) {
      await query('BEGIN');

      const contestFields = [];
      const contestValues = [];
      let idx = 1;

      if (title !== undefined) { contestFields.push(`title = $${idx++}`); contestValues.push(title); }
      if (description !== undefined) { contestFields.push(`description = $${idx++}`); contestValues.push(description); }
      if (start_time !== undefined) { contestFields.push(`start_time = $${idx++}`); contestValues.push(new Date(start_time)); }
      if (end_time !== undefined) { contestFields.push(`end_time = $${idx++}`); contestValues.push(new Date(end_time)); }
      if (allowlist !== undefined) {
        let emails = Array.isArray(allowlist)
          ? allowlist.map(e => String(e).toLowerCase().trim()).filter(Boolean)
          : [];
        // Only enforce creator inclusion when private
        if (emails.length > 0 && !emails.includes(req.user.email.toLowerCase())) {
          emails.push(req.user.email.toLowerCase());
        }
        contestFields.push(`allowlist = $${idx++}`);
        contestValues.push(emails);
      }

      if (contestFields.length > 0) {
        contestValues.push(id);
        await query(
          `UPDATE contests SET ${contestFields.join(', ')} WHERE id = $${idx}`,
          contestValues
        );
      }

      // Problems snapshot apply: upsert + delete removed
      const existingProblems = await query('SELECT id FROM problems WHERE contest_id = $1', [id]);
      const existingProblemIds = new Set(existingProblems.rows.map(r => r.id));
      const incomingProblemIds = new Set(problems.filter(p => p && p.id).map(p => p.id));

      // Delete problems removed from payload
      for (const existingId of existingProblemIds) {
        if (!incomingProblemIds.has(existingId)) {
          await query('DELETE FROM problems WHERE id = $1 AND contest_id = $2', [existingId, id]);
        }
      }

      // Upsert problems and their testcases
      for (let i = 0; i < problems.length; i++) {
        const p = problems[i] || {};
        const pid = p.id || null;

        let problemId = pid;
        if (problemId && existingProblemIds.has(problemId)) {
          await query(
            `UPDATE problems
             SET title = $1, description = $2, constraints = $3,
                 sample_input = $4, sample_output = $5,
                 difficulty = $6, solution = $7,
                 sort_order = $8
             WHERE id = $9 AND contest_id = $10`,
            [
              p.title || '',
              p.description || '',
              p.constraints || '',
              p.sample_input || '',
              p.sample_output || '',
              p.difficulty || 'Easy',
              p.solution || null,
              p.sort_order ?? i,
              problemId,
              id,
            ]
          );
        } else {
          const inserted = await query(
            `INSERT INTO problems (contest_id, title, description, constraints, sample_input, sample_output, difficulty, solution, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id`,
            [
              id,
              p.title || '',
              p.description || '',
              p.constraints || '',
              p.sample_input || '',
              p.sample_output || '',
              p.difficulty || 'Easy',
              p.solution || null,
              p.sort_order ?? i,
            ]
          );
          problemId = inserted.rows[0].id;
        }

        const tcs = Array.isArray(p.testcases) ? p.testcases : [];
        const existingTcs = await query('SELECT id FROM testcases WHERE problem_id = $1', [problemId]);
        const existingTcIds = new Set(existingTcs.rows.map(r => r.id));
        const incomingTcIds = new Set(tcs.filter(tc => tc && tc.id).map(tc => tc.id));

        // Delete removed testcases
        for (const existingTcId of existingTcIds) {
          if (!incomingTcIds.has(existingTcId)) {
            await query('DELETE FROM testcases WHERE id = $1 AND problem_id = $2', [existingTcId, problemId]);
          }
        }

        for (let j = 0; j < tcs.length; j++) {
          const tc = tcs[j] || {};
          if (tc.id && existingTcIds.has(tc.id)) {
            await query(
              `UPDATE testcases
               SET input = $1, expected_output = $2, is_sample = $3, is_hidden = $4, sort_order = $5
               WHERE id = $6 AND problem_id = $7`,
              [
                tc.input ?? '',
                tc.expected_output ?? '',
                tc.is_sample === true,
                tc.is_hidden !== false,
                tc.sort_order ?? j,
                tc.id,
                problemId,
              ]
            );
          } else {
            await query(
              `INSERT INTO testcases (problem_id, input, expected_output, is_sample, is_hidden, sort_order)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                problemId,
                tc.input ?? '',
                tc.expected_output ?? '',
                tc.is_sample === true,
                tc.is_hidden !== false,
                tc.sort_order ?? j,
              ]
            );
          }
        }
      }

      await query('COMMIT');

      // Return updated contest
      const updated = await query('SELECT * FROM contests WHERE id = $1', [id]);
      res.json({ contest: updated.rows[0] });
      return;
    }

    // Backwards-compatible partial update
    const fields = [];
    const values = [];
    let idx = 1;

    if (title) { fields.push(`title = $${idx++}`); values.push(title); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
    if (start_time) { fields.push(`start_time = $${idx++}`); values.push(new Date(start_time)); }
    if (end_time) { fields.push(`end_time = $${idx++}`); values.push(new Date(end_time)); }
    if (allowlist !== undefined) {
      let emails = Array.isArray(allowlist)
        ? allowlist.map(e => String(e).toLowerCase().trim()).filter(Boolean)
        : [];
      if (emails.length > 0 && !emails.includes(req.user.email.toLowerCase())) {
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
    try { await query('ROLLBACK'); } catch (e) {}
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
