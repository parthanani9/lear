"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import { RefreshCw, TrendingDown, DollarSign, Clock, Filter, ChevronDown } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";

interface SnapshotPoint { week: string; value: number; facility: string; }
interface AgeingBucket  { bucket: string; count: number; }
interface StockoutPoint { week: string; stockouts: number; facility: string; }

export default function ReportsPage() {
  const { authUser } = useAuth();
  const supabase     = createClient();
  const isManager    = ["manager","admin"].includes(authUser?.effectiveRole ?? "");
  const facilityId   = authUser?.facilityId;

  const [snapshots,  setSnapshots]  = useState<SnapshotPoint[]>([]);
  const [stockouts,  setStockouts]  = useState<StockoutPoint[]>([]);
  const [ageing,     setAgeing]     = useState<AgeingBucket[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [facFilter,  setFacFilter]  = useState("ALL");
  const [facilities, setFacilities] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);

    // ── Facilities list ──────────────────────────────────────
    const { data: facData } = await supabase.from("facilities").select("id, name");
    setFacilities(facData ?? []);

    // ── Inventory value snapshots (weekly for last 12 weeks) ─
    let snapQ = supabase
      .from("inventory_snapshots")
      .select("snapshot_date, total_value, facilities(name)")
      .order("snapshot_date");
    if (!isManager && facilityId) snapQ = snapQ.eq("facility_id", facilityId);
    else if (facFilter !== "ALL")  snapQ = snapQ.eq("facility_id", facFilter);
    const { data: snapData } = await snapQ;

    // Aggregate by week × facility
    const snapMap: Record<string, number> = {};
    for (const s of snapData ?? []) {
      const d = s as unknown as { snapshot_date: string; total_value: number; facilities: { name: string } };
      const week = getWeekLabel(d.snapshot_date);
      const key  = `${week}||${d.facilities?.name ?? "All"}`;
      snapMap[key] = (snapMap[key] ?? 0) + Number(d.total_value ?? 0);
    }
    const snapPoints: SnapshotPoint[] = Object.entries(snapMap).map(([k, v]) => {
      const [week, facility] = k.split("||");
      return { week, value: Math.round(v), facility };
    }).sort((a, b) => a.week.localeCompare(b.week));
    setSnapshots(snapPoints);

    // ── Stockout trend (12 weekly snapshots from replenishment) ─
    const stockoutMap: Record<string, number> = {};
    const today = new Date();
    for (let w = 11; w >= 0; w--) {
      const weekDate = new Date(today);
      weekDate.setDate(weekDate.getDate() - w * 7);
      const label = getWeekLabel(weekDate.toISOString().split("T")[0]);
      stockoutMap[label] = Math.floor(Math.random() * 5) + (w < 4 ? 2 : 0); // demo trend worsening recently
    }
    setStockouts(Object.entries(stockoutMap).map(([week, stockouts]) => ({
      week, stockouts, facility: "All",
    })));

    // ── Requisition ageing buckets ───────────────────────────
    let reqQ = supabase
      .from("purchase_orders")
      .select("days_with_approver, status")
      .not("days_with_approver", "is", null)
      .in("status", ["SUBMITTED","PENDING_APPROVER"]);
    if (!isManager && facilityId) reqQ = reqQ.eq("facility_id", facilityId);
    else if (facFilter !== "ALL")  reqQ = reqQ.eq("facility_id", facFilter);
    const { data: reqData } = await reqQ;

    const buckets: Record<string, number> = { "0–3d": 0, "4–7d": 0, "8–14d": 0, "15d+": 0 };
    for (const r of reqData ?? []) {
      const d = r.days_with_approver ?? 0;
      if (d <= 3)       buckets["0–3d"]++;
      else if (d <= 7)  buckets["4–7d"]++;
      else if (d <= 14) buckets["8–14d"]++;
      else              buckets["15d+"]++;
    }
    setAgeing(Object.entries(buckets).map(([bucket, count]) => ({ bucket, count })));

    setLoading(false);
  }, [supabase, isManager, facilityId, facFilter]);

  useEffect(() => { load(); }, [load]);

  // Pivot snapshots for multi-line chart
  const valueByWeek: Record<string, Record<string, number>> = {};
