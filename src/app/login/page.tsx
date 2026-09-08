"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const DEMO_USERS = [
  { label: "Admin",    email: "admin@lear.com",    role: "Admin" },
  { label: "Manager",  email: "manager@lear.com",  role: "Manager" },
  { label: "Planner",  email: "planner@lear.com",  role: "Planner" },
  { label: "Area Lead",email: "arealead@lear.com", role: "Area Lead" },
  { label: "Viewer",   email: "viewer@lear.com",   role: "Viewer" },
];

export default function LoginPage() {
  const router   = useRouter();
  const supabase = createClient();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("LearDemo2026!");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) { setError(err.message); setLoading(false); return; }
    router.push("/dashboard");
    router.refresh();
  }

  function fillDemo(demoEmail: string) {
    setEmail(demoEmail);
    setPassword("LearDemo2026!");
    setError("");
  }

  return (
    <div className="min-h-screen bg-lear-gray-050 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-lear-red flex items-center justify-center">
              <span className="text-white font-black text-lg">L</span>
            </div>
            <div className="text-left">
              <div className="font-black text-lear-black text-xl leading-tight">LEAR</div>
              <div className="text-lear-gray-600 text-xs leading-tight">CORPORATION</div>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-lear-black">Inventory Planning Cockpit</h1>
          <p className="text-lear-gray-600 text-sm mt-1">Sign in to your account</p>
        </div>

        {/* Login form */}
        <div className="card p-6 mb-4">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="form-label">Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="form-input"
                placeholder="name@lear.com"
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="form-label">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="form-input"
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <p className="text-xs text-lear-red bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </p>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        {/* Demo quick-fill */}
        <div className="card p-4">
          <p className="text-xs font-bold text-lear-gray-600 uppercase tracking-wide mb-3">
            Demo accounts — click to fill
          </p>
          <div className="grid grid-cols-1 gap-1.5">
            {DEMO_USERS.map(u => (
              <button
                key={u.email}
                onClick={() => fillDemo(u.email)}
                className="flex items-center justify-between px-3 py-2 rounded border
                           border-lear-gray-200 hover:border-lear-red hover:bg-red-50
                           transition-colors text-left group"
              >
                <span className="text-sm font-medium text-lear-black">{u.label}</span>
                <span className="text-xs text-lear-gray-400 group-hover:text-lear-red">{u.email}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-lear-gray-400 mt-3 text-center">
            All accounts use password: <span className="font-mono font-semibold">LearDemo2026!</span>
          </p>
        </div>
      </div>
    </div>
  );
}
