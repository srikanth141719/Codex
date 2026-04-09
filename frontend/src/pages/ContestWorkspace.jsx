import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CodeEditor, { BOILERPLATES } from '../components/CodeEditor';
import Leaderboard from '../components/Leaderboard';
import Timer from '../components/Timer';
import ConfettiAnimation from '../components/ConfettiAnimation';
import SubmissionHistory from '../components/SubmissionHistory';
import { createSocket, pollRunResult, pollSubmissionResult } from '../utils/socket';
import {
  ArrowLeft, Play, Send, Plus, CheckCircle, Clock,
  Code2, Trophy, X, Settings, Terminal, History, Loader,
  ChevronRight, Sparkles, Zap, AlertCircle
} from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

const STORAGE_KEY = (contestId, problemId, isVirtual) =>
  `codex_code_${isVirtual ? 'virtual' : 'real'}_${contestId}_${problemId}`;
const LANG_KEY = (contestId, problemId, isVirtual) =>
  `codex_lang_${isVirtual ? 'virtual' : 'real'}_${contestId}_${problemId}`;

export default function ContestWorkspace() {
  const { id: contestId } = useParams();
  const { apiFetch, user, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const qs = new URLSearchParams(location.search);
  let isVirtual = qs.get('virtual') === '1';
  const initialView = qs.get('view') === 'leaderboard' ? 'leaderboard' : 'problem';

  const VIRTUAL_KEY = `codex_virtual_${contestId}`;
  const ACTIVE_VIRTUAL_KEY = 'codex_active_virtual_contest';

  const [contest, setContest] = useState(null);
  const [problems, setProblems] = useState([]);
  const [selectedProblem, setSelectedProblem] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isCreator, setIsCreator] = useState(false);
  const [acceptedProblems, setAcceptedProblems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Editor state
  const [language, setLanguage] = useState('cpp');
  const [code, setCode] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiKey = useRef(0);
  const cancelPollRef = useRef(null);
  const lastRunIdRef = useRef(null);
  const lastSubmissionIdRef = useRef(null);

  // View state
  const [leftView, setLeftView] = useState(initialView); // problem, leaderboard
  const [leftProblemTab, setLeftProblemTab] = useState('description'); // description, solution
  const [bottomTab, setBottomTab] = useState('output');

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState([]);

  // Submission history
  const [showHistory, setShowHistory] = useState(false);

  // Contest status
  const [contestStatus, setContestStatus] = useState('loading');

  // Virtual session + local scoreboard
  const [virtualSession, setVirtualSession] = useState(null); // { startMs, durationMs }
  const [virtualProblems, setVirtualProblems] = useState({}); // pid -> data

  // Socket ref
  const socketRef = useRef(null);

  // Virtual: time-travel standings from backend + local injection
  useEffect(() => {
    if (!isVirtual || !virtualSession || leftView !== 'leaderboard') return;

    let stopped = false;
    async function refresh() {
      const elapsedMs = Date.now() - virtualSession.startMs;
      try {
        const data = await apiFetch(`/leaderboard/${contestId}?relative_timestamp=${elapsedMs}`);
        if (stopped) return;
        const base = data.leaderboard || [];

        // Inject virtual user row locally (do not persist into official standings)
        let solved = 0;
        let penalty = 0;
        const vp = virtualProblems || {};
        for (const pid of Object.keys(vp)) {
          if (vp[pid]?.accepted) {
            solved += 1;
            penalty += vp[pid].penalty || 0;
          }
        }
        const virtualEntry = {
          rank: null,
          user_id: `virtual:${user?.id || 'anon'}:${contestId}`,
          username: `${user?.username || 'You'} (Virtual)`,
          solved,
          penalty,
          problems: vp,
        };

        const merged = [...base, virtualEntry].sort((a, b) => {
          // same score ordering as backend: (solved*1e7 - penalty) desc
          const sa = (a.solved || 0) * 10000000 - (a.penalty || 0);
          const sb = (b.solved || 0) * 10000000 - (b.penalty || 0);
          if (sb !== sa) return sb - sa;
          return String(a.username).localeCompare(String(b.username));
        }).map((e, idx) => ({ ...e, rank: idx + 1 }));

        setLeaderboard(merged);
      } catch (e) {
        // ignore
      }
    }

    refresh();
    const interval = setInterval(refresh, 10000);
    return () => { stopped = true; clearInterval(interval); };
  }, [isVirtual, virtualSession, leftView, contestId, apiFetch, virtualProblems, user]);

  // Auto-redirect into virtual mode if there is an active virtual contest session
  useEffect(() => {
    if (isVirtual) return;
    const raw = localStorage.getItem(ACTIVE_VIRTUAL_KEY);
    if (!raw) return;
    try {
      const active = JSON.parse(raw);
      if (active && active.contest_id === contestId) {
        navigate(`/contests/${contestId}?virtual=1${location.search.includes('view=leaderboard') ? '&view=leaderboard' : ''}`, { replace: true });
      }
    } catch (e) {
      // ignore malformed
    }
  }, [contestId, isVirtual, navigate, location.search]);

  // Load contest
  const loadContest = useCallback(async () => {
    try {
      const data = await apiFetch(`/contests/${contestId}`);
      setContest(data.contest);
      setProblems(data.contest.problems || []);
      setIsCreator(data.isCreator);
      setAcceptedProblems(isVirtual ? [] : (data.acceptedProblems || []));

      if (data.contest.problems?.length > 0 && !selectedProblem) {
        const firstProb = data.contest.problems[0];
        setSelectedProblem(firstProb);
        setSelectedIdx(0);
        const savedCode = localStorage.getItem(STORAGE_KEY(contestId, firstProb.id, isVirtual));
        const savedLang = localStorage.getItem(LANG_KEY(contestId, firstProb.id, isVirtual));
        if (savedLang) setLanguage(savedLang);
        setCode(savedCode || BOILERPLATES[savedLang || 'cpp'] || '');
      }

      const now = new Date();
      const start = new Date(data.contest.start_time);
      const end = new Date(data.contest.end_time);
      if (!isVirtual) {
        if (now < start) setContestStatus('upcoming');
        else if (now <= end) setContestStatus('live');
        else setContestStatus('ended');
      }
    } catch (err) {
      console.error(err);
      navigate('/');
    } finally {
      setLoading(false);
    }
  }, [contestId, apiFetch, navigate, selectedProblem, isVirtual]);

  useEffect(() => { loadContest(); }, []);

  // Update contest status periodically
  useEffect(() => {
    if (!contest) return;
    if (isVirtual) return;
    const interval = setInterval(() => {
      const now = new Date();
      const start = new Date(contest.start_time);
      const end = new Date(contest.end_time);
      if (now < start) setContestStatus('upcoming');
      else if (now <= end) setContestStatus('live');
      else setContestStatus('ended');
    }, 1000);
    return () => clearInterval(interval);
  }, [contest, isVirtual]);

  // Load or initialize virtual session
  useEffect(() => {
    if (!isVirtual || !contest) return;
    const raw = localStorage.getItem(VIRTUAL_KEY);
    let sess = null;
    try { sess = raw ? JSON.parse(raw) : null; } catch (e) { sess = null; }
    if (!sess || !sess.startMs || !sess.durationMs) {
      // Create one if missing (fallback)
      const startMs = Date.now();
      const durationMs = Math.max(1, new Date(contest.end_time) - new Date(contest.start_time));
      sess = { startMs, durationMs };
      localStorage.setItem(VIRTUAL_KEY, JSON.stringify(sess));
    }
    setVirtualSession(sess);

    const vProbRaw = localStorage.getItem(`${VIRTUAL_KEY}_score`);
    let vProb = {};
    try { vProb = vProbRaw ? JSON.parse(vProbRaw) : {}; } catch (e) { vProb = {}; }
    setVirtualProblems(vProb || {});
    const active = Date.now() <= (sess.startMs + sess.durationMs);
    setContestStatus(active ? 'live' : 'ended');

    // Persist active virtual contest for cross-page navigation
    if (active) {
      localStorage.setItem(
        ACTIVE_VIRTUAL_KEY,
        JSON.stringify({
          contest_id: contestId,
          virtual_start_time: sess.startMs,
          virtual_duration_ms: sess.durationMs,
        })
      );
    } else {
      const rawActive = localStorage.getItem(ACTIVE_VIRTUAL_KEY);
      if (rawActive) {
        try {
          const parsed = JSON.parse(rawActive);
          if (parsed && parsed.contest_id === contestId) {
            localStorage.removeItem(ACTIVE_VIRTUAL_KEY);
          }
        } catch (e) {
          localStorage.removeItem(ACTIVE_VIRTUAL_KEY);
        }
      }
    }
  }, [isVirtual, contestId, contest]);

  // Socket.io for real-time updates
  useEffect(() => {
    if (!token) return;

    const socket = createSocket(token);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✓ Socket connected');
      socket.emit('join:contest', contestId);
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket connection error (will retry):', err.message);
    });

    const handleLeaderboardUpdate = (data) => {
      if (data.contestId === contestId) {
        setLeaderboard(data.leaderboard);
      }
    };
    socket.on('leaderboard:update', handleLeaderboardUpdate);
    socket.on('leaderboard_update', handleLeaderboardUpdate);

    socket.on('submission:status', (data) => {
      if (data.user_id === user?.id) {
        handleSubmissionResult(data);
      }
      // Keep standings fresh for all participants while viewing leaderboard.
      if (!isVirtual && leftView === 'leaderboard' && data?.contest_id === contestId) {
        apiFetch(`/leaderboard/${contestId}`)
          .then((d) => setLeaderboard(d.leaderboard || []))
          .catch(() => {});
      }
    });

    // Load initial leaderboard
    if (!isVirtual) {
      apiFetch(`/leaderboard/${contestId}`)
        .then(data => setLeaderboard(data.leaderboard || []))
        .catch(console.error);
    }

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [contestId, token, user, isVirtual, leftView, apiFetch]);

  // Always fetch latest standings whenever user opens Standings tab.
  useEffect(() => {
    if (leftView !== 'leaderboard' || isVirtual) return;
    apiFetch(`/leaderboard/${contestId}`)
      .then((data) => setLeaderboard(data.leaderboard || []))
      .catch(console.error);
  }, [leftView, contestId, apiFetch, isVirtual]);

  function handleSubmissionResult(data) {
    // Ignore runs/submissions that are not the most recent request (best-effort)
    if (data.is_run) {
      if (!lastRunIdRef.current || data.run_id !== lastRunIdRef.current) return;
    } else {
      if (lastSubmissionIdRef.current && data.submission_id && data.submission_id !== lastSubmissionIdRef.current) {
        // still allow (e.g. websocket order), but prefer latest; don't hard-drop
      }
    }

    // Cancel any active poll
    if (cancelPollRef.current) {
      cancelPollRef.current();
      cancelPollRef.current = null;
    }

    setResult({
      verdict: data.verdict,
      stdout: data.stdout,
      stderr: data.stderr,
      passed_count: data.passed_count,
      total_count: data.total_count,
      runtime_ms: data.runtime_ms,
    });
    setSubmitting(false);
    setRunning(false);

    if (!data.is_run && isVirtual && virtualSession && data.problem_id) {
      const elapsedMin = Math.floor((Date.now() - virtualSession.startMs) / 60000);
      const pid = data.problem_id;
      setVirtualProblems(prev => {
        const next = { ...(prev || {}) };
        if (!next[pid]) next[pid] = { attempts: 0, accepted: false, accept_time: null, penalty: 0 };
        const p = { ...next[pid] };
        p.attempts += 1;
        if (!p.accepted && data.verdict === 'Accepted') {
          p.accepted = true;
          p.accept_time = elapsedMin;
          p.penalty = elapsedMin + 10 * (p.attempts - 1);
        }
        next[pid] = p;
        localStorage.setItem(`${VIRTUAL_KEY}_score`, JSON.stringify(next));
        return next;
      });
    }

    if (data.verdict === 'Accepted') {
      const pid = data.problem_id || selectedProblem?.id;
      if (!isVirtual && pid && !acceptedProblems.includes(pid)) {
        setAcceptedProblems(prev => [...prev, pid]);
      }
      confettiKey.current++;
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000);
    }
  }

  // Auto-save code to localStorage
  useEffect(() => {
    if (!selectedProblem) return;
    localStorage.setItem(STORAGE_KEY(contestId, selectedProblem.id, isVirtual), code);
    localStorage.setItem(LANG_KEY(contestId, selectedProblem.id, isVirtual), language);
  }, [code, language, contestId, selectedProblem, isVirtual]);

  function selectProblem(prob, idx) {
    if (selectedProblem) {
      localStorage.setItem(STORAGE_KEY(contestId, selectedProblem.id, isVirtual), code);
      localStorage.setItem(LANG_KEY(contestId, selectedProblem.id, isVirtual), language);
    }
    setSelectedProblem(prob);
    setSelectedIdx(idx);
    setLeftProblemTab('description');
    setResult(null);
    const savedCode = localStorage.getItem(STORAGE_KEY(contestId, prob.id, isVirtual));
    const savedLang = localStorage.getItem(LANG_KEY(contestId, prob.id, isVirtual));
    const lang = savedLang || 'cpp';
    setLanguage(lang);
    setCode(savedCode || BOILERPLATES[lang] || '');
  }

  function handleLanguageChange(newLang) {
    const oldBoilerplate = BOILERPLATES[language];
    if (!code || code === oldBoilerplate) {
      setCode(BOILERPLATES[newLang] || '');
    }
    setLanguage(newLang);
  }

  async function handleRun() {
    if (contestStatus !== 'live' && contestStatus !== 'ended') return;
    setRunning(true);
    setResult(null);
    setBottomTab('output');

    try {
      const res = await apiFetch('/submissions/run', {
        method: 'POST',
        body: JSON.stringify({
          problem_id: selectedProblem.id,
          contest_id: contestId,
          language,
          code,
          custom_input: showCustomInput ? customInput : null,
        }),
      });
      lastRunIdRef.current = res.run_id;
      // Poll fallback (websocket is best-effort in some environments)
      cancelPollRef.current = pollRunResult(apiFetch, res.run_id, handleSubmissionResult);
    } catch (err) {
      setResult({ verdict: 'Error', stderr: err.message });
      setRunning(false);
    }
  }

  async function handleSubmit() {
    if (contestStatus !== 'live' && contestStatus !== 'ended') return;
    setSubmitting(true);
    setResult(null);
    setBottomTab('output');

    try {
      const res = await apiFetch('/submissions', {
        method: 'POST',
        body: JSON.stringify({
          problem_id: selectedProblem.id,
          contest_id: contestId,
          language,
          code,
          ...(isVirtual ? { submission_type: 'VIRTUAL' } : {}),
        }),
      });
      lastSubmissionIdRef.current = res.submission.id;

      // Start polling as fallback
      cancelPollRef.current = pollSubmissionResult(
        apiFetch, res.submission.id, handleSubmissionResult
      );
    } catch (err) {
      setResult({ verdict: 'Error', stderr: err.message });
      setSubmitting(false);
    }
  }

  function getVerdictStyle(verdict) {
    switch (verdict) {
      case 'Accepted': return { bg: 'bg-gradient-to-r from-emerald-50 to-green-50', border: 'border-emerald-300', text: 'text-emerald-700', icon: '✓' };
      case 'Wrong Answer': return { bg: 'bg-gradient-to-r from-red-50 to-rose-50', border: 'border-red-300', text: 'text-red-700', icon: '✗' };
      case 'Time Limit Exceeded': return { bg: 'bg-gradient-to-r from-orange-50 to-amber-50', border: 'border-orange-300', text: 'text-orange-700', icon: '⏱' };
      case 'Runtime Error': return { bg: 'bg-gradient-to-r from-purple-50 to-violet-50', border: 'border-purple-300', text: 'text-purple-700', icon: '⚠' };
      case 'Compilation Error': return { bg: 'bg-gradient-to-r from-yellow-50 to-amber-50', border: 'border-yellow-300', text: 'text-yellow-800', icon: '⚙' };
      default: return { bg: 'bg-gray-50', border: 'border-gray-300', text: 'text-gray-700', icon: '?' };
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50">
        <div className="text-center">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-emerald-200 rounded-full animate-spin border-t-emerald-600 mx-auto" />
            <Zap className="w-6 h-6 text-emerald-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="mt-4 text-gray-500 font-medium">Loading contest...</p>
        </div>
      </div>
    );
  }

  // Upcoming contest — show countdown
  if (contestStatus === 'upcoming' && !isVirtual) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 backdrop-blur-sm border border-emerald-500/30">
            <Clock className="w-10 h-10 text-emerald-400" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">{contest?.title}</h1>
          <p className="text-emerald-300/70 mb-8 text-lg">Contest hasn't started yet</p>
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 inline-block">
            <Timer targetTime={contest?.start_time} label="Starts in" />
          </div>
          <div className="mt-8">
            <Link to="/" className="inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition-colors font-medium">
              <ArrowLeft className="w-4 h-4" /> Back to Contests
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Confetti */}
      <ConfettiAnimation key={confettiKey.current} trigger={showConfetti} />

      {/* ══════════ Top Navigation Bar ══════════ */}
      <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <Link to="/" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors group">
            <ArrowLeft className="w-4 h-4 text-gray-400 group-hover:text-gray-700" />
          </Link>
          <div className="w-px h-6 bg-gray-200" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-emerald-500 to-green-600 rounded-lg flex items-center justify-center shadow-sm">
              <Code2 className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-sm tracking-tight">{contest?.title}</span>
          </div>
          {contestStatus === 'live' && (
            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-emerald-700 font-semibold text-xs uppercase tracking-wider">Live</span>
            </div>
          )}
          {contestStatus === 'ended' && (
            <span className="bg-gray-100 border border-gray-200 rounded-full px-3 py-1 text-gray-500 text-xs font-medium">Ended</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {contestStatus === 'live' && (
            isVirtual && virtualSession
              ? <Timer targetTime={new Date(virtualSession.startMs + virtualSession.durationMs).toISOString()} label="Virtual Remaining" />
              : (contest?.end_time ? <Timer targetTime={contest.end_time} label="Remaining" /> : null)
          )}
          {isCreator && (
            <Link to={`/contests/${contestId}/admin`} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-600 transition-colors">
              <Settings className="w-3.5 h-3.5" /> Admin
            </Link>
          )}
        </div>
      </div>

      {/* ══════════ Main Split Layout ══════════ */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" className="h-full w-full">

        <Panel defaultSize={44} minSize={28} className="flex flex-col bg-white border-r border-gray-200">
          {/* Problem tabs */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 overflow-x-auto shrink-0 bg-gradient-to-r from-gray-50 to-white">
            {problems.map((prob, idx) => {
              const isSolved = acceptedProblems.includes(prob.id);
              const isActive = selectedIdx === idx;
              return (
                <button
                  key={prob.id}
                  onClick={() => { selectProblem(prob, idx); setLeftView('problem'); }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200
                    ${isActive
                      ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-md shadow-emerald-200'
                      : isSolved
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}
                >
                  {isSolved && <CheckCircle className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-200' : 'text-emerald-500'}`} />}
                  <span>{String.fromCharCode(65 + idx)}</span>
                </button>
              );
            })}

            <button
              onClick={() => setLeftView(leftView === 'leaderboard' ? 'problem' : 'leaderboard')}
              className={`ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200
                ${leftView === 'leaderboard'
                  ? 'bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-800 border border-amber-200 shadow-sm'
                  : 'text-gray-400 hover:bg-amber-50 hover:text-amber-600'}`}
            >
              <Trophy className="w-3.5 h-3.5" /> Standings
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {leftView === 'leaderboard' ? (
              <div className="p-5">
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-yellow-500 rounded-xl flex items-center justify-center shadow-sm">
                    <Trophy className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Standings</h2>
                    <p className="text-xs text-gray-400">Live leaderboard</p>
                  </div>
                </div>
                <Leaderboard leaderboard={leaderboard} problems={problems} currentUserId={user?.id} />
              </div>
            ) : selectedProblem ? (
              <div className="p-6">
                {/* Problem header */}
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-7 h-7 bg-gradient-to-br from-emerald-500 to-green-600 rounded-lg text-white text-xs font-bold flex items-center justify-center shadow-sm">
                        {String.fromCharCode(65 + selectedIdx)}
                      </span>
                      <h2 className="text-xl font-bold text-gray-900">{selectedProblem.title}</h2>
                    </div>
                  </div>
                  {acceptedProblems.includes(selectedProblem.id) && (
                    <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full px-3 py-1 text-xs font-semibold shadow-sm">
                      <CheckCircle className="w-3.5 h-3.5" /> Solved
                    </div>
                  )}
                </div>

                {/* Description/Solution tabs in LEFT pane */}
                {(() => {
                  const virtualActive = isVirtual && virtualSession && Date.now() <= (virtualSession.startMs + virtualSession.durationMs);
                  const canShowSolution = contestStatus === 'ended' && !virtualActive && !!selectedProblem.solution;
                  return (
                    <div className="flex items-center gap-1 mb-5 bg-gray-100/80 p-1 rounded-xl w-fit">
                      <button
                        onClick={() => setLeftProblemTab('description')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          leftProblemTab === 'description' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        Problem Description
                      </button>
                      {canShowSolution && (
                        <button
                          onClick={() => setLeftProblemTab('solution')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            leftProblemTab === 'solution' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          Solution
                        </button>
                      )}
                    </div>
                  );
                })()}

                {/* Left-pane content */}
                {leftProblemTab === 'solution' ? (
                  <div className="prose prose-sm max-w-none text-gray-700 mb-8 leading-relaxed whitespace-pre-wrap">
                    {selectedProblem.solution || 'No solution available yet.'}
                  </div>
                ) : (
                  <div className="prose prose-sm max-w-none text-gray-700 mb-8 leading-relaxed whitespace-pre-wrap">
                    {selectedProblem.description}
                  </div>
                )}

                {leftProblemTab !== 'solution' && (
                  <>
                {/* Constraints */}
                {selectedProblem.constraints && (
                  <div className="mb-8">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <ChevronRight className="w-3 h-3" /> Constraints
                    </h4>
                    <pre className="bg-gradient-to-r from-slate-50 to-gray-50 border border-gray-200 rounded-xl p-4 text-xs font-mono text-gray-800 overflow-x-auto shadow-inner whitespace-pre-wrap">
{selectedProblem.constraints}</pre>
                  </div>
                )}

                {/* Sample I/O */}
                <div className="space-y-4">
                  {selectedProblem.sample_input && (
                    <div className="group">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <ChevronRight className="w-3 h-3" /> Sample Input
                      </h4>
                      <pre className="bg-gradient-to-r from-slate-50 to-gray-50 border border-gray-200 rounded-xl p-4 text-sm font-mono text-gray-800 overflow-x-auto shadow-inner">
{selectedProblem.sample_input}</pre>
                    </div>
                  )}
                  {selectedProblem.sample_output && (
                    <div className="group">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <ChevronRight className="w-3 h-3" /> Sample Output
                      </h4>
                      <pre className="bg-gradient-to-r from-slate-50 to-gray-50 border border-gray-200 rounded-xl p-4 text-sm font-mono text-gray-800 overflow-x-auto shadow-inner">
{selectedProblem.sample_output}</pre>
                    </div>
                  )}

                  {/* Sample testcases */}
                  {selectedProblem.testcases?.filter(tc => tc.is_sample).map((tc, i) => (
                    <div key={tc.id} className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                        Test Case #{i + 1}
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 mb-1">INPUT</p>
                          <pre className="bg-white border border-gray-200 rounded-lg p-3 text-xs font-mono text-gray-800 shadow-inner">
{tc.input}</pre>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 mb-1">OUTPUT</p>
                          <pre className="bg-white border border-gray-200 rounded-lg p-3 text-xs font-mono text-gray-800 shadow-inner">
{tc.expected_output}</pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-300">
                <div className="text-center">
                  <Code2 className="w-12 h-12 mx-auto mb-3" />
                  <p className="font-medium">Select a problem to get started</p>
                </div>
              </div>
            )}
          </div>
        </Panel>

        <PanelResizeHandle className="w-1 bg-gray-100 hover:bg-emerald-200 transition-colors cursor-col-resize" />

        {/* ────── Right Panel: Editor & Output ────── */}
        <Panel defaultSize={56} minSize={32} className="flex flex-col bg-white">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative">
                <select
                  id="language-select"
                  value={language}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  className="appearance-none bg-white border border-gray-300 rounded-lg pl-3 pr-8 py-2 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 cursor-pointer shadow-sm"
                >
                  <option value="cpp">C++ 17</option>
                  <option value="python">Python 3.12</option>
                  <option value="java">Java 21</option>
                </select>
              </div>
              <div className="w-px h-6 bg-gray-200" />
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                {language === 'cpp' ? 'GCC 13' : language === 'python' ? 'CPython' : 'OpenJDK'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHistory(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-all"
                id="history-btn"
              >
                <History className="w-3.5 h-3.5" /> History
              </button>
              <button
                onClick={handleRun}
                disabled={running || !selectedProblem}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-white border-2 border-gray-300 text-gray-700 hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 transition-all shadow-sm"
                id="run-btn"
              >
                {running ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Run
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || (contestStatus !== 'live' && contestStatus !== 'ended') || !selectedProblem}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:from-emerald-600 hover:to-green-700 disabled:opacity-40 disabled:hover:from-emerald-500 transition-all shadow-md shadow-emerald-200 hover:shadow-lg hover:shadow-emerald-300"
                id="submit-btn"
              >
                {submitting ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Submit
              </button>
            </div>
          </div>

          {/* Code editor area */}
          <PanelGroup direction="vertical" className="flex-1 min-h-0">
            <Panel defaultSize={70} minSize={30} className="min-h-0">
              <CodeEditor language={language} code={code} onChange={setCode} />
            </Panel>
            <PanelResizeHandle className="h-1 bg-gray-100 hover:bg-emerald-200 transition-colors cursor-row-resize" />
            <Panel defaultSize={30} minSize={18} className="border-t-2 border-gray-200 flex flex-col bg-white min-h-0">
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white shrink-0">
              <button
                onClick={() => { setBottomTab('output'); setShowCustomInput(false); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  bottomTab === 'output'
                    ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" /> Output
              </button>
              <button
                onClick={() => { setBottomTab('custom'); setShowCustomInput(true); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  bottomTab === 'custom'
                    ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Plus className="w-3.5 h-3.5" /> Custom Input
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {bottomTab === 'output' ? (
                <div>
                  {(submitting || running) && (
                    <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl animate-pulse">
                      <div className="relative">
                        <div className="w-8 h-8 border-3 border-blue-200 rounded-full animate-spin border-t-blue-600" />
                        <Sparkles className="w-3 h-3 text-blue-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-blue-800">
                          {submitting ? 'Judging your solution...' : 'Executing...'}
                        </p>
                        <p className="text-xs text-blue-500">This may take a few seconds</p>
                      </div>
                    </div>
                  )}
                  {result && (() => {
                    const style = getVerdictStyle(result.verdict);
                    return (
                      <div className={`rounded-xl border-2 p-4 ${style.bg} ${style.border} ${
                        result.verdict === 'Accepted' ? 'accepted-glow' : ''
                      } animate-slide-in`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{style.icon}</span>
                            <span className={`font-bold text-base ${style.text}`}>{result.verdict}</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs opacity-70">
                            {result.passed_count !== undefined && result.total_count > 0 && (
                              <span className="font-mono font-medium">
                                {result.passed_count}/{result.total_count} passed
                              </span>
                            )}
                            {result.runtime_ms > 0 && (
                              <span className="font-mono font-medium">{result.runtime_ms}ms</span>
                            )}
                          </div>
                        </div>
                        {result.stdout && (
                          <pre className="text-xs font-mono mt-3 whitespace-pre-wrap bg-white/50 rounded-lg p-3 border border-gray-200/50">{result.stdout}</pre>
                        )}
                        {result.stderr && (
                          <pre className="text-xs font-mono mt-3 whitespace-pre-wrap bg-red-50/50 rounded-lg p-3 text-red-700 border border-red-200/50">{result.stderr}</pre>
                        )}
                      </div>
                    );
                  })()}
                  {!result && !submitting && !running && (
                    <div className="flex items-center gap-3 py-6 px-4 text-gray-300">
                      <Terminal className="w-5 h-5" />
                      <p className="text-sm">Run or submit your code to see results here</p>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <textarea
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    className="w-full h-24 bg-gray-50 border border-gray-200 rounded-xl p-3 font-mono text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none shadow-inner"
                    placeholder="Type your custom test input here..."
                  />
                  <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Click "Run" to test with this input
                  </p>
                </div>
              )}
            </div>
            </Panel>
          </PanelGroup>
        </Panel>
        </PanelGroup>
      </div>

      {/* Submission History Modal */}
      <SubmissionHistory
        problemId={selectedProblem?.id}
        isOpen={showHistory}
        virtualSession={isVirtual ? virtualSession : null}
        onClose={() => setShowHistory(false)}
      />
    </div>
  );
}

