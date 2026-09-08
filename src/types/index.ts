// ============================================================
// TYPES — matches Supabase schema exactly
// ============================================================

export type UserRole = "admin" | "manager" | "planner" | "area_lead" | "viewer";
export type AbcClass = "A" | "B" | "C";
export type ReplenishmentStatus = "STOCKOUT" | "BELOW_MIN" | "AT_REORDER" | "HEALTHY";
export type RequisitionStatus =
  | "DRAFT" | "SUBMITTED" | "PENDING_APPROVER"
  | "APPROVED" | "RETURNED" | "PARTIALLY_RECEIVED" | "RECEIVED";
export type TransferStatus = "RECOMMENDED" | "APPROVED" | "INITIATED" | "COMPLETED" | "REJECTED";
export type RebalancingSignal = "SURPLUS" | "SHORTAGE" | "MATCH" | "HEALTHY";
export type AbcReviewDecision = "PENDING" | "APPROVED" | "FLAGGED" | "RETURNED";
export type WorkflowStatus = "PENDING" | "APPROVED" | "REJECTED" | "ESCALATED";

export interface Facility {
  id: string;
  code: string;
  name: string;
  region: string | null;
  system_type: "EAM" | "MVP";
  active: boolean;
  created_at: string;
}

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  facility_id: string | null;
  demo_active_role: UserRole | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  facility?: Facility;
}

export interface Item {
  id: string;
  facility_id: string;
  sku_code: string;
  description: string;
  long_description: string | null;
  category: string | null;
  unit_of_measure: string;
  unit_cost: number;
  currency: string;
  active: boolean;
}

export interface InventoryPosition {
  id: string;
  item_id: string;
  facility_id: string;
  stock_qty: number;
  snapshot_at: string;
}

export interface InventorySnapshot {
  id: string;
  item_id: string;
  facility_id: string;
  stock_qty: number;
  total_value: number | null;
  snapshot_date: string;
}

export interface ConsumptionHistory {
  id: string;
  item_id: string;
  facility_id: string;
  issue_qty: number;
  issue_date: string;
  machine_code: string | null;
}

export interface InventoryParameter {
  id: string;
  item_id: string;
  facility_id: string;
  min_level: number;
  reorder_point: number;
  max_level: number;
  safety_factor: number;
  reorder_freq_days: number;
  avg_daily_usage: number | null;
  avg_lead_time_days: number | null;
  consumption_window: number;
  effective_from: string;
  approval_status: WorkflowStatus;
  change_pct: number | null;
  change_reason: string | null;
}

export interface AbcClassification {
  id: string;
  item_id: string;
  facility_id: string;
  abc_class: AbcClass;
  composite_score: number | null;
  spend_score: number | null;
  frequency_score: number | null;
  criticality_flag: boolean;
  review_cycle: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  decision: AbcReviewDecision;
  comment: string | null;
  updated_at: string;
}

export interface ReplenishmentRecommendation {
  id: string;
  item_id: string;
  facility_id: string;
  run_date: string;
  current_stock: number;
  open_po_qty: number;
  min_level: number;
  reorder_point: number;
  max_level: number;
  recommended_qty: number;
  avg_daily_usage: number | null;
  avg_lead_time_days: number | null;
  status: ReplenishmentStatus;
  abc_class: AbcClass | null;
  created_at: string;
  // Joined
  items?: Item;
  facilities?: Facility;
}

export interface PurchaseOrder {
  id: string;
  coupa_req_id: string | null;
  item_id: string;
  facility_id: string;
  supplier_name: string | null;
  qty: number;
  unit_cost: number | null;
  currency: string;
  status: RequisitionStatus;
  submitted_at: string | null;
  approved_at: string | null;
  expected_receipt: string | null;
  received_at: string | null;
  quoted_lead_time: number | null;
  current_approver: string | null;
  days_with_approver: number | null;
  justification: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  items?: Item;
  facilities?: Facility;
}

export interface TransferRecommendation {
  id: string;
  item_id: string;
  from_facility_id: string;
  to_facility_id: string;
  from_surplus_qty: number | null;
  to_shortage_qty: number | null;
  recommended_qty: number;
  signal: RebalancingSignal;
  est_lead_time_saving: number | null;
  status: TransferStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  // Joined
  items?: Item;
  from_facility?: Facility;
  to_facility?: Facility;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "error" | "success";
  read: boolean;
  link: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  facility_id: string | null;
  created_at: string;
}

export interface BusinessRule {
  id: string;
  rule_key: string;
  rule_value: string;
  description: string | null;
  updated_at: string;
}

// ── DASHBOARD TYPES ─────────────────────────────────────────
export interface DashboardStats {
  stockoutCount:     number;
  belowMinCount:     number;
  atReorderCount:    number;
  openReqCount:      number;
  facilityCount:     number;
  stockoutRate:      number;
  transferMatches:   number;
  abcPendingCount:   number;
}

export interface StockoutTrendPoint {
  week:          string;
  stockout_rate: number;
  facility_name: string;
}

export interface InventoryValuePoint {
  snapshot_date: string;
  total_value:   number;
  facility_name: string;
}

// ── AUTH CONTEXT ─────────────────────────────────────────────
export interface AuthUser {
  id:       string;
  email:    string;
  profile:  UserProfile;
  // effective role = demo_active_role ?? role
  effectiveRole: UserRole;
  facilityId:    string | null;
}
