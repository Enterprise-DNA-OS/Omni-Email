# Omni Email — Product Requirements Document

## Vision

Omni Email is an AI-powered autonomous email assistant that manages your inbox intelligently across Gmail and Outlook. It doesn't just display email — it **understands, triages, acts, and learns**. The goal is an assistant that handles 80% of email autonomously while keeping you in control of the 20% that matters.

Built with Next.js 16, React 19, TypeScript, Supabase (PostgreSQL), Tailwind CSS 4. AI via OpenRouter (Supabase Edge Functions). Deployed on Netlify.

---

## Current State (as of 2026-04-03)

### What's Built

The app has a solid MVP foundation across all layers:

**Email Core:**
- Multi-account OAuth (Gmail + Outlook) with encrypted token storage and auto-refresh
- Threaded email sync (inbound) for both providers with duplicate detection
- Send and reply for both providers (no attachment upload)
- Forward email UI
- Compose modal with rich text editor, multi-account From selector, draft auto-save to localStorage
- Archive and delete (manual, both local and remote provider)
- Attachment metadata parsing and download proxy

**AI (Basic):**
- Thread classification: auto-assigns `ai_category` (client/billing/support/marketing/etc.) and `ai_priority` (urgent/high/normal/low/ignore) after every sync
- Thread summarization (on-demand and auto via classify pipeline)
- AI reply suggestions with 3 tone modes (professional, friendly, brief)
- Draft improvement (rewrite for clarity/tone)
- AI-generated tags auto-applied to threads

**Calendar:**
- Calendar sync from both providers (read-only, 7-day back / 60-day forward)
- Week and day views with navigation

**UI:**
- Unified inbox with account filter, search, priority indicators, category badges, AI tags
- Thread detail with messages, labels, attachments, inline reply, tag management
- Settings page with account management, tag CRUD, sync controls
- Contacts page (derived from message senders, search, frequency)
- Keyboard shortcuts + command palette (Cmd+K) + shortcuts help modal
- Dark mode (system preference auto-detect)
- Mobile responsive with hamburger nav, mobile sidebar, FAB compose button

**Infrastructure:**
- Background sync via Netlify scheduled functions (every 5 minutes)
- Manual sync and force full re-sync endpoints
- Full-text search with tsvector (weighted: subject > sender > body)
- User-defined tags with thread assignment

### What's NOT Built

The entire autonomy layer, learning system, rules engine, and intelligence layer are missing. The app currently **displays** email well but does not **manage** it. The gaps fall into these categories:

1. **Decision Engine** — No intent detection, no confidence scoring, no action recommendation
2. **Autonomous Actions** — No auto-archive, auto-delete, auto-unsubscribe, auto-forward, auto-snooze, auto-draft, auto-send, auto-follow-up
3. **Rules & Policy** — No user-configurable rules, no VIP lists, no block lists, no approval thresholds, no time-based rules
4. **Learning & Adaptation** — No feedback loop, no correction tracking, no behavior learning, no tone learning per account
5. **Intelligence Layer** — No daily summaries, no relationship intelligence, no risk/opportunity detection, no inbox health metrics
6. **Workflow Integration** — No task extraction, no CRM updates, no "waiting on" tracking, no follow-up engine
7. **Advanced AI** — No semantic search, no knowledge graph, no chat with inbox, no voice briefing, no "catch me up" mode
8. **Safety & Control** — No audit log, no approval queue, no simulation mode, no undo system, no rate limits on autonomous actions
9. **Analytics** — No response time tracking, no automation rate, no volume trends, no SLA monitoring

### Architecture Gap

The CLAUDE.md specifies AI calls should go through OpenRouter via Supabase Edge Functions, but the current implementation calls the Anthropic API directly from Next.js routes. This needs to be migrated.

---

## Feature Roadmap

### Phase 1 — Decision Engine & Safety Foundation

The core that makes everything else possible. Without a decision engine and safety layer, no autonomous action is safe.

#### 1.1 Intent Detection & Confidence Scoring
**Priority: P0** | **Agents: database-schema, ai-features, api-backend**

Classify every incoming thread with what action the user should take and how confident the AI is.

**Intent types:** `reply`, `reply_urgent`, `archive`, `delete`, `delegate`, `schedule`, `pay`, `review`, `ignore`, `unsubscribe`, `follow_up`, `no_action`

**Requirements:**
- Extend the AI classify pipeline to return `intent`, `confidence` (0.0-1.0), and `reasoning`
- Store in new columns: `threads.ai_intent`, `threads.ai_confidence`, `threads.ai_reasoning`
- Confidence thresholds drive what the system can do autonomously vs. what needs approval
- Show intent + confidence in the inbox UI as action suggestions

