import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { LoadingState, SetupNotice } from '../../components/ui/Callout';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import type { AppRole } from '../../types';

export function ProtectedRoute({ allowedRoles }: { allowedRoles: AppRole[] }) {
  const { user, profile, loading, configured } = useAuth();
  if (!configured) return <main className="page-wrap py-12"><SetupNotice /></main>;
  if (loading) return <LoadingState label="Vérification de votre session…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (!profile) return <main className="page-wrap py-12"><div className="card-surface p-8 text-center"><h1 className="font-display text-2xl font-extrabold">Profil en préparation</h1><p className="mt-2 text-sm text-faso-muted">Votre profil n’est pas encore disponible. Vérifiez votre e-mail puis reconnectez-vous.</p></div></main>;
  if (!allowedRoles.includes(profile.role)) return <Navigate to={`/${profile.role}/dashboard`} replace />;
  return <DashboardLayout role={profile.role}><Outlet /></DashboardLayout>;
}
