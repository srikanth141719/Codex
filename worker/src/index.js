const amqp = require('amqplib');
const { Pool } = require('pg');
const Redis = require('ioredis');
const { io: ioClient } = require('socket.io-client');
const { judgeSubmission, runWithCustomInput } = require('./judge');

const QUEUE_NAME = 'submissions';

// Database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://codex:codex_secret@localhost:5432/codex',
  max: 5,
});

// Redis (for leaderboard)
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const RUN_RESULT_KEY = (runId) => `run:${runId}`;

// Worker identification
const WORKER_ID = `worker-${process.pid}-${Date.now().toString(36)}`;

/**
 * Leaderboard update logic (same as backend service but runs in worker context)
 */
async function updateLeaderboard(contestId, userId, problemId, username, verdict, contestStartTime) {
  const userKey = `lb:${contestId}:user:${userId}`;
  const leaderboardKey = `leaderboard:${contestId}`;

  let userData = await redis.hgetall(userKey);
  if (!userData || !userData.username) {
    userData = { username, solved: '0', total_penalty: '0', problems: '{}' };
  }

  let problems = {};
  try { problems = JSON.parse(userData.problems || '{}'); } catch (e) { problems = {}; }

  if (!problems[problemId]) {
    problems[problemId] = { attempts: 0, accepted: false, accept_time: null, penalty: 0 };
  }

  const prob = problems[problemId];

  if (prob.accepted) {
    prob.attempts++;
    await redis.hset(userKey, 'problems', JSON.stringify(problems));
    return;
  }

  prob.attempts++;

  if (verdict === 'Accepted') {
    prob.accepted = true;
    const now = new Date();
    const startTime = new Date(contestStartTime);
    const minutesSinceStart = Math.floor((now - startTime) / 60000);
    prob.accept_time = minutesSinceStart;
    prob.penalty = minutesSinceStart + 10 * (prob.attempts - 1);

    let solved = 0, totalPenalty = 0;
    for (const pid in problems) {
      if (problems[pid].accepted) {
        solved++;
        totalPenalty += problems[pid].penalty;
      }
    }

    userData.solved = String(solved);
    userData.total_penalty = String(totalPenalty);

    const score = solved * 10000000 - totalPenalty;
    await redis.zadd(leaderboardKey, score, userId);
  }

  await redis.hmset(userKey, {
    username: userData.username,
    solved: userData.solved,
    total_penalty: userData.total_penalty,
    problems: JSON.stringify(problems)
  });
}

/**
 * Get full leaderboard from Redis
 */
async function getLeaderboard(contestId) {
  const key = `leaderboard:${contestId}`;
  const members = await redis.zrevrange(key, 0, -1, 'WITHSCORES');
  const leaderboard = [];

  for (let i = 0; i < members.length; i += 2) {
    const userId = members[i];
    const userKey = `lb:${contestId}:user:${userId}`;
    const userData = await redis.hgetall(userKey);
    let problems = {};
    try { problems = JSON.parse(userData.problems || '{}'); } catch (e) { problems = {}; }

    leaderboard.push({
      rank: Math.floor(i / 2) + 1,
      user_id: userId,
      username: userData.username || 'Unknown',
      solved: parseInt(userData.solved || '0'),
      penalty: parseInt(userData.total_penalty || '0'),
      problems,
    });
  }

  return leaderboard;
}

