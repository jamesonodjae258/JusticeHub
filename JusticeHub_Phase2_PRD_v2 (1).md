# JusticeHub — Phase 2 PRD v3.0

**Category:** Legal Technology / Practice Management
**Version:** 3.0 — Architecture Revised
**Date:** July 2026
**Builds on:** JusticeHub MVP PRD v0.1
**What changed in v3.0:** Complete role, routing, and dashboard architecture rewrite. Each role now has a fully separate dashboard experience, scoped at the database level. Activity log and login audit built on Postgres triggers, not application code.

---

## 1. Context & Rationale

Phase 1 established JusticeHub's core loop: case management, document hub, client portal, court dates, and internal collaboration. Phase 2 converts that foundation into a revenue-replacing workflow tool with a proper multi-role architecture.

v3.0 replaces the previous role system with a stricter, more intentional design: four completely separate dashboard experiences, each scoped at both the routing layer and the database layer. No role can see what belongs to another role — not by hiding UI elements, but by structuring queries so the data is never returned in the first place.

> **Prerequisite:** Do not build any Phase 2 feature on top of the Phase 1 routing structure. The architecture in Section 3 must be implemented first. Build nothing else until the routing, RLS, and activity log are confirmed working.

---

## 2. Account Creation & Onboarding Flow

```
Someone signs up at /onboarding
            ↓
They are automatically assigned role: super_admin
(first user of any firm = super_admin, no exceptions, no overrides)
            ↓
Onboarding flow: set up firm name, logo, address, billing defaults
            ↓
Super Admin invites Admin(s)
            ↓
Super Admin OR Admin invites Lawyers / Staff
            ↓
Lawyer invites Clients to the portal
```

**Rules:**
- Nobody self-registers as a lawyer, admin, or staff. Every user below super_admin enters the system through a signed invite link only.
- Invite tokens are one-time-use and expire after 24 hours.
- The onboarding flow is the only place a firm account is created. There is no "create firm" action anywhere else in the app.
- If a Super Admin deletes their own account, the system must first require them to promote another member to Super Admin — a firm cannot be left without one.

---

## 3. Routing Architecture

Four completely separate route groups in Next.js. Each route group is its own world — separate layouts, separate data fetching, separate navigation.

```
/onboarding              → new firm signup — creates the super_admin account
/dashboard/overview/**   → super_admin only
/dashboard/admin/**      → firm_admin only
/dashboard/lawyer/**     → attorney and staff only
/portal/**               → client only — completely separate auth context
```

**Middleware rules (enforced on every request):**
- JWT role claim is checked on every route hit
- A user hitting a route they do not own receives a **404** — not a redirect, not a 403, not an unauthorised page. A 404 reveals nothing about the existence of the route.
- A super_admin hitting `/dashboard/admin` gets a 404. A lawyer hitting `/dashboard/overview` gets a 404. No exceptions.
- The client portal (`/portal`) runs on a completely separate auth context — a client session cannot access any `/dashboard` route and vice versa.
- After login, the middleware reads the role from the JWT and redirects to the correct dashboard automatically. The user never chooses where to go.

---

## 4. Role Definitions

### 4.1 Super Admin *(created at signup — platform owner)*

The Super Admin is the person who created the firm account. They have the highest level of access inside their firm. There is always at least one Super Admin per firm.

**Their dashboard shows:**
- Firm-wide stats: total cases, active cases, closed cases, total clients, documents uploaded, invoices generated, e-signature completion rate
- All lawyers in the firm: name, role, active case count, last login timestamp, last action performed
- **Login audit log**: every user login — timestamp, IP address, device, user agent, success/failure
- **Full activity feed**: every action any user takes across the entire firm — case created, status changed, document uploaded, client invited, invoice sent, note added, user deactivated — all of it, chronological, real time
- **Notifications**: instant alert for every system event (full list in Section 7)
- Full case visibility: read-only across all cases in the firm
- Full user management: invite, deactivate, promote, change roles, manage all admin accounts

**Hard limits:**
- Cannot edit or delete case documents — view only
- Cannot alter time entries or invoices created by lawyers
- Cannot act as another user / impersonate

---

### 4.2 Firm Admin *(invited by Super Admin)*

Operational oversight. Sees team workflow and case activity — not the deep audit infrastructure that the Super Admin has.

