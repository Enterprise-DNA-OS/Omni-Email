@AGENTS.md

# Omni Email — Project Guide

## What This Is

Omni Email is a unified email and calendar client supporting Gmail and Outlook. Built with Next.js 16, React 19, TypeScript, Supabase (PostgreSQL), and Tailwind CSS 4. Deployed on Netlify.

## Agent Team

This project has 8 specialist agents in `.claude/agents/`. **Use the right agent for the task:**

| Task involves… | Use agent | File |
|----------------|-----------|------|
| Migrations, schema, RLS, indexes, triggers, SQL | **Database & Schema** | `database-schema` |
| OAuth, tokens, encryption, login, sessions, middleware | **Auth & Security** | `auth-security` |
| Gmail/Outlook sync, sending email, attachments, background jobs, calendar sync | **Email Sync & Delivery** | `email-sync` |
| API route handlers, query logic, filtering, pagination, validation, tags, contacts | **API & Backend Logic** | `api-backend` |
| AI features, OpenRouter, edge functions, summarization, reply suggestions | **AI Features** | `ai-features` |
| React components, pages, layouts, styling, modals, keyboard shortcuts | **Frontend & UI** | `frontend-ui` |
| Mobile/tablet responsiveness, touch UX, viewport issues, mobile audit | **Mobile Optimization** | `mobile-optimization` |
| Verify features work, catch regressions, check API contracts, find anti-patterns | **QA Health Check** | `qa-health-check` |

### When a task spans multiple agents

Many features touch multiple layers. Follow this order:

1. **Database first** — If the feature needs new tables/columns, run `database-schema` to create the migration
2. **Backend second** — Then `api-backend` or `email-sync` to expose the data via API
3. **Frontend last** — Then `frontend-ui` to build the UI that consumes the API

If unsure which agent to use, pick the one that owns the **primary file** being changed.

## Shared Conventions

### Import Aliases
All imports use the `@/` alias mapped to the project root:
```typescript
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
```

### Supabase Client Usage
| Context | Import | RLS |
|---------|--------|-----|
| Server components & API reads | `createClient()` from `@/lib/supabase/server` | Yes — scoped to `auth.uid()` |
| API writes (threads, messages, credentials) | `createAdminClient()` from `@/lib/supabase/admin` | No — bypasses RLS |
| Browser (deprecated, avoid) | `@/lib/supabase/client` | Yes |

**Rule:** Use `createClient()` for reads (RLS filters by user). Use `createAdminClient()` only for writes to tables where authenticated users don't have write access.

### Auth Check Pattern
Every API route and server action must start with:
```typescript
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
```

### API Response Format
```typescript
// Success
return Response.json({ data: result });             // or just the array/object
return Response.json({ success: true });             // for mutations

// Errors
return Response.json({ error: "Not found" }, { status: 404 });
return Response.json({ error: "Bad request" }, { status: 400 });
return Response.json({ error: "Unauthorized" }, { status: 401 });
return Response.json({ error: "Internal error" }, { status: 500 });
```

### TypeScript Rules
- **Strict mode** — `strict: true` in tsconfig
- **No `any`** — Define proper types/interfaces for all data
- **Path alias** — Always use `@/` imports, never relative `../../../`
- **Interfaces for props** — Every component gets a typed props interface

### File Naming
- Components: `PascalCase.tsx` (e.g., `InboxView.tsx`)
- Hooks: `camelCase.ts` (e.g., `useKeyboardShortcuts.ts`)
- Lib modules: `camelCase.ts` or `kebab-case.ts`
- API routes: `route.ts` inside the path directory
- Migrations: `YYYYMMDDHHMMSS_description.sql`

### Styling
- **Tailwind CSS 4 only** — no inline styles, no CSS modules
- **Responsive** — mobile-first with `sm:`, `md:`, `lg:` breakpoints
- **Dark mode** — support via `dark:` variants and CSS variables
- **Icons** — Lucide React only (`lucide-react`)

### Mobile Requirements (Mandatory)
Every component and page must be fully functional on mobile (375px minimum). These rules are non-negotiable:

- **Touch targets** — All interactive elements ≥ 44px (`min-h-[44px] min-w-[44px]` or `p-2.5`+)
- **No hover-only actions** — Use `opacity-100 sm:opacity-0 sm:group-hover:opacity-100` for reveal-on-hover patterns
- **iOS zoom prevention** — All `<input>` and `<select>` must use `text-base sm:text-sm` (16px on mobile prevents zoom)
- **No horizontal overflow** — Content must fit within viewport at 375px
- **Bottom-sheet modals** — Modals use `items-end` on mobile with `rounded-t-2xl`, centered on `sm:`+
- **Shared nav items** — Both sidebars import from `lib/nav/navItems.ts` (never duplicate the nav list)
- **Shared badges** — Both sidebars use `useNavBadges()` from `hooks/useNavBadges.ts` (never duplicate API calls)
- **Safe-area insets** — Use `env(safe-area-inset-bottom)` for fixed-bottom elements
- **Dynamic viewport** — Use `h-[100dvh]` not `h-screen` for full-height layouts
- **Run `mobile-optimization` agent** — After creating or modifying any component, run this agent to verify mobile compliance

