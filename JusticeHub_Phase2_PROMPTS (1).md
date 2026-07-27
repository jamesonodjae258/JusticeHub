# JusticeHub Phase 2 — Antigravity Build Prompts v3.0

13 chunks in strict order. Architecture first — nothing else until
Chunk 1 and 2 are confirmed working. Read the Implementation Plan
artifact before approving every chunk. Commit after each one.

---

## Before you start

Confirm all of these are in your project root:

- [ ] `PRD.md` — JusticeHub MVP PRD v0.1 (Phase 1)
- [ ] `PRD_PHASE2.md` — JusticeHub Phase 2 PRD v3.0
- [ ] `BRAND.md` — JusticeHub brand and design system
- [ ] `.env.local` — Supabase URL, anon key, service role key
- [ ] Supabase project on **Pro plan** (required for pg_cron)
- [ ] Phase 1 MVP fully built, deployed, and working
- [ ] Git repo with a clean commit at end of Phase 1

---

## Chunk 1 — Routing architecture, role system & RLS

```
Read PRD_PHASE2.md in full, then PRD.md, then BRAND.md.
Do not touch any Phase 1 feature unless this chunk explicitly requires it.

We are building the Phase 2 architecture foundation.
Nothing else gets built until this chunk is confirmed working.

ACCOUNT CREATION RULE:
The first user who signs up creates a firm and is automatically
assigned role: super_admin. No other role can be assigned at signup.
Every user below super_admin enters the system via an invite only.

ROUTING ARCHITECTURE:
Create four completely separate Next.js route groups:

  /onboarding            → firm signup, creates super_admin account
  /dashboard/overview/** → super_admin only
  /dashboard/admin/**    → firm_admin only
  /dashboard/lawyer/**   → attorney and staff only
  /portal/**             → client only, separate auth context

MIDDLEWARE RULES (enforced on every single request):
- Read the role claim from the JWT on every route hit
- A user hitting a route they do not own receives a 404
  NOT a redirect, NOT a 403 — a 404
  This reveals nothing about the existence of the route
- A super_admin hitting /dashboard/admin → 404
- A lawyer hitting /dashboard/overview → 404
- A client session cannot reach any /dashboard route
- After login, middleware reads the role and redirects to the
  correct dashboard automatically — user never chooses

ROLE SYSTEM:
Extend the users table for five roles:
super_admin | firm_admin | attorney | staff | client

Store the role as a claim in the Supabase JWT so it is available
in RLS policies without a database join on every request.

RLS REWRITE:
Rewrite all Phase 1 RLS policies to enforce both firm_id scoping
AND the new role hierarchy from the permissions matrix in
PRD_PHASE2.md Section 5.

Key RLS constraints to enforce at storage URL level (not just UI):
- firm_admin must NEVER receive a signed URL for document content
  (can see document name and metadata only)
- staff can only view document contents on cases explicitly granted
  by an attorney — metadata only by default
- attorney queries are filtered by assigned_to = their user_id
  at the RLS level — not a WHERE clause in application code
- login_audit table: readable by super_admin role only, no exceptions

Also add to users table:
- users.status: active | deactivated
- users.deactivated_at: timestamp
- users.deactivated_by: user_id of who deactivated them

Propose a detailed implementation plan first covering:
1. The middleware routing logic and 404 handling
2. How the JWT role claim is set and refreshed
3. Every RLS policy that changes (list them all)
4. How the document signed-URL restriction is enforced
Do not write any code until I approve the plan.
```

**Gate:** Test every role with a dedicated test account. Confirm: wrong-role hitting any dashboard route gets a 404 (check Network tab — must be 404 not redirect). All Phase 1 routes still work correctly under the new role system.

---

## Chunk 2 — Activity log & login audit (infrastructure)

