const { redis } = require('../config/db');

/**
 * Codeforces-style penalty leaderboard using Redis Sorted Sets.
 * 
 * Score formula: (solved_count * 10_000_000) - total_penalty
 * This way, more solved problems always rank higher, and among equal solves,
 * lower penalty wins (higher score).
 * 
 * Penalty per problem = time_of_accept_minutes + 10 * wrong_attempts_before_accept
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
async function updateLeaderboard(contestId, userId, problemId, username, verdict, contestStartTime) {
  const userKey = USER_DATA_KEY(contestId, userId);

  // Get or initialize user data
  let userData = await redis.hgetall(userKey);
  if (!userData || !userData.username) {
    userData = {
      username: username,
      solved: '0',
      total_penalty: '0',
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
      penalty: 0
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
    for (const pid in problems) {
      if (problems[pid].accepted) {
        solved++;
        totalPenalty += problems[pid].penalty;
      }
    }

    userData.solved = String(solved);
    userData.total_penalty = String(totalPenalty);

    // Score: higher is better. More problems solved is always better.
    // For same solve count, lower penalty should rank higher (have higher score).
    const score = solved * 10000000 - totalPenalty;

    await redis.zadd(LEADERBOARD_KEY(contestId), score, userId);
  }

  await redis.hmset(userKey, {
    username: userData.username,
    solved: userData.solved,
    total_penalty: userData.total_penalty,
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
    const score = parseFloat(members[i + 1]);
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