**Database additions:**
- `threads.ai_intent` — text with CHECK constraint on valid intents
- `threads.ai_confidence` — numeric(3,2), 0.00-1.00
- `threads.ai_reasoning` — text, short explanation for transparency

#### 1.2 Audit Log
**Priority: P0** | **Agents: database-schema, api-backend, frontend-ui**

Every action taken by the system (and by the user) must be logged for transparency and undo.

**Requirements:**
- Log all mutations: archive, delete, send, reply, label, classify, auto-action, rule execution
- Each entry records: who (user or system), what (action type), target (thread/message ID), details (JSONB), timestamp, reversible (boolean)
- Audit log viewer in settings or as a sidebar panel
- Filter by action type, date range, actor (user vs AI)

**Database additions:**
- `audit_log` table: `id, user_id, actor ('user' | 'system' | 'rule'), action, target_type, target_id, details (JSONB), reversible, undone_at, created_at`
- Index on `(user_id, created_at DESC)`

#### 1.3 Approval Queue
**Priority: P0** | **Agents: database-schema, api-backend, frontend-ui**

Medium-confidence AI actions go into a queue for human review instead of executing immediately.

**Requirements:**
- Queue entries created when AI confidence is between configurable thresholds (e.g., 0.5-0.8)
- Each entry shows: thread summary, proposed action, confidence, reasoning
- User can approve (execute), reject (dismiss), or modify (change action) each item
- Batch approve/reject
- Approval queue accessible from sidebar with count badge
- Items expire after configurable period (default 48 hours)

**Database additions:**
- `approval_queue` table: `id, user_id, thread_id, proposed_action, proposed_details (JSONB), confidence, reasoning, status ('pending' | 'approved' | 'rejected' | 'expired'), resolved_at, expires_at, created_at`

#### 1.4 Undo System
**Priority: P0** | **Agents: api-backend, frontend-ui**

Every reversible action gets a 10-second undo window via toast notification, plus full undo from the audit log.

**Requirements:**
- Toast with "Undo" button appears after archive, delete, label, send, auto-action
- Undo reverses the action locally and at the provider where possible
- Audit log entries marked `reversible: true` show an "Undo" button
- Undo of a send = move to drafts (where provider supports recall)
- Rate-limited: max 1 undo per action

---

### Phase 2 — Autonomous Actions

These are the actions the system takes on its own, gated by confidence scoring and the approval queue.

#### 2.1 Auto-Archive
**Priority: P0** | **Agents: email-sync, api-backend, ai-features**

Automatically archive low-value threads when confidence is high enough.

**Requirements:**
- Triggers when `ai_intent = 'archive'` AND `ai_confidence >= 0.85`
- Archives locally (set `archived_at`) and remotely (remove INBOX label / move to archive)
- Logs to audit log with `actor: 'system'`
- User can configure per-account: enable/disable auto-archive, adjust confidence threshold
- Never auto-archive from VIP senders

#### 2.2 Auto-Delete / Auto-Junk
**Priority: P1** | **Agents: email-sync, api-backend, ai-features**

Delete obvious junk after safety checks.

**Requirements:**
- Only triggers when `ai_intent = 'delete'` AND `ai_confidence >= 0.95`
- Safety checks: not from a known contact, not from a domain in safe list, no attachments, not a reply in an existing conversation
- Soft delete first (mark deleted, move to trash at provider), hard delete after 30 days
- Configurable: enable/disable, safe list domains, never-delete senders

#### 2.3 Auto-Unsubscribe
**Priority: P1** | **Agents: email-sync, api-backend, database-schema**

Detect newsletters and cold outreach, offer one-click unsubscribe, or auto-unsubscribe when confidence is high.

**Requirements:**
- Parse `List-Unsubscribe` and `List-Unsubscribe-Post` headers during sync
- Store unsubscribe method per thread/sender: `mailto:`, `https://`, `List-Unsubscribe-Post`
- AI identifies newsletter/cold-outreach patterns even without headers
- UI: "Unsubscribe" button on detected newsletter threads
- Auto-unsubscribe for senders marked as unwanted (user confirms once, future emails auto-unsubscribed)
- Track unsubscribe history and suppression list

**Database additions:**
- `unsubscribe_log` table: `id, user_id, sender_email, sender_domain, method, status ('pending' | 'sent' | 'confirmed' | 'failed'), unsubscribed_at, created_at`
- `threads.list_unsubscribe` — text, raw header value
- `threads.is_newsletter` — boolean, AI-detected

#### 2.4 Auto-Label & Auto-Folder
**Priority: P1** | **Agents: ai-features, api-backend**

