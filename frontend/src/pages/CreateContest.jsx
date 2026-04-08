import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Plus, Trash2, ChevronDown, ChevronUp, CheckSquare, Square,
  Calendar, Clock, FileText, Users, Zap, ArrowLeft
} from 'lucide-react';

export default function CreateContest() {
  const { apiFetch } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1); // 1: Details, 2: Problems, 3: Review
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Contest details
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDateTime, setStartDateTime] = useState('');
  const [endDateTime, setEndDateTime] = useState('');
  const [allowlistText, setAllowlistText] = useState('');

  // Problems
  const [problems, setProblems] = useState([]);
  const [expandedProblem, setExpandedProblem] = useState(null);

  function addProblem() {
    setProblems([...problems, {
      id: Date.now(),
      title: '',
      description: '',
      sample_input: '',
      sample_output: '',
      testcases: [],
    }]);
    setExpandedProblem(problems.length);
  }

  function updateProblem(idx, field, value) {
    const updated = [...problems];
    updated[idx] = { ...updated[idx], [field]: value };
    setProblems(updated);
  }

  function removeProblem(idx) {
    setProblems(problems.filter((_, i) => i !== idx));
    setExpandedProblem(null);
  }

  function addTestcase(problemIdx) {
    const updated = [...problems];
    updated[problemIdx].testcases.push({
      id: Date.now(),
      input: '',
      expected_output: '',
      is_sample: false,
      is_hidden: true,
    });
    setProblems(updated);
  }

  function updateTestcase(problemIdx, tcIdx, field, value) {
    const updated = [...problems];
    updated[problemIdx].testcases[tcIdx] = {
      ...updated[problemIdx].testcases[tcIdx],
      [field]: value,
    };
    setProblems(updated);
  }

  function removeTestcase(problemIdx, tcIdx) {
    const updated = [...problems];
    updated[problemIdx].testcases = updated[problemIdx].testcases.filter((_, i) => i !== tcIdx);
    setProblems(updated);
  }

  async function handleSubmit() {
    setError('');
    setLoading(true);

    try {
      // Parse datetime-local values (already in local time)
      const start = new Date(startDateTime);
      const end = new Date(endDateTime);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error('Please enter valid start and end times');
      }

      if (end <= start) {
        throw new Error('End time must be after start time');
      }

      const durationMin = Math.round((end - start) / 60000);
      if (durationMin < 1) {
        throw new Error('Contest must be at least 1 minute long');
      }

      // Parse allowlist
      const allowlist = allowlistText
        .split(/[\n,;]+/)
        .map(e => e.trim())
        .filter(Boolean);

      // 1. Create contest
      const contestData = await apiFetch('/contests', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          allowlist,
        }),
      });

      const contestId = contestData.contest.id;

      // 2. Create problems + testcases
      for (let i = 0; i < problems.length; i++) {
        const prob = problems[i];
        const probData = await apiFetch(`/problems/${contestId}`, {
          method: 'POST',
          body: JSON.stringify({
            title: prob.title,
            description: prob.description,
            sample_input: prob.sample_input,
            sample_output: prob.sample_output,
            sort_order: i,
          }),
        });

        const problemId = probData.problem.id;

        // Create testcases for this problem
        for (let j = 0; j < prob.testcases.length; j++) {
          const tc = prob.testcases[j];
          await apiFetch(`/testcases/${problemId}`, {
            method: 'POST',
            body: JSON.stringify({
              input: tc.input,
              expected_output: tc.expected_output,
              is_sample: tc.is_sample,
              is_hidden: tc.is_hidden,
              sort_order: j,
            }),
          });
        }
      }

      navigate(`/contests/${contestId}/admin`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-container max-w-4xl mx-auto">
      <button onClick={() => navigate('/')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Contests
      </button>

      <div className="flex items-center gap-3 mb-8">
        <Zap className="w-8 h-8 text-emerald-600" />
        <h1 className="text-2xl font-bold text-gray-900">Create Contest</h1>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-1 mb-8">
        {[
          { num: 1, label: 'Details' },
          { num: 2, label: 'Problems' },
          { num: 3, label: 'Review' },
        ].map(({ num, label }) => (
          <React.Fragment key={num}>
            <button
              onClick={() => setStep(num)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${step === num ? 'bg-emerald-600 text-white' : step > num ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}
            >
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                border-2 border-current">
                {num}
              </span>
              {label}
            </button>
            {num < 3 && <div className={`flex-1 h-0.5 ${step > num ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
          </React.Fragment>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-6 animate-slide-in">
          {error}
        </div>
      )}

      {/* Step 1: Contest Details */}
      {step === 1 && (
        <div className="card p-8 space-y-6 animate-fade-in">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-600" />
            Contest Details
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Title *</label>
            <input
              id="contest-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field"
              placeholder="e.g., Weekly Challenge #1"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea
              id="contest-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field h-24 resize-none"
              placeholder="Describe your contest..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <Calendar className="w-3.5 h-3.5 inline mr-1" /> Start Date & Time *
            </label>
            <input
              id="contest-start-datetime"
              type="datetime-local"
              value={startDateTime}
              onChange={(e) => setStartDateTime(e.target.value)}
              className="input-field"
              required
            />
            <p className="text-xs text-gray-400 mt-1">When the contest begins (your local time)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <Calendar className="w-3.5 h-3.5 inline mr-1" /> End Date & Time *
            </label>
            <input
              id="contest-end-datetime"
              type="datetime-local"
              value={endDateTime}
              onChange={(e) => setEndDateTime(e.target.value)}
              className="input-field"
              required
            />
            <p className="text-xs text-gray-400 mt-1">When the contest ends (your local time)</p>
            {startDateTime && endDateTime && new Date(endDateTime) > new Date(startDateTime) && (
              <p className="text-xs text-emerald-600 mt-1 font-medium">
                Duration: {Math.round((new Date(endDateTime) - new Date(startDateTime)) / 60000)} minutes
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <Users className="w-3.5 h-3.5 inline mr-1" /> Allowlist (emails)
            </label>
            <textarea
              id="contest-allowlist"
              value={allowlistText}
              onChange={(e) => setAllowlistText(e.target.value)}
              className="input-field h-24 resize-none font-mono text-xs"
              placeholder="Enter emails (one per line, comma, or semicolon separated)&#10;user1@example.com&#10;user2@example.com"
            />
            <p className="text-xs text-gray-400 mt-1">Only these users can see and join the contest. Your email is automatically included.</p>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => setStep(2)}
              disabled={!title || !startDateTime || !endDateTime}
              className="btn-primary"
            >
              Next: Add Problems →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Problems */}
      {step === 2 && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Problems ({problems.length})
            </h2>
            <button onClick={addProblem} className="btn-primary flex items-center gap-2" id="add-problem-btn">
              <Plus className="w-4 h-4" />
              Add Problem
            </button>
          </div>

          {problems.length === 0 && (
            <div className="card p-12 text-center">
              <FileText className="w-12 h-12 mx-auto mb-3 text-gray-200" />
              <p className="text-gray-500">No problems added yet. Click "Add Problem" to get started.</p>
            </div>
          )}

          {problems.map((prob, idx) => (
            <div key={prob.id} className="card overflow-hidden">
              <div
                className="flex items-center justify-between px-6 py-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => setExpandedProblem(expandedProblem === idx ? null : idx)}
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center text-sm font-bold text-emerald-700">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span className="font-medium text-gray-900">
                    {prob.title || `Problem ${idx + 1}`}
                  </span>
                  <span className="text-xs text-gray-400">
                    {prob.testcases.length} testcase{prob.testcases.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); removeProblem(idx); }}
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {expandedProblem === idx ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </div>

              {expandedProblem === idx && (
                <div className="p-6 space-y-5 border-t border-gray-100 animate-fade-in">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Problem Title *</label>
                    <input
                      value={prob.title}
                      onChange={(e) => updateProblem(idx, 'title', e.target.value)}
                      className="input-field"
                      placeholder="e.g., Two Sum"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Description *</label>
                    <textarea
                      value={prob.description}
                      onChange={(e) => updateProblem(idx, 'description', e.target.value)}
                      className="input-field h-32 resize-none"
                      placeholder="Describe the problem statement..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Sample Input Format</label>
                      <textarea
                        value={prob.sample_input}
                        onChange={(e) => updateProblem(idx, 'sample_input', e.target.value)}
                        className="input-field h-20 resize-none font-mono text-xs"
                        placeholder="e.g., 5&#10;1 2 3 4 5"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Sample Output Format</label>
                      <textarea
                        value={prob.sample_output}
                        onChange={(e) => updateProblem(idx, 'sample_output', e.target.value)}
                        className="input-field h-20 resize-none font-mono text-xs"
                        placeholder="e.g., 15"
                      />
                    </div>
                  </div>

                  {/* Testcases */}
                  <div className="border-t border-gray-100 pt-5">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-700">Test Cases</h4>
                      <button
                        onClick={() => addTestcase(idx)}
                        className="btn-secondary text-xs flex items-center gap-1 px-3 py-1.5"
                      >
                        <Plus className="w-3 h-3" />
                        Add Testcase
                      </button>
                    </div>

                    {prob.testcases.length === 0 && (
                      <p className="text-sm text-gray-400 italic">No test cases added yet</p>
                    )}

                    {prob.testcases.map((tc, tcIdx) => (
                      <div key={tc.id} className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-medium text-gray-600">Test Case #{tcIdx + 1}</span>
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                              <button
                                onClick={() => updateTestcase(idx, tcIdx, 'is_sample', !tc.is_sample)}
                                className="text-gray-500 hover:text-emerald-600"
                              >
                                {tc.is_sample ? <CheckSquare className="w-4 h-4 text-emerald-600" /> : <Square className="w-4 h-4" />}
                              </button>
                              Sample
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                              <button
                                onClick={() => updateTestcase(idx, tcIdx, 'is_hidden', !tc.is_hidden)}
                                className="text-gray-500 hover:text-orange-600"
                              >
                                {tc.is_hidden ? <CheckSquare className="w-4 h-4 text-orange-600" /> : <Square className="w-4 h-4" />}
                              </button>
                              Hidden
                            </label>
                            <button
                              onClick={() => removeTestcase(idx, tcIdx)}
                              className="p-1 text-red-400 hover:text-red-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Input</label>
                            <textarea
                              value={tc.input}
                              onChange={(e) => updateTestcase(idx, tcIdx, 'input', e.target.value)}
                              className="input-field h-16 resize-none font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Expected Output</label>
                            <textarea
                              value={tc.expected_output}
                              onChange={(e) => updateTestcase(idx, tcIdx, 'expected_output', e.target.value)}
                              className="input-field h-16 resize-none font-mono text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          <div className="flex justify-between pt-4">
            <button onClick={() => setStep(1)} className="btn-secondary">
              ← Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={problems.length === 0}
              className="btn-primary"
            >
              Next: Review →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div className="card p-8 space-y-6 animate-fade-in">
          <h2 className="text-lg font-semibold text-gray-900">Review & Create</h2>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-500">Title</p>
              <p className="font-medium text-gray-900">{title}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Duration</p>
              <p className="font-medium text-gray-900">
                {startDateTime && new Date(startDateTime).toLocaleString()} → {endDateTime && new Date(endDateTime).toLocaleString()}
              </p>
              {startDateTime && endDateTime && new Date(endDateTime) > new Date(startDateTime) && (
                <p className="text-xs text-emerald-600 mt-1">
                  ({Math.round((new Date(endDateTime) - new Date(startDateTime)) / 60000)} minutes)
                </p>
              )}
            </div>
            <div>
              <p className="text-sm text-gray-500">Problems</p>
              <p className="font-medium text-gray-900">{problems.length}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Allowlisted Users</p>
              <p className="font-medium text-gray-900">
                {allowlistText.split(/[\n,;]+/).filter(Boolean).length || 'Creator only'}
              </p>
            </div>
          </div>

          {description && (
            <div>
              <p className="text-sm text-gray-500">Description</p>
              <p className="text-sm text-gray-700 mt-1">{description}</p>
            </div>
          )}

          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Problems Overview</h3>
            {problems.map((prob, idx) => (
              <div key={prob.id} className="flex items-center gap-3 py-2">
                <span className="w-6 h-6 bg-emerald-100 rounded text-xs font-bold text-emerald-700 flex items-center justify-center">
                  {String.fromCharCode(65 + idx)}
                </span>
                <span className="text-sm text-gray-900">{prob.title}</span>
                <span className="text-xs text-gray-400">{prob.testcases.length} tc</span>
              </div>
            ))}
          </div>

          <div className="flex justify-between pt-4">
            <button onClick={() => setStep(2)} className="btn-secondary">
              ← Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="btn-primary flex items-center gap-2"
              id="create-contest-submit"
            >
              {loading ? <div className="spinner" /> : <><Zap className="w-4 h-4" /> Create Contest</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
