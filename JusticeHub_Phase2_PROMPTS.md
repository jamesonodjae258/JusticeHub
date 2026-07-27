# JusticeHub Phase 2 — Antigravity Build Prompts

Paste each prompt into Antigravity in order. Read the Implementation Plan
artifact before approving every single one. Commit after each chunk completes.
Never start the next chunk until the gate condition is met.

---

## Before you start

Confirm the following are in your project root before running any prompt:

- [ ] `PRD.md` — JusticeHub MVP PRD v0.1 (Phase 1)
- [ ] `PRD_PHASE2.md` — JusticeHub Phase 2 PRD v2.0
- [ ] `BRAND.md` — JusticeHub brand and design system
- [ ] `.env.local` — Supabase URL, anon key, service role key
- [ ] Supabase project upgraded to **Pro plan** (required for pg_cron)
- [ ] Phase 1 MVP is fully built, deployed, and working
- [ ] Git repo initialised with a clean commit at the end of Phase 1

---

## Chunk 1 — Role system & RLS upgrade

```
Read PRD_PHASE2.md, PRD.md, and BRAND.md before writing any code.

We are starting Phase 2. The Phase 1 MVP is already built. Do not touch or
rewrite any Phase 1 feature unless a Phase 2 requirement explicitly changes it.

Step 1: Extend the role system.

- Extend the users table to support five roles exactly as defined in
  PRD_PHASE2.md Section 2.1: super_admin, firm_admin, attorney, staff, client
- Store the user's role as a claim in the Supabase JWT so it is available in
  RLS policies without a database join on every request
- Rewrite all existing Phase 1 Supabase RLS policies to enforce both firm_id
  scoping AND the new role hierarchy from the permissions matrix in Section 2.2
- Key constraints to enforce at the RLS and storage URL level (not just the UI):
    - Firm Admin must never receive a signed URL for document content —
      they can see document names and metadata only
    - Staff can only view document contents on cases explicitly granted by
      an Attorney — default is metadata only
    - Super Admin read access to documents is logged to a separate
      super_admin_audit_log table (immutable — no UPDATE or DELETE ever
      permitted on this table, enforced at the database level)
- Add the super_admin_audit_log table as defined in Section 3.3 of the PRD
- Add users.status (active | deactivated) and users.deactivated_at,
  users.deactivated_by fields

Propose an implementation plan first. Do not write code until I approve.
Include in the plan: exactly which RLS policies change, how the JWT claim
is set, and how the document signed-URL restriction is enforced.
```

**Gate:** Verify every existing Phase 1 route still works correctly under the new role system with a test attorney and test client account before proceeding.

---

## Chunk 2 — User management (Firm Admin inviting & managing team)

```
Continue building JusticeHub Phase 2. Read PRD_PHASE2.md Section 3 before
starting. BRAND.md governs all UI.

Step 2: User management module.

- Create the firm_invitations table as defined in Section 3.3:
  id, firm_id, email, role, invited_by, token (UUID), expires_at, accepted_at
- Tokens expire after 24 hours and are one-time-use — mark as used immediately
  on acceptance; a used or expired token must never work again
- Build the Firm Admin invite flow:
    - "Invite member" button in firm settings opens a form: name, email, role
      (Attorney or Staff only — not Firm Admin)
    - JusticeHub sends an invitation email with the secure signup link
    - Invitee clicks link, sets password, account created with assigned role
    - Firm Admin sees invite status (Pending / Accepted) in the team list
    - Expired invites can be resent with one click
- Build the team management list for Firm Admin:
    - View all members: name, role, email, join date, last active date
    - Change a member's role between Attorney and Staff
    - Deactivate a member — revokes login immediately, preserves all their work
    - Reactivate a deactivated member
    - Promote a member to Firm Admin — requires current Firm Admin to confirm
      with their password; this is a deliberate, high-friction action
    - Deactivated members shown in a separate collapsible list

All UI follows BRAND.md: Plus Jakarta Sans headings, Inter body, #1A47CC
primary, 8-point grid, light mode only, Tabler Icons outline.

Propose the plan first.
```

**Gate:** Firm Admin can complete the full invite flow end-to-end with a test email address — invite sent, link clicked, account created, member visible in team list with correct role.

---

## Chunk 3 — Profiles