async function processSubmission(msg, channel) {
  const data = JSON.parse(msg.content.toString());
  console.log(`[${WORKER_ID}] Processing ${data.is_run ? 'run' : 'submission'}: ${data.is_run ? data.run_id : data.submission_id} (${data.language})`);

  try {
    let result;

    if (data.is_run) {
      // "Run" mode — custom input or sample test cases
      if (data.custom_input !== null && data.custom_input !== undefined) {
        result = await runWithCustomInput(data, data.custom_input);
        result.passed_count = 0;
        result.total_count = 0;
        result.runtime_ms = 0;
        result.memory_kb = 0;
      } else {
        // Run against sample test cases
        const tcResult = await pool.query(
          'SELECT * FROM testcases WHERE problem_id = $1 AND is_sample = true ORDER BY sort_order',
          [data.problem_id]
        );
        if (tcResult.rows.length === 0) {
          result = await runWithCustomInput(data, '');
          result.passed_count = 0;
          result.total_count = 0;
        } else {
          result = await judgeSubmission(data, tcResult.rows);
        }
        result.runtime_ms = result.runtime_ms || 0;
        result.memory_kb = result.memory_kb || 0;
      }

      // Ephemeral run: do NOT write anything to submissions table
      if (data.run_id) {
        // Store ephemeral run result for polling fallback (TTL)
        await redis.set(
          RUN_RESULT_KEY(data.run_id),
          JSON.stringify({
            run_id: data.run_id,
            user_id: data.user_id,
            contest_id: data.contest_id,
            problem_id: data.problem_id,
            verdict: result.verdict,
            runtime_ms: result.runtime_ms || 0,
            memory_kb: result.memory_kb || 0,
            stdout: result.stdout || '',
            stderr: result.stderr || '',
            passed_count: result.passed_count || 0,
            total_count: result.total_count || 0,
            finished_at: new Date().toISOString(),
          }),
          'EX',
          300
        );
      }
    } else {
      // "Submit" mode — run against ALL test cases (sample + hidden)
      const tcResult = await pool.query(
        'SELECT * FROM testcases WHERE problem_id = $1 ORDER BY sort_order',
        [data.problem_id]
      );

      if (tcResult.rows.length === 0) {
        result = { verdict: 'Accepted', runtime_ms: 0, memory_kb: 0, stdout: 'No test cases configured', stderr: '', passed_count: 0, total_count: 0 };
      } else {
        result = await judgeSubmission(data, tcResult.rows);
      }

      // Update submission in database
      await pool.query(
        `UPDATE submissions SET verdict = $1, runtime_ms = $2, memory_kb = $3,
         stdout = $4, stderr = $5, passed_count = $6, total_count = $7
         WHERE id = $8`,
        [result.verdict, result.runtime_ms, result.memory_kb,
         result.stdout || '', result.stderr || '',
         result.passed_count, result.total_count,
         data.submission_id]
      );

      // Update leaderboard only for REAL submissions during contest window
      const now = new Date();
      const contestEnded = data.contest_end_time ? now > new Date(data.contest_end_time) : false;
      const st = data.submission_type ? String(data.submission_type).toUpperCase() : 'REAL';
      if (data.contest_id && !contestEnded && st === 'REAL') {
        await updateLeaderboard(
          data.contest_id, data.user_id, data.problem_id,
          data.username, result.verdict, data.contest_start_time
        );
      }
    }

    // Emit real-time updates via backend's Socket.io
    try {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
      const socket = ioClient(backendUrl, { transports: ['websocket'], timeout: 3000 });

      socket.on('connect', () => {
        // Emit submission status to all connected clients
        socket.emit('worker:submission_result', {
          submission_id: data.submission_id,
          run_id: data.run_id,
          is_run: !!data.is_run,
          user_id: data.user_id,
          contest_id: data.contest_id,
          problem_id: data.problem_id,
          verdict: result.verdict,
          runtime_ms: result.runtime_ms,
          memory_kb: result.memory_kb,
          stdout: result.stdout,
          stderr: result.stderr,
          passed_count: result.passed_count,
          total_count: result.total_count,
        });

        // If it's a submit (not run), also emit leaderboard update
        if (!data.is_run && data.contest_id) {
          getLeaderboard(data.contest_id).then(leaderboard => {
            socket.emit('worker:leaderboard_update', {
              contest_id: data.contest_id,
              leaderboard,
            });
            setTimeout(() => socket.disconnect(), 500);
          });
        } else {
          setTimeout(() => socket.disconnect(), 500);
        }
      });

      socket.on('connect_error', () => {
        socket.disconnect();
      });
    } catch (socketErr) {
      console.error('Socket emit error (non-fatal):', socketErr.message);
    }

    console.log(`[${WORKER_ID}] Submission ${data.submission_id} → ${result.verdict}`);
    channel.ack(msg);
  } catch (err) {
    console.error(`[${WORKER_ID}] Error processing submission:`, err);

    if (data.is_run && data.run_id) {
      await redis.set(
        RUN_RESULT_KEY(data.run_id),
        JSON.stringify({
          run_id: data.run_id,
          user_id: data.user_id,
          contest_id: data.contest_id,
          problem_id: data.problem_id,
          verdict: 'Internal Error',
          runtime_ms: 0,
          memory_kb: 0,
          stdout: '',
          stderr: err.message,
          passed_count: 0,
          total_count: 0,
          finished_at: new Date().toISOString(),
        }),
        'EX',
        300
      );
    } else if (data.submission_id) {
      // Update as internal error
      await pool.query(
        `UPDATE submissions SET verdict = 'Internal Error', stderr = $1 WHERE id = $2`,
        [err.message, data.submission_id]
      );
    }

    channel.ack(msg); // Don't requeue failed messages
  }
}

async function start() {
  console.log(`[${WORKER_ID}] Starting judge worker...`);

  const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://codex:codex_secret@localhost:5672';
  let retries = 20;

  while (retries > 0) {
    try {
      const connection = await amqp.connect(rabbitUrl);
      const channel = await connection.createChannel();
      await channel.assertQueue(QUEUE_NAME, { durable: true });
      channel.prefetch(1); // Process one at a time

      console.log(`[${WORKER_ID}] ✓ Connected to RabbitMQ, waiting for submissions...`);

      channel.consume(QUEUE_NAME, (msg) => {
        if (msg) processSubmission(msg, channel);
      });

      connection.on('close', () => {
        console.error(`[${WORKER_ID}] RabbitMQ connection closed, restarting...`);
        setTimeout(start, 5000);
      });

      return;
    } catch (err) {
      retries--;
      console.error(`[${WORKER_ID}] RabbitMQ connection failed (${retries} retries left):`, err.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.error(`[${WORKER_ID}] Failed to connect to RabbitMQ after all retries`);
  process.exit(1);
}

// Ensure runner images exist
async function ensureRunnerImages() {
  const Docker = require('dockerode');
  const os = require('os');

  let docker;
  if (process.env.DOCKER_HOST) {
    const host = process.env.DOCKER_HOST;
    if (host.startsWith('tcp://')) {
      const url = new URL(host);
      docker = new Docker({ host: url.hostname, port: url.port });
    } else {
      docker = new Docker({ socketPath: host.replace('unix://', '') });
    }
  } else if (os.platform() === 'win32') {
    docker = new Docker({ socketPath: '//./pipe/docker_engine' });
  } else {
    docker = new Docker({ socketPath: '/var/run/docker.sock' });
  }

  const requiredImages = ['codex-runner-cpp', 'codex-runner-python', 'codex-runner-java'];

  for (const imgName of requiredImages) {
    try {
      await docker.getImage(imgName).inspect();
      console.log(`[${WORKER_ID}] ✓ Image ${imgName} found`);
    } catch (err) {
      console.log(`[${WORKER_ID}] ⚠ Image ${imgName} not found. Please build it first.`);
    }
  }
}

ensureRunnerImages().then(start).catch(err => {
  console.error('Worker startup failed:', err);
  process.exit(1);
});
