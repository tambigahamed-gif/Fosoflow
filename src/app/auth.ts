import { useContext } from 'react';
import type { AppRole } from '../types';
import { AuthContext } from './auth-context';

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé dans Providers');
  return context;
}

export function roleHome(role: AppRole) {
  return role === 'admin' ? '/admin/dashboard' : `/${role}/dashboard`;
}