### Database Conventions
- **Provider enum:** `'gmail' | 'outlook'`
- **UUIDs** for all primary keys via `gen_random_uuid()`
- **Timestamps:** `timestamptz` with `DEFAULT now()` for `created_at`
- **Soft operations:** Archive uses `archived_at` timestamp (null = active)
- **JSONB** for flexible data: `recipients`, `labels`, `attachments`, `sync_state`, `raw`
- **Full-text search:** `tsvector` with GIN index, weights A=subject, B=sender, C=body

### AI Architecture
- **OpenRouter is the AI gateway** — All LLM calls go through `https://openrouter.ai/api/v1/chat/completions` (OpenAI-compatible format). This lets us swap models by changing a string, not code.
- **Supabase Edge Functions for AI** — AI API keys (`OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) are stored as **Supabase secrets**, NOT in `.env.local`. AI calls run through edge functions in `supabase/functions/` which access keys via `Deno.env.get()`.
- **Next.js AI routes proxy** — `app/api/ai/*` routes authenticate the user, then call the Supabase Edge Function. They do NOT hold API keys themselves.
- Edge functions live in `supabase/functions/` and use Deno runtime (`jsr:@supabase/functions-js/edge-runtime.d.ts`).
- Shared edge function utilities go in `supabase/functions/_shared/`.

### Environment Variables
Never hardcode secrets. Config is split between env vars and Supabase secrets:

**In `.env.local` (Next.js runtime):**
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Crypto: `TOKEN_ENCRYPTION_KEY`, `OAUTH_STATE_SECRET`
- OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT`
- App: `NEXT_PUBLIC_APP_URL`
- Sync: `SYNC_CRON_SECRET`

**In Supabase secrets (edge function runtime):**
- `OPENROUTER_API_KEY` — Primary AI gateway key
- `ANTHROPIC_API_KEY` — Direct Anthropic access (backup)
- `OPENAI_API_KEY` — OpenAI access (if needed)
- `TOKEN_ENCRYPTION_KEY` — Shared with Next.js for token decrypt in edge functions
- `SYNC_CRON_SECRET` — Shared with Next.js for sync auth

## Cross-Agent Coordination Rules

These rules prevent half-built features when work spans multiple domains:

### Adding a new database column or table
1. `database-schema` creates the migration with proper RLS, indexes, and grants
2. `api-backend` adds/updates the API route to expose the new data
3. `frontend-ui` updates components to display/use the new data
4. If the column comes from a provider (Gmail/Outlook), `email-sync` must also update the sync parser

### Adding a new API endpoint
1. `api-backend` creates the route with auth check, validation, and response format
2. `frontend-ui` creates the component/page that calls the endpoint
3. If the endpoint needs new data, `database-schema` creates the migration first

### Adding a new provider feature (e.g., new Gmail/Outlook capability)
1. `email-sync` implements the provider API integration
2. `database-schema` adds any new columns/tables needed to store the data
3. `api-backend` exposes it via API
4. `frontend-ui` builds the UI

### Adding a new AI feature
1. `ai-features` creates the prompt, endpoint, and client integration
2. `frontend-ui` adds the UI trigger (button in AIPanel or elsewhere)

### Modifying auth or sessions
1. `auth-security` makes the change
2. `frontend-ui` updates login page or protected route behavior if needed
3. `api-backend` updates auth checks if the session shape changes

### After any frontend change (mandatory)
1. `mobile-optimization` audits all changed components for mobile compliance
2. Any issues found are flagged as P0 and must be fixed before the change is considered complete

## Project Structure Quick Reference

```
app/
├── layout.tsx                          — Root layout
├── page.tsx                            — Redirect → /inbox
├── login/page.tsx                      — Login
├── (app)/                              — Protected shell
│   ├── layout.tsx                      — App shell (uses AppShell client component)
│   ├── inbox/page.tsx                  — Inbox
│   ├── thread/[id]/page.tsx            — Thread detail
│   ├── calendar/page.tsx               — Calendar
│   ├── contacts/page.tsx               — Contacts + Relationship Intelligence
│   ├── settings/page.tsx               — Settings (accounts, tags, sender lists, modes, auto-send, style)
│   ├── approvals/page.tsx              — AI approval queue
│   ├── rules/page.tsx                  — Rules engine builder
│   ├── tasks/page.tsx                  — Extracted action items
│   ├── summary/page.tsx                — Daily executive summary
│   ├── catch-me-up/page.tsx            — Catch-me-up briefing
│   ├── waiting/page.tsx                — Follow-up tracker
│   ├── analytics/page.tsx              — Inbox health dashboard (enhanced)
│   ├── snoozed/page.tsx                — Snoozed threads
│   ├── scheduled/page.tsx              — Scheduled messages
│   ├── alerts/page.tsx                 — Risk/opportunity alerts
│   ├── trash/page.tsx                  — Soft-deleted threads
│   ├── briefs/page.tsx                 — Meeting briefs
│   ├── filing/page.tsx                 — Document filing dashboard
│   ├── newsletters/page.tsx            — Newsletter/subscription manager
│   ├── cold-emails/page.tsx            — Cold email blocker
│   ├── digests/page.tsx                — Email digest manager
│   └── knowledge/page.tsx              — Knowledge base & snippets
├── api/
│   ├── auth/oauth/callback/route.ts    — OAuth callback
│   ├── accounts/                       — Account CRUD + style analysis
│   ├── threads/                        — Thread ops (archive, read, tags, snooze, restore, unsubscribe, bulk, alerts)
│   ├── compose/                        — Send + schedule
│   ├── tags/                           — Tag CRUD
│   ├── contacts/                       — Contacts + intelligence + rebuild
│   ├── events/route.ts                 — Calendar events
│   ├── ai/                             — AI features (classify, summarize, suggest-reply, improve, catch-me-up, daily-summary, feedback, suggestions, extract-tasks)
│   ├── attachments/                    — File downloads
│   ├── sync/                           — Manual sync + force re-sync
│   ├── internal/sync/route.ts          — Cron sync + snooze + scheduled + stale
│   ├── audit-log/                      — Audit log query + undo
│   ├── approval-queue/                 — Approval queue CRUD + batch + count
│   ├── rules/                          — Rules CRUD + test
│   ├── drafts/                         — Drafts CRUD + send
│   ├── tasks/                          — Tasks CRUD
│   ├── follow-ups/                     — Follow-up CRUD
│   ├── summaries/                      — Summary history + latest
│   ├── sender-classifications/         — VIP/safe/blocked lists
│   ├── auto-send/                      — Auto-send config + kill switch
│   ├── automation/                     — Manual triggers (auto-archive, auto-delete, auto-send)
│   ├── scheduled/                      — Scheduled messages CRUD
│   ├── search/semantic/route.ts        — Semantic vector search
│   ├── chat/                           — Chat with inbox + history (14 action types)
│   ├── analytics/                      — Dashboard + heatmap + senders + categories + response-times + volume
│   ├── mode/route.ts                   — Operating mode get/set
│   ├── run-inbox/                      — Run-my-inbox activate/deactivate/status
│   ├── unsubscribe/                    — Unsubscribe log
│   ├── meeting-briefs/                 — Meeting briefs CRUD + generate + settings
│   ├── filing/                         — Document filing CRUD + config + folders
│   ├── newsletters/                    — Newsletter listing + bulk unsubscribe
│   ├── cold-emails/                    — Cold email detection + settings + test
│   ├── digests/                        — Digest config CRUD + entries + generate
│   └── knowledge/                      — Knowledge base CRUD + stats
components/                             — 55+ React components
hooks/                                  — Custom React hooks (useKeyboardShortcuts, useBulkSelection)
lib/
├── supabase/                           — DB clients (server, admin, client)
├── email/                              — Sync + outbound + MIME + unsubscribe + snooze + scheduled + auto-forward + cold-email-detector
├── calendar/                           — Calendar sync
├── oauth/                              — OAuth flows
├── crypto/                             — Token encryption
├── accounts/                           — Account persistence
├── ai/                                 — AI client + classify + embeddings + semantic search + chat + catch-me-up + daily summary + tasks + follow-up + tone + behavioral + operating modes + run-inbox + context drafts + reply modes + auto-close + knowledge-retrieval + digest-engine
├── storage/                            — Cloud storage (google-drive + onedrive + filing-engine)
├── audit/                              — Audit log helper
├── approval/                           — Approval queue helper
├── undo/                               — Undo system (execute + reversals)
├── automation/                         — Auto-archive + auto-delete + auto-draft + auto-send
├── rules/                              — Rules engine (engine + conditions + actions)
├── sender-classifications/             — VIP/safe/blocked checks
└── analytics/                          — Daily analytics aggregation
supabase/
├── migrations/                         — 36 SQL migration files
├── functions/_shared/openrouter.ts     — Shared OpenRouter client
├── functions/ai-classify/              — Classification edge function
├── functions/ai-summarize/             — Summarization edge function
├── functions/ai-suggest-reply/         — Reply suggestion edge function
├── functions/ai-improve/               — Draft improvement edge function
├── functions/ai-catch-me-up/           — Catch-me-up briefing edge function
├── functions/ai-chat/                  — Chat orchestration edge function (14 action types)
├── functions/ai-context-draft/         — Context-aware draft edge function
├── functions/ai-daily-summary/         — Daily summary edge function
├── functions/ai-embeddings/            — Vector embedding edge function
├── functions/ai-extract-tasks/         — Task extraction edge function
├── functions/ai-suggest-rules/         — Rule suggestion edge function
├── functions/ai-analyze-style/         — Writing style analysis edge function
├── functions/ai-meeting-brief/         — Meeting brief generation edge function
├── functions/ai-cold-email/            — Cold email classification edge function
├── functions/ai-digest/                — Digest summarization edge function
├── functions/ai-file-classifier/       — Attachment filing classification edge function
└── functions/sync-email/               — Sync forwarder edge function
netlify/functions/                      — Background sync (scheduled + background)
```