```
Continue Phase 2. Read PRD_PHASE2.md Section 4 and BRAND.md.

Step 3: Profiles module.

- Create the profiles table as defined in Section 4.3:
  user_id, firm_id, display_name, title, avatar_url, bio, phone, bar_number,
  practice_areas, hourly_rate, show_phone_to_clients, notification_preferences
- A profile row is created automatically when a user accepts an invite or
  signs up — never wait for the user to create it manually
- Build the profile edit surface (accessible from the sidebar and from
  personal settings) for all roles:
    - Profile photo upload — stored in a private Supabase Storage bucket;
      served via signed URL with 7-day TTL; never a public bucket URL
    - Full name, professional title, email (requires verification to change),
      phone (optional), bio (max 140 chars)
- Attorney-only additional fields:
    - Bar / roll number (optional)
    - Practice areas (multi-select: Civil, Criminal, Corporate, Family,
      Property, Immigration, Labour, Other)
    - Hourly rate (numeric — pre-fills on time entry)
- Client profile edit inside the client portal:
    - Full name, phone, preferred language — nothing else
- Role and firm are read-only on the profile — only a Firm Admin can change role
- Display the attorney's avatar in the sidebar, case cards, and case detail

All UI follows BRAND.md exactly.

Propose the plan first.
```

**Gate:** Every role (attorney, staff, firm admin, client) can save a complete profile including an uploaded avatar. Avatar displays correctly in the sidebar and on case cards.

---

## Chunk 4 — Firm Settings

```
Continue Phase 2. Read PRD_PHASE2.md Section 5.2 and BRAND.md.

Step 4: Firm Settings surface (Firm Admin only).

Route-guard this entire section so that only users with role = firm_admin
can access it. Any other role hitting this route should be redirected.

Build the following settings sections under a /settings/firm route:

Firm profile:
- Firm name, firm logo (uploaded image stored in Supabase Storage),
  firm address, primary contact email, phone, website URL
- These values feed into: invoices, client portal header, email signatures

Billing defaults:
- Default hourly rate (pre-fills for new attorneys; each attorney overrides
  in their profile)
- Default payment terms (free text — e.g. "Payment due within 14 days")
- Invoice currency (set once at firm level)
- Invoice number format (configurable prefix + auto-increment — e.g. INV-2026-001)
- Tax label and default rate (e.g. "VAT 7.5%" — optional line on invoices)
- Bank account details (shown on invoices as payment instructions)

Client portal settings:
- Portal header message (max 200 chars — shown to clients on login)
- Toggle: allow clients to download shared documents (default off)
- Toggle: show attorney phone number to clients by default (attorneys can
  override per profile)

Security:
- Enforce 2FA for all firm members — when enabled, all members must set up
  2FA within 7 days or lose access
- View login activity for all firm members (date, time, IP, device) —
  read-only table, no actions
- Session timeout — dropdown: 1h, 4h, 8h, 24h, 7 days

Create the firm_settings table as defined in Section 9 of the PRD.
All settings must persist correctly and survive a full page reload.

All UI follows BRAND.md. Propose the plan first.
```

**Gate:** Firm Admin configures all sections, saves, refreshes the page, and all values are still correct. Firm name and logo appear correctly on a test invoice PDF preview.

---

## Chunk 5 — Personal Settings

```
Continue Phase 2. Read PRD_PHASE2.md Section 5.1 and BRAND.md.

Step 5: Personal Settings surface (all roles).

Route: /settings/account — accessible to every logged-in user.

Account section:
- Change display name
- Change email — requires current password confirmation + email verification
  sent to the new address before the change takes effect
- Change password — requires current password, new password, confirmation
- Enable / disable 2FA (TOTP) using Supabase Auth's built-in TOTP support —
  show a QR code for Google Authenticator / Authy; require the user to enter
  a valid TOTP code to confirm setup before enabling
- Delete account — requires typing the word "DELETE" to confirm; Firm Admin
  accounts can only be deleted if they first assign another Firm Admin

Notifications section:
- Two toggles per event type: Email and In-app
- Event types and who sees them as defined in the notifications table in
  PRD_PHASE2.md Section 5.1
- Store preferences in profiles.notification_preferences (JSONB)
- Notification preferences take effect immediately on save

Appearance section:
- Show a "Light mode" toggle — it is on and cannot be turned off
- Show a "Dark mode" toggle — disabled, labelled "Coming soon"
- Language dropdown — English only, others greyed out labelled "Coming soon"

All UI follows BRAND.md. Propose the plan first.
```

**Gate:** User can change their password and enable 2FA end-to-end. Notification preferences save and persist. The delete account flow requires correct confirmation text before proceeding.

---

## Chunk 6 — Super Admin Panel

