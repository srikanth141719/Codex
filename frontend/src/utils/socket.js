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