Automatically apply tags based on AI classification and user-defined rules.

**Requirements:**
- AI tags (already exists via classify pipeline) — enhance with project, company, and person-based tags
- Auto-create tags from detected patterns (e.g., project names, company names)
- User can pin/unpin auto-generated tags
- Tag hierarchy support (parent/child tags)

#### 2.5 Auto-Star / Auto-Pin
**Priority: P2** | **Agents: database-schema, api-backend, frontend-ui**

Automatically star genuinely important threads.

**Requirements:**
- `threads.starred_at` column
- AI stars threads with `ai_priority = 'urgent'` or `ai_priority = 'high'` AND from VIP senders
- Starred view in sidebar
- Manual star/unstar toggle

**Database additions:**
- `threads.starred_at` — timestamptz, nullable

#### 2.6 Auto-Snooze
**Priority: P2** | **Agents: database-schema, api-backend, frontend-ui, email-sync**

Snooze threads until a relevant time.

**Requirements:**
- `threads.snoozed_until` column
- Manual snooze with preset times: later today, tomorrow morning, next week, custom datetime
- AI can suggest snooze when intent is `schedule` (e.g., "this is about a meeting next Thursday — snooze until Wednesday")
- Background job checks snoozed threads every minute, moves back to inbox when due
- Snoozed view in sidebar with count

**Database additions:**
- `threads.snoozed_until` — timestamptz, nullable
- Index on `snoozed_until` for the background unsnooze job

#### 2.7 Auto-Draft Replies
**Priority: P1** | **Agents: ai-features, database-schema, api-backend, frontend-ui**

Pre-generate draft replies for threads that need responses.

**Requirements:**
- When `ai_intent = 'reply'` or `ai_intent = 'reply_urgent'`, auto-generate a draft reply
- Store drafts in a new `drafts` table (not just localStorage)
- Show draft indicator on thread rows
- Opening a thread with a pre-generated draft shows it in the reply box with "AI Draft" badge
- User can edit, send, or dismiss
- Multiple drafts per thread (different tones)

**Database additions:**
- `drafts` table: `id, user_id, account_id, thread_id, message_id (reply-to), to_recipients (JSONB), cc_recipients, bcc_recipients, subject, body_html, body_text, tone, source ('user' | 'ai'), status ('draft' | 'sent' | 'discarded'), created_at, updated_at`

#### 2.8 Auto-Send (Narrow Safe Cases)
**Priority: P2** | **Agents: ai-features, email-sync, api-backend**

Send replies automatically when confidence is very high and rules allow.

**Requirements:**
- Only when `ai_confidence >= 0.95` AND user has explicitly enabled auto-send for the sender/domain/category
- Types of auto-sends: meeting confirmations, read receipts, "thank you" acknowledgments, out-of-office-style responses
- All auto-sends logged to audit log and approval queue (post-facto review)
- Rate limit: max 10 auto-sends per hour per account
- Kill switch: user can disable all auto-sends instantly

#### 2.9 Auto-Follow-Up
**Priority: P2** | **Agents: database-schema, ai-features, email-sync, api-backend, frontend-ui**

Track sent emails awaiting response and auto-send follow-ups.

**Requirements:**
- Detect when a sent email hasn't received a reply after N days
- AI generates a follow-up draft
- Follow-up can be auto-sent (if enabled) or queued for approval
- "Waiting on" view showing all threads awaiting replies
- Configurable follow-up intervals per relationship type (e.g., clients = 2 days, vendors = 5 days)

**Database additions:**
- `follow_ups` table: `id, user_id, thread_id, account_id, original_message_id, follow_up_count, next_follow_up_at, max_follow_ups, status ('waiting' | 'followed_up' | 'replied' | 'cancelled'), created_at`

#### 2.10 Auto-Forward
**Priority: P3** | **Agents: email-sync, api-backend**

Forward specific emails to the right person or shared inbox.

**Requirements:**
- Triggers from rules engine (Phase 3) — e.g., "invoices from domain X → forward to accounting@"
- Logged in audit log
- Configurable per-rule

#### 2.11 Auto-Close Stale Threads
**Priority: P3** | **Agents: ai-features, api-backend**

Detect and archive threads that have gone stale.

**Requirements:**
- Threads with no activity for N days (configurable, default 14) and no pending follow-up
- AI verifies the thread is truly resolved / no action needed
- Auto-archive with `actor: 'system'` in audit log

---

### Phase 3 — Rules & Policy Engine

User-configurable automation that works alongside AI.

#### 3.1 Rules Engine
**Priority: P1** | **Agents: database-schema, api-backend, frontend-ui**

