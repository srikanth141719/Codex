import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Code2, LogOut, Plus, User, ChevronDown } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-200/80 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl flex items-center justify-center
                          shadow-lg shadow-emerald-200 group-hover:shadow-emerald-300 group-hover:scale-105 transition-all duration-200">
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900 tracking-tight">
              Code<span className="bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent">X</span>
            </span>
          </Link>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <Link
              to="/contests/create"
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold text-sm rounded-xl
                       hover:from-emerald-600 hover:to-green-700 transition-all shadow-md shadow-emerald-200 hover:shadow-lg hover:shadow-emerald-300"
              id="create-contest-btn"
            >
              <Plus className="w-4 h-4" />
              Create Contest
            </Link>

            <div className="relative group">
              <button className="flex items-center gap-2.5 px-3 py-2 rounded-xl
                               hover:bg-gray-100 transition-all text-sm font-medium text-gray-700 border border-transparent hover:border-gray-200">
                <div className="w-8 h-8 bg-gradient-to-br from-emerald-100 to-green-100 rounded-full flex items-center justify-center border border-emerald-200">
                  <span className="text-sm font-bold text-emerald-700">
                    {user?.username?.charAt(0)?.toUpperCase() || 'U'}
                  </span>
                </div>
                <span className="hidden sm:inline">{user?.username}</span>
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>

              <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border border-gray-200
                            opacity-0 invisible group-hover:opacity-100 group-hover:visible
                            transition-all duration-200 transform group-hover:translate-y-0 translate-y-1 z-50">
                <div className="p-4 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900">{user?.username}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{user?.email}</p>
                </div>
                <div className="p-2">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-600
                             hover:bg-red-50 transition-colors rounded-lg font-medium"
                    id="logout-btn"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
