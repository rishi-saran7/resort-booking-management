"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL!;
const TOKEN_KEY = "resort_token";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StaffUser {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "staff";
  phone?: string | null;
  created_at?: string;
}

interface AuthContextValue {
  user: StaffUser | null;
  token: string | null;
  /** true while the initial session restore is in flight */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<StaffUser | null>(null);
  const [token, setToken]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true); // blocks render until session restored

  const router = useRouter();

  // ── Internal helpers ──────────────────────────────────────────────────────

  const clearSession = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(TOKEN_KEY);
    }
    setToken(null);
    setUser(null);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    router.push("/login");
  }, [clearSession, router]);

  // ── Restore session on mount ──────────────────────────────────────────────
  //
  // 1. Read token from localStorage
  // 2. Hit /api/auth/me to validate it and get fresh user data from DB
  // 3. If invalid / expired → clear + redirect to /login on next navigation
  //
  useEffect(() => {
    const stored = typeof window !== "undefined"
      ? localStorage.getItem(TOKEN_KEY)
      : null;

    if (!stored) {
      setLoading(false);
      return;
    }

    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${stored}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data?.profile) {
          setToken(stored);
          setUser(data.data.profile as StaffUser);
        } else {
          clearSession();
        }
      })
      .catch(() => clearSession())
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only

  // ── Login ─────────────────────────────────────────────────────────────────

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error ?? "Login failed. Please try again.");
      }

      const { access_token, profile } = data.data as {
        access_token: string;
        profile: StaffUser;
      };

      localStorage.setItem(TOKEN_KEY, access_token);
      setToken(access_token);
      setUser(profile);
      router.push("/dashboard");
    },
    [router]
  );

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
