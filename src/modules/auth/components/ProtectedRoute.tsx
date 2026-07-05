import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../../app/providers/AuthProvider';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  console.info('[agro-debug] ProtectedRoute render', {
    pathname: window.location.pathname,
    isLoading,
    hasUser: Boolean(user),
  });
  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" /></div>;
  if (!user) {
    console.warn('[agro-debug] ProtectedRoute redirect to /login: no user', {
      pathname: window.location.pathname,
    });
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