```
Continue Phase 2. Read PRD_PHASE2.md Section 5.3 and Section 2.1 (Super Admin
role definition) carefully before writing any code.

Step 6: Super Admin panel.

CRITICAL SECURITY REQUIREMENTS — read before planning:
1. The Super Admin panel must live in a completely separate Next.js route group:
   /superadmin — protected by a dedicated Supabase role and its own
   middleware check. A firm_admin, attorney, staff, or client hitting any
   /superadmin route must receive a 404, not a redirect — do not reveal
   that the route exists.
2. Super Admin login must enforce 2FA — a Super Admin without 2FA enabled
   cannot access the panel.
3. Every single action the Super Admin takes must be written to
   super_admin_audit_log with: super_admin_id, action (string), target_type,
   target_id, ip_address, created_at. This table has no UPDATE or DELETE
   permissions — not even for the super_admin role. Enforce this at the
   Postgres level with a RULE or trigger.

Build the following sections inside /superadmin:

Dashboard:
- Total registered firms (by plan tier)
- Monthly active users across all firms
- Total cases, documents, invoices generated, e-signature requests
- New firm registrations chart (last 90 days)

Firms list:
- Table: firm name, plan, member count, case count, created date, last active
- Search by firm name or email
- Actions per firm: View stats, Suspend, Reinstate, Delete
  - Suspend: locks all firm members out immediately; data preserved; firm
    status shown as "Suspended" in the list
  - Reinstate: restores access immediately
  - Delete: requires Super Admin to type the firm name exactly to confirm;
    triggers a data export email to the Firm Admin before deletion executes

Document audit viewer:
- Search by case ID or document name across all firms
- Documents open in a read-only inline viewer — no download button,
  no edit, no copy-to-clipboard of content
- Every document opened here is logged to super_admin_audit_log

Feature flags:
- Toggle list for Phase 2 modules: Time Tracking, Billing, E-signature
- Can be toggled globally (all firms) or per firm
- Maintenance mode toggle — shows a banner to all users; Super Admin
  retains full access

Email templates:
- View and edit platform-level templates: invite, portal invite, invoice
  delivery, overdue reminder, signing request
- Variables: {{firm_name}}, {{client_name}}, {{case_name}}, {{link}}
- Firm-level overrides from firm_settings take precedence — show a note
  when a firm has a custom override

Propose a detailed plan before writing any code. The plan must explicitly
address: how the /superadmin route group is isolated, how the audit log
immutability is enforced at the database level, and how the document
read-only viewer prevents download.
```

**Gate:** Super Admin can view a document from any firm — confirm the view is read-only with no download option and that the action appears in super_admin_audit_log. A test firm_admin account must receive a 404 when attempting to access /superadmin.

---

## Chunk 7 — Time Tracking

```
Continue Phase 2. Read PRD_PHASE2.md Section 6 and BRAND.md.

Step 7: Time tracking module. Only attorneys can log time — enforce this
at the RLS level, not just the UI.

- Create the time_entries table as defined in Section 6.2
- Build the time entry form inside the case detail view:
    - Fields: date (default today), duration (hours + minutes), is_billable
      toggle (default true), description (free text)
    - Hourly rate pre-fills from the attorney's profile; editable per entry
    - billable_amount is computed from duration and rate — never stored directly
    - Save adds the entry to the case time log
- Build the timer widget inside the case view:
    - Start / stop button — visible and accessible without scrolling
    - Shows elapsed time as h:mm:ss while running
    - On stop: opens the time entry form pre-filled with the elapsed duration
      and today's date — attorney reviews and saves
    - Timer state persists through page refreshes using localStorage as a
      fallback (no backend needed for the running timer — only on save)
- Build the per-case time log:
    - Chronological list of all time entries on the case
    - Each row: date, attorney name, description, duration, rate, amount,
      billable badge
    - Running totals at the top: total hours, total billable amount
    - Entries with an invoice_id are marked "Billed" and cannot be edited
    - Entries without an invoice_id can be edited or deleted by the
      attorney who created them
- invoice_id on a time entry is null until it is added to an invoice;
  this prevents double-billing and must be enforced at the database level

All UI follows BRAND.md. Propose the plan first.
```

**Gate:** An attorney logs 10 real time entries across 2 test cases — including at least 2 using the timer widget. Billed entries (manually set invoice_id for testing) are correctly locked from editing.

---

## Chunk 8 — Billing Part 1: Invoice generation & PDF

