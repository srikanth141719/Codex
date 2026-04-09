const { redis } = require('../config/db');

/**
 * Codeforces-style penalty leaderboard using Redis Sorted Sets, extended with
 * per-problem scoring that can support partial scores.
 *
 * Ranking score formula (for the sorted set):
 *   (solved_count * 10_000_000) - total_penalty
 * so more solved problems always rank higher, and among equal solves,
 * lower penalty wins (higher score).
 *
 * Penalty per problem = time_of_accept_minutes + 10 * wrong_attempts_before_accept
 *
 * Additionally, we track:
 *   - prob.score: numeric score for a problem (supports partial credit)
 *   - userData.score: total score across problems (sum of prob.score)
 * 
 * Data structures:
 *   - Sorted Set:   leaderboard:{contest_id}        -> member: user_id, score
 *   - Hash:         lb:{contest_id}:user:{user_id}   -> per-problem data as JSON
 */

const LEADERBOARD_KEY = (contestId) => `leaderboard:${contestId}`;
const USER_DATA_KEY = (contestId, userId) => `lb:${contestId}:user:${userId}`;

/**
 * Record a submission result and recalculate leaderboard
 */
async function updateLeaderboard(contestId, userId, problemId, username, verdict, contestStartTime, passedCount, totalCount) {
  const userKey = USER_DATA_KEY(contestId, userId);

  // Get or initialize user data
  let userData = await redis.hgetall(userKey);
  if (!userData || !userData.username) {
    userData = {
      username: username,
      solved: '0',
      total_penalty: '0',
      score: '0',
      problems: '{}'
    };
  }

  let problems = {};
  try {
    problems = JSON.parse(userData.problems || '{}');
  } catch (e) {
    problems = {};
  }

  // Initialize problem data if needed
  if (!problems[problemId]) {
    problems[problemId] = {
      attempts: 0,
      accepted: false,
      accept_time: null,
      penalty: 0,
      score: 0,
    };
  }

  const prob = problems[problemId];

  // If already accepted, don't change anything for this problem
  if (prob.accepted) {
    // Still count the attempt for display
    prob.attempts++;
    await redis.hset(userKey, 'problems', JSON.stringify(problems));
    return await getLeaderboard(contestId);
  }

  prob.attempts++;

  // Partial scoring (updated on every judged submission)
  const MAX_PROBLEM_SCORE = 100;
  const pCount = Number.isFinite(passedCount) ? passedCount : (passedCount ? Number(passedCount) : 0);
  const tCount = Number.isFinite(totalCount) ? totalCount : (totalCount ? Number(totalCount) : 0);
  let partialScore = 0;
  if (tCount > 0 && pCount > 0) {
    partialScore = (pCount / tCount) * MAX_PROBLEM_SCORE;
  }
  if (verdict === 'Accepted') {
    partialScore = MAX_PROBLEM_SCORE;
  }
  if (Number.isFinite(partialScore)) {
    const prev = typeof prob.score === 'number' ? prob.score : 0;
    prob.score = Math.max(prev, partialScore);
  }

  if (verdict === 'Accepted') {
    prob.accepted = true;
    const now = new Date();
    const startTime = new Date(contestStartTime);
    const minutesSinceStart = Math.floor((now - startTime) / 60000);
    prob.accept_time = minutesSinceStart;
    // Penalty = time of acceptance + 10 * wrong attempts (attempts before this one)
    prob.penalty = minutesSinceStart + 10 * (prob.attempts - 1);

    // Recalculate totals
    let solved = 0;
    let totalPenalty = 0;
    let totalScore = 0;
    for (const pid in problems) {
      if (problems[pid].accepted) {
        solved++;
        totalPenalty += problems[pid].penalty;
      }
      // Aggregate score from all problems (accepted or partial)
      if (typeof problems[pid].score === 'number') {
        totalScore += problems[pid].score;
      }
    }

    userData.solved = String(solved);
    userData.total_penalty = String(totalPenalty);
    userData.score = String(totalScore);

    // hotfix: ranking is strictly by total score
    await redis.zadd(LEADERBOARD_KEY(contestId), totalScore, userId);
  }

  // Always recompute total score (even for partial, non-AC submissions)
  {
    let totalScore = 0;
    for (const pid in problems) {
      if (typeof problems[pid].score === 'number') totalScore += problems[pid].score;
    }
    userData.score = String(totalScore);
    await redis.zadd(LEADERBOARD_KEY(contestId), totalScore, userId);
  }

  await redis.hmset(userKey, {
    username: userData.username,
    solved: userData.solved,
    total_penalty: userData.total_penalty,
    score: userData.score || '0',
    problems: JSON.stringify(problems)
  });

  return await getLeaderboard(contestId);
}

/**
 * Get the full leaderboard for a contest
 */
async function getLeaderboard(contestId) {
  const key = LEADERBOARD_KEY(contestId);

  // Get all members sorted by score (descending — highest score = best rank)
  const members = await redis.zrevrange(key, 0, -1, 'WITHSCORES');

  const leaderboard = [];
  for (let i = 0; i < members.length; i += 2) {
    const userId = members[i];
    const rankScore = parseFloat(members[i + 1]);
    const userKey = USER_DATA_KEY(contestId, userId);
    const userData = await redis.hgetall(userKey);

    let problems = {};
    try {
      problems = JSON.parse(userData.problems || '{}');
    } catch (e) {
      problems = {};
    }

    leaderboard.push({
      rank: Math.floor(i / 2) + 1,
      user_id: userId,
      username: userData.username || 'Unknown',
      solved: parseInt(userData.solved || '0'),
      penalty: parseInt(userData.total_penalty || '0'),
      score: parseFloat(userData.score || '0'),
      problems: problems,
    });
  }

  return leaderboard;
}

/**
 * Clear leaderboard for a contest (useful for testing)
 */
async function clearLeaderboard(contestId) {
  const key = LEADERBOARD_KEY(contestId);
  const members = await redis.zrange(key, 0, -1);
  for (const userId of members) {
    await redis.del(USER_DATA_KEY(contestId, userId));
  }
  await redis.del(key);
}

module.exports = { updateLeaderboard, getLeaderboard, clearLeaderboard };
