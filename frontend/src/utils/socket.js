import { io } from 'socket.io-client';

/**
 * Create a Socket.io connection to the backend.
 * In dev mode, connect directly to backend:3001 bypassing Vite proxy.
 * In production, connect to current origin (Nginx handles routing).
 */
export function createSocket(token) {
  const url = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin;

  return io(url, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });
}

/**
 * Poll a submission's status until it's no longer Pending/Running.
 * Fallback for when WebSocket isn't delivering results.
 */
export function pollSubmissionResult(apiFetch, submissionId, onResult, maxAttempts = 30) {
  let attempts = 0;
  const interval = setInterval(async () => {
    attempts++;
    try {
      const data = await apiFetch(`/submissions/${submissionId}`);
      const sub = data.submission;
      if (sub && sub.verdict !== 'Pending' && sub.verdict !== 'Running') {
        clearInterval(interval);
        onResult({
          verdict: sub.verdict,
          stdout: sub.stdout,
          stderr: sub.stderr,
          passed_count: sub.passed_count,
          total_count: sub.total_count,
          runtime_ms: sub.runtime_ms,
          problem_id: sub.problem_id,
        });
      }
    } catch (err) {
      // ignore poll errors
    }
    if (attempts >= maxAttempts) {
      clearInterval(interval);
      onResult({ verdict: 'Timeout', stderr: 'Judge did not respond in time. Is the worker running?' });
    }
  }, 2000);
  return () => clearInterval(interval);
}

/**
 * Poll an ephemeral run result until it exists or times out.
 */
export function pollRunResult(apiFetch, runId, onResult, maxAttempts = 30) {
  let attempts = 0;
  const interval = setInterval(async () => {
    attempts++;
    try {
      const data = await apiFetch(`/runs/${runId}`);
      const run = data.run;
      if (run && run.verdict) {
        clearInterval(interval);
        onResult({
          is_run: true,
          run_id: run.run_id,
          verdict: run.verdict,
          stdout: run.stdout,
          stderr: run.stderr,
          passed_count: run.passed_count,
          total_count: run.total_count,
          runtime_ms: run.runtime_ms,
          memory_kb: run.memory_kb,
          problem_id: run.problem_id,
          contest_id: run.contest_id,
          user_id: run.user_id,
        });
      }
    } catch (err) {
      // ignore until it appears / expires
    }
    if (attempts >= maxAttempts) {
      clearInterval(interval);
      onResult({ verdict: 'Timeout', stderr: 'Run did not respond in time. Is the worker running?' });
    }
  }, 1000);
  return () => clearInterval(interval);
}
