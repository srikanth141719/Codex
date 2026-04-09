const express = require('express');
const { query } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { getLeaderboardAt } = require('../services/leaderboard_db');

const router = express.Router();

// GET /api/users/:id/stats — global solved stats by difficulty
router.get('/:id/stats', authMiddleware, async (req, res) => {
  try {
    const userId = req.params.id;

    const rows = await query(
      `SELECT p.difficulty, COUNT(DISTINCT s.problem_id)::int AS solved
       FROM submissions s
       JOIN problems p ON p.id = s.problem_id
       WHERE s.user_id = $1
         AND s.verdict = 'Accepted'
       GROUP BY p.difficulty`,
      [userId]
    );

    const byDifficulty = { Easy: 0, Medium: 0, Hard: 0 };
    for (const r of rows.rows) {
      const k = r.difficulty || 'Easy';
      if (byDifficulty[k] !== undefined) byDifficulty[k] = Number(r.solved) || 0;
    }
    const totalSolved = byDifficulty.Easy + byDifficulty.Medium + byDifficulty.Hard;

    res.json({
      user_id: userId,
      total_solved: totalSolved,
      by_difficulty: byDifficulty,
    });
  } catch (err) {
    console.error('User stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id/history — contests participated + aggregated stats
router.get('/:id/history', authMiddleware, async (req, res) => {
  try {
    const userId = req.params.id;

    const contestsRes = await query(
      `SELECT DISTINCT c.id, c.title, c.start_time, c.end_time, c.creator_id
       FROM contests c
       JOIN submissions s ON s.contest_id = c.id
       WHERE s.user_id = $1
       ORDER BY c.start_time DESC`,
      [userId]
    );

    const history = [];
    for (const c of contestsRes.rows) {
      const totalQuestionsRes = await query(
        'SELECT COUNT(*)::int AS cnt FROM problems WHERE contest_id = $1',
        [c.id]
      );
      const totalQuestions = totalQuestionsRes.rows[0]?.cnt || 0;

      const perProblemRes = await query(
        `WITH per_problem AS (
           SELECT
             problem_id,
             MAX(CASE WHEN verdict = 'Accepted' THEN 1 ELSE 0 END) AS has_ac,
             MAX(
               CASE
                 WHEN total_count > 0 THEN (passed_count::float / total_count)
                 ELSE 0
               END
             ) AS best_frac
           FROM submissions
           WHERE user_id = $1 AND contest_id = $2
           GROUP BY problem_id
         )
         SELECT
           COALESCE(SUM(has_ac), 0)::int AS fully_solved,
           COALESCE(SUM(CASE WHEN has_ac = 0 AND best_frac > 0 THEN 1 ELSE 0 END), 0)::int AS partially_solved,
           COALESCE(SUM(LEAST(1.0, best_frac) * 100.0), 0)::float AS total_score
         FROM per_problem`,
        [userId, c.id]
      );

      const fullySolved = perProblemRes.rows[0]?.fully_solved || 0;
      const partiallySolved = perProblemRes.rows[0]?.partially_solved || 0;
      const totalScore = Number(perProblemRes.rows[0]?.total_score || 0);

      let finalRank = null;
      try {
        const leaderboard = await getLeaderboardAt(c.id, c.end_time);
        const me = leaderboard.find((e) => e.user_id === userId);
        finalRank = me ? me.rank : null;
      } catch (e) {
        finalRank = null;
      }

      history.push({
        contest: c,
        stats: {
          total_questions: totalQuestions,
          fully_solved: fullySolved,
          partially_solved: partiallySolved,
          total_score: totalScore,
          final_rank: finalRank,
        },
      });
    }

    res.json({ user_id: userId, history });
  } catch (err) {
    console.error('User history error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