```
Continue Phase 2. Read PRD_PHASE2.md Section 6 carefully.

Step 2: Activity log and login audit infrastructure.
This must be built before any feature work. Everything else
depends on it.

ACTIVITY LOG TABLE: `activity_log`
Fields: id, firm_id, actor_id, actor_role, action, entity_type,
entity_id, metadata (JSONB), created_at

Action string format: entity.verb
Examples: case.created, case.status_changed, document.uploaded,
document.visibility_toggled, client.invited, invoice.sent,
note.added, user.deactivated, user.invited, user.promoted

How it is written — POSTGRES TRIGGER ONLY:
Every write operation on the following tables must automatically
insert a row into activity_log via a Postgres trigger:
cases, documents, clients, invoices, notes, users (for status/role changes)

Do NOT write to activity_log from application code.
The trigger fires at the DB level regardless of how the write happens.

IMMUTABILITY — enforce at Postgres level:
CREATE RULE no_update_activity_log AS ON UPDATE TO activity_log
DO INSTEAD NOTHING;
CREATE RULE no_delete_activity_log AS ON DELETE TO activity_log
DO INSTEAD NOTHING;

This must be a database-level rule, not an application check.
Test it: attempt UPDATE and DELETE on activity_log directly in
the Supabase SQL editor — both must fail silently.

RLS on activity_log:
- super_admin → reads all rows for their firm_id
- firm_admin → reads rows where entity_type IN
  ('case', 'document', 'client', 'invoice', 'note') only
  NO user management events, NO session events
- attorney / staff → reads rows where entity_id matches
  their assigned case IDs only
- client → no access

LOGIN AUDIT TABLE: `login_audit`
Fields: id, user_id, firm_id, ip_address, device (parsed from UA),
user_agent, created_at, success (bool)

How it is written — SUPABASE AUTH HOOK:
Insert a row on every login attempt (success AND failure) via a
Supabase Auth hook. Capture the IP address and user agent from
the request headers.

IMMUTABILITY — same Postgres rules as activity_log:
No UPDATE, no DELETE, enforced at DB level.

RLS on login_audit:
- super_admin → reads all rows for their firm_id
- ALL other roles → zero access, no exceptions

NOTIFICATION TABLE: `notifications`
Fields: id, firm_id, recipient_id, recipient_role, event_type,
entity_type, entity_id, message, read (bool), created_at

A notification row is inserted by the same Postgres trigger that
writes to activity_log — not separately from application code.
RLS: each user reads only their own notification rows
(recipient_id = auth.uid()).

Propose the plan first showing:
1. The trigger function code approach
2. How the Auth hook captures IP and user agent
3. The Postgres rules for immutability
4. All RLS policies for all three new tables
```

**Gate:** Perform a write (create a case, upload a document). Confirm activity_log has a new row. Attempt `UPDATE activity_log SET action = 'test' WHERE id = [any id]` in the Supabase SQL editor — must fail. Attempt `DELETE FROM activity_log` — must fail. Login with a test account — confirm login_audit has a row with correct IP. A firm_admin auth context querying activity_log must not return user management events.

---

## Chunk 3 — Onboarding flow

```
Continue Phase 2. Read PRD_PHASE2.md Section 2 and BRAND.md.

Step 3: Firm onboarding flow.

Route: /onboarding

This is the only place a new firm account is created.
There is no "create firm" action anywhere else in the app.

ONBOARDING STEPS:
Step 1 — Account creation
- Email, password, full name
- On submit: create auth user, create users row with role = super_admin,
  create firm row, link user to firm, create their profile row
- The role assignment to super_admin is automatic — there is no role
  selector on this screen

Step 2 — Firm setup wizard (3 sub-steps, skippable but prompted)
- Sub-step A: Firm name, firm logo upload, firm address
- Sub-step B: Primary contact email, phone, website URL
- Sub-step C: Default invoice currency, payment terms, bank details
  (these power the billing module later)
- Each sub-step saves to firm_settings as the user progresses
- "Skip for now" allowed — they can complete in firm settings later

Step 3 — Invite prompt
- "Your firm is ready. Want to invite your first team member?"
- Two buttons: "Invite someone now" (opens invite modal) and
  "Go to dashboard" (proceeds to /dashboard/overview)
- This is not mandatory — just a nudge

After onboarding: redirect to /dashboard/overview
The super_admin never sees /onboarding again after firm creation.

If a user tries to access /onboarding when already logged in,
redirect them to their role-appropriate dashboard.

All UI follows BRAND.md exactly.
Propose the plan first.
```

