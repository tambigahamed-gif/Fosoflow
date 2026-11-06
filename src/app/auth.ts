import { useContext } from 'react';
import type { AppRole } from '../types';
import { AuthContext } from './auth-context';

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé dans Providers');
  return context;
}

export function roleHome(role: AppRole) {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'service_provider') return '/provider/dashboard';
  return `/${role}/dashboard`;
}
