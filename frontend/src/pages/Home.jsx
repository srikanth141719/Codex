import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Timer from '../components/Timer';
import {
  Calendar, Clock, Users, ChevronRight, Trophy, Plus, Zap,
  Code2, ArrowRight, Sparkles, CircleDot, MoreVertical, PlayCircle, BarChart3, Trash2
} from 'lucide-react';

function ContestCard({ contest, currentUserId, onDelete }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const now = new Date();
  const start = new Date(contest.start_time);
  const end = new Date(contest.end_time);
  
  let status, statusBg, statusDot;
  if (now < start) {
    status = 'Upcoming';
    statusBg = 'bg-blue-50 text-blue-700 border-blue-200';
    statusDot = 'bg-blue-500';
  } else if (now >= start && now <= end) {
    status = 'Live';
    statusBg = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    statusDot = 'bg-emerald-500';
  } else {
    status = 'Ended';
    statusBg = 'bg-gray-50 text-gray-500 border-gray-200';
    statusDot = 'bg-gray-400';
  }

  const canShowMenu = status === 'Live' || status === 'Ended';
  const isCreator = !!currentUserId && contest.creator_id === currentUserId;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/contests/${contest.id}`)}
      onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/contests/${contest.id}`); }}
      className="group relative bg-white rounded-2xl border border-gray-200 p-6 
               hover:border-emerald-300 hover:shadow-xl hover:shadow-emerald-100/50
               transition-all duration-300 transform hover:-translate-y-0.5 cursor-pointer"
    >
      {/* Status indicator */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusBg}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${statusDot} ${status === 'Live' ? 'animate-pulse' : ''}`} />
            {status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canShowMenu && (
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                aria-label="Contest actions"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-20 overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    onClick={() => navigate(`/contests/${contest.id}?view=leaderboard`)}
                  >
                    <BarChart3 className="w-4 h-4 text-amber-600" />
                    See Leaderboard
                  </button>
                  <button
                    className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    onClick={() => {
                      const durationMs = Math.max(1, end - start);
                      const key = `codex_virtual_${contest.id}`;
                      localStorage.setItem(key, JSON.stringify({ startMs: Date.now(), durationMs }));
                      localStorage.removeItem(`${key}_score`);
                      navigate(`/contests/${contest.id}?virtual=1`);
                    }}
                  >
                    <PlayCircle className="w-4 h-4 text-emerald-600" />
                    Take a Virtual Contest
                  </button>
                  {isCreator && (
                    <button
                      className="w-full text-left px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-50 flex items-center gap-2 border-t border-gray-100"
                      onClick={async () => {
                        setMenuOpen(false);
                        await onDelete?.(contest.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                      Delete Contest
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
        </div>
      </div>

      {/* Title */}
      <h3 className="text-lg font-bold text-gray-900 group-hover:text-emerald-700 transition-colors mb-2 line-clamp-1">
        {contest.title}
      </h3>

      {contest.description && (
        <p className="text-sm text-gray-400 mb-4 line-clamp-2 leading-relaxed">{contest.description}</p>
      )}

      {/* Meta info */}
      <div className="flex items-center gap-4 text-xs text-gray-400 mb-4">
        <div className="flex items-center gap-1.5 bg-gray-50 rounded-full px-2.5 py-1">
          <Calendar className="w-3 h-3" />
          {start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
        <div className="flex items-center gap-1.5 bg-gray-50 rounded-full px-2.5 py-1">
          <Clock className="w-3 h-3" />
          {Math.round((end - start) / 60000)} min
        </div>
        <div className="flex items-center gap-1.5 bg-gray-50 rounded-full px-2.5 py-1">
          <Code2 className="w-3 h-3" />
          {contest.problem_count || 0} problems
        </div>
      </div>

      {/* Countdown for upcoming */}
      {status === 'Upcoming' && (
        <div className="mt-2">
          <Timer targetTime={contest.start_time} label="Starts in" />
        </div>
      )}

      {/* Hover accent line */}
      <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-gradient-to-r from-emerald-500 to-green-500 rounded-full scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />
    </div>
  );
}

export default function Home() {
  const { apiFetch, user } = useAuth();
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('live');

  const refresh = useMemo(() => async () => {
    const data = await apiFetch('/contests');
    if (data.groups) {
      const all = [
        ...(data.groups.live || []),
        ...(data.groups.upcoming || []),
        ...(data.groups.past || []),
      ];
      setContests(all);
    } else {
      setContests(data.contests || []);
    }
  }, [apiFetch]);

  useEffect(() => {
    refresh()
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [refresh]);

  async function handleDeleteContest(contestId) {
    if (!confirm('Delete this contest? This will permanently delete problems, testcases, and submissions.')) return;
    try {
      await apiFetch(`/contests/${contestId}`, { method: 'DELETE' });
      await refresh();
    } catch (e) {
      alert(e.message);
    }
  }

  const now = new Date();
  const live = contests.filter(c => now >= new Date(c.start_time) && now <= new Date(c.end_time));
  const upcoming = contests.filter(c => now < new Date(c.start_time));
  const past = contests.filter(c => now > new Date(c.end_time));

  const tabData = {
    live,
    upcoming,
    past,
  };

  const shown = tabData[activeTab] || [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Hero */}
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 rounded-3xl p-10 mb-10 shadow-2xl">
          <div className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(16,185,129,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(52,211,153,0.2) 0%, transparent 50%)'
            }}
          />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                <span className="text-emerald-400 text-sm font-semibold uppercase tracking-wider">Dashboard</span>
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">Your Contests</h1>
              <p className="text-emerald-200/60 text-lg">Compete, code, and climb the leaderboard</p>
            </div>
            <Link
              to="/contests/create"
              className="hidden sm:flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-400 to-green-500 text-white font-bold text-sm rounded-xl
                       hover:from-emerald-500 hover:to-green-600 transition-all shadow-lg shadow-emerald-900/30 hover:shadow-xl group"
            >
              <Plus className="w-4 h-4" />
              New Contest
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          {/* Stats bar */}
          <div className="relative z-10 flex items-center gap-6 mt-8 pt-6 border-t border-white/10">
            {[
              { label: 'Total', value: contests.length, color: 'text-white' },
              { label: 'Live', value: live.length, color: 'text-emerald-400' },
              { label: 'Upcoming', value: upcoming.length, color: 'text-blue-400' },
              { label: 'Past', value: past.length, color: 'text-gray-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-white/40 font-medium uppercase tracking-wider">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-gray-200 p-6 animate-pulse">
                <div className="skeleton h-5 w-20 rounded-full mb-4" />
                <div className="skeleton h-6 w-3/4 rounded-lg mb-3" />
                <div className="skeleton h-4 w-full rounded-lg mb-2" />
                <div className="skeleton h-4 w-2/3 rounded-lg" />
              </div>
            ))}
          </div>
        ) : contests.length === 0 ? (
          <div className="text-center py-24 bg-white rounded-3xl border border-gray-200 shadow-sm">
            <div className="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-200 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Trophy className="w-10 h-10 text-gray-300" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">No Contests Yet</h2>
            <p className="text-gray-400 mb-8 max-w-md mx-auto">Create your first coding contest or wait for an invitation from another user</p>
            <Link to="/contests/create" className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold rounded-xl shadow-lg shadow-emerald-200 hover:shadow-xl transition-all">
              <Plus className="w-5 h-5" />
              Create Your First Contest
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100/80 p-1.5 rounded-2xl w-fit backdrop-blur-sm">
              {[
                { key: 'live', label: 'Live Contests', count: live.length },
                { key: 'upcoming', label: 'Upcoming Contests', count: upcoming.length },
                { key: 'past', label: 'Past Contests', count: past.length },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
                    ${activeTab === t.key ? 'bg-white text-gray-900 shadow-md' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'}`}
                >
                  <span>{t.label}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    t.key === 'live' ? 'bg-emerald-100 text-emerald-700' :
                    t.key === 'upcoming' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {t.count}
                  </span>
                </button>
              ))}
            </div>

            {/* List */}
            {shown.length === 0 ? (
              <div className="text-center py-14 bg-white rounded-3xl border border-gray-200 shadow-sm">
                <p className="text-gray-500 font-medium">No contests in this tab.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {shown.map((c) => (
                  <ContestCard
                    key={c.id}
                    contest={c}
                    currentUserId={user?.id}
                    onDelete={handleDeleteContest}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