A visual rule builder where users define conditions and actions.

**Conditions (combinable with AND/OR):**
- Sender email / domain matches
- Subject contains / matches regex
- Body contains
- Has attachments
- AI category matches
- AI priority matches
- AI intent matches
- Is first-time sender
- Sender is/is not in contacts
- Account matches
- Time of day / day of week

**Actions:**
- Apply tag
- Archive
- Delete
- Forward to address
- Star / pin
- Snooze until time
- Set priority override
- Mark as VIP
- Auto-reply with template
- Move to approval queue
- Do nothing (suppress AI action)

**Requirements:**
- Rules have priority ordering (higher priority rules override lower)
- Rules can be enabled/disabled
- Rule execution logged in audit log
- "Test rule" — show which existing threads would match
- Import/export rules as JSON

**Database additions:**
- `rules` table: `id, user_id, name, conditions (JSONB), actions (JSONB), enabled, priority, match_count, last_matched_at, created_at, updated_at`

#### 3.2 VIP & Safe Lists
**Priority: P1** | **Agents: database-schema, api-backend, frontend-ui**

Explicit sender classification that overrides AI decisions.

**Requirements:**
- VIP list: senders whose emails are always surfaced prominently, never auto-archived/deleted
- Safe list: domains/senders that are never treated as spam/newsletter
- Block list: senders whose emails are always auto-archived or auto-deleted
- Never-auto-send list: domains where auto-send is forbidden (e.g., legal, executive)
- Manage all lists from settings
- Quick-add from thread view (right-click sender → "Add to VIP")

**Database additions:**
- `sender_classifications` table: `id, user_id, email_or_domain, classification ('vip' | 'safe' | 'blocked' | 'never_auto_send'), notes, created_at`

#### 3.3 Account-Specific Personalities
**Priority: P2** | **Agents: database-schema, ai-features, api-backend, frontend-ui**

Different AI behavior per connected account.

**Requirements:**
- Per-account settings: default reply tone, signature, auto-send enabled, follow-up aggressiveness
- AI learns different writing styles per account from sent mail history
- Stored as JSONB on the accounts table

**Database additions:**
- `accounts.ai_personality` — JSONB: `{ defaultTone, autoSendEnabled, followUpDays, writingStyleSummary }`

#### 3.4 Time-Based Rules
**Priority: P2** | **Agents: database-schema, api-backend**

Rules that apply during specific time windows.

**Requirements:**
- Quiet hours: suppress all auto-actions during configured hours
- Weekend rules: different handling for weekend emails
- Holiday calendar: suppress auto-sends on holidays
- "Do not disturb" toggle that pauses all autonomous actions

**Database additions:**
- `user_preferences.quiet_hours` — JSONB: `{ enabled, start, end, timezone, weekendEnabled }`
- `user_preferences.dnd_until` — timestamptz, nullable

#### 3.5 Approval Thresholds by Action Type
**Priority: P2** | **Agents: database-schema, api-backend, frontend-ui**

Different confidence requirements for different action types.

**Requirements:**
- Configurable per action: auto-archive needs 0.85, auto-delete needs 0.95, auto-send needs 0.95, auto-label needs 0.7
- Stored per-user, overridable per-account
- Settings UI with sliders for each threshold

**Database additions:**
- `user_preferences.action_thresholds` — JSONB: `{ archive: 0.85, delete: 0.95, send: 0.95, label: 0.7, ... }`

---

### Phase 4 — Learning & Adaptation

The system gets smarter over time by learning from user behavior.

#### 4.1 Feedback Loop
**Priority: P1** | **Agents: database-schema, ai-features, api-backend, frontend-ui**

Capture user corrections and use them to improve future classifications.

**Requirements:**
- Thumbs up/down on AI classifications (category, priority, intent)
- Track when user overrides AI: manually archives something AI said to reply to, manually replies to something AI said to ignore
- Track draft acceptance rate: AI draft sent as-is vs. edited vs. discarded
- Correction details stored with the original AI output for comparison
- Weekly "learning report": show what the AI got right and wrong

**Database additions:**
- `ai_feedback` table: `id, user_id, thread_id, feedback_type ('classification' | 'draft' | 'action'), ai_output (JSONB), user_correction (JSONB), created_at`

#### 4.2 Behavioral Learning
**Priority: P2** | **Agents: ai-features, database-schema**

Learn from patterns in what the user does without explicit feedback.

**Requirements:**
- Track: what the user reads, archives, deletes, replies to, ignores, and how quickly
- Detect repeated manual actions and suggest automating them ("You've archived 15 emails from this sender this month — create a rule?")
- Learn preferred response time by relationship type
- Learn project associations from label patterns and repeated threads