**Gate:** Complete full onboarding with a new test email. Confirm: firm row created, user has role super_admin in DB, profile row created, firm_settings row created, redirect lands on /dashboard/overview. Try accessing /onboarding while logged in — confirm redirect to dashboard.

---

## Chunk 4 — User management (invites, team, deactivation)

```
Continue Phase 2. Read PRD_PHASE2.md Sections 9 and BRAND.md.

Step 4: User management.

WHO CAN INVITE WHOM (enforce at RLS and route level):
- super_admin can invite: firm_admin, attorney, staff
- firm_admin can invite: attorney, staff only
  (firm_admin cannot invite or manage other firm_admins)
- attorney, staff, client → cannot invite anyone except:
  attorney can invite a client to the portal from their case

INVITE FLOW:
- Create firm_invitations table:
  id, firm_id, email, role, invited_by, token (UUID),
  expires_at (24h from creation), accepted_at
- Token is one-time-use: mark accepted_at immediately on use
  An accepted or expired token must never work again
- Invite email contains a secure signup link with the token
- Invitee clicks link → sets password → account created with
  the assigned role → redirected to their role-specific dashboard
- Inviter sees invite status (Pending / Accepted) in team list
- Expired invites can be resent (new token generated, old invalidated)

TEAM MANAGEMENT LIST:
super_admin sees: all users in firm (all roles)
firm_admin sees: attorneys and staff only (not admins)

Columns: avatar, name, role badge, email, join date,
last active date, status badge (Active / Deactivated)

ACTIONS:
- Change role between attorney and staff (not to firm_admin —
  that is a separate promote action)
- Deactivate: revokes login immediately, preserves all work
  Deactivated users cannot log in — blocked at auth middleware
  Deactivated users appear in a separate collapsible section
- Reactivate: restores login immediately
- Promote to firm_admin (super_admin only):
  Requires super_admin to enter their own password to confirm
  This is deliberately high friction — not a dropdown

PROTECTION RULE:
If a super_admin tries to deactivate or delete their own account
and they are the only super_admin in the firm — block the action
with a clear message: "Promote another member to Super Admin first."

All UI follows BRAND.md. Propose plan first.
```

**Gate:** super_admin invites a firm_admin. firm_admin invites a lawyer. Lawyer receives invite email, accepts, lands on /dashboard/lawyer. firm_admin attempting to invite another firm_admin must be blocked (route + RLS). Deactivate the lawyer — confirm they cannot log in. Reactivate — confirm they can.

---

## Chunk 5 — Profiles

```
Continue Phase 2. Read PRD_PHASE2.md Section 10 and BRAND.md.

Step 5: Profiles.

Create the profiles table:
user_id, firm_id, display_name, title, avatar_url, bio (max 140),
phone (optional, stored encrypted), bar_number (attorney only),
practice_areas (attorney only — text array), hourly_rate
(attorney only — numeric), show_phone_to_clients (bool),
notification_preferences (JSONB)

A profile row is created automatically when:
- super_admin completes onboarding (created in Chunk 3)
- Any user accepts an invite (created on invite acceptance)
Never wait for the user to create their own profile row.

AVATAR STORAGE:
- Private Supabase Storage bucket — never a public bucket
- Served via signed URL with 7-day TTL, regenerated on load
- Accepted formats: JPG, PNG, WebP — max 5MB
- Resize and compress server-side before storing

PROFILE EDIT SURFACE:
Accessible from the sidebar (avatar click) and from
personal settings → Profile for all roles.

All roles can edit:
- Profile photo, full name, title, phone (optional), bio (140 chars)
- Email (requires current password + email verification to change)

Attorney-only additional fields:
- Bar / roll number (optional)
- Practice areas (multi-select checkboxes)
- Hourly rate (numeric input — pre-fills on time entry)
- Show phone to clients toggle

Read-only on all profiles (display only, no edit):
- Role (only super_admin changes this), firm, join date

CLIENT PROFILE (inside /portal):
- Editable: full name, phone, preferred language
- Created by the inviting lawyer — client edits after accepting invite
- No avatar for clients in Phase 2

Show avatar in: sidebar (all dashboards), case cards,
case detail assigned attorney chip, team list, activity feed rows.

All UI follows BRAND.md. Propose plan first.
```

