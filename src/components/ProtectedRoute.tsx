/**
 * Rol bazlı korumalı rota (CLAUDE.md · Aşama 2a):
 * - Token yoksa /login'e yönlendirir
 * - `roles` verildiyse rol uyuşmazsa / adresine yönlendirir
 * - İlk yükleme doğrulaması sürerken boş ekran gösterir
 */

import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Role } from '../types';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  roles?: Role[];
}

export default function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return null;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
