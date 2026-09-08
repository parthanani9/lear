"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { TransferRecommendation } from "@/types";
import { RefreshCw, ArrowRight, CheckCircle, XCircle, Play } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import clsx from "clsx";

interface CrossPlantRow {
  sku_code: string;
  description: string;
  plant_a_stock: number | null;
  plant_b_stock: number | null;
  plant_c_stock: number | null;
  enterprise_total: number;
  signal: string;
}

export default function CrossPlantPage() {
  const { authUser } = useAuth();
  const supabase     = createClient();
  const [crossData, setCrossData] = useState<CrossPlantRow[]>([]);
  const [transfers, setTransfers] = useState<(TransferRecommendation & {
    items: { sku_code: string; description: string };
    from_facility: { name: string };
    to_facility: { name: string };
  })[]>([]);
  const [loading, setLoading]   = useState(true);
  const [running, setRunning]   = useState(false);
  const [approving, setApproving] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);

    // Load transfer recommendations with joins
    const { data: tData } = await supabase
      .from("transfer_recommendations")
      .select(`
        *,
        items(sku_code, description),
        from_facility:facilities!transfer_recommendations_from_facility_id_fkey(id, name),
        to_facility:facilities!transfer_recommendations_to_facility_id_fkey(id, name)
      `)
      .eq("status", "RECOMMENDED")
      .order("signal");
    setTransfers((tData as typeof transfers) ?? []);

    // Build cross-plant table from replenishment_recommendations
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

      // Mark matches from transfers
      for (const t of (tData ?? []) as typeof transfers) {
        if (t.signal === "MATCH") {
          const row = byItem[t.items?.sku_code];
          if (row) row.signal = "MATCH";
        }
      }

      setCrossData(Object.values(byItem));
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function runEngine() {
    setRunning(true);
    await supabase.functions.invoke("rebalancing-engine", {});
    await load();
    setRunning(false);
  }

  async function approveTransfer(id: string) {
    if (!authUser) return;
    setApproving(p => ({ ...p, [id]: true }));
    await supabase.from("transfer_recommendations").update({
      status:      "APPROVED",
      approved_by: authUser.id,
      approved_at: new Date().toISOString(),
    }).eq("id", id);
    setApproving(p => ({ ...p, [id]: false }));
    load();
  }

  async function rejectTransfer(id: string) {
    await supabase.from("transfer_recommendations").update({
      status: "REJECTED",
      rejection_reason: "Rejected by manager",
    }).eq("id", id);
    load();
  }

  const signalStyles: Record<string, string> = {
    MATCH:   "bg-blue-50 text-info font-bold",
    SHORTAGE:"bg-red-50 text-lear-red font-bold",
    SURPLUS: "bg-amber-50 text-warning font-bold",
    HEALTHY: "text-lear-gray-400",
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Cross-Plant Inventory"
        subtitle="Enterprise-wide stock visibility and rebalancing recommendations"
        actions={
          <button onClick={runEngine} disabled={running} className="btn-ghost btn-sm">
            <Play className={clsx("w-3.5 h-3.5", running && "animate-spin")} />
            Run Rebalancing Engine
          </button>
        }
      />

      {/* Transfer recommendations */}
      {transfers.filter(t => t.signal === "MATCH").length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-lear-black mb-3">
            Transfer Recommendations
            <span className="ml-2 badge badge-blue">
              {transfers.filter(t => t.signal === "MATCH").length} match{transfers.filter(t => t.signal === "MATCH").length !== 1 ? "es" : ""}
            </span>
          </h2>
          <div className="grid gap-3">
            {transfers.filter(t => t.signal === "MATCH").map(t => (
              <div key={t.id} className="card p-4 border-l-4 border-info">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
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
                      <span className="font-bold">{t.recommended_qty}</span>
                      <span className="text-lear-gray-600 ml-1">units</span>
                      {t.est_lead_time_saving && (
                        <span className="ml-2 text-xs text-success">
                          ~{t.est_lead_time_saving} days faster than external procurement
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => approveTransfer(t.id)}
                      disabled={approving[t.id]}
                      className="btn-success btn-sm">
                      <CheckCircle className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      onClick={() => rejectTransfer(t.id)}
                      className="btn-danger btn-sm">
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </div>
                <div className="flex gap-4 mt-2 text-xs text-lear-gray-600">
                  <span>Surplus at {t.from_facility?.name}: <strong>{t.from_surplus_qty}</strong></span>
                  <span>Shortage at {t.to_facility?.name}: <strong>{t.to_shortage_qty}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cross-plant table */}
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
                      <span className={clsx("text-xs font-semibold", signalStyles[row.signal] ?? "text-lear-gray-600")}>
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