**Gate:** Every role (super_admin, firm_admin, attorney, staff, client) saves a complete profile including uploaded avatar. Avatar displays in sidebar and case cards. Avatar signed URL works after 7 days (test with a manually expired URL). A firm_admin profile does not show bar_number or hourly_rate fields.

---

## Chunk 6 — Firm settings & personal settings

```
Continue Phase 2. Read PRD_PHASE2.md Section 11 and BRAND.md.

Step 6: Settings surfaces.

PERSONAL SETTINGS (/settings/account — all roles):

Account section:
- Change display name
- Change email: requires current password + email verification
  to new address before change takes effect
- Change password: requires current password, new password, confirm
- Enable/disable 2FA: TOTP via Supabase Auth built-in support
  Show QR code for Google Authenticator / Authy
  Require user to enter a valid TOTP code to confirm setup
- Delete account:
  - Requires typing "DELETE" exactly to confirm
  - If user is the only super_admin in their firm: block with message
    "Promote another Super Admin before deleting your account"

Notifications section:
- Two toggles per event type: Email and In-app
- Show only the event types relevant to the user's role
  (a lawyer does not see the login audit notification toggle)
- Store in profiles.notification_preferences (JSONB)
- Changes take effect immediately on save

Appearance section:
- Light mode toggle: on, cannot be turned off (Phase 2 is light only)
- Dark mode toggle: disabled, label "Coming soon"
- Language: English only, others greyed out "Coming soon"

FIRM SETTINGS — SUPER ADMIN (/settings/firm — super_admin only):
Route-guard: any other role hitting this route → 404

Sections:
- Firm profile: name, logo, address, contact email, phone, website
- Billing defaults: hourly rate, payment terms, currency,
  invoice number format (prefix + auto-increment), tax label + rate,
  bank account details
- Team management: full user list (all roles), all invite/manage
  actions from Chunk 4 surfaced here as well
- Client portal settings: header message (max 200 chars),
  client download toggle, attorney phone visibility default
- Security: enforce 2FA firm-wide, session timeout (1h/4h/8h/24h/7d),
  login activity (full — all users, IP, device — super_admin only)

FIRM SETTINGS — FIRM ADMIN (/settings/firm-admin — firm_admin only):
Route-guard: any other role → 404
Note: different route to super_admin firm settings — never shared

Sections (subset of above):
- Firm profile: name, logo, address only
  (NO billing defaults — super_admin controls those)
- Team management: lawyers and staff only — cannot see or manage admins
- Client portal settings: same as super_admin
- Security: session timeout only — NO login activity section

Create the firm_settings table:
firm_id, name, logo_url, address, contact_email, phone, website,
invoice_currency, invoice_number_format, tax_label, tax_rate,
payment_terms, bank_details (encrypted), portal_message,
allow_client_download (bool), show_attorney_phone (bool),
enforce_2fa (bool), session_timeout_minutes

All UI follows BRAND.md. Propose plan first.
```

**Gate:** super_admin and firm_admin see different settings sections — confirm firm_admin cannot see billing defaults or login activity. All settings persist after full page reload. 2FA setup works end-to-end. firm_admin hitting /settings/firm gets 404.

---

## Chunk 7 — Super Admin dashboard

