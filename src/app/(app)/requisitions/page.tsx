"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { PurchaseOrder } from "@/types";
import { RefreshCw, Clock, CheckCircle, AlertCircle, Filter, ChevronDown } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import clsx from "clsx";

const STATUS_LABELS: Record<string, string> = {
  DRAFT:"Draft", SUBMITTED:"Submitted", PENDING_APPROVER:"Pending Approver",
  APPROVED:"Approved", RETURNED:"Returned",
  PARTIALLY_RECEIVED:"Partial", RECEIVED:"Received",
};
const STATUS_BADGE: Record<string, string> = {
  DRAFT:"badge-gray", SUBMITTED:"badge-blue", PENDING_APPROVER:"badge-amber",
  APPROVED:"badge-green", RETURNED:"badge-red",
  PARTIALLY_RECEIVED:"badge-navy", RECEIVED:"badge-green",
};

export default function RequisitionsPage() {
  const { authUser } = useAuth();
  const supabase     = createClient();
  const role         = authUser?.effectiveRole ?? "viewer";
  const facilityId   = authUser?.facilityId;
  const isManager    = ["manager","admin"].includes(role);

  const [orders, setOrders]   = useState<(PurchaseOrder & {
    items: { sku_code: string; description: string };
    facilities: { name: string };
  })[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatus] = useState("ALL");
  const [facilityFilter, setFac]  = useState("ALL");
  const [facilities, setFacilities] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("purchase_orders")
      .select("*, items(sku_code, description), facilities(name)")
      .order("created_at", { ascending: false });

    if (!isManager && facilityId) q = q.eq("facility_id", facilityId);
    else if (facilityFilter !== "ALL") q = q.eq("facility_id", facilityFilter);
    if (statusFilter !== "ALL") q = q.eq("status", statusFilter);

    const { data } = await q;
    setOrders((data as typeof orders) ?? []);
    setLoading(false);
  }, [supabase, isManager, facilityId, facilityFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!isManager) return;
    supabase.from("facilities").select("id, name").then(({ data }) => setFacilities(data ?? []));
  }, [isManager, supabase]);

  const aging5  = orders.filter(o => (o.days_with_approver ?? 0) > 5 && o.status === "PENDING_APPROVER").length;
  const open    = orders.filter(o => !["RECEIVED","RETURNED"].includes(o.status)).length;
  const approved = orders.filter(o => o.status === "APPROVED").length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Requisitions"
        subtitle="Coupa requisition status and ageing tracker"
        actions={
          <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
            <RefreshCw className={clsx("w-3.5 h-3.5", loading && "animate-spin")} /> Refresh
          </button>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label:"Open Requisitions",   val:open,    icon:<Clock className="w-5 h-5"/>,        accent:"blue" },
          { label:"Aging > 5 Days",      val:aging5,  icon:<AlertCircle className="w-5 h-5"/>,  accent:"red" },
          { label:"Approved",            val:approved,icon:<CheckCircle className="w-5 h-5"/>,  accent:"green" },
          { label:"Total",               val:orders.length, icon:<Filter className="w-5 h-5"/>,accent:"black" },
        ].map(s => (
          <div key={s.label} className={`stat-card accent-${s.accent}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-2xl font-black tabular">{s.val}</div>
                <div className="text-xs text-lear-gray-600 mt-1">{s.label}</div>
              </div>
              <div className={clsx("p-2 rounded",
                s.accent === "red" ? "bg-red-50 text-lear-red" :
                s.accent === "green" ? "bg-green-50 text-success" :
                s.accent === "blue" ? "bg-blue-50 text-info" : "bg-lear-gray-100 text-lear-black")}>
                {s.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2 bg-white border border-lear-gray-200 rounded px-3 py-1.5">
          <Filter className="w-3.5 h-3.5 text-lear-gray-400" />
          <select value={statusFilter} onChange={e => setStatus(e.target.value)}
            className="text-sm bg-transparent outline-none cursor-pointer">
            <option value="ALL">All Status</option>
            {Object.entries(STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-lear-gray-400" />
        </div>
        {isManager && facilities.length > 0 && (
          <div className="flex items-center gap-2 bg-white border border-lear-gray-200 rounded px-3 py-1.5">
            <Filter className="w-3.5 h-3.5 text-lear-gray-400" />
            <select value={facilityFilter} onChange={e => setFac(e.target.value)}
              className="text-sm bg-transparent outline-none cursor-pointer">
              <option value="ALL">All Facilities</option>
              {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-lear-gray-400" />
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-5 h-5 animate-spin text-lear-gray-400" />
            </div>
          ) : orders.length === 0 ? (
            <p className="text-sm text-lear-gray-400 px-5 py-10 text-center">No requisitions found.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Req #</th>
                  <th>SKU</th>
                  <th>Description</th>
                  {isManager && <th>Facility</th>}
                  <th className="text-right">Qty</th>
                  <th>Supplier</th>
                  <th>Status</th>
                  <th className="text-right">Days w/ Approver</th>
                  <th>Expected Receipt</th>
                  <th>Justification</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o, i) => {
                  const isAging = (o.days_with_approver ?? 0) > 5 && o.status === "PENDING_APPROVER";
                  return (
                    <tr key={o.id} className={clsx(i % 2 === 1 ? "alt" : "", isAging && "bg-red-50/50")}>
                      <td className="font-mono text-xs font-semibold text-lear-black">
                        {o.coupa_req_id ?? <span className="text-lear-gray-400">DRAFT</span>}
                      </td>
                      <td className="font-mono text-xs">{o.items?.sku_code}</td>
                      <td className="text-xs max-w-[150px] truncate">{o.items?.description}</td>
                      {isManager && <td className="text-xs">{o.facilities?.name}</td>}
                      <td className="tabular text-right font-semibold">{o.qty}</td>
                      <td className="text-xs text-lear-gray-600 max-w-[120px] truncate">{o.supplier_name ?? "—"}</td>
                      <td>
                        <span className={STATUS_BADGE[o.status] ?? "badge-gray"}>
                          {STATUS_LABELS[o.status] ?? o.status}
                        </span>
                      </td>
                      <td className={clsx("tabular text-right text-sm font-semibold",
                        isAging ? "text-lear-red" : "text-lear-gray-600")}>
                        {o.days_with_approver != null ? (
                          <span className="flex items-center justify-end gap-1">
                            {isAging && <AlertCircle className="w-3.5 h-3.5" />}
                            {o.days_with_approver}d
                          </span>
                        ) : "—"}
                      </td>
                      <td className="text-xs text-lear-gray-600">
                        {o.expected_receipt
                          ? new Date(o.expected_receipt).toLocaleDateString("en-MX")
                          : "—"}
                      </td>
                      <td className="text-xs text-lear-gray-600 max-w-[140px] truncate">
                        {o.justification ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