```
Continue Phase 2. Read PRD_PHASE2.md Section 7 and BRAND.md.

Step 8 of 3 in the billing module: invoice generation and PDF.

- Create the invoices table as defined in Section 7.2
- Build the invoice generation flow triggered from the case detail view:
    - "Generate invoice" button (visible to attorney and firm_admin only)
    - Pulls all time_entries where invoice_id IS NULL and is_billable = true
      for the current case — pre-fills them as line items
    - Attorney can add additional flat-fee line items manually (description,
      quantity, unit price)
    - Attorney sets due date and can override payment terms for this invoice
    - Tax line: optional; label and rate pulled from firm_settings defaults;
      editable per invoice
    - Running total updates in real time as line items are added or edited
- Build the invoice preview screen:
    - Shows exactly how the invoice will look as a PDF
    - Firm name, logo, and address from firm_settings
    - Client name and address
    - Line items table with amounts
    - Subtotal, tax, total
    - Due date and payment terms
    - Bank account details from firm_settings
    - Editable from preview — attorney can go back and adjust before sending
- Build PDF generation:
    - Generate the invoice PDF server-side using a Supabase Edge Function
      (use Puppeteer or react-pdf — choose whichever produces cleaner output)
    - PDF must complete generation in under 3 seconds
    - PDF stored in Supabase Storage (private bucket); url saved to invoices.pdf_url
    - Invoice number auto-increments using the format from firm_settings
      (e.g. INV-2026-001)

Hosted invoice URL: when the invoice is sent, generate a unique non-guessable
token (UUID) as part of the URL — do not expose the invoice_id in the URL.

Do not build the send flow yet — that is Chunk 9. Stop after PDF generation
and storage are confirmed working.

Propose the plan first, including the PDF generation approach.
```

**Gate:** Generate a test invoice from real time entries, preview it, generate the PDF, and confirm: the PDF is stored in Supabase Storage, the invoice number follows the firm's configured format, and the URL token is a UUID (not the invoice ID).

---

## Chunk 9 — Billing Part 2: Send, status tracking & reminders

```
Continue Phase 2. Read PRD_PHASE2.md Section 7 and BRAND.md.

Step 9: Billing send flow, hosted invoice view, status tracking,
and overdue reminders.

Send flow:
- "Send invoice" button on the invoice preview sends an email to the client
  with the PDF attached and a link to the hosted invoice view
- Sending moves invoice status from Draft to Sent and sets sent_at timestamp
- The email uses the firm's primary contact email as reply-to and the firm
  name in the sender display

Hosted invoice view (client-facing, no login required):
- Accessible via /invoice/[token] where token is the UUID generated in Chunk 8
- Displays the invoice cleanly, branded with the firm name and logo
- Must be fully readable on mobile
- No download button unless the firm has enabled it in client portal settings
- When a client opens this URL, update invoice status to Viewed (if currently Sent)

Invoice status tracking:
- Status: Draft → Sent → Viewed → Paid → Overdue
- "Mark as paid" button on the invoice detail (visible to attorney and
  firm_admin only) — sets status to Paid, sets paid_at timestamp, and marks
  all associated time_entries with the invoice_id (confirming they are billed)
- Overdue: set automatically by the reminder cron (next step)

Overdue reminders (automated):
- Create the invoice_reminders table: id, invoice_id, sent_at, type (7day | 14day)
- Build a Supabase Edge Function triggered by pg_cron on a daily schedule
- The function checks for invoices where:
    - status = 'sent' or 'viewed'
    - due_date is 7 or 14 days in the past
    - No row exists in invoice_reminders for this invoice_id and this type
- For each qualifying invoice, send a reminder email to the client and insert
  a row into invoice_reminders — this row is the deduplication lock
- The function must be idempotent: running it twice in a day must not send
  duplicate reminders

Invoice history view:
- Per-case: list of all invoices with status badge, total, issue date, due date
- Per-client: all invoices across all their cases
- Filterable by status
- Invoice status badge on the case detail view — not buried in a separate section

All UI follows BRAND.md. Propose the plan first including the cron schedule.
```

**Gate:** Send a real invoice to a test email, open the hosted link on mobile (confirm it renders correctly), mark it as paid, and verify the time entries are marked as billed. Set a test invoice's due_date to 7 days ago and manually trigger the cron — confirm one reminder is sent and a second trigger does not send a duplicate.

---

## Chunk 10 — Document E-signature