```
Continue Phase 2. Read PRD_PHASE2.md Section 8.1 and BRAND.md.

Step 7: Super Admin dashboard (/dashboard/overview).

This route returns 404 for any role other than super_admin.
Confirm this is working from Chunk 1 before building any UI.

TOP STATS ROW (4 cards, 8pt grid, BRAND.md card spec):
- Total active cases in the firm
- Total lawyers (active count)
- Documents uploaded this month
- Invoices generated this month

CHARTS ROW:
- Active cases by status: Intake / Active / Awaiting Court / Closed
  (horizontal bar chart or donut — choose what reads clearest)
- New cases over last 30 days (line chart)

LAWYERS TABLE:
Columns: avatar, name, role badge, active case count,
last login (date + time), last action performed, status badge
Clicking a row opens a slide-over showing that lawyer's case list
(read-only — super_admin cannot edit cases from here)

LOGIN AUDIT PANEL (right side or bottom panel):
- Last 50 login events in reverse chronological order
- Each row: user avatar + name, timestamp, IP address,
  device icon (desktop/mobile/tablet), success/fail badge
- Searchable by user name, date range
- Failed login attempts shown in red

LIVE ACTIVITY FEED:
- Every firm-wide action in reverse chronological order
- Each row: actor avatar + name + role badge, action description,
  entity name (linked to that record), timestamp
- Filter tabs: All / Cases / Documents / Clients / Invoices / Users
- Infinite scroll or paginated (50 per page)
- Real-time: new events appear without page refresh
  (use Supabase Realtime subscription on activity_log)

NOTIFICATIONS:
- Bell icon in the top bar with unread count badge
- Clicking opens a notification panel (slide-over or dropdown)
- Every event type from PRD_PHASE2.md Section 7 marked super_admin
- Each notification links to the relevant record
- Mark all as read button

All data queries scoped by firm_id.
All UI follows BRAND.md: Plus Jakarta Sans headings, Inter body,
#1A47CC primary, 8pt grid, light mode, Tabler outline icons.
Propose plan first.
```

**Gate:** super_admin sees real-time activity feed — create a case as a lawyer in another tab and confirm the activity feed updates without refresh. Login audit shows correct IP and device. firm_admin hitting /dashboard/overview gets 404. Charts render with real data.

---

## Chunk 8 — Admin dashboard

```
Continue Phase 2. Read PRD_PHASE2.md Section 8.2 and BRAND.md.

Step 8: Firm Admin dashboard (/dashboard/admin).

This route returns 404 for any role other than firm_admin.

TOP STATS ROW (4 cards):
- Total cases in the firm
- Active lawyers (count)
- Clients with portal access
- Invoices pending payment

CASE LIST:
- All cases in the firm: case name, client name, status badge,
  assigned lawyer (avatar + name), last updated date
- Assign / reassign a case to a different lawyer from this view
- Click a case to open case detail (read access — cannot edit)
- Filter by status, assigned lawyer

TEAM PANEL:
- All lawyers and staff: avatar, name, role badge, case count,
  last active DATE (not time, not IP — super_admin only sees that)
- Invite new lawyer or staff (opens invite modal from Chunk 4)
- Deactivate / reactivate lawyers and staff (not admins)
- No login history, no IP addresses visible anywhere on this dashboard

CASE ACTIVITY FEED:
- Case-level events only: case.created, case.status_changed,
  document.uploaded, client.invited, note.added, court_date.added
- NO login events (user.login is invisible to firm_admin)
- NO user management events from other admins
- Each row: actor name, action, case name, timestamp
- Filter: All / Cases / Documents / Clients

NOTIFICATIONS:
- Bell icon with unread count
- Case and client events only (see PRD_PHASE2.md Section 7)
- Login events do NOT appear in firm_admin notification panel

All UI follows BRAND.md. Propose plan first.
```

**Gate:** firm_admin dashboard shows case activity but NOT login events. super_admin creates a case — confirm it appears in firm_admin activity feed. firm_admin activity feed must not contain any rows with entity_type = 'user_session' or action containing 'login'. super_admin hitting /dashboard/admin gets 404.

---

## Chunk 9 — Lawyer dashboard