**Database additions:**
- `behavior_signals` table: `id, user_id, thread_id, signal_type ('read' | 'archived' | 'deleted' | 'replied' | 'ignored'), time_to_action_seconds, created_at`

#### 4.3 Tone Learning Per Account
**Priority: P2** | **Agents: ai-features, database-schema**

Analyze sent mail history to learn the user's natural voice per account.

**Requirements:**
- On account connection, analyze last 50 sent messages for tone, formality, typical greeting/sign-off
- Build a "writing style profile" per account stored as a structured summary
- Use this profile as context when generating draft replies
- Periodically refresh (every 30 days or on user request)

**Database additions:**
- `accounts.writing_style_profile` — text, AI-generated style summary
- `accounts.style_analyzed_at` — timestamptz

---

### Phase 5 — Intelligence Layer

Higher-order understanding across all email activity.

#### 5.1 Daily Executive Summary
**Priority: P1** | **Agents: ai-features, api-backend, frontend-ui**

A morning briefing of what matters.

**Requirements:**
- Generated daily at user's configured time (default 7am local)
- Contents: new important threads, threads awaiting your reply, follow-ups due, meetings today, action items extracted, overnight activity summary
- Delivered as: in-app summary page, optional email digest, optional push notification
- "Catch me up from overnight" mode: expanded version covering all activity since last session
- "What needs a decision from me?" filtered view

**API additions:**
- `POST /api/ai/daily-summary` — generate on demand
- `GET /api/summaries/latest` — fetch most recent summary

**Database additions:**
- `daily_summaries` table: `id, user_id, summary_date, content (JSONB), generated_at`

#### 5.2 Relationship Intelligence
**Priority: P2** | **Agents: database-schema, ai-features, api-backend, frontend-ui**

Understand your communication network.

**Requirements:**
- Contact-level metrics: message frequency, average response time (yours and theirs), last interaction, relationship trend (growing/stable/declining)
- Top contacts dashboard: who you email most, who you're neglecting, hot leads, recurring issues
- Company-level grouping: aggregate contacts by domain
- Relationship health indicators on contact cards
- "You haven't replied to X in 5 days" nudges

**Database additions:**
- `contacts` table (proper): `id, user_id, name, email, domain, company, relationship_score, last_inbound_at, last_outbound_at, avg_response_time_hours, message_count_in, message_count_out, first_seen_at, created_at, updated_at`
- `contact_interactions` table: `id, contact_id, thread_id, direction ('inbound' | 'outbound'), responded_in_seconds, created_at`

#### 5.3 Action Item & Task Extraction
**Priority: P1** | **Agents: ai-features, database-schema, api-backend, frontend-ui**

Pull tasks, deadlines, and commitments from email threads.

**Requirements:**
- AI scans threads for action items, deadlines, commitments, and assignments
- Extracted tasks stored with: description, deadline (if mentioned), assignee (if mentioned), source thread, status
- Task view accessible from sidebar
- Mark tasks complete/dismiss
- Detect meeting action items from calendar context

**Database additions:**
- `tasks` table: `id, user_id, thread_id, message_id, description, deadline, assignee, status ('pending' | 'done' | 'dismissed'), source ('ai_extracted' | 'user_created'), created_at, completed_at`

#### 5.4 Risk & Opportunity Detection
**Priority: P2** | **Agents: ai-features, api-backend**

Flag emails that represent business opportunities or risks.

**Requirements:**
- Opportunity signals: new business inquiries, partnership proposals, job opportunities, introductions
- Risk signals: angry customers, legal threats, invoice disputes, service outages, churn indicators, compliance issues
- Flagged in the inbox with risk/opportunity badges
- Separate "Alerts" view for high-priority risk/opportunity items

**Database additions:**
- `threads.ai_signals` — JSONB array: `[{ type: 'risk' | 'opportunity', signal: '...', severity: 'high' | 'medium' | 'low' }]`

#### 5.5 Inbox Health Dashboard
**Priority: P2** | **Agents: database-schema, api-backend, frontend-ui**

Analytics on inbox performance.

**Metrics:**
- Response times by sender/category/account
- Email volume trends (daily, weekly, monthly)
- Automation rate (% of emails handled without user intervention)
- Time saved (estimated from auto-actions)
- Draft acceptance rate
- Unsubscribe cleanup impact
- False archive/delete rate (from undo usage)
- SLA tracking for key senders
- Unread count trend
- Busiest hours heatmap