```
Continue Phase 2. Read PRD_PHASE2.md Section 8 and BRAND.md.

Step 10: E-signature module.

Before writing code, confirm:
1. Which e-signature provider we are using (Docusign, Adobe Sign, or DocuSeal)
2. That the provider API key and webhook secret are in .env.local
3. That we have confirmed the legal standing of electronic signatures in
   Nigeria for the document types we will initially support

Only attorneys can send signature requests — enforce this at the RLS level.

- Create the signature_requests table as defined in Section 8.3
- Build the signature request flow from the case document hub:
    - Attorney selects a document → clicks "Request signature"
    - Confirms recipient (client email pre-filled from the case)
    - Sends — JusticeHub calls the provider API to create an envelope/request
    - Provider sends the signing email to the client directly
    - Document status in the case hub updates to "Awaiting signature"
- Client signing experience:
    - Client receives email from the provider with a signing link
    - No account creation required — client clicks link and signs
    - Client can use drawn or typed signature
    - After signing, the provider redirects to a confirmation page
- Webhook handler:
    - Build a Supabase Edge Function as the webhook endpoint for the provider
    - On signing_complete event: update signature_requests.status to signed,
      set signed_at, download the signed PDF from the provider API, store it
      in Supabase Storage (private bucket), save the URL to signed_doc_url
    - Update the document in the case hub to status "Signed" and replace the
      document reference with the signed version
    - Send a confirmation email to both the attorney and the client
    - Signed document must be stored within 60 seconds of the webhook arriving
- Polling fallback:
    - If a signature_request has status = pending for more than 48 hours,
      a separate daily Edge Function checks the provider API directly for
      status and updates accordingly — guards against missed webhooks
- Attorney-facing pending requests view:
    - List of outstanding signature requests on the case detail view
    - Shows: document name, client name, requested date, status
    - "Follow up" button sends a reminder email to the client (one per 24 hours
      maximum — enforce with a timestamp check)

All UI follows BRAND.md. Propose a detailed plan first including: the webhook
endpoint URL structure, how the signed PDF is retrieved from the provider,
and how the 60-second storage SLA is monitored.
```

**Gate:** Complete an end-to-end signing flow with a real test document on a mobile device. Confirm: webhook fires and signed PDF appears in the case document hub within 60 seconds, document status shows "Signed", both attorney and client receive confirmation emails, and a second webhook delivery (simulated) does not duplicate the stored document.

---

## Final review prompt (run after all 10 chunks)

```
Do a full Phase 2 review pass before we consider this shippable.

1. Role system audit:
   - Confirm RLS policies on every table enforce both firm_id AND role
   - Test: a staff user cannot access document contents on a case they are
     not explicitly granted; a firm_admin cannot receive a signed document URL
   - Test: a firm user hitting /superadmin receives a 404

2. Super Admin audit log:
   - Attempt an UPDATE and DELETE on super_admin_audit_log — both must fail
     at the database level, not the application layer
   - Confirm every Super Admin action in Chunk 6 produced a log row

3. Invitation security:
   - Accept an invite, then attempt to use the same token again — must fail
   - Let an invite expire (set expires_at to the past) — must be rejected

4. Billing integrity:
   - Confirm time entries with an invoice_id cannot be edited or deleted
   - Confirm a time entry cannot appear on two invoices (invoice_id already set)
   - Trigger the overdue reminder cron twice — confirm only one reminder per
     invoice per threshold (7day / 14day) is ever sent

5. E-signature integrity:
   - Simulate a duplicate webhook delivery — confirm the signed PDF is not
     stored twice
   - Confirm the polling fallback correctly picks up a request that has been
     pending for 48+ hours

6. PDF generation:
   - Generate an invoice with 20 line items — confirm it completes in under
     3 seconds and the PDF is correctly formatted

7. BRAND.md compliance:
   - Walk through every new Phase 2 surface and confirm: Plus Jakarta Sans
     headings, Inter body, #1A47CC primary, 8-point grid, light mode,
     Tabler outline icons, ghost + primary button pattern

8. Mobile check:
   - Open the hosted invoice URL on a real mobile device
   - Complete the e-signature flow on a real mobile device
   - Confirm the client portal is readable and usable on mobile

Report all findings as a prioritised list. Fix all Critical and High severity
issues before marking Phase 2 as complete. Do not self-approve — flag
everything that needs a human decision.
```

---

## Tips for working with Antigravity across all chunks

- **Always read the Implementation Plan artifact before clicking Proceed.** The few minutes spent here is the cheapest insurance you have.
- **Commit after every chunk** with a message like `feat: phase2-chunk-3-profiles`. If a chunk goes sideways you want to revert to the last clean commit, not three chunks back.
- **RLS and the document access boundary are the one place to read the code yourself**, not just the plan summary. This is legal data — a shortcut here matters.
- **The Super Admin panel is the most security-sensitive chunk.** Take extra time on the plan review for Chunk 6. The audit log immutability must be verified at the Postgres level before sign-off.
- **Test on mobile before marking any client-facing chunk as done.** The hosted invoice view and the signing flow will both be opened by clients on their phones.
- **Do not parallelise.** Every chunk depends on the previous one. Roles must exist before profiles. Profiles must exist before firm settings. Time tracking must exist before billing.