```
Continue Phase 2. Read PRD_PHASE2.md Section 8.3 and BRAND.md.

Step 9: Lawyer dashboard (/dashboard/lawyer).
Also used by staff — with reduced quick actions.

This route returns 404 for super_admin, firm_admin, and client.

TOP STATS ROW (4 cards):
- My active cases
- Upcoming hearings in the next 7 days
- Pending e-signature requests (shows 0 until e-sig module built)
- Unpaid invoices (shows 0 until billing module built)

MY CASES:
CRITICAL: This list must be filtered by RLS at the query level —
not a WHERE clause added in application code. The RLS policy on
the cases table for the attorney role must be:
  assigned_to = auth.uid()
Test this by querying the cases table directly with an attorney's
auth token — it must only return their cases, not all firm cases.

Case cards: case name, client name, status badge, next court date,
last updated, document count

QUICK ACTIONS (attorney only — not shown to staff):
- New case
- Log time (disabled until time tracking module is built — show greyed)
- Upload document
- Send invoice (disabled until billing module is built — show greyed)

MY ACTIVITY FEED:
- Events on their cases only (RLS enforces this)
- document.uploaded, client.invited, client viewed portal,
  note.added, case.status_changed on their cases
- Zero visibility into other lawyers' activity

NOTIFICATIONS:
- Their cases only: court dates, client portal activity,
  document signed, invoice paid, new note
- No firm-wide events

All UI follows BRAND.md. Propose plan first.
```

**Gate:** Log in as a lawyer — confirm the cases list only shows cases assigned to them. Query the Supabase cases table directly using the lawyer's JWT (use Supabase JS client with that session) — confirm the query returns only their cases at the DB level. Create a case assigned to a different lawyer — confirm it does not appear in the first lawyer's dashboard or queries.

---

## Chunk 10 — Time tracking

```
Continue Phase 2. Read PRD_PHASE2.md Section 12 and BRAND.md.

Step 10: Time tracking — inside /dashboard/lawyer only.
Only attorneys can log time — enforce at RLS level.

Create time_entries table:
id, case_id, user_id, firm_id, date, duration_minutes,
rate_per_hour, billable_amount (computed, never stored),
is_billable (bool, default true), description, invoice_id

billable_amount is always computed as (duration_minutes / 60) x
rate_per_hour — never stored directly.

TIME ENTRY FORM (inside case detail view, lawyer dashboard):
- Date (default today), duration (hours + minutes inputs),
  is_billable toggle, description (free text)
- Rate pre-fills from attorney's hourly_rate in their profile
- Save inserts to time_entries

TIMER WIDGET:
- Persistent, accessible without scrolling inside case view
- Start / stop button — shows elapsed time as h:mm:ss while running
- On stop: opens time entry form pre-filled with elapsed duration
  and today's date — attorney reviews and saves
- Timer state persists through page refreshes via localStorage
  (no backend for the running timer — only on save)

PER-CASE TIME LOG:
- Chronological list of all entries on the case
- Each row: date, description, duration, rate, amount, billable badge
- Running totals at top: total hours, total billable amount
- Entries with an invoice_id show "Billed" badge and are locked
  from editing or deletion (enforce at RLS level too)
- Entries without invoice_id can be edited or deleted by the
  attorney who created them only

Super Admin sees time entry totals in case stats (read only).
Firm Admin sees invoice totals only — not individual time entries.
This is enforced by separate queries, not by hiding UI.

All UI follows BRAND.md. Propose plan first.
```

**Gate:** Attorney logs 10 real time entries across 2 test cases including 2 via the timer. Manually set invoice_id on one entry — confirm it becomes locked (attempt edit in UI and directly via Supabase client — both must fail). firm_admin querying time_entries directly must return empty or totals only, not individual rows.

---

## Chunk 11 — Billing Part 1: Invoice generation & PDF

```
Continue Phase 2. Read PRD_PHASE2.md Section 12 and BRAND.md.

Step 11: Invoice generation and PDF.

Create invoices table:
id, case_id, client_id, firm_id, status (draft|sent|viewed|paid|overdue),
issue_date, due_date, line_items (JSONB array), subtotal, tax_amount,
total_amount, pdf_url, sent_at, paid_at, reminder_sent_at, url_token (UUID)

url_token is generated at invoice creation — this is what the hosted
invoice URL uses, not the invoice_id.

INVOICE GENERATION (inside case detail, lawyer dashboard):
- "Generate invoice" button — visible to attorney and firm_admin
- Pulls all time_entries where invoice_id IS NULL and is_billable = true
  for this case — pre-filled as line items
- Attorney can add flat-fee line items manually
- Set due date, override payment terms for this invoice
- Tax line: label + rate from firm_settings, editable per invoice
- Running total updates in real time as items are edited

INVOICE PREVIEW:
- Shows exactly how the PDF will look
- Firm name, logo, address from firm_settings
- Client name, line items, subtotal, tax, total, due date,
  payment terms, bank account details
- Editable — attorney can go back and adjust

PDF GENERATION:
- Supabase Edge Function (Puppeteer or react-pdf — choose based
  on output quality for a legal invoice)
- Must complete in under 3 seconds
- PDF stored in private Supabase Storage bucket
- URL saved to invoices.pdf_url
- Invoice number auto-increments using firm_settings format

Do not build the send flow yet — that is Chunk 12.
Stop after PDF generation and storage confirmed working.

All UI follows BRAND.md. Propose plan first including PDF approach.
```

