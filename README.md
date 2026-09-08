# Lear Inventory Planning Cockpit

A full-stack inventory planning and MRP platform built for Lear Corporation's demo.

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · Supabase (Auth + DB + Edge Functions) · Recharts · Vercel

---

## Demo Accounts

All accounts use password: `LearDemo2026!`

| Email | Role | Access |
|---|---|---|
| admin@lear.com | IT / Platform Admin | System config, user management, **role switcher** |
| manager@lear.com | Inventory Manager | All 6 modules, all facilities |
| planner@lear.com | Requisitor / Planner | Dashboard, Replenishment, Requisitions (Plant A only) |
| arealead@lear.com | Warehouse / Area Lead | Dashboard, ABC Review (Plant A only) |
| viewer@lear.com | Read-Only Viewer | Dashboard, Reports (Plant A only) |

**To switch roles during the demo:**
1. Log in as `admin@lear.com`
2. Navigate to **Admin → Demo Role Switcher**
3. Change the active role on any user (including yourself)
4. Reload the page — the entire UI adapts to that role

---

## Step-by-Step Deployment

### Step 1 — Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Choose a name (e.g. `lear-cockpit`), set a strong DB password, choose region closest to you
3. Wait ~2 minutes for the project to provision
4. Go to **Project Settings → API** and copy:
   - `Project URL` → this is `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → this is `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role secret` key → this is `SUPABASE_SERVICE_ROLE_KEY`

### Step 2 — Run Database Migrations

Go to **Supabase Dashboard → SQL Editor** and run these files **in order**:

**2a. Schema** — paste and run `supabase/migrations/001_schema.sql`

**2b. Seed data** — paste and run `supabase/migrations/002_seed.sql`

**2c. Auth users** — paste and run `supabase/migrations/003_auth_users.sql`

> If `003_auth_users.sql` fails with a duplicate error on `auth.identities`, try running just the `auth.users` insert first, then the `auth.identities` insert separately.

### Step 3 — Deploy Edge Functions

Install the Supabase CLI if you haven't:
```bash
npm install -g supabase
```

Login and link your project:
```bash
supabase login
supabase link --project-ref your-project-id
# Find your project-ref in: Supabase Dashboard → Project Settings → General
```

Deploy all 4 Edge Functions:
```bash
supabase functions deploy mrp-engine
supabase functions deploy abc-engine
supabase functions deploy rebalancing-engine
supabase functions deploy trigger-engines
```

Set the service role secret on Edge Functions:
```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

### Step 4 — Run Engines to Populate Calculated Data

After seeding, call the trigger function once to run ABC → MRP → Rebalancing:

```bash
curl -X POST https://your-project-id.supabase.co/functions/v1/trigger-engines \
  -H "Authorization: Bearer your-service-role-key-here" \
  -H "Content-Type: application/json"
```

> This populates `abc_classifications`, `inventory_parameters`, `replenishment_recommendations`, and `transfer_recommendations`. Takes ~30 seconds. The dashboard will show live data after this runs.

### Step 5 — Deploy to Vercel

**5a. Push to GitHub**
```bash
git init
git add .
git commit -m "Initial commit — Lear Inventory Cockpit"
git remote add origin https://github.com/your-org/lear-cockpit.git
git push -u origin main
```

**5b. Import to Vercel**
1. Go to [vercel.com](https://vercel.com) → New Project
2. Import your GitHub repository
3. Framework: **Next.js** (auto-detected)
4. Add Environment Variables:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://your-project-id.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon key |
| `NEXT_PUBLIC_APP_URL` | your Vercel URL (add after first deploy) |

5. Click **Deploy**

**5c. Enable Email Auth in Supabase**
1. Supabase Dashboard → Authentication → Providers
2. Make sure **Email** is enabled
3. Under **Email** settings, disable "Confirm email" for demo (so users can log in without email verification)

---

## Local Development

```bash
# Clone the repo
git clone https://github.com/your-org/lear-cockpit.git
cd lear-cockpit

# Install dependencies
npm install

# Copy env file
cp .env.example .env.local
# Fill in your Supabase URL and anon key

# Run dev server
npm run dev
# Open http://localhost:3000
```

---

## Project Structure

```
lear-cockpit/
├── supabase/
│   ├── migrations/
│   │   ├── 001_schema.sql          # All 14 tables + RLS policies
│   │   ├── 002_seed.sql            # 3 facilities, 60 SKUs, stock, POs
│   │   └── 003_auth_users.sql      # 5 demo auth users
│   └── functions/
│       ├── mrp-engine/             # Min/Max/Reorder/Recommended Qty
│       ├── abc-engine/             # ABC classification scoring
│       ├── rebalancing-engine/     # Cross-plant SURPLUS/SHORTAGE/MATCH
│       └── trigger-engines/        # Runs all 3 in sequence
│
└── src/
    ├── app/
    │   ├── login/                  # Email + password login
    │   └── (app)/
    │       ├── dashboard/          # Role-specific KPI dashboard
    │       ├── replenishment/      # MRP table + create requisition
    │       ├── abc-review/         # Quarterly ABC workflow
    │       ├── cross-plant/        # Multi-facility + transfers
    │       ├── requisitions/       # Coupa status tracker
    │       ├── reports/            # Recharts trend reports
    │       └── admin/              # Users + role switcher + rules
    ├── components/
    │   └── layout/
    │       ├── AppShell.tsx        # Dark sidebar + topbar
    │       └── NotificationBell.tsx
    ├── hooks/
    │   └── useAuth.ts              # Auth context + effectiveRole
    ├── lib/supabase/
    │   ├── client.ts               # Browser client
    │   └── server.ts               # Server component client
    ├── middleware.ts               # Route protection
    └── types/index.ts              # All TypeScript types
```

---

## Key Architecture Decisions

| Decision | Choice | Reason |
|---|---|---|
| Auth | Supabase email+password | Simple, no OAuth complexity |
| Role enforcement | Supabase RLS | DB-level, can't be bypassed |
| Demo role switching | `demo_active_role` column | One login, any role, no re-auth |
| Backend engines | Supabase Edge Functions | Serverless, same infra as DB |
| Charts | Recharts | Zero config, React-native |
| Styling | Tailwind + custom CSS | Lear brand colours baked in |

---

## MRP Formulas (from spec)

```
Daily Usage (DU)  = SUM(issues last 90 days) ÷ 90
Lead Time (LT)    = AVG(last 3 PO receipt times)
Minimum           = DU × LT × Safety Factor (A=1.5, B=1.0, C=0.5)
Reorder Point     = DU × LT + Minimum
Maximum           = Reorder Point + (DU × Reorder Frequency days)
Recommended Qty   = Maximum − MAX(stock, 0) − Open PO Qty
```

---

## Troubleshooting

**Login fails:** Check that `003_auth_users.sql` ran successfully and email confirmation is disabled in Supabase Auth settings.

**Dashboard shows no data:** Run the trigger-engines curl command from Step 4. The seed data needs the engines to process it before recommendations appear.

**Edge Functions fail:** Make sure you ran `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...` — the engines need service role access to bypass RLS when writing calculated data.

**RLS blocking data:** All reads from the frontend use the anon key + user JWT. If data isn't showing, check that the user's `facility_id` in `user_profiles` matches the data's `facility_id`.
