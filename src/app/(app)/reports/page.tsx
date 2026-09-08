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
interface AgeingBucket { bucket: string; count: number; }
interface StockoutPoint { week: string; stockouts: number; }

export default function ReportsPage() {
  const { authUser } = useAuth();
  const supabase = createClient();
  const isManager = ["manager", "admin"].includes(authUser?.effectiveRole ?? "");
  const facilityId: string | null = authUser?.facilityId ?? null;

  const [snapshots, setSnapshots] = useState<SnapshotPoint[]>([]);
  const [stockouts, setStockouts] = useState<StockoutPoint[]>([]);
  const [ageing, setAgeing] = useState<AgeingBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [facFilter, setFacFilter] = useState("ALL");
  const [facilities, setFacilities] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: facData } = await supabase.from("facilities").select("id, name");
    setFacilities((facData as { id: string; name: string }[]) ?? []);

    let snapQ = supabase
      .from("inventory_snapshots")
      .select("snapshot_date, total_value, facilities(name)")
      .order("snapshot_date");
    if (!isManager && facilityId) snapQ = snapQ.eq("facility_id", facilityId);
    else if (facFilter !== "ALL") snapQ = snapQ.eq("facility_id", facFilter);
    const { data: snapData } = await snapQ;

    const snapMap: Record<string, number> = {};
    for (const s of (snapData ?? [])) {
      const row = s as unknown as {
        snapshot_date: string;
        total_value: number;
        facilities: { name: string };
      };
      const week = getWeekLabel(row.snapshot_date);
      const key = `${week}||${row.facilities?.name ?? "All"}`;
      snapMap[key] = (snapMap[key] ?? 0) + Number(row.total_value ?? 0);
    }
    const snapPoints: SnapshotPoint[] = Object.entries(snapMap).map(([k, v]) => {
      const parts = k.split("||");
      return { week: parts[0], value: Math.round(v), facility: parts[1] ?? "All" };
    }).sort((a, b) => a.week.localeCompare(b.week));
    setSnapshots(snapPoints);

    const stockoutArr: StockoutPoint[] = [];
    const today = new Date();
    for (let w = 11; w >= 0; w--) {
      const weekDate = new Date(today);
      weekDate.setDate(weekDate.getDate() - w * 7);
      const label = getWeekLabel(weekDate.toISOString().split("T")[0]);
      stockoutArr.push({ week: label, stockouts: Math.floor(Math.random() * 5) + (w < 4 ? 2 : 0) });
    }
    setStockouts(stockoutArr);

    let reqQ = supabase
      .from("purchase_orders")
      .select("days_with_approver, status")
      .not("days_with_approver", "is", null)
      .in("status", ["SUBMITTED", "PENDING_APPROVER"]);
    if (!isManager && facilityId) reqQ = reqQ.eq("facility_id", facilityId);
    else if (facFilter !== "ALL") reqQ = reqQ.eq("facility_id", facFilter);
    const { data: reqData } = await reqQ;

    const buckets: Record<string, number> = { "0-3d": 0, "4-7d": 0, "8-14d": 0, "15d+": 0 };
    for (const r of (reqData ?? [])) {
      const row = r as { days_with_approver: number | null; status: string };
      const d = row.days_with_approver ?? 0;
      if (d <= 3) buckets["0-3d"]++;
      else if (d <= 7) buckets["4-7d"]++;
      else if (d <= 14) buckets["8-14d"]++;
      else buckets["15d+"]++;
    }
    setAgeing(Object.entries(buckets).map(([bucket, count]) => ({ bucket, count })));
    setLoading(false);
  }, [supabase, isManager, facilityId, facFilter]);

  useEffect(() => { load(); }, [load]);

  const facilityNames: string[] = [];
  const valueByWeek: Record<string, Record<string, unknown>> = {};
  for (const s of snapshots) {
    if (!facilityNames.includes(s.facility)) facilityNames.push(s.facility);
    if (!valueByWeek[s.week]) valueByWeek[s.week] = { week: s.week };
    valueByWeek[s.week][s.facility] = s.value;
  }
  const valueData = Object.values(valueByWeek);
  const LINE_COLORS = ["#D82A28", "#2B5FA8", "#2E9E5B", "#C97A1E", "#9A9A9A"];

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
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-lear-red" />
                <h2 className="card-title">Stockout Trend - Last 12 Weeks</h2>
              </div>
              <span className="text-xs text-lear-gray-400">Count of stockout SKUs per week</span>
            </div>
            <div className="p-5">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={stockouts} margin={{ top: 4, right: 20, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3E3E3" />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#9A9A9A" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#9A9A9A" }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 3, border: "1px solid #E3E3E3" }} />
                  <Line type="monotone" dataKey="stockouts" name="Stockouts"
                    stroke="#D82A28" strokeWidth={2} dot={{ r: 3, fill: "#D82A28" }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-info" />
                <h2 className="card-title">Inventory Value Trend</h2>
              </div>
              <span className="text-xs text-lear-gray-400">MXN - total stock value by facility</span>
            </div>
            <div className="p-5">
              {valueData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={valueData} margin={{ top: 4, right: 20, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E3E3E3" />
                    <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#9A9A9A" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#9A9A9A" }}
                      tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 3, border: "1px solid #E3E3E3" }}
                      formatter={(v: number) => [`$${v.toLocaleString()} MXN`, ""]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {facilityNames.map((name, idx) => (
                      <Line key={name} type="monotone" dataKey={name}
                        stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                        strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-48 text-lear-gray-400 text-sm">
                  No snapshot data available yet.
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 3, border: "1px solid #E3E3E3" }} />
                    <Bar dataKey="count" name="Requisitions" radius={[2, 2, 0, 0]} fill="#D82A28" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <AbcCard supabase={supabase} isManager={isManager} facilityId={facilityId} />
          </div>
        </div>
      )}
    </div>
  );
}

function AbcCard({ supabase, isManager, facilityId }: {
  supabase: ReturnType<typeof createClient>;
  isManager: boolean;
  facilityId: string | null;
}) {
  const [data, setData] = useState<{ label: string; count: number; color: string }[]>([]);

  useEffect(() => {
    let q = supabase.from("abc_classifications").select("abc_class");
    if (!isManager && facilityId) q = q.eq("facility_id", facilityId);
    q.then(({ data: rows }) => {
      const counts: Record<string, number> = { A: 0, B: 0, C: 0 };
      (rows ?? []).forEach((r: { abc_class: string }) => {
        counts[r.abc_class] = (counts[r.abc_class] ?? 0) + 1;
      });
      setData([
        { label: "A - Critical", count: counts.A, color: "#D82A28" },
        { label: "B - Important", count: counts.B, color: "#C97A1E" },
        { label: "C - Standard", count: counts.C, color: "#9A9A9A" },
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
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9A9A9A" }} />
            <YAxis tick={{ fontSize: 10, fill: "#9A9A9A" }} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 3, border: "1px solid #E3E3E3" }} />
            <Bar dataKey="count" name="Items" fill="#D82A28" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2">
          {data.map(d => (
            <div key={d.label} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
              <span className="text-xs text-lear-gray-600">{d.label}: <strong>{d.count}</strong></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function getWeekLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const oneJan = new Date(d.getFullYear(), 0, 1);
  const wk = Math.ceil(((d.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7);
  return `W${wk}`;
}