**Gate:** Generate a test invoice from real time entries. Preview renders correctly. PDF generates, is stored in Supabase Storage, invoice number follows firm's format, url_token is a UUID (not the invoice_id). PDF generation completes in under 3 seconds (test with 20 line items).

---

## Chunk 12 — Billing Part 2: Send, status, reminders

```
Continue Phase 2. Read PRD_PHASE2.md Section 12 and BRAND.md.

Step 12: Invoice send, hosted view, status tracking, reminders.

SEND FLOW:
- "Send invoice" button on preview sends email to client:
  PDF attached + link to hosted invoice view
- Moves status from Draft to Sent, sets sent_at
- Email uses firm's primary contact as reply-to and firm name as sender

HOSTED INVOICE VIEW (/invoice/[url_token]):
- Public route — no login required
- url_token is the UUID from invoices.url_token — never expose invoice_id
- Branded with firm name and logo from firm_settings
- Fully readable on mobile
- No download button unless firm has allow_client_download = true
- When client opens this URL: update status to Viewed if currently Sent

MARK AS PAID:
- Button on invoice detail (attorney and firm_admin only)
- Sets status to Paid, sets paid_at
- Marks all associated time_entries with this invoice_id

OVERDUE REMINDERS:
- Create invoice_reminders table: id, invoice_id, sent_at, type (7day|14day)
- Supabase Edge Function triggered by pg_cron on daily schedule
- Function checks: status = 'sent' or 'viewed', due_date 7 or 14 days
  past, no row in invoice_reminders for this invoice_id + type
- For each match: send reminder email to client, insert into
  invoice_reminders (this row is the deduplication lock)
- Function must be idempotent: running twice must never send duplicate

INVOICE HISTORY:
- Per-case invoice list: status badge, total, issue date, due date
- Per-client invoice list across all their cases
- Filterable by status
- Invoice status badge visible on case detail — not buried in a tab

All UI follows BRAND.md. Propose plan first including cron schedule.
```

**Gate:** Send invoice to real test email. Open hosted link on mobile — confirm readable and no download button (with download disabled). Mark as paid — confirm time entries show billed badge. Set due_date 7 days in the past on a test invoice, trigger cron manually, confirm one reminder sent. Trigger cron again — confirm no duplicate.

---

## Chunk 13 — Document E-signature

```
Continue Phase 2. Read PRD_PHASE2.md Section 12 and BRAND.md.

Step 13: E-signature integration.

Before writing code confirm:
1. Which provider: Docusign (recommended), Adobe Sign, or DocuSeal
2. Provider API key and webhook secret are in .env.local
3. Legal standing of e-signatures confirmed for Nigeria

Only attorneys can send signature requests — RLS enforced.

Create signature_requests table:
id, case_id, document_id, firm_id, client_id, provider,
provider_envelope_id, status (pending|signed|declined|expired),
requested_at, signed_at, signed_doc_url

SIGNATURE REQUEST FLOW (in case document hub, lawyer dashboard):
- Attorney selects a document → "Request signature"
- Client email pre-filled from the case — confirm and send
- JusticeHub calls provider API to create the envelope/request
- Provider sends signing email to client
- Document status in case hub: "Awaiting signature"

CLIENT SIGNING:
- Client receives email with signing link (from provider)
- No account creation required
- Drawn or typed signature
- After signing: provider redirects to confirmation page

WEBHOOK HANDLER (Supabase Edge Function):
- Endpoint for provider webhook on signing_complete event
- On signing_complete:
  1. Update signature_requests.status to signed, set signed_at
  2. Download signed PDF from provider API
  3. Store in private Supabase Storage bucket
  4. Save URL to signature_requests.signed_doc_url
  5. Update document in case hub to status "Signed"
  6. Send confirmation email to both attorney and client
- Signed document must be stored within 60 seconds of webhook
- If duplicate webhook arrives: check if signed_doc_url already set
  — skip storage, skip email, update status only if needed

POLLING FALLBACK (separate daily Edge Function):
- If signature_request.status = pending for 48+ hours:
  query provider API directly for status and update accordingly
- Guards against missed or failed webhooks

PENDING REQUESTS VIEW (in case detail, lawyer dashboard):
- List: document name, client name, requested date, status badge
- "Follow up" button sends reminder to client (max once per 24 hours —
  enforce with a timestamp check on the signature_request row)

All UI follows BRAND.md. Propose plan covering: webhook endpoint
URL structure, how signed PDF is retrieved from provider, how the
60-second SLA is monitored, and duplicate webhook handling.
```

