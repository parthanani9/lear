"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ReplenishmentRecommendation, PurchaseOrder, TransferRecommendation, AbcClassification } from "@/types";
import {
  AlertCircle, Package, ShoppingCart, TrendingDown,
  CheckCircle, Clock, RefreshCw, Building2,
} from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import PageHeader from "@/components/layout/PageHeader";

export default function DashboardPage() {
  const { authUser } = useAuth();
  const supabase     = createClient();
  const role         = authUser?.effectiveRole ?? "viewer";
  const facilityId   = authUser?.facilityId;

  const [recs, setRecs]       = useState<ReplenishmentRecommendation[]>([]);
  const [orders, setOrders]   = useState<PurchaseOrder[]>([]);
  const [transfers, setTransfers] = useState<TransferRecommendation[]>([]);
  const [abcPending, setAbcPending] = useState<AbcClassification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authUser) return;
    async function load() {
      const today = new Date().toISOString().split("T")[0];
      const isManager = ["manager","admin"].includes(role);

      // Replenishment recs
      let q = supabase
        .from("replenishment_recommendations")
        .select("*, items(sku_code, description, category), facilities(name)")
        .eq("run_date", today)
        .neq("status", "HEALTHY")
        .order("status");
      if (!isManager && facilityId) q = q.eq("facility_id", facilityId);
      const { data: recsData } = await q.limit(10);
      setRecs((recsData as ReplenishmentRecommendation[]) ?? []);

      // Open purchase orders
      let oq = supabase
        .from("purchase_orders")
        .select("*, items(sku_code, description), facilities(name)")
        .in("status", ["DRAFT","SUBMITTED","PENDING_APPROVER"])
        .order("created_at", { ascending: false });
      if (!isManager && facilityId) oq = oq.eq("facility_id", facilityId);
      const { data: ordersData } = await oq.limit(8);
      setOrders((ordersData as PurchaseOrder[]) ?? []);

      // Transfer recommendations (manager/admin only)
      if (isManager) {
        const { data: tData } = await supabase
          .from("transfer_recommendations")
          .select("*, items(sku_code,description), from_facility:facilities!transfer_recommendations_from_facility_id_fkey(name), to_facility:facilities!transfer_recommendations_to_facility_id_fkey(name)")
          .eq("status", "RECOMMENDED")
          .eq("signal", "MATCH")
          .limit(5);
        setTransfers((tData as unknown as TransferRecommendation[]) ?? []);
      }

      // ABC pending (area_lead / manager)
      if (["area_lead","manager","admin"].includes(role)) {
        let aq = supabase
          .from("abc_classifications")
          .select("*, items(sku_code, description), facilities(name)")
          .eq("decision", "PENDING");
        if (!isManager && facilityId) aq = aq.eq("facility_id", facilityId);
        const { data: abcData } = await aq.limit(5);
        setAbcPending((abcData as AbcClassification[]) ?? []);
      }

      setLoading(false);
    }
    load();
  }, [authUser, role, facilityId, supabase]);

  const stockouts    = recs.filter(r => r.status === "STOCKOUT").length;
  const belowMin     = recs.filter(r => r.status === "BELOW_MIN").length;
  const atReorder    = recs.filter(r => r.status === "AT_REORDER").length;
  const agingOrders  = orders.filter(o => o.days_with_approver && o.days_with_approver > 5).length;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="w-6 h-6 animate-spin text-lear-gray-400" />
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Dashboard"
        subtitle={`Live inventory position${role === "manager" || role === "admin" ? " — all facilities" : " — your facility"}`}
      />

      {/* ── STATS ROW ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard accent="red" icon={<AlertCircle className="w-5 h-5"/>}
          label="Stockouts" value={stockouts} delta={stockouts > 0 ? "Requires immediate action" : "None today"} />
        <StatCard accent="amber" icon={<Package className="w-5 h-5"/>}
          label="Below Minimum" value={belowMin} delta="Order recommended" />
        <StatCard accent="black" icon={<ShoppingCart className="w-5 h-5"/>}
          label="Open Requisitions" value={orders.length}
          delta={agingOrders > 0 ? `${agingOrders} aging > 5 days` : "All within SLA"} />
        {role === "manager" || role === "admin" ? (
          <StatCard accent="blue" icon={<Building2 className="w-5 h-5"/>}
            label="Transfer Matches" value={transfers.length} delta="Cross-plant opportunities" />
        ) : (
          <StatCard accent="green" icon={<TrendingDown className="w-5 h-5"/>}
            label="At Reorder Point" value={atReorder} delta="Plan ahead" />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── REPLENISHMENT ALERTS ───────────────────────── */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Items Requiring Action</h2>
            <Link href="/replenishment" className="text-xs text-lear-red hover:underline">
              View all →
            </Link>
          </div>
          <div className="overflow-x-auto">
            {recs.length === 0 ? (
              <div className="flex items-center gap-2 px-5 py-8 text-lear-gray-400 text-sm">
                <CheckCircle className="w-4 h-4 text-success" />
                All items are healthy today
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr><th>SKU</th><th>Stock</th><th>Min</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {recs.slice(0, 6).map((r, i) => (
                    <tr key={r.id} className={i % 2 === 1 ? "alt" : ""}>
                      <td>
                        <span className="font-mono text-xs font-semibold">{r.items?.sku_code}</span>
                        <div className="text-xs text-lear-gray-400 truncate max-w-[140px]">{r.items?.description}</div>
                      </td>
                      <td className={clsx("tabular font-semibold", r.current_stock === 0 && "text-lear-red")}>
                        {r.current_stock}
                      </td>
                      <td className="tabular">{Math.round(r.min_level)}</td>
                      <td><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── OPEN REQUISITIONS ─────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Open Requisitions</h2>
            <Link href="/requisitions" className="text-xs text-lear-red hover:underline">
              View all →
            </Link>
          </div>
          <div className="overflow-x-auto">
            {orders.length === 0 ? (
              <p className="px-5 py-8 text-sm text-lear-gray-400">No open requisitions</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr><th>Req #</th><th>SKU</th><th>Status</th><th>Days</th></tr>
                </thead>
                <tbody>
                  {orders.map((o, i) => (
                    <tr key={o.id} className={i % 2 === 1 ? "alt" : ""}>
                      <td className="font-mono text-xs">{o.coupa_req_id ?? "DRAFT"}</td>
                      <td className="text-xs">{o.items?.sku_code}</td>
                      <td><ReqStatusBadge status={o.status} /></td>
                      <td className={clsx("tabular text-xs",
                        o.days_with_approver && o.days_with_approver > 5 ? "text-lear-red font-bold" : "")}>
                        {o.days_with_approver ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── ABC PENDING (area_lead / manager) ─────────── */}
        {["area_lead","manager","admin"].includes(role) && abcPending.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">ABC Review — Pending Approval</h2>
              <Link href="/abc-review" className="text-xs text-lear-red hover:underline">
                Review →
              </Link>
            </div>
            <table className="data-table">
              <thead>
                <tr><th>SKU</th><th>Class</th><th>Cycle</th><th>Action</th></tr>
              </thead>
              <tbody>
                {abcPending.map((a, i) => (
                  <tr key={a.id} className={i % 2 === 1 ? "alt" : ""}>
                    <td className="font-mono text-xs font-semibold">
                      {(a as unknown as { items: { sku_code: string } }).items?.sku_code}
                    </td>
                    <td>
                      <span className={clsx("badge", a.abc_class === "A" ? "badge-red" : a.abc_class === "B" ? "badge-amber" : "badge-gray")}>
                        {a.abc_class}
                      </span>
                    </td>
                    <td className="text-xs">{a.review_cycle}</td>
                    <td>
                      <Link href="/abc-review" className="text-xs text-lear-red hover:underline">Review</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── TRANSFER MATCHES (manager/admin) ──────────── */}
        {["manager","admin"].includes(role) && transfers.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Cross-Plant Rebalancing Matches</h2>
              <Link href="/cross-plant" className="text-xs text-lear-red hover:underline">
                View →
              </Link>
            </div>
            <table className="data-table">
              <thead>
                <tr><th>SKU</th><th>From</th><th>To</th><th>Qty</th></tr>
              </thead>
              <tbody>
                {transfers.map((t, i) => {
                  const tf = t as unknown as {
                    items: { sku_code: string };
                    from_facility: { name: string };
                    to_facility: { name: string };
                  };
                  return (
                    <tr key={t.id} className={i % 2 === 1 ? "alt" : ""}>
                      <td className="font-mono text-xs">{tf.items?.sku_code}</td>
                      <td className="text-xs">{tf.from_facility?.name}</td>
                      <td className="text-xs">{tf.to_facility?.name}</td>
                      <td className="tabular font-semibold">{t.recommended_qty}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────
function StatCard({ accent, icon, label, value, delta }: {
  accent: "red"|"amber"|"green"|"blue"|"black";
  icon: React.ReactNode; label: string; value: number; delta: string;
}) {
  return (
    <div className={`stat-card accent-${accent}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-2xl font-black text-lear-black tabular">{value}</p>
          <p className="text-xs text-lear-gray-600 mt-1">{label}</p>
          <p className="text-xs text-lear-gray-400 mt-1">{delta}</p>
        </div>
        <div className={clsx("p-2 rounded",
          accent === "red" ? "bg-red-50 text-lear-red" :
          accent === "amber" ? "bg-amber-50 text-warning" :
          accent === "green" ? "bg-green-50 text-success" :
          accent === "blue" ? "bg-blue-50 text-info" :
          "bg-lear-gray-100 text-lear-black")}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    STOCKOUT:  "status-stockout",
    BELOW_MIN: "status-below-min",
    AT_REORDER:"status-at-reorder",
    HEALTHY:   "status-healthy",
  };
  const labels: Record<string, string> = {
    STOCKOUT: "Stockout", BELOW_MIN: "Below Min",
    AT_REORDER: "At Reorder", HEALTHY: "Healthy",
  };
  return <span className={map[status] ?? "badge-gray"}>{labels[status] ?? status}</span>;
}

function ReqStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: "badge-gray", SUBMITTED: "badge-blue",
    PENDING_APPROVER: "badge-amber", APPROVED: "badge-green",
    RETURNED: "badge-red",
  };
  const labels: Record<string, string> = {
    DRAFT:"Draft", SUBMITTED:"Submitted", PENDING_APPROVER:"Pending",
    APPROVED:"Approved", RETURNED:"Returned",
  };
  return <span className={map[status] ?? "badge-gray"}>{labels[status] ?? status}</span>;
}
