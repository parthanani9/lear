"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AuthUser, UserProfile, UserRole } from "@/types";

export function useAuth() {
  const supabase = createClient();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loading, setLoading]   = useState(true);

  const loadProfile = useCallback(async (userId: string, email: string) => {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("*, facility:facilities(*)")
      .eq("id", userId)
      .single();

    if (!profile) return null;

    const effectiveRole = (profile.demo_active_role ?? profile.role) as UserRole;
    const facilityId    = effectiveRole === "manager" || effectiveRole === "admin"
      ? null
      : profile.facility_id;

    return {
      id:    userId,
      email,
      profile: profile as unknown as UserProfile,
      effectiveRole,
      facilityId,
    } as AuthUser;
  }, [supabase]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!mounted) return;
      if (user) {
        const au = await loadProfile(user.id, user.email ?? "");
        if (mounted) setAuthUser(au);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        if (session?.user) {
          const au = await loadProfile(session.user.id, session.user.email ?? "");
          setAuthUser(au);
        } else {
          setAuthUser(null);
        }
        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile, supabase.auth]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: "global" });
    setAuthUser(null);
    window.location.href = "/login";
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (!authUser) return;
    const au = await loadProfile(authUser.id, authUser.email);
    setAuthUser(au);
  }, [authUser, loadProfile]);

  return { authUser, loading, signOut, refreshProfile };
}