**Their dashboard shows:**
- Team overview: all lawyers, case loads, last active date — **no login IP, no device info, no full audit history**
- All cases across the firm: can view and assign to lawyers
- **Activity feed (case-level only):** new case created, case status changed, client added, document uploaded, court date added — **not** login events, not session events, not system-level changes
- **Notifications (case and client events only):** case assigned, new client, document uploaded, court date approaching, invoice overdue — **not** login events, not user management events
- Client list across the firm
- Invoice status across the firm: can view and send — cannot view individual time entry logs
- Can invite lawyers and staff — **cannot invite or manage other Admins** (only Super Admin manages Admin accounts)

**Hard limits:**
- Cannot see login audit log (IP addresses, devices, session history — Super Admin only)
- Cannot see full system activity feed (session and login events invisible)
- Cannot view individual lawyer time entries — sees invoice totals only
- Cannot manage other Admin accounts
- Cannot access Super Admin notifications or dashboard

---

### 4.3 Lawyer / Attorney *(invited by Super Admin or Admin)*

Their own workspace. Entirely scoped to cases assigned to them. They cannot see other lawyers' work at any level.

**Their dashboard shows:**
- Only cases assigned to them — enforced by RLS, not a UI filter
- Only clients linked to their assigned cases
- Their own time entries and billing
- Their own document uploads
- Their own court dates and deadlines
- Notifications scoped to their cases only: new note, date approaching, client viewed portal, document signed, invoice paid

**Hard limits:**
- Cannot see other lawyers' cases, clients, documents, time entries, or invoices
- Cannot see any Admin or Super Admin view
- Cannot see firm-wide stats, team activity, or any audit log
- Cannot invite or manage other users (can invite clients to the portal from their own cases)

---

### 4.4 Staff / Paralegal *(invited by Super Admin or Admin)*

Support role. Similar scope to a Lawyer but with no billing or e-signature access.

**Their dashboard shows:**
- Cases they are assigned to or that they have been explicitly granted access to by a Lawyer
- Can upload documents, add court dates, add notes
- Cannot log time entries, generate invoices, or send e-signature requests
- Cannot view other lawyers' or staff members' cases

---

### 4.5 Client *(invited by Lawyer from a case)*

Completely separate experience. Different URL, different login flow, different everything.

**Their portal shows:**
- Their case(s) only: status, upcoming dates, documents the lawyer has toggled visible
- Nothing else — no other clients, no firm data, no internal activity, no other cases

---

## 5. Permissions Matrix

| Permission | Super Admin | Firm Admin | Lawyer | Staff | Client |
|---|---|---|---|---|---|
| Create firm account / onboarding | ✓ | ✗ | ✗ | ✗ | ✗ |
| View Super Admin dashboard | ✓ | ✗ | ✗ | ✗ | ✗ |
| View Admin dashboard | ✗ | ✓ | ✗ | ✗ | ✗ |
| View Lawyer dashboard | ✗ | ✗ | ✓ | ✓ | ✗ |
| View client portal | ✗ | ✗ | ✗ | ✗ | ✓ |
| View login audit log | ✓ | ✗ | ✗ | ✗ | ✗ |
| View full activity feed | ✓ | Case-level only | Their cases only | Their cases only | ✗ |
| Receive all system notifications | ✓ | Case/client events | Their cases only | Their cases only | ✗ |
| View all cases (firm-wide) | Read only | ✓ | ✗ | ✗ | ✗ |
| Edit cases | ✗ | ✓ | Assigned only | Assigned only | ✗ |
| View all client documents | Read only | ✗ | Assigned cases | Granted only | Own docs |
| Edit / delete documents | ✗ | ✗ | ✓ | ✗ | ✗ |
| Invite Admin | ✓ | ✗ | ✗ | ✗ | ✗ |
| Invite Lawyer / Staff | ✓ | ✓ | ✗ | ✗ | ✗ |
| Invite Client to portal | ✗ | ✗ | ✓ | ✗ | ✗ |
| Deactivate any user | ✓ | Lawyers/Staff only | ✗ | ✗ | ✗ |
| Manage Admin accounts | ✓ | ✗ | ✗ | ✗ | ✗ |
| Log time entries | ✗ | ✗ | ✓ | ✗ | ✗ |
| Generate & send invoices | ✓ | ✓ | ✓ | ✗ | ✗ |
| View individual time entry logs | ✓ | ✗ | Own only | ✗ | ✗ |
| Send e-signature requests | ✗ | ✗ | ✓ | ✗ | ✗ |
| Manage firm settings | ✓ | ✓ | ✗ | ✗ | ✗ |
| View firm-wide stats | ✓ | ✓ | ✗ | ✗ | ✗ |

