import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Leaderboard from '../components/Leaderboard';
import { createSocket } from '../utils/socket';
import {
  ArrowLeft, Settings, Clock, Users, Edit3, Save, Plus, Trash2,
  CheckSquare, Square, RefreshCw, Eye, Trophy, BarChart3, FileText,
  Shield, Sparkles
} from 'lucide-react';

export default function AdminDashboard() {
  const { id } = useParams();
  const { apiFetch, user, token } = useAuth();
  const navigate = useNavigate();

  const [contest, setContest] = useState(null);
  const [problems, setProblems] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('leaderboard');
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editAllowlist, setEditAllowlist] = useState('');

  const loadContest = useCallback(async () => {
    try {
      const data = await apiFetch(`/contests/${id}`);
      if (!data.isCreator) { navigate(`/contests/${id}`); return; }
      setContest(data.contest);
      setProblems(data.contest.problems || []);
      const c = data.contest;
      setEditTitle(c.title);
      setEditDescription(c.description || '');
      // Convert ISO to datetime-local format (YYYY-MM-DDTHH:MM)
      const toLocal = (iso) => {
        const d = new Date(iso);
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      };
      setEditStart(toLocal(c.start_time));
      setEditEnd(toLocal(c.end_time));
      setEditAllowlist((c.allowlist || []).join('\n'));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id, apiFetch, navigate]);

  useEffect(() => { loadContest(); }, [loadContest]);

  // Real-time leaderboard via Socket.io — using fixed connection
  useEffect(() => {
    if (!token) return;
    const socket = createSocket(token);

    socket.on('connect', () => {
      socket.emit('join:contest', id);
    });

    socket.on('leaderboard:update', (data) => {
      if (data.contestId === id) setLeaderboard(data.leaderboard);
    });

    apiFetch(`/leaderboard/${id}`)
      .then(data => setLeaderboard(data.leaderboard || []))
      .catch(console.error);

    return () => socket.disconnect();
  }, [id, token, apiFetch]);

  async function saveContestDetails() {
    setSaving(true);
    try {
      const startDT = new Date(editStart);
      const endDT = new Date(editEnd);
      await apiFetch(`/contests/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: editTitle, description: editDescription,
          start_time: startDT.toISOString(), end_time: endDT.toISOString(),
          allowlist: editAllowlist.split(/[\n,;]+/).map(e => e.trim()).filter(Boolean),
        }),
      });
      setEditMode(false);
      loadContest();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  }

  async function addNewProblem() {
    try {
      await apiFetch(`/problems/${id}`, {
        method: 'POST',
        body: JSON.stringify({ title: `Problem ${problems.length + 1}`, description: 'Enter problem description...' }),
      });
      loadContest();
    } catch (err) { alert(err.message); }
  }

  async function addNewTestcase(problemId) {
    try {
      await apiFetch(`/testcases/${problemId}`, {
        method: 'POST',
        body: JSON.stringify({ input: '', expected_output: '', is_sample: false, is_hidden: true }),
      });
      loadContest();
    } catch (err) { alert(err.message); }
  }

  async function updateProblem(problemId, data) {
    try { await apiFetch(`/problems/${problemId}`, { method: 'PUT', body: JSON.stringify(data) }); }
    catch (err) { alert(err.message); }
  }

  async function updateTestcase(tcId, data) {
    try { await apiFetch(`/testcases/${tcId}`, { method: 'PUT', body: JSON.stringify(data) }); loadContest(); }
    catch (err) { alert(err.message); }
  }

  async function deleteTestcase(tcId) {
    if (!confirm('Delete this testcase?')) return;
    try { await apiFetch(`/testcases/${tcId}`, { method: 'DELETE' }); loadContest(); }
    catch (err) { alert(err.message); }
  }

  async function deleteProblem(probId) {
    if (!confirm('Delete this problem and all its testcases?')) return;
    try { await apiFetch(`/problems/${probId}`, { method: 'DELETE' }); loadContest(); }
    catch (err) { alert(err.message); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-10 h-10 border-4 border-emerald-200 rounded-full animate-spin border-t-emerald-600" />
      </div>
    );
  }

  if (!contest) return <div className="page-container text-center text-gray-500">Contest not found</div>;

  const now = new Date();
  const status = now < new Date(contest.start_time) ? 'Upcoming' :
                 now <= new Date(contest.end_time) ? 'Live' : 'Ended';

  return (
    <div className="page-container max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link to="/" className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-sm">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">{contest.title}</h1>
              {status === 'Live' && (
                <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-emerald-700 text-xs font-bold">LIVE</span>
                </div>
              )}
            </div>
            <p className="text-sm text-gray-500 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> Admin Dashboard
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link to={`/contests/${id}`} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm">
            <Eye className="w-4 h-4" /> View as User
          </Link>
          <button onClick={loadContest} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 bg-gray-100/80 p-1.5 rounded-2xl w-fit backdrop-blur-sm">
        {[
          { key: 'leaderboard', icon: Trophy, label: 'Leaderboard' },
          { key: 'settings', icon: Settings, label: 'Settings' },
          { key: 'problems', icon: FileText, label: 'Problems' },
        ].map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
              ${tab === key
                ? 'bg-white text-gray-900 shadow-md'
                : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'}`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* ═══ Leaderboard Tab ═══ */}
      {tab === 'leaderboard' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-yellow-500 rounded-xl flex items-center justify-center shadow-md">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Live Standings</h2>
              <p className="text-xs text-gray-400">Real-time Codeforces-style leaderboard</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Auto-updating
            </div>
          </div>
          <Leaderboard leaderboard={leaderboard} problems={problems} currentUserId={user?.id} />
        </div>
      )}

      {/* ═══ Settings Tab ═══ */}
      {tab === 'settings' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-gray-400 to-gray-500 rounded-xl flex items-center justify-center shadow-sm">
                <Settings className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Contest Settings</h2>
                <p className="text-xs text-gray-400">Edit times, description, and allowlist</p>
              </div>
            </div>
            {editMode ? (
              <div className="flex gap-2">
                <button onClick={() => setEditMode(false)} className="btn-secondary text-sm">Cancel</button>
                <button onClick={saveContestDetails} disabled={saving} className="btn-primary text-sm flex items-center gap-1.5">
                  {saving ? <div className="spinner w-3 h-3" /> : <Save className="w-3.5 h-3.5" />} Save Changes
                </button>
              </div>
            ) : (
              <button onClick={() => setEditMode(true)} className="btn-secondary text-sm flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5" /> Edit
              </button>
            )}
          </div>

          {editMode ? (
            <div className="space-y-5 bg-gray-50 rounded-xl p-6 border border-gray-100">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Title</label>
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
                <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="input-field h-24 resize-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Start Date & Time</label>
                <input type="datetime-local" value={editStart} onChange={(e) => setEditStart(e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">End Date & Time</label>
                <input type="datetime-local" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Allowlist (emails)</label>
                <textarea value={editAllowlist} onChange={(e) => setEditAllowlist(e.target.value)} className="input-field h-28 resize-none font-mono text-xs" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6">
              {[
                { label: 'Title', value: contest.title },
                { label: 'Status', value: status },
                { label: 'Start', value: new Date(contest.start_time).toLocaleString() },
                { label: 'End', value: new Date(contest.end_time).toLocaleString() },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{label}</p>
                  <p className="font-semibold text-gray-800">{value}</p>
                </div>
              ))}
              <div className="col-span-2 bg-gray-50 rounded-xl p-4 border border-gray-100">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Allowlisted Users</p>
                <div className="flex flex-wrap gap-2">
                  {(contest.allowlist || []).map((email, i) => (
                    <span key={i} className="bg-white border border-gray-200 rounded-full px-3 py-1 text-xs font-mono text-gray-600">{email}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Problems Tab ═══ */}
      {tab === 'problems' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-gray-400" />
              <span className="text-sm font-medium text-gray-500">{problems.length} problem{problems.length !== 1 ? 's' : ''}</span>
            </div>
            <button onClick={addNewProblem} className="btn-primary flex items-center gap-2 text-sm shadow-md shadow-emerald-200">
              <Plus className="w-4 h-4" /> Add Problem
            </button>
          </div>

          {problems.map((prob, idx) => (
            <div key={prob.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl flex items-center justify-center text-sm font-bold text-white shadow-md">
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <input
                      defaultValue={prob.title}
                      onBlur={(e) => updateProblem(prob.id, { title: e.target.value })}
                      className="input-field py-1.5 text-lg font-bold w-72"
                    />
                  </div>
                  <button onClick={() => deleteProblem(prob.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <textarea
                  defaultValue={prob.description}
                  onBlur={(e) => updateProblem(prob.id, { description: e.target.value })}
                  className="input-field h-24 resize-none text-sm"
                  placeholder="Problem description..."
                />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sample Input</label>
                    <textarea defaultValue={prob.sample_input} onBlur={(e) => updateProblem(prob.id, { sample_input: e.target.value })} className="input-field h-16 resize-none font-mono text-xs mt-1" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sample Output</label>
                    <textarea defaultValue={prob.sample_output} onBlur={(e) => updateProblem(prob.id, { sample_output: e.target.value })} className="input-field h-16 resize-none font-mono text-xs mt-1" />
                  </div>
                </div>

                {/* Testcases */}
                <div className="border-t border-gray-100 pt-5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-bold text-gray-700">Test Cases ({prob.testcases?.length || 0})</h4>
                    <button onClick={() => addNewTestcase(prob.id)} className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors">
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>

                  {(prob.testcases || []).map((tc, tcIdx) => (
                    <div key={tc.id} className="mb-3 p-4 bg-gray-50/80 rounded-xl border border-gray-100">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-gray-400">#{tcIdx + 1}</span>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium">
                            <button onClick={() => updateTestcase(tc.id, { is_sample: !tc.is_sample })}>
                              {tc.is_sample ? <CheckSquare className="w-4 h-4 text-emerald-600" /> : <Square className="w-4 h-4 text-gray-300" />}
                            </button>
                            <span className={tc.is_sample ? 'text-emerald-700' : 'text-gray-400'}>Sample</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium">
                            <button onClick={() => updateTestcase(tc.id, { is_hidden: !tc.is_hidden })}>
                              {tc.is_hidden ? <CheckSquare className="w-4 h-4 text-orange-500" /> : <Square className="w-4 h-4 text-gray-300" />}
                            </button>
                            <span className={tc.is_hidden ? 'text-orange-700' : 'text-gray-400'}>Hidden</span>
                          </label>
                          <button onClick={() => deleteTestcase(tc.id)} className="text-red-300 hover:text-red-600 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <textarea defaultValue={tc.input} onBlur={(e) => updateTestcase(tc.id, { input: e.target.value })} className="input-field h-16 resize-none font-mono text-xs" placeholder="Input" />
                        <textarea defaultValue={tc.expected_output} onBlur={(e) => updateTestcase(tc.id, { expected_output: e.target.value })} className="input-field h-16 resize-none font-mono text-xs" placeholder="Expected Output" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