**Gate:** Complete end-to-end signing on a mobile device with a real test document. Confirm: webhook fires, signed PDF appears in case hub within 60 seconds, both parties receive confirmation emails. Simulate duplicate webhook — confirm document not stored twice. Simulate a pending request 48+ hours old — confirm polling fallback updates the status.

---

## Final review prompt

```
Full Phase 2 review before we ship.

1. ROUTING SECURITY:
   - Confirm every role gets a 404 (not redirect) on wrong routes
   - Test all 5 role + route combinations from the permissions matrix
   - Confirm client session cannot access any /dashboard route

2. RLS INTEGRITY:
   - Lawyer querying cases table with their JWT: returns only their cases
   - firm_admin querying documents table: returns metadata only,
     no signed URLs for document content
   - login_audit queried by attorney auth context: must return empty

3. ACTIVITY LOG IMMUTABILITY:
   - Attempt UPDATE on activity_log in Supabase SQL editor: must fail
   - Attempt DELETE on activity_log: must fail
   - Same for login_audit

4. NOTIFICATION SCOPING:
   - Login event: appears in super_admin bell only
   - Case created: appears in super_admin + firm_admin only
   - Document uploaded on a lawyer's case: appears in that lawyer's
     bell, firm_admin bell, super_admin bell — NOT in other lawyers'

5. DASHBOARD DATA ISOLATION:
   - firm_admin activity feed: contains zero login events
   - lawyer dashboard: cases list is empty for a lawyer with no
     assignments (even if 20 other cases exist in the firm)
   - super_admin time entry view: shows totals only, not line items
     that would be visible to firm_admin

6. BILLING INTEGRITY:
   - Time entry with invoice_id: cannot be edited (UI + DB level)
   - Same time entry cannot appear on two invoices
   - Overdue reminder cron: fires once per threshold per invoice

7. E-SIGNATURE:
   - Duplicate webhook: document not stored twice
   - Polling fallback: correctly updates a 48hr+ pending request

8. MOBILE:
   - Hosted invoice URL readable on mobile
   - E-signature flow completable on mobile

9. BRAND.md COMPLIANCE:
   - Walk every new Phase 2 surface: Plus Jakarta Sans headings,
     Inter body, #1A47CC primary, 8pt grid, light mode,
     Tabler outline icons, correct button hierarchy

Report all findings as: Critical (must fix before ship) /
High (fix within 48hrs of ship) / Medium (next sprint).
Do not self-approve Critical or High items.
```

---

## Posting tips

- **Read every Implementation Plan artifact before clicking Proceed.**
- **Commit after every chunk** — message format: `feat: phase2-chunk-7-superadmin-dashboard`
- **The RLS layer is the product** — if data leaks across roles, nothing else matters. Test it with real auth tokens, not mocked sessions.
- **Test the activity log trigger on every new table** — add a row, check the log appeared.
- **Lawyer dashboard data isolation is the most important gate** — do not move to billing until you have confirmed at the DB level (not just the UI) that a lawyer cannot see another lawyer's cases.
- **Do not parallelise** — every chunk depends on the previous one.