---

## 6. Activity Log & Login Audit System

This is the most important infrastructure piece in Phase 2. It must be built first, before any feature work, because everything else depends on it.

### 6.1 Activity log

**Table: `activity_log`**

| Field | Notes |
|---|---|
| `id` | Primary key |
| `firm_id` | RLS scope |
| `actor_id` | The user who performed the action |
| `actor_role` | Snapshot of the actor's role at time of action |
| `action` | String: `case.created`, `case.status_changed`, `document.uploaded`, `document.visibility_toggled`, `client.invited`, `invoice.sent`, `note.added`, `user.deactivated`, etc. |
| `entity_type` | `case`, `document`, `client`, `invoice`, `user`, `note` |
| `entity_id` | ID of the affected record |
| `metadata` | JSONB: before/after values, extra context — e.g. `{from: "active", to: "closed"}` |
| `created_at` | Timestamp — indexed for fast feed queries |

**How it is written:**
Every write operation inserts a row into `activity_log` automatically via a **Postgres trigger** — not application-layer code. This means even if the application has a bug or the API is bypassed, the log is still written.

**RLS on `activity_log`:**
- `super_admin` → reads all rows for their firm
- `firm_admin` → reads rows where `entity_type IN ('case', 'document', 'client', 'invoice', 'note')` only — no user management events, no session events
- `attorney` / `staff` → reads rows where `entity_id` matches their assigned case IDs only
- Clients → no access

### 6.2 Login audit log

**Table: `login_audit`**

| Field | Notes |
|---|---|
| `id` | Primary key |
| `user_id` | Who logged in |
| `firm_id` | RLS scope |
| `ip_address` | Client IP at time of login |
| `device` | Parsed from user agent: Desktop / Mobile / Tablet |
| `user_agent` | Full user agent string |
| `created_at` | Timestamp |
| `success` | Boolean — false for failed login attempts |

**How it is written:**
Inserted via a **Supabase Auth hook** that fires on every login attempt — success and failure both logged.

**RLS on `login_audit`:**
- `super_admin` → reads all rows for their firm
- All other roles → no access, no exceptions

### 6.3 Immutability

Both `activity_log` and `login_audit` are append-only. No `UPDATE` or `DELETE` is permitted on either table, enforced by a Postgres rule at the database level — not the application layer. Not even the Super Admin can alter these records.

---

## 7. Notification System

Notifications are delivered in-app (bell icon) and optionally by email (configurable in personal settings).

| Event | Super Admin | Firm Admin | Lawyer | Staff |
|---|---|---|---|---|
| Any user logs in | ✓ (with IP + device) | ✗ | ✗ | ✗ |
| Failed login attempt | ✓ | ✗ | ✗ | ✗ |
| Case created | ✓ | ✓ | If assigned | ✗ |
| Case status changed | ✓ | ✓ | If their case | If their case |
| Document uploaded | ✓ | ✓ | If their case | If their case |
| Document visibility toggled | ✓ | ✓ | If their case | ✗ |
| Client invited to portal | ✓ | ✓ | If their client | ✗ |
| Client viewed portal | ✓ | ✗ | If their client | ✗ |
| Invoice sent | ✓ | ✓ | If their invoice | ✗ |
| Invoice paid | ✓ | ✓ | If their invoice | ✗ |
| Invoice overdue | ✓ | ✓ | If their invoice | ✗ |
| Court date in 48 hours | ✓ | ✓ | If their case | If their case |
| Note added to case | ✓ | ✓ | If their case | If their case |
| Document signed | ✓ | ✓ | If their case | ✗ |
| User invited | ✓ | ✓ (lawyers/staff only) | ✗ | ✗ |
| User deactivated | ✓ | ✗ | ✗ | ✗ |
| User promoted | ✓ | ✗ | ✗ | ✗ |

**Notification delivery:**
- All notifications land in the in-app notification centre (bell icon in top bar) for the relevant role's dashboard
- Users configure email on/off per event type in personal settings
- Notifications are scoped by RLS — a lawyer's notification query can only return notifications related to their cases

