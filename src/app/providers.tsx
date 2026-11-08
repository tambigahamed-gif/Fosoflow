import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../types';
import { isCurrentAuthRequest } from './session-guard';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { AuthContext, type AuthContextValue } from './auth-context';

export function Providers({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const sessionRef = useRef<Session | null>(null);
  const revisionRef = useRef(0);
  const profileOwnerRef = useRef<string | null>(null);
  const mountedRef = useRef(false);

  const loadProfile = useCallback(async (userId: string) => {
    if (!supabase) return null;
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) throw error;
    return (data as Profile | null) ?? null;
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    mountedRef.current = true;

    const applySession = (nextSession: Session | null) => {
      const revision = ++revisionRef.current;
      const userId = nextSession?.user.id ?? null;
      sessionRef.current = nextSession;
      setSession(nextSession);

      if (!userId) {
        profileOwnerRef.current = null;
        setProfile(null);
        setLoading(false);
        return;
      }

      if (profileOwnerRef.current !== userId) {
        profileOwnerRef.current = null;
        setProfile(null);
      } else {
        setLoading(false);
        return;
      }

      setLoading(true);
      queueMicrotask(() => {
        void loadProfile(userId).then((nextProfile) => {
          if (!mountedRef.current || !isCurrentAuthRequest({ revision, userId }, { revision: revisionRef.current, userId: sessionRef.current?.user.id ?? null })) return;
          setProfile(nextProfile);
          profileOwnerRef.current = nextProfile ? userId : null;
        }).catch(() => {
          if (!mountedRef.current || !isCurrentAuthRequest({ revision, userId }, { revision: revisionRef.current, userId: sessionRef.current?.user.id ?? null })) return;
          setProfile(null);
          profileOwnerRef.current = null;
        }).finally(() => {
          if (mountedRef.current && isCurrentAuthRequest({ revision, userId }, { revision: revisionRef.current, userId: sessionRef.current?.user.id ?? null })) setLoading(false);
        });
      });
    };

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession);
    });

    const initialRevision = revisionRef.current;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mountedRef.current || revisionRef.current !== initialRevision) return;
      if (error) {
        setLoading(false);
        return;
      }
      applySession(data.session);
    }).catch(() => {
      if (mountedRef.current && revisionRef.current === initialRevision) {
        sessionRef.current = null;
        setSession(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      mountedRef.current = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    const activeSession = sessionRef.current;
    const userId = activeSession?.user.id;
    if (!userId) return;
    const revision = revisionRef.current;
    setLoading(true);
    try {
      const nextProfile = await loadProfile(userId);
      if (!mountedRef.current || !isCurrentAuthRequest({ revision, userId }, { revision: revisionRef.current, userId: sessionRef.current?.user.id ?? null })) return;
      setProfile(nextProfile);
      profileOwnerRef.current = nextProfile ? userId : null;
    } catch {
      if (!mountedRef.current || !isCurrentAuthRequest({ revision, userId }, { revision: revisionRef.current, userId: sessionRef.current?.user.id ?? null })) return;
      setProfile(null);
      profileOwnerRef.current = null;
    } finally {
      if (mountedRef.current && isCurrentAuthRequest({ revision, userId }, { revision: revisionRef.current, userId: sessionRef.current?.user.id ?? null })) setLoading(false);
    }
  }, [loadProfile]);

  const value = useMemo<AuthContextValue>(() => ({ session, user: session?.user ?? null, profile, loading, configured: isSupabaseConfigured, refreshProfile }), [session, profile, loading, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