**Database additions:**
- `analytics_daily` table: `id, user_id, date, emails_received, emails_sent, emails_auto_archived, emails_auto_deleted, avg_response_time_minutes, ai_drafts_accepted, ai_drafts_edited, ai_drafts_discarded, created_at`

---

### Phase 6 — Drafting & Reply Intelligence

Advanced reply generation beyond the current basic tone selection.

#### 6.1 Expanded Reply Modes
**Priority: P1** | **Agents: ai-features, frontend-ui**

Add more reply personas beyond the current 3.

**New modes:** `concise`, `warm`, `executive`, `support`, `sales`, `legal_safe`, `detailed`, `casual`

**Requirements:**
- Each mode has a distinct system prompt
- Mode selection via dropdown or quick-select buttons
- Per-account default mode (configurable in settings)
- "Custom instruction" field for one-off tone adjustments

#### 6.2 Context-Aware Drafts
**Priority: P2** | **Agents: ai-features**

Drafts that reference relationship history, previous conversations, and attachments.

**Requirements:**
- Include last 5 interactions with this sender as context when drafting
- Reference relevant attachments, documents, or action items from the thread
- Suggest next steps, calendar links, or follow-up dates in the draft
- Detect when no reply is needed and say so
- Detect when a phone call or meeting would be better than email

#### 6.3 Smart Compose (Autocomplete)
**Priority: P3** | **Agents: ai-features, frontend-ui**

AI autocomplete while typing, like GitHub Copilot for email.

**Requirements:**
- Tab to accept inline suggestion
- Suggestions based on: writing style profile, conversation context, common phrases
- Streaming suggestions as user types (debounced)
- Toggle on/off per user

---

### Phase 7 — Advanced AI Features

#### 7.1 Semantic Search
**Priority: P2** | **Agents: database-schema, ai-features, api-backend, frontend-ui**

Natural language search across all email.

**Requirements:**
- Query expansion: "emails about the Q4 budget" → searches for budget, financial, quarterly review, etc.
- Answer questions: "what did John say about the deadline?" returns the relevant passage
- Search across all accounts simultaneously
- Search attachments (extract text from PDFs, docs)

**Implementation:** pgvector extension + embedding pipeline for message content

**Database additions:**
- `message_embeddings` table: `id, message_id, embedding vector(1536), created_at`
- Enable pgvector extension

#### 7.2 Chat With Your Inbox
**Priority: P2** | **Agents: ai-features, frontend-ui**

Natural language interface for email management.

**Requirements:**
- Chat panel in sidebar or as a modal
- Questions: "What am I waiting on from Acme Corp?", "Show me all invoices from last month", "What's the status of the Henderson deal?"
- Commands: "Archive all marketing emails from this week", "Draft a follow-up to Sarah about the contract", "Snooze the Stripe invoice until Friday"
- Context-aware: understands current view, selected thread, recent actions

#### 7.3 Knowledge Graph
**Priority: P3** | **Agents: database-schema, ai-features**

Build a graph of contacts, companies, deals, issues, and projects from email history.

**Requirements:**
- Entity extraction: people, companies, projects, amounts, dates
- Relationship mapping: who works where, who introduced whom, deal relationships
- Queryable: "Who at Acme Corp have I talked to?" "What projects is Sarah involved in?"
- Auto-updated as new emails arrive

#### 7.4 "Catch Me Up" Mode
**Priority: P1** | **Agents: ai-features, frontend-ui**

A briefing page for returning after being away.

**Requirements:**
- Shows activity since last session (or custom time range)
- Grouped by: urgent/needs decision, important updates, low-priority activity, auto-handled by AI
- One-click actions: approve AI decisions, reply to urgent items, dismiss the rest
- Estimated time to clear inbox

#### 7.5 "Run My Inbox" Mode
**Priority: P3** | **Agents: ai-features, frontend-ui, api-backend**

Fully autonomous inbox management for a specified duration.

**Requirements:**
- User activates for a time period (2 hours, rest of day, this weekend)
- AI handles everything within configured thresholds
- All actions logged to audit log
- Summary generated when mode ends
- Emergency override: "only interrupt me for emails from [list]"
- "Only show me emails worth more than $X or tied to strategic projects"

---

### Phase 8 — Workflow & Operations

#### 8.1 Calendar Intelligence
**Priority: P1** | **Agents: ai-features, database-schema, api-backend, frontend-ui**

Connect email context with calendar.

**Requirements:**
- Create events from compose ("I'll send you a meeting invite" → suggest creating event)
- Detect meeting-related emails and link to calendar events
- Meeting prep: summarize related threads before a meeting
- Meeting follow-up: detect action items from post-meeting emails
- Calendar event CRUD (create, update, delete via provider API)

