"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { TransferRecommendation } from "@/types";
import {
  RefreshCw, ArrowRight, CheckCircle, XCircle,
  Play, Truck, PackageCheck, Clock,
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import clsx from "clsx";

type TransferStatus = "RECOMMENDED" | "APPROVED" | "INITIATED" | "COMPLETED" | "REJECTED";

interface CrossPlantRow {
  sku_code: string;
  description: string;
  plant_a_stock: number | null;
  plant_b_stock: number | null;
  plant_c_stock: number | null;
  enterprise_total: number;
  signal: string;
}

type EnrichedTransfer = TransferRecommendation & {
  items: { id: string; sku_code: string; description: string };
  from_facility: { id: string; name: string };
  to_facility: { id: string; name: string };
};

const STATUS_CONFIG: Record<TransferStatus, { label: string; badge: string; description: string }> = {
  RECOMMENDED: { label: "Pending Approval",  badge: "badge-blue",  description: "Awaiting manager approval" },
  APPROVED:    { label: "Approved",          badge: "badge-green", description: "Approved — awaiting shipment" },
  INITIATED:   { label: "In Transit",        badge: "badge-amber", description: "Units shipped — awaiting receipt" },
  COMPLETED:   { label: "Completed",         badge: "badge-green", description: "Transfer complete — stock updated" },
  REJECTED:    { label: "Rejected",          badge: "badge-red",   description: "Transfer rejected" },
};

export default function CrossPlantPage() {
  const { authUser } = useAuth();
  const supabase = createClient();
  const role = authUser?.effectiveRole ?? "viewer";
  const facilityId: string | null = authUser?.facilityId ?? null;
  const isManager = ["manager", "admin"].includes(role);

  const [crossData, setCrossData]         = useState<CrossPlantRow[]>([]);
  const [transfers, setTransfers]         = useState<EnrichedTransfer[]>([]);
  const [loading, setLoading]             = useState(true);
  const [running, setRunning]             = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab]         = useState<"active" | "completed">("active");
  const [toast, setToast]                 = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);

    const { data: tData } = await supabase
      .from("transfer_recommendations")
      .select(`
        *,
        items(id, sku_code, description),
        from_facility:facilities!transfer_recommendations_from_facility_id_fkey(id, name),
        to_facility:facilities!transfer_recommendations_to_facility_id_fkey(id, name)
      `)
      .not("status", "eq", "REJECTED")
      .order("created_at", { ascending: false });

    setTransfers((tData as EnrichedTransfer[]) ?? []);

    const today = new Date().toISOString().split("T")[0];
    const { data: recs } = await supabase
      .from("replenishment_recommendations")
      .select("item_id, facility_id, current_stock, status, items(sku_code, description), facilities(name, code)")
      .eq("run_date", today);

    if (recs) {
      const byItem: Record<string, CrossPlantRow> = {};
      for (const rec of recs) {
        const r = rec as unknown as {
          item_id: string; facility_id: string; current_stock: number; status: string;
          items: { sku_code: string; description: string };
          facilities: { name: string; code: string };
        };
        const key = r.items.sku_code;
        if (!byItem[key]) {
          byItem[key] = {
            sku_code: r.items.sku_code, description: r.items.description,
            plant_a_stock: null, plant_b_stock: null, plant_c_stock: null,
            enterprise_total: 0, signal: "HEALTHY",
          };
        }
        const code = r.facilities.code;
        if (code === "PLANT_A") byItem[key].plant_a_stock = r.current_stock;
        if (code === "PLANT_B") byItem[key].plant_b_stock = r.current_stock;
        if (code === "PLANT_C") byItem[key].plant_c_stock = r.current_stock;
        byItem[key].enterprise_total += r.current_stock;
        if (r.status === "STOCKOUT" || r.status === "BELOW_MIN") byItem[key].signal = "SHORTAGE";
      }

      for (const t of (tData ?? []) as EnrichedTransfer[]) {
        if (t.signal === "MATCH" && t.status !== "COMPLETED") {
          const row = byItem[t.items?.sku_code];
          if (row) row.signal = "MATCH";
        }
      }

      setCrossData(Object.values(byItem));
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function approveTransfer(t: EnrichedTransfer) {
    if (!authUser) return;
    setActionLoading(p => ({ ...p, [t.id]: true }));

    await supabase.from("transfer_recommendations").update({
      status:      "APPROVED",
      approved_by: authUser.id,
      approved_at: new Date().toISOString(),
    }).eq("id", t.id);

    const planners = await supabase
      .from("user_profiles").select("id")
      .in("facility_id", [t.from_facility.id, t.to_facility.id])
      .eq("role", "planner");

    for (const p of planners.data ?? []) {
      await supabase.from("notifications").insert({
        user_id: p.id,
        title:   "Transfer Approved",
        message: `Transfer of ${t.recommended_qty} units of ${t.items.sku_code} from ${t.from_facility.name} to ${t.to_facility.name} has been approved.`,
        type:    "info",
        link:    "/cross-plant",
      });
    }

    showToast(`Transfer approved — ${t.from_facility.name} → ${t.to_facility.name} notified`);
    setActionLoading(p => ({ ...p, [t.id]: false }));
    load();
  }

  async function rejectTransfer(id: string) {
    setActionLoading(p => ({ ...p, [id]: true }));

    const transfer = transfers.find(t => t.id === id);

    await supabase.from("transfer_recommendations").update({
      status:           "REJECTED",
      rejection_reason: "Rejected by manager",
    }).eq("id", id);

    if (transfer) {
      const planners = await supabase
        .from("user_profiles").select("id")
        .in("facility_id", [transfer.from_facility_id, transfer.to_facility_id])
        .eq("role", "planner");

      for (const p of planners.data ?? []) {
        await supabase.from("notifications").insert({
          user_id: p.id,
          title:   "Transfer Rejected",
          message: `The proposed transfer of ${transfer.items?.sku_code} from ${transfer.from_facility?.name} to ${transfer.to_facility?.name} was rejected by management.`,
          type:    "error",
          link:    "/cross-plant",
        });
      }
    }

    showToast("Transfer rejected — planners notified", "error");
    setActionLoading(p => ({ ...p, [id]: false }));
    load();
  }

  async function markInitiated(t: EnrichedTransfer) {
    setActionLoading(p => ({ ...p, [t.id]: true }));

    await supabase.from("transfer_recommendations").update({
      status: "INITIATED",
    }).eq("id", t.id);

    const destPlanners = await supabase
      .from("user_profiles").select("id")
      .eq("facility_id", t.to_facility.id)
      .eq("role", "planner");

    for (const p of destPlanners.data ?? []) {
      await supabase.from("notifications").insert({
        user_id: p.id,
        title:   "Transfer In Transit",
        message: `${t.recommended_qty} units of ${t.items.sku_code} from ${t.from_facility.name} are on the way. Please confirm receipt when arrived.`,
        type:    "warning",
        link:    "/cross-plant",
      });
    }

    showToast(`Marked as in transit — ${t.to_facility.name} planner notified`);
    setActionLoading(p => ({ ...p, [t.id]: false }));
    load();
  }

  async function confirmReceipt(t: EnrichedTransfer) {
    setActionLoading(p => ({ ...p, [t.id]: true }));

    await supabase.from("transfer_recommendations").update({
      status: "COMPLETED",
    }).eq("id", t.id);

    const { data: fromPos } = await supabase
      .from("inventory_positions").select("id, stock_qty")
      .eq("item_id", t.item_id)
      .eq("facility_id", t.from_facility_id)
      .single();

    const { data: toPos } = await supabase
      .from("inventory_positions").select("id, stock_qty")
      .eq("item_id", t.item_id)
      .eq("facility_id", t.to_facility_id)
      .single();

    if (fromPos) {
      await supabase.from("inventory_positions").update({
        stock_qty:   Math.max(0, Number(fromPos.stock_qty) - t.recommended_qty),
        snapshot_at: new Date().toISOString(),
      }).eq("id", fromPos.id);
    }

    if (toPos) {
      await supabase.from("inventory_positions").update({
        stock_qty:   Number(toPos.stock_qty) + t.recommended_qty,
        snapshot_at: new Date().toISOString(),
      }).eq("id", toPos.id);
    }

    await supabase.from("audit_log").insert({
      user_id:     authUser?.id,
      action_type: "TRANSFER_COMPLETED",
      entity_type: "transfer_recommendations",
      entity_id:   t.id,
      new_value: {
        item:      t.items.sku_code,
        qty:       t.recommended_qty,
        from:      t.from_facility.name,
        to:        t.to_facility.name,
        completed: new Date().toISOString(),
      },
      facility_id: t.to_facility_id,
    });

    await supabase.functions.invoke("mrp-engine", {});

    const managers = await supabase
      .from("user_profiles").select("id")
      .in("role", ["manager", "admin"]);

    for (const mgr of managers.data ?? []) {
      await supabase.from("notifications").insert({
        user_id: mgr.id,
        title:   "Transfer Completed",
        message: `${t.recommended_qty} units of ${t.items.sku_code} received at ${t.to_facility.name} from ${t.from_facility.name}. Inventory updated automatically.`,
        type:    "success",
        link:    "/cross-plant",
      });
    }

    showToast(`Receipt confirmed — ${t.from_facility.name} −${t.recommended_qty}, ${t.to_facility.name} +${t.recommended_qty}`);
    setActionLoading(p => ({ ...p, [t.id]: false }));
    load();
  }

  async function runEngine() {
    setRunning(true);
    await supabase.functions.invoke("rebalancing-engine", {});
    await load();
    setRunning(false);
  }

  function canInitiate(t: EnrichedTransfer): boolean {
    if (t.status !== "APPROVED") return false;
    if (isManager) return true;
    return facilityId === t.from_facility_id;
  }

  function canConfirmReceipt(t: EnrichedTransfer): boolean {
    if (t.status !== "INITIATED") return false;
    if (isManager) return true;
    return facilityId === t.to_facility_id;
  }

  const activeTransfers    = transfers.filter(t => !["COMPLETED", "REJECTED"].includes(t.status));
  const completedTransfers = transfers.filter(t => t.status === "COMPLETED");

  const signalStyles: Record<string, string> = {
    MATCH:    "bg-blue-50 text-info font-bold",
    SHORTAGE: "bg-red-50 text-lear-red font-bold",
    SURPLUS:  "bg-amber-50 text-warning font-bold",
    HEALTHY:  "text-lear-gray-400",
  };

  return (
    <div className="p-6 max-w-7xl mx-auto relative">

      {toast && (
        <div className={clsx(
          "fixed top-5 right-5 z-50 px-4 py-3 rounded shadow-lg text-sm font-semibold text-white",
          toast.type === "success" ? "bg-success" : "bg-lear-red"
        )}>
          {toast.msg}
        </div>
      )}

      <PageHeader
        title="Cross-Plant Inventory"
        subtitle="Enterprise-wide stock visibility and rebalancing"
        actions={
          <button onClick={runEngine} disabled={running} className="btn-ghost btn-sm">
            <Play className={clsx("w-3.5 h-3.5", running && "animate-spin")} />
            Run Rebalancing Engine
          </button>
        }
      />

      <div className="flex flex-wrap gap-2 mb-5">
        {(["RECOMMENDED", "APPROVED", "INITIATED", "COMPLETED"] as TransferStatus[]).map((s, i) => (
          <div key={s} className="flex items-center gap-1.5 text-xs text-lear-gray-600">
            {i > 0 && <ArrowRight className="w-3 h-3 text-lear-gray-300" />}
            <span className={STATUS_CONFIG[s].badge + " badge"}>{STATUS_CONFIG[s].label}</span>
          </div>
        ))}
      </div>

      <div className="mb-6">
        <div className="flex gap-1 border-b border-lear-gray-200 mb-3">
          {(["active", "completed"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={clsx("px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === tab
                  ? "border-lear-red text-lear-red"
                  : "border-transparent text-lear-gray-600 hover:text-lear-black")}>
              {tab === "active"
                ? `Active Transfers (${activeTransfers.length})`
                : `Completed (${completedTransfers.length})`}
            </button>
          ))}
        </div>

        {activeTab === "active" && (
          activeTransfers.length === 0 ? (
            <div className="card p-8 text-center text-lear-gray-400 text-sm">
              No active transfers. Run the Rebalancing Engine to find opportunities.
            </div>
          ) : (
            <div className="grid gap-3">
              {activeTransfers.map(t => {
                const cfg = STATUS_CONFIG[t.status as TransferStatus];
                return (
                  <div key={t.id} className={clsx("card p-4 border-l-4",
                    t.status === "RECOMMENDED" ? "border-info" :
                    t.status === "APPROVED"    ? "border-success" :
                    t.status === "INITIATED"   ? "border-warning" : "border-lear-gray-200")}>

                    <div className="flex items-start justify-between flex-wrap gap-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <div>
                          <span className="font-mono text-sm font-bold">{t.items?.sku_code}</span>
                          <span className="text-xs text-lear-gray-600 ml-2">{t.items?.description}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-semibold text-warning">{t.from_facility?.name}</span>
                          <ArrowRight className="w-4 h-4 text-lear-gray-400" />
                          <span className="font-semibold text-success">{t.to_facility?.name}</span>
                        </div>
                        <div className="text-sm">
                          <span className="font-bold text-lear-black">{t.recommended_qty}</span>
                          <span className="text-lear-gray-600 ml-1">units</span>
                          {t.est_lead_time_saving && (
                            <span className="ml-2 text-xs text-success">
                              ~{t.est_lead_time_saving} days faster vs external
                            </span>
                          )}
                        </div>
                        <span className={cfg.badge + " badge"}>{cfg.label}</span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {t.status === "RECOMMENDED" && isManager && (
                          <>
                            <button onClick={() => approveTransfer(t)}
                              disabled={actionLoading[t.id]}
                              className="btn-success btn-sm">
                              <CheckCircle className="w-3.5 h-3.5" />
                              {actionLoading[t.id] ? "Approving…" : "Approve"}
                            </button>
                            <button onClick={() => rejectTransfer(t.id)}
                              disabled={actionLoading[t.id]}
                              className="btn-danger btn-sm">
                              <XCircle className="w-3.5 h-3.5" /> Reject
                            </button>
                          </>
                        )}

                        {canInitiate(t) && (
                          <button onClick={() => markInitiated(t)}
                            disabled={actionLoading[t.id]}
                            className="btn-ghost btn-sm">
                            <Truck className="w-3.5 h-3.5" />
                            {actionLoading[t.id] ? "Updating…" : "Mark as Shipped"}
                          </button>
                        )}

                        {canConfirmReceipt(t) && (
                          <button onClick={() => confirmReceipt(t)}
                            disabled={actionLoading[t.id]}
                            className="btn-primary btn-sm">
                            <PackageCheck className="w-3.5 h-3.5" />
                            {actionLoading[t.id] ? "Updating inventory…" : "Confirm Receipt"}
                          </button>
                        )}

                        {t.status === "INITIATED" && !canConfirmReceipt(t) && (
                          <span className="flex items-center gap-1.5 text-xs text-lear-gray-400">
                            <Clock className="w-3.5 h-3.5" />
                            Awaiting receipt at {t.to_facility?.name}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-4 mt-2 text-xs text-lear-gray-600">
                      <span>Surplus at {t.from_facility?.name}: <strong>{t.from_surplus_qty}</strong></span>
                      <span>Shortage at {t.to_facility?.name}: <strong>{t.to_shortage_qty}</strong></span>
                      <span className="text-lear-gray-400">{cfg.description}</span>
                    </div>

                    <div className="mt-3 flex items-center gap-1">
                      {(["RECOMMENDED", "APPROVED", "INITIATED", "COMPLETED"] as TransferStatus[]).map(s => {
                        const steps = ["RECOMMENDED", "APPROVED", "INITIATED", "COMPLETED"];
                        const filled = steps.indexOf(t.status as TransferStatus) >= steps.indexOf(s);
                        return (
                          <div key={s} className={clsx("h-1 flex-1 rounded-full transition-colors",
                            filled
                              ? s === "INITIATED" ? "bg-warning" : "bg-success"
                              : "bg-lear-gray-200"
                          )} />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {activeTab === "completed" && (
          completedTransfers.length === 0 ? (
            <div className="card p-8 text-center text-lear-gray-400 text-sm">
              No completed transfers yet.
            </div>
          ) : (
            <div className="grid gap-3">
              {completedTransfers.map(t => (
                <div key={t.id} className="card p-4 border-l-4 border-success opacity-80">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-sm font-bold">{t.items?.sku_code}</span>
                      <span className="text-xs text-lear-gray-600">{t.items?.description}</span>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-lear-gray-600">{t.from_facility?.name}</span>
                        <ArrowRight className="w-3 h-3 text-lear-gray-400" />
                        <span className="text-lear-gray-600">{t.to_facility?.name}</span>
                      </div>
                      <span className="font-semibold text-sm">{t.recommended_qty} units</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-success" />
                      <span className="badge badge-green">Completed</span>
                      {t.approved_at && (
                        <span className="text-xs text-lear-gray-400">
                          {new Date(t.approved_at).toLocaleDateString("en-MX")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">All-Facility Inventory Position</h2>
          <span className="text-xs text-lear-gray-400">
            {new Date().toLocaleDateString("en-MX", { dateStyle: "long" })}
          </span>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-5 h-5 animate-spin text-lear-gray-400" />
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Description</th>
                  <th className="text-right">Plant A</th>
                  <th className="text-right">Plant B</th>
                  <th className="text-right">Plant C</th>
                  <th className="text-right">Enterprise Total</th>
                  <th>Signal</th>
                </tr>
              </thead>
              <tbody>
                {crossData.map((row, i) => (
                  <tr key={row.sku_code} className={i % 2 === 1 ? "alt" : ""}>
                    <td className="font-mono text-xs font-semibold">{row.sku_code}</td>
                    <td className="text-xs max-w-[180px] truncate">{row.description}</td>
                    <StockCell val={row.plant_a_stock} />
                    <StockCell val={row.plant_b_stock} />
                    <StockCell val={row.plant_c_stock} />
                    <td className="tabular text-right font-bold">{row.enterprise_total}</td>
                    <td>
                      <span className={clsx("text-xs font-semibold px-2 py-0.5 rounded",
                        signalStyles[row.signal] ?? "text-lear-gray-600")}>
                        {row.signal}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function StockCell({ val }: { val: number | null }) {
  if (val === null) return <td className="tabular text-right text-lear-gray-300 text-sm">N/A</td>;
  return (
    <td className={clsx("tabular text-right text-sm font-semibold",
      val === 0 ? "text-lear-red" : val < 10 ? "text-warning" : "text-lear-black")}>
      {val}
    </td>
  );
}
