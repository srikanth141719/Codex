import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Trophy, BarChart3, Clock, ArrowRight, X } from 'lucide-react';

function ProgressModal({ open, onClose, item }) {
  if (!open) return null;
  const s = item?.stats || {};
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl border border-gray-200 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="font-bold text-gray-900">Progress</div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-3 text-sm">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Total Questions</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{s.total_questions ?? 0}</div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div className="text-xs text-emerald-700 font-semibold uppercase tracking-wider">Fully Solved</div>
            <div className="text-2xl font-bold text-emerald-800 mt-1">{s.fully_solved ?? 0}</div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="text-xs text-amber-700 font-semibold uppercase tracking-wider">Partially Solved</div>
            <div className="text-2xl font-bold text-amber-800 mt-1">{s.partially_solved ?? 0}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Total Score</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{Number(s.total_score ?? 0).toFixed(1)}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 col-span-2">
            <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Final Rank</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{s.final_rank ?? '—'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Profile() {
  const { apiFetch, user } = useAuth();
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('history');
  const [selected, setSelected] = useState(null);

  const userId = user?.id;

  const load = useMemo(() => async () => {
    if (!userId) return;
    const [s, h] = await Promise.all([
      apiFetch(`/users/${userId}/stats`),
      apiFetch(`/users/${userId}/history`),
    ]);
    setStats(s);
    setHistory(h.history || []);
  }, [apiFetch, userId]);

  useEffect(() => {
    load()
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [load]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="w-10 h-10 border-4 border-emerald-200 rounded-full animate-spin border-t-emerald-600" />
      </div>
    );
  }

  const by = stats?.by_difficulty || { Easy: 0, Medium: 0, Hard: 0 };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center shadow-md shadow-emerald-200">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-lg font-bold text-gray-900">{user?.username}</div>
              <div className="text-xs text-gray-400">Profile</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Solved</div>
              <div className="text-3xl font-bold text-gray-900 mt-1">{stats?.total_solved ?? 0}</div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
              <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Easy</div>
              <div className="text-3xl font-bold text-emerald-800 mt-1">{by.Easy ?? 0}</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <div className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Medium</div>
              <div className="text-3xl font-bold text-amber-800 mt-1">{by.Medium ?? 0}</div>
            </div>
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5">
              <div className="text-xs font-semibold text-rose-700 uppercase tracking-wider">Hard</div>
              <div className="text-3xl font-bold text-rose-800 mt-1">{by.Hard ?? 0}</div>
            </div>
          </div>
        </div>

        <div className="flex gap-1 mb-6 bg-gray-100/80 p-1.5 rounded-2xl w-fit backdrop-blur-sm">
          {[
            { key: 'history', label: 'Past History', icon: Clock },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
                ${tab === key ? 'bg-white text-gray-900 shadow-md' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'}`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {tab === 'history' && (
          <div className="space-y-4">
            {history.length === 0 ? (
              <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-10 text-center text-gray-500">
                No past contests yet.
              </div>
            ) : (
              history.map((item) => (
                <div key={item.contest.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-lg font-bold text-gray-900">{item.contest.title}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        {new Date(item.contest.start_time).toLocaleString()} → {new Date(item.contest.end_time).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/contests/${item.contest.id}`}
                        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        View Contest <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                      <button
                        onClick={() => setSelected(item)}
                        className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                      >
                        <BarChart3 className="w-3.5 h-3.5" /> Progress
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <ProgressModal open={!!selected} onClose={() => setSelected(null)} item={selected} />
      </div>
    </div>
  );
}

