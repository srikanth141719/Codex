const { query } = require('../config/db');

function computeScore(solved, totalPenalty) {
  return solved * 10000000 - totalPenalty;
}

/**
 * Reconstruct Codeforces-style leaderboard from Postgres up to a cutoff time.
 * Only includes REAL submissions (official contest timeline).
 */
async function getLeaderboardAt(contestId, cutoffTime) {
  const contestRes = await query('SELECT id, start_time FROM contests WHERE id = $1', [contestId]);
  if (contestRes.rows.length === 0) {
    const err = new Error('Contest not found');
    err.statusCode = 404;
    throw err;
  }
  const contestStart = new Date(contestRes.rows[0].start_time);
  const cutoff = new Date(cutoffTime);

  // Pull all relevant submissions up to cutoff in chronological order.
  // We only care about REAL submissions for official timeline replay.
  const subsRes = await query(
    `SELECT s.user_id, u.username, s.problem_id, s.verdict, s.submitted_at
     FROM submissions s
     JOIN users u ON u.id = s.user_id
     WHERE s.contest_id = $1
       AND s.submission_type = 'REAL'
       AND s.submitted_at <= $2
     ORDER BY s.submitted_at ASC`,
    [contestId, cutoff]
  );

  // userId -> user aggregate
  const users = new Map();

  for (const row of subsRes.rows) {
    const userId = row.user_id;
    const username = row.username;
    const problemId = row.problem_id;
    const verdict = row.verdict;
    const submittedAt = new Date(row.submitted_at);

    if (!users.has(userId)) {
      users.set(userId, {
        user_id: userId,
        username,
        solved: 0,
        penalty: 0,
        problems: {}, // problemId -> {attempts, accepted, accept_time, penalty}
      });
    }

    const u = users.get(userId);
    if (!u.problems[problemId]) {
      u.problems[problemId] = { attempts: 0, accepted: false, accept_time: null, penalty: 0 };
    }

    const p = u.problems[problemId];

    // Always count attempts for display (matches current Redis behavior)
    p.attempts += 1;

    if (p.accepted) continue;

    if (verdict === 'Accepted') {
      p.accepted = true;
      const minutesSinceStart = Math.floor((submittedAt - contestStart) / 60000);
      p.accept_time = minutesSinceStart;
      p.penalty = minutesSinceStart + 10 * (p.attempts - 1);
    }
  }

  // Recompute totals per user
  const leaderboard = [];
  for (const u of users.values()) {
    let solved = 0;
    let totalPenalty = 0;
    for (const pid of Object.keys(u.problems)) {
      const p = u.problems[pid];
      if (p.accepted) {
        solved += 1;
        totalPenalty += p.penalty;
      }
    }
    u.solved = solved;
    u.penalty = totalPenalty;
    u._score = computeScore(solved, totalPenalty);
    leaderboard.push(u);
  }

  leaderboard.sort((a, b) => {
    // Higher score ranks first; tie-break by username for stable ordering
    if (b._score !== a._score) return b._score - a._score;
    return String(a.username).localeCompare(String(b.username));
  });

  // Add ranks and strip private fields
  return leaderboard.map((u, idx) => ({
    rank: idx + 1,
    user_id: u.user_id,
    username: u.username,
    solved: u.solved,
    penalty: u.penalty,
    problems: u.problems,
  }));
}

module.exports = { getLeaderboardAt };

