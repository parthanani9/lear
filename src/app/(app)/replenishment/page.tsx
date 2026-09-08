"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ReplenishmentRecommendation } from "@/types";
import { RefreshCw, Filter, PlusCircle, Download, ChevronDown } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import clsx from "clsx";

const STATUS_OPTS = [
  { label: "All", value: "ALL" },
  { label: "Stockout", value: "STOCKOUT" },
  { label: "Below Min", value: "BELOW_MIN" },
  { label: "At Reorder", value: "AT_REORDER" },
  { label: "Healthy", value: "HEALTHY" },
];
const ABC_OPTS = [
  { label: "All Classes", value: "ALL" },
  { label: "A — Critical", value: "A" },
  { label: "B — Important", value: "B" },
  { label: "C — Standard", value: "C" },
];

function StatusBadge({ s }: { s: string }) {
  const m: Record<string,string> = { STOCKOUT:"status-stockout", BELOW_MIN:"status-below-min", AT_REORDER:"status-at-reorder", HEALTHY:"status-healthy" };
  const l: Record<string,string> = { STOCKOUT:"Stockout", BELOW_MIN:"Below Min", AT_REORDER:"At Reorder", HEALTHY:"Healthy" };
  return <span className={m[s]}>{l[s]}</span>;
}

export default function ReplenishmentPage() {
  const { authUser } = useAuth();
  const supabase     = createClient();
  const role         = authUser?.effectiveRole ?? "viewer";
  const facilityId   = authUser?.facilityId;
  const isManager    = ["manager","admin"].includes(role);
  const canCreate    = ["planner","manager","admin"].includes(role);

  const [recs, setRecs]                     = useState<ReplenishmentRecommendation[]>([]);
  const [loading, setLoading]               = useState(true);
  const [statusFilter, setStatusFilter]     = useState("ALL");
  const [abcFilter, setAbcFilter]           = useState("ALL");
  const [facilityFilter, setFacilityFilter] = useState("ALL");
  const [facilities, setFacilities]         = useState<{ id: string; name: string }[]>([]);
  const [modal, setModal]                   = useState<ReplenishmentRecommendation | null>(null);
  const [creating, setCreating]             = useState(false);
  const [qty, setQty]                       = useState("");
  const [supplier, setSupplier]             = useState("Balluff de Mexico SA de CV");
  const [justification, setJustification]   = useState("");
  const [toast, setToast]                   = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];
    let q = supabase
      .from("replenishment_recommendations")
      .select("*, items(sku_code, description, category, unit_of_measure, unit_cost), facilities(name, code)")
      .eq("run_date", today)
      .order("status");

    if (!isManager && facilityId) q = q.eq("facility_id", facilityId);
    else if (facilityFilter !== "ALL") q = q.eq("facility_id", facilityFilter);
    if (statusFilter !== "ALL") q = q.eq("status", statusFilter);
    if (abcFilter !== "ALL")    q = q.eq("abc_class", abcFilter);

    const { data } = await q;
    setRecs((data as ReplenishmentRecommendation[]) ?? []);
    setLoading(false);
  }, [supabase, isManager, facilityId, facilityFilter, statusFilter, abcFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!isManager) return;
    supabase.from("facilities").select("id, name").then(({ data }) => setFacilities(data ?? []));
  }, [isManager, supabase]);

  async function runEngine() {
    setLoading(true);
    await supabase.functions.invoke("mrp-engine", { body: facilityId ? { facility_id: facilityId } : {} });
    await loadData();
  }

  async function createRequisition() {
    if (!modal || !authUser) return;
    setCreating(true);
    const coupa_req_id = `REQ-${Math.floor(1000000 + Math.random() * 9000000)}`;
    const orderQty = parseFloat(qty) || modal.recommended_qty;

    await supabase.from("purchase_orders").insert({
      coupa_req_id,
      item_id:       modal.item_id,
      facility_id:   modal.facility_id,
      supplier_name: supplier,
      qty:           orderQty,
      unit_cost:     modal.items?.unit_cost,
      currency:      "MXN",
      status:        "SUBMITTED",
      submitted_at:  new Date().toISOString(),
      justification,
      created_by:    authUser.id,
    });

    // Notify managers of new requisition
    const { data: managers } = await supabase
      .from("user_profiles")
      .select("id")
      .in("role", ["manager", "admin"]);

    for (const mgr of managers ?? []) {
      await supabase.from("notifications").insert({
        user_id: mgr.id,
        title:   "New Requisition Created",
        message: `${authUser.profile.full_name} created ${coupa_req_id} for ${modal.items?.sku_code} — ${orderQty} units from ${supplier}.`,
        type:    "info",
        link:    "/requisitions",
      });
    }

    // Also notify the planner's area lead
    const { data: areaLeads } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("facility_id", modal.facility_id)
      .eq("role", "area_lead");

    for (const lead of areaLeads ?? []) {
      await supabase.from("notifications").insert({
        user_id: lead.id,
        title:   "Requisition Submitted",
        message: `${coupa_req_id} submitted for ${modal.items?.sku_code} — ${orderQty} units. Status: Submitted to Coupa.`,
        type:    "info",
        link:    "/requisitions",
      });
    }

    setCreating(false);
    setModal(null);
    setJustification("");
    showToast(`✓ ${coupa_req_id} created and submitted to Coupa`);
    loadData();
  }

  function exportCSV() {
    const rows = [
      ["SKU","Description","Status","Stock","Min","Reorder","Max","Recommended Qty","ABC"],
      ...recs.map(r => [
        r.items?.sku_code, r.items?.description, r.status,
        r.current_stock, Math.round(r.min_level), Math.round(r.reorder_point),
        Math.round(r.max_level), r.recommended_qty, r.abc_class,
      ]),
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const a   = document.createElement("a");
    a.href    = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = `replenishment-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  }

  const sortOrder: Record<string,number> = { STOCKOUT:0, BELOW_MIN:1, AT_REORDER:2, HEALTHY:3 };
  const sorted = [...recs].sort((a,b) => (sortOrder[a.status]??9) - (sortOrder[b.status]??9));

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 px-4 py-3 rounded shadow-lg text-sm font-semibold text-white bg-success">
          {toast}
        </div>
      )}

      <PageHeader
        title="Replenishment"
        subtitle={`Daily MRP recommendations — ${new Date().toLocaleDateString("en-MX", { dateStyle:"long" })}`}
        actions={
          <div className="flex items-center gap-2">
            {isManager && (
              <button onClick={exportCSV} className="btn-ghost btn-sm">
                <Download className="w-3.5 h-3.5" /> Export
              </button>
            )}
            <button onClick={runEngine} className="btn-ghost btn-sm" disabled={loading}>
              <RefreshCw className={clsx("w-3.5 h-3.5", loading && "animate-spin")} /> Refresh Engine
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} opts={STATUS_OPTS} />
        <FilterSelect label="ABC Class" value={abcFilter} onChange={setAbcFilter} opts={ABC_OPTS} />
        {isManager && facilities.length > 0 && (
          <FilterSelect label="Facility"
            value={facilityFilter}
            onChange={setFacilityFilter}
            opts={[{ label:"All Facilities", value:"ALL" }, ...facilities.map(f => ({ label: f.name, value: f.id }))]}
          />
        )}
      </div>

      {/* Summary pills */}
      <div className="flex gap-3 mb-4 flex-wrap">
        {[
          { label:"Stockouts",   count: recs.filter(r=>r.status==="STOCKOUT").length,   cls:"bg-red-50 text-lear-red border-lear-red/30" },
          { label:"Below Min",   count: recs.filter(r=>r.status==="BELOW_MIN").length,  cls:"bg-amber-50 text-warning border-warning/30" },
          { label:"At Reorder",  count: recs.filter(r=>r.status==="AT_REORDER").length, cls:"bg-blue-50 text-info border-info/30" },
          { label:"Total Items", count: recs.length,                                    cls:"bg-lear-gray-050 text-lear-gray-600 border-lear-gray-200" },
        ].map(s => (
          <div key={s.label} className={`flex items-center gap-1.5 px-3 py-1 border rounded-full text-xs font-semibold ${s.cls}`}>
            {s.count} {s.label}
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-5 h-5 animate-spin text-lear-gray-400" />
            </div>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-lear-gray-400 px-5 py-10 text-center">No items match the selected filters.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Description</th>
                  {isManager && <th>Facility</th>}
                  <th>ABC</th>
                  <th className="text-right">Stock</th>
                  <th className="text-right">Min</th>
                  <th className="text-right">Reorder</th>
                  <th className="text-right">Max</th>
                  <th className="text-right">Open PO</th>
                  <th className="text-right">Rec. Qty</th>
                  <th>Status</th>
                  {canCreate && <th />}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={r.id} className={i % 2 === 1 ? "alt" : ""}>
                    <td className="font-mono text-xs font-semibold">{r.items?.sku_code}</td>
                    <td>
                      <span className="text-xs text-lear-black">{r.items?.description}</span>
                      <span className="block text-xs text-lear-gray-400">{r.items?.category}</span>
                    </td>
                    {isManager && <td className="text-xs">{(r as unknown as {facilities:{name:string}}).facilities?.name}</td>}
                    <td>
                      <span className={clsx("badge", r.abc_class === "A" ? "badge-red" : r.abc_class === "B" ? "badge-amber" : "badge-gray")}>
                        {r.abc_class ?? "—"}
                      </span>
                    </td>
                    <td className={clsx("tabular text-right font-semibold text-sm", r.current_stock === 0 && "text-lear-red")}>
                      {r.current_stock}
                    </td>
                    <td className="tabular text-right text-sm">{Math.round(r.min_level)}</td>
                    <td className="tabular text-right text-sm">{Math.round(r.reorder_point)}</td>
                    <td className="tabular text-right text-sm">{Math.round(r.max_level)}</td>
                    <td className="tabular text-right text-sm text-lear-gray-600">{r.open_po_qty}</td>
                    <td className={clsx("tabular text-right font-bold text-sm",
                      r.recommended_qty > 0 ? "text-lear-black" : "text-lear-gray-400")}>
                      {r.recommended_qty > 0 ? Math.round(r.recommended_qty) : "—"}
                    </td>
                    <td><StatusBadge s={r.status} /></td>
                    {canCreate && (
                      <td>
                        {r.recommended_qty > 0 && (
                          <button
                            onClick={() => { setModal(r); setQty(String(Math.round(r.recommended_qty))); }}
                            className="btn-primary btn-sm whitespace-nowrap">
                            <PlusCircle className="w-3 h-3" /> Create Req.
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

      {/* Create Requisition Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded shadow-xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-lear-gray-200">
              <h3 className="font-bold text-lear-black">Create Requisition</h3>
              <p className="text-xs text-lear-gray-600 mt-0.5">{modal.items?.sku_code} — {modal.items?.description}</p>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">SKU</label>
                  <input value={modal.items?.sku_code} disabled className="form-input bg-lear-gray-050" />
                </div>
                <div>
                  <label className="form-label">Current Stock</label>
                  <input value={modal.current_stock} disabled className="form-input bg-lear-gray-050" />
                </div>
              </div>
              <div>
                <label className="form-label">Quantity <span className="text-lear-gray-400">(recommended: {Math.round(modal.recommended_qty)})</span></label>
                <input type="number" value={qty} onChange={e => setQty(e.target.value)} className="form-input" min="1" />
              </div>
              <div>
                <label className="form-label">Supplier</label>
                <select value={supplier} onChange={e => setSupplier(e.target.value)} className="form-select">
                  <option>Balluff de Mexico SA de CV</option>
                  <option>Norgren SA de CV</option>
                  <option>Autycom SA de CV</option>
                  <option>Standard Lifters Inc</option>
                  <option>Nidec Minster SA de CV</option>
                  <option>Festo Mexico SA de CV</option>
                </select>
              </div>
              <div>
                <label className="form-label">Justification <span className="text-lear-gray-400">(optional)</span></label>
                <textarea value={justification} onChange={e => setJustification(e.target.value)}
                  className="form-input resize-none" rows={2} />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-lear-gray-200 flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="btn-ghost">Cancel</button>
              <button onClick={createRequisition} disabled={creating} className="btn-primary">
                {creating ? "Submitting…" : "Submit to Coupa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, opts }: {
  label: string; value: string; onChange: (v: string) => void;
  opts: { label: string; value: string }[];
}) {
  return (
    <div className="flex items-center gap-2 bg-white border border-lear-gray-200 rounded px-3 py-1.5">
      <Filter className="w-3.5 h-3.5 text-lear-gray-400" />
      <select value={value} onChange={e => onChange(e.target.value)}
        className="text-sm text-lear-black bg-transparent outline-none cursor-pointer appearance-none">
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="w-3.5 h-3.5 text-lear-gray-400" />
    </div>
  );
}
