<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Agent Coordination Protocol

## Agent Roster

| Agent | Owns | Key files |
|-------|------|-----------|
| `database-schema` | Schema, migrations, RLS, indexes, triggers | `supabase/migrations/`, `supabase/config.toml` |
| `auth-security` | OAuth, tokens, encryption, sessions | `lib/oauth/`, `lib/crypto/`, `lib/accounts/`, `middleware.ts` |
| `email-sync` | Provider sync, sending, attachments, background jobs, cloud storage | `lib/email/`, `lib/calendar/`, `lib/storage/`, `netlify/functions/` |
| `api-backend` | API routes, queries, validation, response shaping | `app/api/` (except auth, sync, ai, compose, attachments) |
| `ai-features` | OpenRouter, edge functions, prompts, AI endpoints, knowledge base | `lib/ai/`, `app/api/ai/`, `supabase/functions/ai-*/` |
| `frontend-ui` | Components, pages, layouts, hooks, styling | `components/`, `hooks/`, `app/(app)/`, `app/login/` |
| `mobile-optimization` | Mobile/tablet responsiveness, touch UX, viewport audit | Reads all `components/`, delegates fixes to `frontend-ui` |
| `qa-health-check` | Feature verification, regression detection, anti-pattern scanning | Reads `QA_CHECKLIST.md`, scans all files, reports issues |

## Ownership Boundaries

Files can be **owned** (agent modifies freely) or **read-only** (agent reads for context but doesn't modify without coordination).

### Shared dependencies (no single owner — coordinate before changing)
- `lib/supabase/server.ts` — Server-side Supabase client factory
- `lib/supabase/admin.ts` — Service-role client factory
- `lib/supabase/client.ts` — Browser client (deprecated)
- `package.json` / `tsconfig.json` — Project config
- `next.config.ts` — Next.js config
- `netlify.toml` — Deployment config

### Overlap zones (two agents may both need to touch)
| File pattern | Primary | Secondary |
|-------------|---------|-----------|
| `app/api/compose/send/route.ts` | `email-sync` | `api-backend` |
| `app/api/threads/[id]/reply/route.ts` | `email-sync` | `api-backend` |
| `app/api/attachments/` | `email-sync` | `api-backend` |
| `app/api/sync/` | `email-sync` | `api-backend` |
| `app/api/auth/` | `auth-security` | `api-backend` |
| `app/api/accounts/` | `auth-security` | `api-backend` |
| `app/api/filing/` | `email-sync` | `api-backend` |
| `components/AIPanel.tsx` | `frontend-ui` | `ai-features` |
| `components/ChatPanel.tsx` | `frontend-ui` | `ai-features` |
| `components/LoginForm.tsx` | `frontend-ui` | `auth-security` |
| `lib/email/cold-email-detector.ts` | `ai-features` | `email-sync` |
| `lib/ai/context-aware-drafts.ts` | `ai-features` | `api-backend` (knowledge integration) |

For overlap zones: the **primary** agent makes the change, informed by the secondary agent's domain knowledge.

## Feature Implementation Checklist

When building a feature that spans multiple layers, follow this checklist to avoid half-built work:

- [ ] **Data layer** — Does this need a new table, column, or index? → `database-schema` creates migration
- [ ] **Provider integration** — Does this fetch/push data to Gmail or Outlook? → `email-sync` implements provider API calls
- [ ] **Security** — Does this touch auth, tokens, or permissions? → `auth-security` handles it
- [ ] **API surface** — Does the frontend need a new endpoint or changed response? → `api-backend` creates/updates the route
- [ ] **AI** — Does this use Claude API? → `ai-features` implements the prompt and endpoint
- [ ] **UI** — Does the user see or interact with this? → `frontend-ui` builds the component
- [ ] **Mobile** — Does this have any UI? → `mobile-optimization` audits the component for mobile compliance (mandatory for all UI changes)
- [ ] **QA** — After all changes are complete → `qa-health-check` runs global anti-pattern checks and verifies the changed feature (mandatory before push)

Not every feature needs all layers. A UI-only refactor skips steps 1-5. A new migration might only need step 1. But **every feature with UI must pass mobile audit**, and **all changes must pass QA health check before push**.

## Communication Between Agents

Agents don't talk to each other directly. Instead, they communicate through:

1. **Database schema** — The migration files are the contract between backend and database
2. **API routes** — The request/response shape is the contract between frontend and backend
3. **TypeScript types** — Shared interfaces define data shapes across boundaries
4. **This file** — Ownership rules prevent conflicts

When an agent needs work done in another agent's domain, it should note what's needed and let the user (or orchestrator) delegate to the appropriate agent.

## New Feature Reference (Inbox Zero Parity — April 2026)

These features were added to match/exceed Inbox Zero's capabilities:

### AI Chat Interface (Enhanced)
14 action types: archive, mark_read, mark_unread, star, delete, label, snooze, tag, forward, create_rule, create_draft, update_settings, daily_summary, set_followup. Quick prompt pills. Clear chat. Rich action cards with approval flow.

### Meeting Briefs
Pre-meeting AI briefings from calendar events. Tables: `meeting_briefs`. Edge function: `ai-meeting-brief`. Settings in `user_preferences`. Pages: `/briefs`.

### Auto-File Attachments
Cloud storage filing for email attachments. Google Drive + OneDrive. Tables: `document_filing`, `filing_config`. Edge function: `ai-file-classifier`. Library: `lib/storage/`. Pages: `/filing`.

### Analytics Dashboard (Enhanced)
Period selector (7d/14d/30d/90d), stacked volume chart (sent/received/auto-handled), top senders/recipients, category distribution, response time trends (avg/median/p95), busiest hours heatmap. New API routes: `analytics/senders`, `analytics/categories`, `analytics/response-times`, `analytics/volume`.

### Bulk Unsubscriber
Newsletter detection and bulk management. API: `newsletters/`, `newsletters/bulk-unsubscribe`. Pages: `/newsletters`.

### Cold Email Blocker
AI-powered cold email detection. Three modes: list/label/archive. Tables: `cold_email_log`. Edge function: `ai-cold-email`. Library: `lib/email/cold-email-detector.ts`. Pages: `/cold-emails`.

### Email Digest System
Scheduled AI-summarized email digests. Tables: `digest_config`, `digest_entries`. Edge function: `ai-digest`. Library: `lib/ai/digest-engine.ts`. Pages: `/digests`.

### Knowledge Base & Snippets
User knowledge for AI reply enrichment. Types: fact/preference/procedure/snippet. Scopes: global/sender/domain/topic. Tables: `knowledge_entries` (with FTS). Library: `lib/ai/knowledge-retrieval.ts`. Integrated into `context-aware-drafts.ts`. Pages: `/knowledge`.