**API additions:**
- `POST /api/events` — create event
- `PUT /api/events/[id]` — update event
- `DELETE /api/events/[id]` — delete event

#### 8.2 Email-to-Task Pipeline
**Priority: P2** | **Agents: ai-features, api-backend, frontend-ui**

Turn emails into tracked tasks.

**Requirements:**
- Manual: "Create task from this email" button on thread view
- Automatic: AI extracts action items and creates tasks
- Task list view in sidebar
- Task status: pending, in progress, done, dismissed
- Deadline tracking with notifications
- Future: export to Asana/Notion/Linear via webhooks

#### 8.3 Scheduled Send
**Priority: P2** | **Agents: database-schema, email-sync, api-backend, frontend-ui**

Queue emails for future delivery.

**Requirements:**
- Schedule button on compose/reply with datetime picker
- Preset times: tomorrow morning, Monday morning, custom
- Scheduled messages queue view
- Cancel/edit scheduled messages before send time
- Background job checks every minute for due messages

**Database additions:**
- `scheduled_messages` table: `id, user_id, account_id, thread_id, to_recipients (JSONB), cc, bcc, subject, body_html, send_at, status ('queued' | 'sent' | 'cancelled' | 'failed'), created_at`

---

### Phase 9 — Polish & Infrastructure

#### 9.1 Bulk Actions
**Priority: P1** | **Agents: api-backend, frontend-ui**

Select multiple threads for batch operations.

**Requirements:**
- Checkbox selection on thread rows
- Select all (visible / all matching filter)
- Bulk toolbar: archive, delete, add tag, mark read/unread, star
- Count indicator
- Undo support for bulk operations

#### 9.2 Attachment Upload
**Priority: P1** | **Agents: email-sync, api-backend, frontend-ui**

Attach files to outgoing emails.

**Requirements:**
- File picker and drag-and-drop on compose/reply
- File size validation (25MB per email)
- Upload progress indicator
- Attachment chips with remove button
- Support for both Gmail (multipart MIME) and Outlook (Graph API attachments)

#### 9.3 Email Signatures
**Priority: P2** | **Agents: database-schema, api-backend, frontend-ui**

**Requirements:**
- Multiple signatures per account
- Rich text editor for signature content
- Default signature per account, auto-inserted on compose/reply
- Toggle on/off per message

**Database additions:**
- `signatures` table: `id, user_id, account_id, name, body_html, is_default, created_at`

#### 9.4 Email Templates
**Priority: P2** | **Agents: database-schema, api-backend, frontend-ui**

**Requirements:**
- Create reusable templates (subject + body)
- Insert template from compose via search dropdown
- Quick-reply with template from thread view
- Template usage tracking

**Database additions:**
- `email_templates` table: `id, user_id, name, subject, body_html, category, usage_count, created_at`

#### 9.5 Advanced Search & Filters
**Priority: P2** | **Agents: api-backend, frontend-ui**

**Requirements:**
- Filter by: date range, sender, recipient, has attachments, is unread, tag, AI category, AI priority, AI intent
- Saved searches with sidebar shortcuts
- Search suggestions as you type
- Filter for archived threads (currently hardcoded to exclude)

**Database additions:**
- `saved_searches` table: `id, user_id, name, query_params (JSONB), created_at`

#### 9.6 Theme & Display Preferences
**Priority: P2** | **Agents: database-schema, frontend-ui**

**Requirements:**
- Manual theme toggle: Light / Dark / System (currently system-only)
- Inbox density: comfortable, compact, spacious
- Reading pane layout options
- Font size preference
- Persist to database (cross-device)

**Database additions:**
- `user_preferences` table: `id, user_id, theme, density, reading_pane, font_size, timezone, quiet_hours (JSONB), action_thresholds (JSONB), dnd_until, created_at, updated_at`

#### 9.7 Real-Time Sync
**Priority: P2** | **Agents: email-sync, frontend-ui**

**Requirements:**
- Gmail push via Google Pub/Sub webhooks
- Outlook push via Microsoft Graph subscriptions
- Supabase Realtime for live UI updates when new emails arrive
- "New messages" banner with one-click refresh
- Browser notification API integration

#### 9.8 Sync Health Monitoring
**Priority: P2** | **Agents: email-sync, api-backend, frontend-ui**

**Requirements:**
- Per-account sync status dashboard in settings
- Last sync time, next sync time, error count, token validity
- Alert on repeated sync failures
- Proper 429 handling with exponential backoff (currently marks token as invalid on rate limit)
- Retry queue for failed message syncs

#### 9.9 Prompt Versioning
**Priority: P2** | **Agents: ai-features, database-schema**

