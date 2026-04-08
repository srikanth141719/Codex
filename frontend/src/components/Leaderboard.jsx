import React from 'react';
import { Trophy, Medal, Award } from 'lucide-react';

function formatTime(minutes) {
  if (minutes === null || minutes === undefined) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function RankBadge({ rank }) {
  if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-500" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
  if (rank === 3) return <Award className="w-5 h-5 text-amber-600" />;
  return <span className="text-sm font-bold text-gray-600">{rank}</span>;
}

function ProblemCell({ probData }) {
  if (!probData) {
    return <td className="px-3 py-2.5 text-center text-gray-300">—</td>;
  }

  if (probData.accepted) {
    return (
      <td className="px-3 py-2.5 text-center">
        <div className="flex flex-col items-center">
          <span className="text-xs font-bold text-emerald-600">
            {probData.attempts > 1 ? `+${probData.attempts - 1}` : '+'}
          </span>
          <span className="text-[10px] text-emerald-500 font-mono">
            {formatTime(probData.accept_time)}
          </span>
        </div>
      </td>
    );
  }

  if (probData.attempts > 0) {
    return (
      <td className="px-3 py-2.5 text-center">
        <span className="text-xs font-bold text-red-500">
          -{probData.attempts}
        </span>
      </td>
    );
  }

  return <td className="px-3 py-2.5 text-center text-gray-300">—</td>;
}

export default function Leaderboard({ leaderboard = [], problems = [], currentUserId }) {
  if (leaderboard.length === 0) {
    return (
      <div className="text-center py-12">
        <Trophy className="w-12 h-12 mx-auto mb-3 text-gray-200" />
        <p className="text-gray-500 text-sm">No standings yet. Be the first to solve a problem!</p>
      </div>
    );
  }

  // Generate problem letters (A, B, C, ...)
  const problemLetters = problems.map((_, i) => String.fromCharCode(65 + i));

  return (
    <div className="overflow-x-auto">
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th className="w-12 text-center">#</th>
            <th>Who</th>
            <th className="text-center w-10">=</th>
            <th className="text-center">Penalty</th>
            {problems.map((prob, i) => (
              <th key={prob.id} className="text-center min-w-[60px]">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-bold">{problemLetters[i]}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leaderboard.map((entry) => (
            <tr
              key={entry.user_id}
              className={`transition-colors ${
                entry.user_id === currentUserId
                  ? 'bg-emerald-50 border-l-2 border-l-emerald-500'
                  : ''
              }`}
            >
              <td className="text-center">
                <RankBadge rank={entry.rank} />
              </td>
              <td>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-emerald-100 rounded-full flex items-center justify-center text-xs font-bold text-emerald-700">
                    {entry.username?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <span className={`text-sm font-medium ${
                    entry.user_id === currentUserId ? 'text-emerald-700 font-bold' : 'text-gray-900'
                  }`}>
                    {entry.username}
                  </span>
                </div>
              </td>
              <td className="text-center">
                <span className="text-sm font-bold text-gray-800">{entry.solved}</span>
              </td>
              <td className="text-center">
                <span className="text-sm font-mono text-gray-600">{entry.penalty}</span>
              </td>
              {problems.map((prob) => (
                <ProblemCell key={prob.id} probData={entry.problems?.[prob.id]} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