---

## 8. Dashboard Specifications

### 8.1 Super Admin Dashboard (`/dashboard/overview`)

**Top stats row (4 cards):**
- Total active cases
- Total lawyers in firm
- Documents uploaded this month
- Invoices generated this month

**Second row:**
- Active cases by status (Intake / Active / Awaiting Court / Closed) — bar chart
- New cases over time — line chart (last 30 days)

**Lawyers table:**
- Name, role, avatar, active case count, last login (date + time), last action performed, status badge (Active / Deactivated)
- Clicking a lawyer row shows their case list — read only

**Login audit feed (right panel):**
- Last 50 login events: user name, timestamp, IP address, device icon, success/failure badge
- Searchable by user name or date range

**Live activity feed (bottom):**
- Every firm-wide action in reverse chronological order
- Actor name + role, action description, entity affected, timestamp
- Filterable by: All / Cases / Documents / Clients / Invoices / Users

**Notifications bell:**
- All system events
- Red badge count on unread
- Click to expand notification panel — each notification links to the relevant record

---

### 8.2 Admin Dashboard (`/dashboard/admin`)

**Top stats row (4 cards):**
- Total cases in firm
- Active lawyers
- Clients with portal access
- Invoices pending payment

**Case list:**
- All cases in the firm: name, client, status badge, assigned lawyer, last updated
- Can assign/reassign cases to lawyers
- Can view case detail — read access