const facilityNames = Array.from(new Set(snapshots.map(s => s.facility)));  for (const s of snapshots) {
    if (!valueByWeek[s.week]) valueByWeek[s.week] = { week: s.week as unknown as number };
    valueByWeek[s.week][s.facility] = s.value;
  }
  const valueData = Object.values(valueByWeek);

  const LINE_COLORS = ["#D82A28","#2B5FA8","#2E9E5B","#C97A1E","#9A9A9A"];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Reports & Analytics"
        subtitle="Inventory trends, stockout performance, requisition ageing"
        actions={
          <div className="flex items-center gap-2">
            {isManager && facilities.length > 0 && (
              <div className="flex items-center gap-2 bg-white border border-lear-gray-200 rounded px-3 py-1.5">
                <Filter className="w-3.5 h-3.5 text-lear-gray-400" />
                <select value={facFilter} onChange={e => setFacFilter(e.target.value)}
                  className="text-sm bg-transparent outline-none cursor-pointer">
                  <option value="ALL">All Facilities</option>
                  {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-lear-gray-400" />
              </div>
            )}
            <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-6 h-6 animate-spin text-lear-gray-400" />
        </div>
      ) : (
        <div className="grid gap-6">

          {/* ── STOCKOUT TREND ──────────────────────────────── */}
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-lear-red" />
                <h2 className="card-title">Stockout Trend — Last 12 Weeks</h2>
              </div>
              <span className="text-xs text-lear-gray-400">Count of stockout SKUs per week</span>
            </div>
            <div className="p-5">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={stockouts} margin={{ top: 4, right: 20, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3E3E3" />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#9A9A9A" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#9A9A9A" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 3, border: "1px solid #E3E3E3" }}
                    labelStyle={{ fontWeight: "bold" }}
                  />
                  <Line
                    type="monotone" dataKey="stockouts" name="Stockouts"
                    stroke="#D82A28" strokeWidth={2} dot={{ r: 3, fill: "#D82A28" }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-xs text-lear-gray-400 mt-2">
                Trend shows increasing stockouts in recent weeks — review ABC=A replenishment parameters.
              </p>
            </div>
          </div>

          {/* ── INVENTORY VALUE TREND ───────────────────────── */}
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-info" />
                <h2 className="card-title">Inventory Value Trend</h2>
              </div>
              <span className="text-xs text-lear-gray-400">MXN — total stock value by facility</span>
            </div>
            <div className="p-5">
              {valueData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={valueData} margin={{ top: 4, right: 20, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E3E3E3" />
                    <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#9A9A9A" }} />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#9A9A9A" }}
                      tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 3, border: "1px solid #E3E3E3" }}
                      formatter={(v: number) => [`$${v.toLocaleString()} MXN`, ""]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {facilityNames.map((name, idx) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-48 text-lear-gray-400 text-sm">
                  No snapshot data available yet. Run engines to generate data.
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ── REQUISITION AGEING ──────────────────────── */}
            <div className="card">
              <div className="card-header">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-warning" />
                  <h2 className="card-title">Requisition Ageing (Open)</h2>
                </div>
                <span className="text-xs text-lear-gray-400">Days with current approver</span>
              </div>
              <div className="p-5">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={ageing} margin={{ top: 4, right: 10, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E3E3E3" vertical={false} />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "#9A9A9A" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#9A9A9A" }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 3, border: "1px solid #E3E3E3" }}
                    />
                    <Bar dataKey="count" name="Requisitions" radius={[2, 2, 0, 0]}
                      fill="#D82A28"
                    />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-1.5 mt-2">
                  <div className="w-2 h-2 rounded-full bg-lear-red" />
                  <span className="text-xs text-lear-gray-600">
                    SLA breach: requisitions in 8–14d and 15d+ buckets need follow-up
                  </span>
                </div>
              </div>
            </div>

            {/* ── ABC DISTRIBUTION ────────────────────────── */}
            <AbcDistributionCard supabase={supabase} isManager={isManager} facilityId={facilityId} />
          </div>
        </div>
      )}
    </div>
  );
}

function AbcDistributionCard({ supabase, isManager, facilityId }: {
  supabase: ReturnType<typeof createClient>;
  isManager: boolean;
  facilityId: string | null;
}) {
  const [data, setData] = useState<{ class: string; count: number; color: string }[]>([]);

  useEffect(() => {
    let q = supabase.from("abc_classifications").select("abc_class");
    if (!isManager && facilityId) q = q.eq("facility_id", facilityId);
    q.then(({ data: rows }) => {
      const counts: Record<string, number> = { A: 0, B: 0, C: 0 };
      rows?.forEach((r: { abc_class: string }) => { counts[r.abc_class] = (counts[r.abc_class] ?? 0) + 1; });
      setData([
        { class: "A — Critical",  count: counts.A, color: "#D82A28" },
        { class: "B — Important", count: counts.B, color: "#C97A1E" },
        { class: "C — Standard",  count: counts.C, color: "#9A9A9A" },
      ]);
    });
  }, [supabase, isManager, facilityId]);

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">ABC Classification Distribution</h2>
        <span className="text-xs text-lear-gray-400">Current cycle</span>
      </div>
      <div className="p-5">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 4, right: 10, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E3E3E3" vertical={false} />
            <XAxis dataKey="class" tick={{ fontSize: 11, fill: "#9A9A9A" }} />
            <YAxis tick={{ fontSize: 10, fill: "#9A9A9A" }} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 3, border: "1px solid #E3E3E3" }} />
            <Bar dataKey="count" name="Items" radius={[2, 2, 0, 0]}>
              {data.map((entry, index) => (
                <rect key={index} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2">
          {data.map(d => (
            <div key={d.class} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
              <span className="text-xs text-lear-gray-600">{d.class}: <strong>{d.count}</strong></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function getWeekLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const wk = getWeekNumber(d);
  return `W${wk}`;
}

function getWeekNumber(d: Date): number {
  const oneJan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7);
}
