import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { X, Clock, Code2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

function getVerdictClass(verdict) {
  switch (verdict) {
    case 'Accepted': return 'verdict-accepted';
    case 'Wrong Answer': return 'verdict-wrong';
    case 'Time Limit Exceeded': return 'verdict-tle';
    case 'Runtime Error': return 'verdict-rte';
    case 'Compilation Error': return 'verdict-ce';
    case 'Pending': case 'Running': return 'verdict-pending';
    default: return 'text-gray-500';
  }
}

function getVerdictIcon(verdict) {
  switch (verdict) {
    case 'Accepted': return <CheckCircle className="w-4 h-4 text-emerald-600" />;
    case 'Wrong Answer': return <XCircle className="w-4 h-4 text-red-600" />;
    case 'Time Limit Exceeded': return <Clock className="w-4 h-4 text-orange-600" />;
    case 'Runtime Error': return <AlertTriangle className="w-4 h-4 text-purple-600" />;
    case 'Compilation Error': return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
    default: return <div className="spinner w-4 h-4" />;
  }
}

export default function SubmissionHistory({ problemId, isOpen, onClose }) {
  const { apiFetch } = useAuth();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCode, setSelectedCode] = useState(null);

  useEffect(() => {
    if (!isOpen || !problemId) return;

    setLoading(true);
    apiFetch(`/submissions/problem/${problemId}`)
      .then((data) => setSubmissions(data.submissions || []))
      .catch((err) => console.error('Failed to load submissions:', err))
      .finally(() => setLoading(false));
  }, [isOpen, problemId, apiFetch]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content p-0" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Submission History</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Code viewer modal */}
        {selectedCode && (
          <div className="modal-overlay" style={{ zIndex: 60 }} onClick={() => setSelectedCode(null)}>
            <div className="modal-content p-0 max-w-3xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <Code2 className="w-5 h-5 text-emerald-600" />
                  <h4 className="font-semibold text-gray-900">Submitted Code</h4>
                  <span className="badge-gray">{selectedCode.language}</span>
                </div>
                <button onClick={() => setSelectedCode(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <pre className="p-6 font-mono text-sm text-gray-800 bg-gray-50 overflow-x-auto max-h-[60vh]">
                {selectedCode.code}
              </pre>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="spinner w-6 h-6" />
            </div>
          ) : submissions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Code2 className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p>No submissions yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {submissions.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-100
                           hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => {
                    // Fetch full submission with code
                    apiFetch(`/submissions/${sub.id}`)
                      .then((data) => setSelectedCode(data.submission))
                      .catch(console.error);
                  }}
                >
                  <div className="flex items-center gap-3">
                    {getVerdictIcon(sub.verdict)}
                    <div>
                      <span className={`text-sm font-medium ${getVerdictClass(sub.verdict)}`}>
                        {sub.verdict}
                      </span>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {sub.language} • {sub.passed_count}/{sub.total_count} passed
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">
                      {new Date(sub.submitted_at).toLocaleString()}
                    </p>
                    {sub.runtime_ms > 0 && (
                      <p className="text-xs text-gray-400">{sub.runtime_ms}ms</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