**Team panel:**
- All lawyers and staff: name, role, case count, last active date (not login time — that's Super Admin only)
- Can invite new lawyer or staff
- Can deactivate lawyers and staff (not other Admins)

**Case activity feed:**
- Case-level events only: new case, status change, document uploaded, client added, court date added
- No login events, no user management events

**Notifications bell:**
- Case and client events only
- Invoice overdue alerts

---

### 8.3 Lawyer Dashboard (`/dashboard/lawyer`)

**Top stats row (4 cards):**
- My active cases
- Upcoming hearings (next 7 days)
- Pending e-signature requests
- Unpaid invoices

**My cases:**
- Only cases assigned to this lawyer — RLS enforces this at query level
- Status badges, client name, next court date, last updated

**Quick actions:**
- New case
- Log time
- Upload document
- Send invoice

**My activity feed:**
- Only events on their cases — document uploaded, client viewed portal, note added, document signed
- No other lawyers' activity visible

**Notifications bell:**
- Their cases only
- Court date reminders, invoice paid alerts, client portal activity

---

## 9. User Management Module

### 9.1 Who can invite whom

| Role being invited | Who can invite them |
|---|---|
| Super Admin (promotion) | Super Admin only |
| Firm Admin | Super Admin only |
| Lawyer | Super Admin OR Firm Admin |
| Staff | Super Admin OR Firm Admin |
| Client (to portal) | Lawyer only (from their case) |

### 9.2 Invite flow

- Inviter opens Team Management (Super Admin: in Overview dashboard; Admin: in their dashboard)
- Enters name, email, and selects role
- System sends a signed invite email with a one-time-use token (24-hour expiry)
- Invitee clicks link, sets password, lands on their role-specific dashboard
- Inviter sees invite status update from Pending to Accepted

### 9.3 Data model

| Field / Table | Notes |
|---|---|
| `firm_invitations` | `id, firm_id, email, role, invited_by, token (UUID), expires_at, accepted_at` |
| `users.role` | `super_admin \| firm_admin \| attorney \| staff \| client` — stored in DB and as JWT claim |
| `users.status` | `active \| deactivated` — deactivated blocks login at auth layer |
| `users.deactivated_at` | Timestamp |
| `users.deactivated_by` | user_id of who performed the deactivation |
| `activity_log` | See Section 6.1 |
| `login_audit` | See Section 6.2 |

---

## 10. Profiles Module

Every user has a profile — scoped to their role.

### Attorney / Staff / Admin profile (editable fields)
- Profile photo (avatar) — private Supabase Storage bucket, served via signed URL with 7-day TTL
- Full name, professional title, email (requires verification to change), phone (optional)
- Bio — 140 character limit; shown to clients in the portal

### Attorney-only additional fields
- Bar / roll number (optional)
- Practice areas — multi-select
- Hourly rate — pre-fills on time entry; overridable per case

### Read-only on all profiles
- Role (only Super Admin can change), firm, join date

### Client profile (editable in portal)
- Full name, phone, preferred language
- Created by the inviting lawyer; client can edit name, phone, language after accepting invite

---

## 11. Settings Module

### 11.1 Personal Settings (all users)
- Account: change name, email (requires verification), password, enable/disable 2FA (TOTP)
- Profile: all profile fields, avatar upload/remove
- Notifications: email + in-app toggles per event type (scoped to what their role can receive)
- Appearance: light mode only — dark mode toggle present, labelled "Coming soon"
- Delete account: requires typed confirmation; Super Admin must promote another before deleting

### 11.2 Firm Settings (Super Admin and Firm Admin)

**Super Admin sees all sections:**
- Firm profile: name, logo, address, contact email, phone, website
- Billing defaults: hourly rate, payment terms, currency, invoice number format, tax, bank details
- Team management: full user list, invite, deactivate, promote
- Client portal settings: header message, download toggle, phone visibility default
- Security: enforce 2FA firm-wide, session timeout, login activity (full — all users)

**Firm Admin sees a subset:**
- Firm profile: name, logo, address (but NOT billing defaults — Super Admin only)
- Team management: lawyers and staff only (not Admin accounts)
- Client portal settings: same as Super Admin
- Security: session timeout only — no login activity log access

### 11.3 Difference in security settings visibility

| Setting | Super Admin | Firm Admin |
|---|---|---|
| Login activity (all users, IP, device) | ✓ | ✗ |
| Enforce 2FA firm-wide | ✓ | ✗ |
| Session timeout | ✓ | ✓ |
| View own login history | ✓ | ✓ |

---

## 12. Modules A, B, C (Time Tracking, Billing, E-signature)

These modules are unchanged from v2.0 in terms of feature scope. The difference is that they now render inside the correct role-scoped dashboards:

- Time tracking lives inside `/dashboard/lawyer` — only attorneys log time
- Billing invoice generation lives in `/dashboard/lawyer` (generate) and `/dashboard/admin` (view/send status)
- Super Admin can see invoice totals in their firm-wide stats but not individual time entry logs
- E-signature requests are initiated from `/dashboard/lawyer` only

Refer to Sections 6, 7, and 8 of PRD v2.0 for full data models and feature specs for these modules.

---

## 13. Data Model Summary (Phase 2 additions)

| Table | Key fields | Purpose |
|---|---|---|
| `profiles` | `user_id, firm_id, display_name, title, avatar_url, bio, phone, bar_number, practice_areas, hourly_rate, notification_preferences` | One per user, 1:1 with auth.users |
| `firm_settings` | `firm_id, name, logo_url, address, invoice_currency, invoice_number_format, tax_label, tax_rate, payment_terms, bank_details, portal_message` | Firm configuration |
| `firm_invitations` | `id, firm_id, email, role, invited_by, token, expires_at, accepted_at` | Pending invites |
| `activity_log` | `id, firm_id, actor_id, actor_role, action, entity_type, entity_id, metadata, created_at` | Immutable — written by Postgres trigger |
| `login_audit` | `id, user_id, firm_id, ip_address, device, user_agent, created_at, success` | Immutable — written by Supabase Auth hook |
| `time_entries` | `id, case_id, user_id, firm_id, date, duration_minutes, rate_per_hour, is_billable, description, invoice_id` | Billable hours |
| `invoices` | `id, case_id, client_id, firm_id, status, issue_date, due_date, line_items, total_amount, pdf_url, sent_at, paid_at` | Full invoice lifecycle |
| `invoice_reminders` | `id, invoice_id, sent_at, type` | Prevents duplicate reminders |
| `signature_requests` | `id, case_id, document_id, firm_id, client_id, provider, provider_envelope_id, status, requested_at, signed_at, signed_doc_url` | E-signature lifecycle |
| `notifications` | `id, firm_id, recipient_id, recipient_role, event_type, entity_type, entity_id, message, read, created_at` | In-app notification records |

---

## 14. Non-Functional Requirements

- All route protection enforced in Next.js middleware — wrong role = 404, not redirect
- All data access enforced in Supabase RLS — queries that breach role boundaries return empty, never an error that reveals data exists
- `activity_log` and `login_audit` are immutable — Postgres-level `RULE` prevents UPDATE and DELETE on both tables, not even Super Admin can alter them
- Avatar images served via signed URLs (7-day TTL) — never public bucket URLs
- Invite tokens: one-time-use, 24-hour expiry, marked used on acceptance
- Super Admin 2FA is mandatory — wired into the auth flow, cannot be bypassed
- Invoice PDF generation: under 3 seconds
- Signed documents stored within 60 seconds of webhook
- Hosted invoice URL uses UUID token, not invoice ID

---

## 15. Build Sequence

**Total: 13 weeks.** Architecture first — nothing else until it is confirmed working.

| Week | Module | Deliverable | Gate |
|---|---|---|---|
| 1 | Architecture & routing | Route groups, middleware 404 enforcement, JWT role claims, RLS rewrite for all 5 roles | Every role correctly isolated — wrong role = 404 confirmed |
| 2 | Activity log & login audit | `activity_log` Postgres trigger, `login_audit` Auth hook, RLS on both tables, immutability enforced | Perform a write operation — confirm log row appears; attempt UPDATE on log — confirm it fails at DB level |
| 3 | Onboarding flow | Firm signup creates super_admin, onboarding wizard (firm name/logo/settings), redirect to Super Admin dashboard | Full onboarding flow completed by a test account |
| 4 | User management | Invite flow, team list, deactivate/reactivate, promote to firm_admin, role-scoped visibility | Firm Admin can invite a lawyer; Super Admin can invite an Admin; lawyer gets 404 on team management |
| 5 | Profiles | Profile edit for all roles, avatar upload (private bucket, signed URL), attorney-specific fields | All roles save complete profiles including avatar |
| 6 | Firm & personal settings | Firm settings (Super Admin full, Admin subset), personal settings (account, 2FA, notifications, appearance) | Super Admin and Admin see different setting sections; 2FA setup works end-to-end |
| 7 | Super Admin dashboard | Stats, lawyers table, login audit feed, full activity feed, notifications, firm-wide case read-only | Super Admin sees full activity; Admin hitting /dashboard/overview gets 404 |
| 8 | Admin dashboard | Stats, case list with assignment, team panel, case activity feed, notifications | Admin sees case-level activity only; no login events visible |
| 9 | Lawyer dashboard | Stats, my cases (RLS enforced), quick actions, my activity feed, notifications | Lawyer sees only their cases — confirmed at DB level, not just UI |
| 10 | Time tracking | Time entry form, timer widget, per-case time log, billable toggle — inside lawyer dashboard | Pilot firm logs 10 real time entries |
| 11–12 | Billing | Invoice generation, PDF, send, hosted client view, status tracking, overdue reminders | Client opens invoice on mobile; reminder fires once only |
| 13 | E-signature | Provider integration, signing flow, webhook, signed document storage | End-to-end signing on mobile for a real document |

---

## 16. Deferred to Phase 3

| Feature | Why |
|---|---|
| AI drafting | Needs document corpus — build after 3+ months of document history |
| Online payment processing | Requires payment compliance review |
| Recurring invoices / retainer billing | Validate demand first |
| Multi-party e-signature | Validate demand before adding orchestration complexity |
| Accounting integrations | Validate after billing is proven |
| Contract lifecycle management | Separate PRD needed |
| Dark mode | After Phase 3 when core feature set is stable |
| Mobile app | When retention metrics justify the investment |
| Multi-language support | Phase 3 if West African expansion continues |

---

## 17. Risks & Mitigations

| Risk | Detail | Mitigation |
|---|---|---|
| Route leakage | A wrong-role user discovers a route exists via redirect | Return 404, not 403 or redirect, for all unauthorised route access |
| Data leakage via RLS gap | A lawyer's query accidentally returns another lawyer's cases | Test every query with a non-owner auth context before shipping each chunk |
| Activity log missing events | Application code bypassed — some writes not logged | Triggers fire at DB level regardless of application — not dependent on app code |
| Login audit hook failure | Auth hook crashes silently — logins not logged | Wrap hook in try/catch; alert Super Admin if login_audit row count stops growing |
| Super Admin locked out | Super Admin loses 2FA device and cannot log in | Recovery codes generated at 2FA setup; recovery flow requires email + identity verification |
| Invite token leaked | Invite link forwarded to wrong person | One-time-use + 24-hour expiry + immediate mark-used on acceptance |
| Firm left without Super Admin | Super Admin deletes account without promoting another | Block account deletion if the user is the only Super Admin in the firm |
