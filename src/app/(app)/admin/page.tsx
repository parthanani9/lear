"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { UserProfile, UserRole, BusinessRule } from "@/types";
import { Users, Settings, Activity, ChevronRight, RefreshCw, Check, AlertCircle } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import clsx from "clsx";

type Tab = "users" | "roles" | "rules" | "integrations";

const ROLE_LABELS: Record<UserRole, string> = {
  admin:     "IT / Platform Admin",
  manager:   "Inventory Manager",
  planner:   "Requisitor / Planner",
  area_lead: "Warehouse / Area Lead",
  viewer:    "Read-Only Viewer",
};

const ROLE_OPTS: { value: UserRole; label: string }[] = [
  { value: "admin",     label: "IT / Platform Admin" },
  { value: "manager",   label: "Inventory Manager" },
  { value: "planner",   label: "Requisitor / Planner" },
  { value: "area_lead", label: "Warehouse / Area Lead" },
  { value: "viewer",    label: "Read-Only Viewer" },
];

export default function AdminPage() {
  const { authUser, refreshProfile } = useAuth();
  const supabase = createClient();
  const [tab, setTab]         = useState<Tab>("users");
  const [users, setUsers]     = useState<(UserProfile & { facility?: { name: string } })[]>([]);
  const [rules, setRules]     = useState<BusinessRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRule, setSavingRule] = useState<Record<string, boolean>>({});
  const [ruleEdits, setRuleEdits]   = useState<Record<string, string>>({});
  const [switchingSaved, setSwitchingSaved] = useState(false);

  const loadUsers = useCallback(async () => {
    const { data } = await supabase
      .from("user_profiles")
      .select("*, facility:facilities(name)")
      .order("role");
    setUsers((data as typeof users) ?? []);
  }, [supabase]);

  const loadRules = useCallback(async () => {
    const { data } = await supabase.from("business_rules").select("*").order("rule_key");
    setRules((data as BusinessRule[]) ?? []);
    const edits: Record<string, string> = {};
    data?.forEach((r: BusinessRule) => { edits[r.id] = r.rule_value; });
    setRuleEdits(edits);
  }, [supabase]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      await Promise.all([loadUsers(), loadRules()]);
      setLoading(false);
    }
    load();
  }, [loadUsers, loadRules]);

  // ── Demo Role Switcher ─────────────────────────────────────
  async function switchDemoRole(userId: string, role: UserRole | null) {
    setSwitchingSaved(false);
    await supabase
      .from("user_profiles")
      .update({ demo_active_role: role })
      .eq("id", userId);
    setSwitchingSaved(true);
    await loadUsers();
    // Refresh own profile if switching self
    if (userId === authUser?.id) await refreshProfile();
    setTimeout(() => setSwitchingSaved(false), 2000);
  }

  // ── Business Rule Save ────────────────────────────────────
  async function saveRule(id: string, key: string) {
    setSavingRule(p => ({ ...p, [id]: true }));
    await supabase.from("business_rules")
      .update({ rule_value: ruleEdits[id], updated_at: new Date().toISOString() })
      .eq("id", id);
    setSavingRule(p => ({ ...p, [id]: false }));
    await loadRules();
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "users",        label: "User Management",     icon: <Users className="w-4 h-4" /> },
    { id: "roles",        label: "Demo Role Switcher",  icon: <ChevronRight className="w-4 h-4" /> },
    { id: "rules",        label: "Business Rules",      icon: <Settings className="w-4 h-4" /> },
    { id: "integrations", label: "Integration Health",  icon: <Activity className="w-4 h-4" /> },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Admin Panel"
        subtitle="User management, demo role switcher, business rules, integration health"
      />

      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 border-b border-lear-gray-200">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={clsx("flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
              tab === t.id
                ? "border-lear-red text-lear-red"
                : "border-transparent text-lear-gray-600 hover:text-lear-black")}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <RefreshCw className="w-5 h-5 animate-spin text-lear-gray-400" />
        </div>
      ) : (
        <>
          {/* ── USER MANAGEMENT ─────────────────────────────── */}
          {tab === "users" && (
            <div className="card overflow-hidden">
              <div className="card-header">
                <h2 className="card-title">All Users</h2>
                <span className="text-xs text-lear-gray-400">{users.length} registered accounts</span>
              </div>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Facility</th>
                      <th>Demo Role Active</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u, i) => (
                      <tr key={u.id} className={i % 2 === 1 ? "alt" : ""}>
                        <td className="font-semibold text-sm">{u.full_name}</td>
                        <td className="font-mono text-xs text-lear-gray-600">{u.email}</td>
                        <td>
                          <span className={clsx("badge",
                            u.role === "admin" ? "badge-navy" :
                            u.role === "manager" ? "badge-blue" :
                            u.role === "planner" ? "badge-green" :
                            u.role === "area_lead" ? "badge-amber" : "badge-gray")}>
                            {ROLE_LABELS[u.role]}
                          </span>
                        </td>
                        <td className="text-xs">{u.facility?.name ?? <span className="text-lear-gray-400">All Facilities</span>}</td>
                        <td>
                          {u.demo_active_role
                            ? <span className="badge badge-amber">{ROLE_LABELS[u.demo_active_role]}</span>
                            : <span className="text-xs text-lear-gray-400">—</span>}
                        </td>
                        <td>
                          <span className={clsx("badge", u.active ? "badge-green" : "badge-gray")}>
                            {u.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── DEMO ROLE SWITCHER ───────────────────────────── */}
          {tab === "roles" && (
            <div className="space-y-4">
              <div className="card p-4 border-l-4 border-warning bg-amber-50">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-lear-black">Demo Mode — Role Switcher</p>
                    <p className="text-xs text-lear-gray-600 mt-0.5">
                      Set a <strong>Demo Active Role</strong> on any user to simulate how the app looks
                      from that role's perspective. The actual Supabase Auth role is unchanged.
                      To clear the demo role, select "— Use Real Role —".
                    </p>
                  </div>
                </div>
              </div>

              {switchingSaved && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 border border-green-200 rounded text-sm text-success font-semibold">
                  <Check className="w-4 h-4" /> Role updated — reload the page to see changes take effect.
                </div>
              )}

              <div className="grid gap-3">
                {users.map(u => (
                  <div key={u.id} className="card p-4 flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <div className="font-semibold text-sm text-lear-black">{u.full_name}</div>
                      <div className="text-xs text-lear-gray-600 font-mono">{u.email}</div>
                      <div className="text-xs text-lear-gray-400 mt-0.5">
                        Real role: <strong>{ROLE_LABELS[u.role]}</strong>
                        {u.demo_active_role && (
                          <> · Demo active: <span className="text-warning font-semibold">{ROLE_LABELS[u.demo_active_role]}</span></>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="form-label mb-0 whitespace-nowrap">Switch to:</label>
                      <select
                        defaultValue={u.demo_active_role ?? ""}
                        onChange={e => switchDemoRole(u.id, (e.target.value || null) as UserRole | null)}
                        className="form-select py-1.5 text-xs w-48">
                        <option value="">— Use Real Role —</option>
                        {ROLE_OPTS.map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              <div className="card p-4 bg-lear-gray-050">
                <p className="text-xs text-lear-gray-600 font-semibold mb-2">How to demo each role:</p>
                <ol className="text-xs text-lear-gray-600 space-y-1 list-decimal list-inside">
                  <li>Log in as <code className="font-mono bg-white px-1 rounded">admin@lear.com</code></li>
                  <li>Navigate to Admin → Demo Role Switcher</li>
                  <li>Set the active role on your own user (admin@lear.com)</li>
                  <li>Reload the page — sidebar, data, and actions all change to reflect that role</li>
                  <li>To reset: set "— Use Real Role —" and reload</li>
                </ol>
              </div>
            </div>
          )}

          {/* ── BUSINESS RULES ───────────────────────────────── */}
          {tab === "rules" && (
            <div className="card overflow-hidden">
              <div className="card-header">
                <h2 className="card-title">Configurable Business Rules</h2>
                <span className="text-xs text-lear-gray-400">All parameters. No code change required.</span>
              </div>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Parameter</th>
                      <th>Description</th>
                      <th className="text-right">Value</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((r, i) => (
                      <tr key={r.id} className={i % 2 === 1 ? "alt" : ""}>
                        <td className="font-mono text-xs">{r.rule_key}</td>
                        <td className="text-xs text-lear-gray-600 max-w-xs">{r.description}</td>
                        <td className="text-right">
                          <input
                            type="text"
                            value={ruleEdits[r.id] ?? r.rule_value}
                            onChange={e => setRuleEdits(p => ({ ...p, [r.id]: e.target.value }))}
                            className="form-input py-1 text-right tabular w-24 text-sm"
                          />
                        </td>
                        <td>
                          <button
                            onClick={() => saveRule(r.id, r.rule_key)}
                            disabled={savingRule[r.id] || ruleEdits[r.id] === r.rule_value}
                            className={clsx("btn btn-sm",
                              ruleEdits[r.id] !== r.rule_value ? "btn-primary" : "btn-ghost opacity-50")}>
                            {savingRule[r.id] ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            {savingRule[r.id] ? "Saving" : "Save"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-3 bg-lear-gray-050 border-t border-lear-gray-200">
                <p className="text-xs text-lear-gray-600">
                  After changing formula parameters (safety factors, reorder frequencies), run the
                  MRP Engine from the Replenishment page to recalculate all recommendations.
                </p>
              </div>
            </div>
          )}

          {/* ── INTEGRATION HEALTH ───────────────────────────── */}
          {tab === "integrations" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    name: "EAM (Enterprise Asset Management)",
                    status: "Simulated — demo mode",
                    lastSync: "Data loaded via seed SQL",
                    records: "60 items, 3 facilities",
                    errors: 0,
                    healthy: true,
                  },
                  {
                    name: "Coupa (Procurement)",
                    status: "Simulated — demo mode",
                    lastSync: "Requisitions created in-app",
                    records: "8 open POs seeded",
                    errors: 0,
                    healthy: true,
                  },
                  {
                    name: "MVP (Maintenance Planning)",
                    status: "Not connected — demo mode",
                    lastSync: "Plant C uses MVP; data seeded",
                    records: "20 items (Plant C)",
                    errors: 0,
                    healthy: true,
                  },
                  {
                    name: "SAP Integration",
                    status: "Not in scope — Phase 2+",
                    lastSync: "—",
                    records: "—",
                    errors: 0,
                    healthy: false,
                  },
                ].map(sys => (
                  <div key={sys.name} className={clsx("card p-4 border-l-4",
                    sys.healthy ? "border-success" : "border-lear-gray-200")}>
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-sm text-lear-black">{sys.name}</h3>
                      <span className={clsx("badge",
                        sys.healthy ? "badge-green" : "badge-gray")}>
                        {sys.healthy ? "OK" : "N/A"}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs text-lear-gray-600">
                      <div><span className="font-semibold">Status:</span> {sys.status}</div>
                      <div><span className="font-semibold">Last Sync:</span> {sys.lastSync}</div>
                      <div><span className="font-semibold">Records:</span> {sys.records}</div>
                      <div><span className="font-semibold">Errors:</span> {sys.errors}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="card p-4 bg-lear-gray-050">
                <p className="text-xs text-lear-gray-600">
                  <strong>Note:</strong> In production, this panel shows live EAM sync timestamps,
                  Coupa API status, record counts per sync, and error rates. Integration is configured
                  post-SOW based on Lear IT API access confirmation (see Open Questions Q-01–Q-04 in spec).
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
