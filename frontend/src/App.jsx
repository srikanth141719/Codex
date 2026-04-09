import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Home from './pages/Home';
import CreateContest from './pages/CreateContest';
import AdminDashboard from './pages/AdminDashboard';
import ContestWorkspace from './pages/ContestWorkspace';
import Profile from './pages/Profile';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="spinner w-8 h-8" />
      </div>
    );
  }
  return user ? children : <Navigate to="/login" replace />;
}

function GuestRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="spinner w-8 h-8" />
      </div>
    );
  }
  return !user ? children : <Navigate to="/" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
      <Route path="/signup" element={<GuestRoute><Signup /></GuestRoute>} />
      <Route path="/" element={<ProtectedRoute><><Navbar /><Home /></></ProtectedRoute>} />
      <Route path="/contests/create" element={<ProtectedRoute><><Navbar /><CreateContest /></></ProtectedRoute>} />
      <Route path="/contests/:id/admin" element={<ProtectedRoute><><Navbar /><AdminDashboard /></></ProtectedRoute>} />
      <Route path="/contests/:id" element={<ProtectedRoute><ContestWorkspace /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><><Navbar /><Profile /></></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