**Requirements:**
- Store prompts in database instead of hardcoded strings
- Version history for each prompt
- A/B testing: run two prompt versions and compare accuracy
- Rollback to previous version

**Database additions:**
- `ai_prompts` table: `id, name, version, system_prompt, model, active, accuracy_score, created_at`

#### 9.10 Migrate AI to OpenRouter via Edge Functions
**Priority: P1** | **Agents: ai-features**

Current state violates the architecture spec. All AI calls go directly to Anthropic from Next.js routes.

**Requirements:**
- Create Supabase Edge Functions for each AI operation (classify, summarize, suggest-reply, improve)
- Route all AI calls through OpenRouter (`https://openrouter.ai/api/v1/chat/completions`)
- Move API keys to Supabase secrets (remove from .env.local)
- Update Next.js AI routes to proxy through edge functions

---

## Personal Operating Modes

These modes change how the entire system behaves, not just the UI.

| Mode | Behavior |
|------|----------|
| **CEO Mode** | Only surface what needs your decision. Auto-handle everything else. Minimal inbox. |
| **Assistant Mode** | Aggressively clean, draft, and organize. Maximum automation. |
| **Sales Mode** | Prioritize leads, follow-ups, and prospects. Track deal-related threads. |
| **Support Mode** | Prioritize issues, SLAs, and customer threads. Track resolution times. |
| **Travel Mode** | Highlight logistics, itineraries, and time-sensitive items. Auto-reply to non-urgent. |
| **Deep Work Mode** | Only interrupt for critical messages. Queue everything else for batch review. |

**Database additions:**
- `user_preferences.operating_mode` — text, nullable
- `user_preferences.mode_config` — JSONB, per-mode settings

---

## Implementation Priority Order

### Tier 1 — Foundation (enables everything else)
1. Audit log (1.2)
2. Intent detection & confidence scoring (1.1)
3. Approval queue (1.3)
4. Undo system (1.4)
5. Migrate AI to OpenRouter (9.10)
6. Feedback loop (4.1)

### Tier 2 — Core Autonomy (first real autonomous value)
7. Auto-archive (2.1)
8. Auto-label (2.4)
9. Auto-draft replies (2.7)
10. Rules engine (3.1)
11. VIP & safe lists (3.2)
12. Daily executive summary (5.1)
13. Action item extraction (5.3)
14. Bulk actions (9.1)

### Tier 3 — Intelligence (makes it smart)
15. "Catch me up" mode (7.4)
16. Expanded reply modes (6.1)
17. Relationship intelligence (5.2)
18. Auto-unsubscribe (2.3)
19. Auto-follow-up (2.9)
20. Inbox health dashboard (5.5)
21. Attachment upload (9.2)

### Tier 4 — Power Features (makes it indispensable)
22. Auto-snooze (2.6)
23. Scheduled send (8.3)
24. Calendar intelligence (8.1)
25. Semantic search (7.1)
26. Risk & opportunity detection (5.4)
27. Chat with inbox (7.2)
28. Behavioral learning (4.2)
29. Tone learning per account (4.3)

### Tier 5 — Delight (makes it feel magical)
30. Auto-delete / auto-junk (2.2)
31. Auto-send (2.8)
32. Smart compose autocomplete (6.3)
33. "Run my inbox" mode (7.5)
34. Knowledge graph (7.3)
35. Personal operating modes
36. Context-aware drafts (6.2)
37. Auto-forward (2.10)
38. Auto-close stale threads (2.11)

---

## Success Metrics

### Core
- **Automation rate:** % of emails handled without user intervention (target: 60% within 30 days of use)
- **Time saved:** Hours/week saved vs. manual email management (target: 5+ hours/week)
- **Accuracy:** AI classification accuracy (target: 90%+ after learning period)
- **False positive rate:** % of auto-actions the user undoes (target: < 2%)

### Engagement
- **DAU/MAU ratio:** Daily active users / monthly active users (target: > 50%)
- **AI feature usage:** % of users who use AI features daily (target: 70%)
- **Draft acceptance rate:** % of AI drafts sent without edits (target: 40%+)
- **Approval queue clearance:** Average time to clear approval queue (target: < 4 hours)

### Performance
- **Page load:** < 1s
- **Sync latency:** < 30s from provider to inbox
- **AI response:** < 3s for classifications, < 5s for drafts
- **Zero data loss incidents**
- **< 1% error rate on email operations**

### Growth
- **Accounts connected per user:** Average 2+ (multi-account value)
- **Rules created per user:** Average 5+ after first month
- **Unsubscribes executed:** Track newsletter cleanup impact
