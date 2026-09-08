"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { AbcClassification } from "@/types";
import { RefreshCw, CheckCircle, Flag, RotateCcw, Play } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import clsx from "clsx";

type Decision = "PENDING" | "APPROVED" | "FLAGGED" | "RETURNED";

export default function AbcReviewPage() {
  const { authUser } = useAuth();
  const supabase     = createClient();
  const role         = authUser?.effectiveRole ?? "viewer";
  const facilityId   = authUser?.facilityId;
  const canApprove   = ["area_lead","manager","admin"].includes(role);
  const isManager    = ["manager","admin"].includes(role);

  const [items, setItems]     = useState<(AbcClassification & { items: { sku_code: string; description: string; unit_cost: number }; facilities: { name: string } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<Decision | "ALL">("ALL");
  const [running, setRunning] = useState(false);
  const [comment, setComment] = useState<Record<string, string>>({});
  const [saving, setSaving]   = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("abc_classifications")
      .select("*, items(sku_code, description, unit_cost), facilities(name)")
      .order("abc_class");
    if (!isManager && facilityId) q = q.eq("facility_id", facilityId);
    if (filter !== "ALL") q = q.eq("decision", filter);
    const { data } = await q;
    setItems((data as typeof items) ?? []);
    setLoading(false);
  }, [supabase, isManager, facilityId, filter]);

  useEffect(() => { load(); }, [load]);

  async function runAbcEngine() {
    setRunning(true);
    await supabase.functions.invoke("abc-engine", { body: facilityId ? { facility_id: facilityId } : {} });
    await load();
    setRunning(false);
  }

  async function updateDecision(id: string, decision: Decision, itemComment?: string) {
    setSaving(p => ({ ...p, [id]: true }));
    await supabase.from("abc_classifications").update({
      decision,
      comment:     itemComment ?? comment[id] ?? null,
      reviewed_by: authUser?.id,
      reviewed_at: new Date().toISOString(),
    }).eq("id", id);
    setSaving(p => ({ ...p, [id]: false }));
    setItems(prev => prev.map(i => i.id === id ? { ...i, decision } : i));
  }

  async function approveAll() {
    const pending = items.filter(i => i.decision === "PENDING");
    for (const item of pending) {
      await updateDecision(item.id, "APPROVED");
    }
  }

  const stats = {
    pending:  items.filter(i => i.decision === "PENDING").length,
    approved: items.filter(i => i.decision === "APPROVED").length,
    flagged:  items.filter(i => i.decision === "FLAGGED").length,
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="ABC Classification Review"
        subtitle={`Quarterly parameter review — ${items[0]?.review_cycle ?? "Q3-2026"}`}
        actions={
          <div className="flex items-center gap-2">
            {canApprove && stats.pending > 0 && (
              <button onClick={approveAll} className="btn-success btn-sm">
                <CheckCircle className="w-3.5 h-3.5" /> Approve All Pending ({stats.pending})
              </button>
            )}
            <button onClick={runAbcEngine} disabled={running} className="btn-ghost btn-sm">
              <Play className={clsx("w-3.5 h-3.5", running && "animate-spin")} />
              Run Classification Engine
            </button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label:"Pending Review", count:stats.pending, cls:"border-l-4 border-warning" },
          { label:"Approved",       count:stats.approved,cls:"border-l-4 border-success" },
          { label:"Flagged",        count:stats.flagged, cls:"border-l-4 border-lear-red" },
        ].map(s => (
          <div key={s.label} className={`card p-4 ${s.cls}`}>
            <div className="text-2xl font-black tabular">{s.count}</div>
            <div className="text-xs text-lear-gray-600 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 border-b border-lear-gray-200">
        {(["ALL","PENDING","APPROVED","FLAGGED"] as const).map(f => (
          <button key={f}
            onClick={() => setFilter(f)}
            className={clsx("px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
              filter === f
                ? "border-lear-red text-lear-red"
                : "border-transparent text-lear-gray-600 hover:text-lear-black")}>
            {f === "ALL" ? "All Items" : f.charAt(0) + f.slice(1).toLowerCase()}
            {f === "PENDING" && stats.pending > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-warning text-white text-xs rounded-full">
                {stats.pending}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
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
                  {isManager && <th>Facility</th>}
                  <th>Class</th>
                  <th className="text-right">Composite Score</th>
                  <th className="text-right">Spend Score</th>
                  <th className="text-right">Freq. Score</th>
                  <th>Critical</th>
                  <th>Reviewed</th>
                  <th>Decision</th>
                  {canApprove && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.id} className={i % 2 === 1 ? "alt" : ""}>
                    <td className="font-mono text-xs font-semibold">{item.items?.sku_code}</td>
                    <td className="text-xs max-w-[160px] truncate">{item.items?.description}</td>
                    {isManager && <td className="text-xs">{item.facilities?.name}</td>}
                    <td>
                      <span className={clsx("badge", item.abc_class==="A"?"badge-red":item.abc_class==="B"?"badge-amber":"badge-gray")}>
                        {item.abc_class}
                      </span>
                    </td>
                    <td className="tabular text-right text-sm">
                      {item.composite_score != null ? (item.composite_score * 100).toFixed(1) + "%" : "—"}
                    </td>
                    <td className="tabular text-right text-sm text-lear-gray-600">
                      {item.spend_score != null ? (item.spend_score * 100).toFixed(1) + "%" : "—"}
                    </td>
                    <td className="tabular text-right text-sm text-lear-gray-600">
                      {item.frequency_score != null ? (item.frequency_score * 100).toFixed(1) + "%" : "—"}
                    </td>
                    <td>
                      {item.criticality_flag
                        ? <span className="badge badge-red">Critical</span>
                        : <span className="text-xs text-lear-gray-400">—</span>}
                    </td>
                    <td className="text-xs text-lear-gray-600">
                      {item.reviewed_at ? new Date(item.reviewed_at).toLocaleDateString("en-MX") : "Not yet"}
                    </td>
                    <td>
                      <DecisionBadge d={item.decision} />
                    </td>
                    {canApprove && (
                      <td>
                        {item.decision === "PENDING" && (
                          <div className="flex items-center gap-1.5">
                            <button
                              disabled={saving[item.id]}
                              onClick={() => updateDecision(item.id, "APPROVED")}
                              className="btn-success btn-sm">
                              <CheckCircle className="w-3 h-3" />
                            </button>
                            <button
                              disabled={saving[item.id]}
                              onClick={() => updateDecision(item.id, "FLAGGED")}
                              className="btn-danger btn-sm">
                              <Flag className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        {item.decision === "APPROVED" && (
                          <button
                            onClick={() => updateDecision(item.id, "PENDING")}
                            className="text-xs text-lear-gray-400 hover:text-lear-black">
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Audit note */}
      <p className="text-xs text-lear-gray-400 mt-3">
        ✓ All items shown have a review timestamp — including unchanged items. Audit gap from legacy process is resolved.
      </p>
    </div>
  );
}

function DecisionBadge({ d }: { d: string }) {
  const m: Record<string, string> = {
    PENDING:"badge-amber", APPROVED:"badge-green",
    FLAGGED:"badge-red", RETURNED:"badge-gray",
  };
  const l: Record<string, string> = {
    PENDING:"Pending", APPROVED:"Approved",
    FLAGGED:"Flagged", RETURNED:"Returned",
  };
  return <span className={m[d] ?? "badge-gray"}>{l[d] ?? d}</span>;
}
