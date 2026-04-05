<p align="center">
  <img src="public/logo.png" alt="Omni Email" width="80" height="80" />
</p>

<h1 align="center">Omni Email</h1>

<p align="center">
  <strong>The open-source AI email client that manages your inbox for you.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a> -- a leading data and AI education company.
</p>

<p align="center">
  <a href="#features">Features</a> &bull;
  <a href="#built-with-ai">Built with AI</a> &bull;
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#self-hosting">Self-Hosting</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#developing-with-ai-tools">Dev with AI</a> &bull;
  <a href="#contributing">Contributing</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-61dafb?style=flat-square" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?style=flat-square" alt="Supabase" />
  <img src="https://img.shields.io/badge/Tailwind-4-38bdf8?style=flat-square" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is Omni Email?

Omni Email is a unified email and calendar client for **Gmail** and **Outlook** that uses AI to classify, prioritize, and act on your emails. It's not just an email viewer with an AI bolt-on -- it's an **agentic inbox** where AI proactively manages your email workflow.

Think Superhuman meets AI autopilot, fully open source.

### Why another email client?

Most AI email tools bolt ChatGPT onto a reply button. Omni Email is different:

- **Agentic by design** -- AI classifies every email with intent, priority, and category the moment it syncs
- **Quick Rules** -- One click from any email to create a rule that instantly applies across your entire inbox
- **Run My Inbox** -- Let the AI autonomously handle your email for a set period (all actions logged and reversible)
- **18 edge functions** -- AI operations run on Supabase Edge Functions, keeping API keys secure and response times fast
- **OpenRouter gateway** -- Swap AI models by changing a single string, no code changes needed
- **107 API endpoints** -- A comprehensive backend covering every email workflow you can imagine
- **Self-hostable** -- Bring your own API keys, own your data

---

## Built with AI

> **This entire application was built using AI-assisted development tools.** We believe in the future of AI-augmented software development, and this project is proof of what's possible. Over 36 database migrations, 107 API endpoints, 18 edge functions, and 55+ React components -- all developed with AI as a core part of the workflow.

### AI Development Tools Used

| Tool | Role |
|------|------|
| **[Claude Code](https://claude.ai/claude-code)** by Anthropic | Primary development tool. Claude Code acted as the AI coding agent, building features end-to-end across the full stack -- from database migrations to API routes to React components. Six specialist agents (defined in `AGENTS.md`) each owned a specific domain of the codebase. |
| **[Cursor](https://cursor.com)** | AI-powered IDE used throughout development for code navigation, inline edits, and rapid iteration. Cursor's deep codebase understanding made refactoring and debugging significantly faster. |
| **[GitHub Copilot](https://github.com/features/copilot)** | AI pair programming assistant used for code completion, boilerplate generation, and pattern matching across the codebase. |

Enterprise DNA is committed to demonstrating that AI tools are not just productivity boosters -- they are a new way to build software. This project serves as a reference implementation for AI-assisted full-stack development.

---

## Features

### Core Email
- Unified inbox for Gmail and Outlook accounts
- Rich HTML email rendering with attachment support
- Compose, reply, and forward with rich text editor
- Thread-based conversation view
- Full-text search with PostgreSQL `tsvector`
- Drag-and-drop file attachments (25 MB limit)
- Draft auto-save to localStorage
- Bulk operations (archive, delete, tag multiple threads)
- Snooze and scheduled send
- Unread count badges

### AI Classification
- Every email automatically classified with:
  - **Intent** -- reply, archive, delete, delegate, schedule, review, follow up, etc.
  - **Priority** -- urgent, high, normal, low, ignore
  - **Category** -- notification, marketing, personal, security, etc.
  - **Confidence score** -- how sure the AI is about its classification
- AI-generated tags for each thread
- Risk and opportunity signal detection

### AI Assistant (per-thread)
- **Summarize** any thread in one click
- **Suggest reply** with 11 tone modes (Professional, Friendly, Brief, Executive, Sales, Legal Safe, etc.)
- **Improve draft** -- paste your draft, get a polished version
- **Context-aware drafting** -- AI learns your writing style from previous emails
- **Custom instructions** -- "mention the deadline, keep it under 2 paragraphs"
- Thumbs up/down feedback to improve over time

### Quick Rules
- One-click rule creation from any email:
  - Block sender (delete all from this address)
  - Auto-archive from domain
  - Delete all from domain
  - Archive by AI category
- Rules apply **immediately** to all matching emails in your inbox (up to 500)
- Rules also run automatically on future incoming emails
- AI-suggested rules based on your email patterns

### Catch Me Up
- AI-generated briefing of what happened while you were away
- Threads grouped by: Urgent, Needs Decision, Updates, Auto-Handled
- Quick rule buttons on every thread for fast triage
- Stats: total new, auto-handled count, estimated clear time

### Chat with Inbox
- Natural language interface to your inbox
- "What needs my attention?" / "Summarize today" / "Draft a reply to..."
- 14 action types: archive, tag, snooze, create rule, draft reply, and more
- Semantic search powered by vector embeddings

### Automation
- **Rules Engine** -- Visual rule builder with conditions and actions
- **Operating Modes** -- CEO Mode, Focus Mode, Vacation Mode, etc. (7 modes)
- **Auto-Send** -- AI can send replies automatically (with confidence threshold and kill switch)
- **Approval Queue** -- Review AI-proposed actions before they execute
- **Sender Classifications** -- VIP, safe, blocked, never-auto-send lists
- **Run My Inbox** -- Full autonomous email management for a set time period

### Calendar
- Week and day views synced from Gmail/Outlook
- **Meeting Briefs** -- AI-generated prep notes before meetings with participant context and agenda analysis
- Auto-generated meeting brief settings

### Analytics
- Inbox health dashboard with volume charts
- Busiest hours heatmap
- Response time tracking
- Sender and category breakdowns
- Automation rate metrics
- Enhanced daily analytics aggregation

### Cold Email Blocker
- AI-powered cold email detection
- Configurable sensitivity settings
- Automatic quarantine of suspected cold emails
- Whitelist/blacklist management
- Test mode to preview detection before enabling

### Newsletter Manager
- Detect newsletters and recurring sender patterns
- Bulk unsubscribe with one click
- Newsletter digest view
- Unsubscribe activity log

### Document Filing
- AI-powered document classification from email attachments
- Configurable filing folders and rules
- Cloud storage integration
- File categorization by type and project

### Knowledge Base
- Save important emails and snippets for quick reference
- Searchable knowledge repository
- Statistics on saved content
- Quick insert into compose window

### Email Digests
- Customizable digest schedules (daily, weekly)
- AI-generated digest summaries
- Per-digest entry management
- Generate on-demand digests

### Additional Features
- Daily executive summary with AI analysis
- Task extraction from emails
- Follow-up tracker ("Waiting On") with send reminders
- Relationship intelligence (contact context from email history)
- Behavior signal detection (tone shifts, urgency patterns)
- Tone learning (AI adapts to your writing style)
- Audit log with undo for every action
- Scheduled messages with queue management

---

## Screenshots

> Screenshots coming soon. Contributions of screenshots are welcome -- if you're running Omni Email, open a PR with screenshots for this section!

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4, Lucide icons |
| Database | Supabase (PostgreSQL) with RLS |
| Auth | Supabase Auth (magic link / email OTP) |
| AI Gateway | OpenRouter (swap models via config) |
| AI Runtime | 18 Supabase Edge Functions (Deno) |
| Email Sync | Gmail API + Microsoft Graph API |
| Search | PostgreSQL full-text search + vector embeddings |
| Deployment | Netlify (frontend) + Supabase (backend) |

---

## Quick Start

### Prerequisites

- **Node.js 18+** (20+ recommended)
- A [Supabase](https://supabase.com) account and project
- An [OpenRouter](https://openrouter.ai) API key (for AI features)
- Google OAuth credentials (for Gmail integration)
- Microsoft Azure app registration (for Outlook integration)

### Step 1: Clone and Install

```bash
git clone https://github.com/Enterprise-DNA-OS/Omni-Email.git
cd Omni-Email
npm install
```

### Step 2: Supabase Setup

#### 2a. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in (or create an account)
2. Click **New Project**
3. Choose your organization, give the project a name (e.g., `omni-email`), set a database password, and select a region
4. Wait for the project to finish provisioning (~2 minutes)

#### 2b. Get Your Project Credentials

1. In your Supabase dashboard, go to **Settings > API**
2. Copy these values -- you'll need them for `.env.local`:
   - **Project URL** (e.g., `https://abcdefgh.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)
   - **service_role key** (starts with `eyJ...`) -- keep this secret
3. Go to **Settings > General** and copy your **Reference ID** (e.g., `abcdefgh`)

#### 2c. Install Supabase CLI and Link Your Project

```bash
# Install the Supabase CLI globally
npm install -g supabase

# Login to Supabase (opens browser for authentication)
npx supabase login

# Link this project to your Supabase project
npx supabase link --project-ref YOUR_REFERENCE_ID
```

#### 2d. Push Database Migrations

This will create all 36 tables, indexes, RLS policies, and triggers:

```bash
npx supabase db push
```

#### 2e. Deploy Edge Functions

Deploy all 18 AI edge functions to your Supabase project:

```bash
npx supabase functions deploy
```

This deploys the following functions: `ai-analyze-style`, `ai-catch-me-up`, `ai-chat`, `ai-classify`, `ai-cold-email`, `ai-context-draft`, `ai-daily-summary`, `ai-digest`, `ai-embeddings`, `ai-extract-tasks`, `ai-file-classifier`, `ai-follow-up`, `ai-improve`, `ai-meeting-brief`, `ai-suggest-reply`, `ai-suggest-rules`, `ai-summarize`, and `sync-email`.

#### 2f. Set Supabase Secrets

AI API keys and shared secrets are stored as Supabase secrets (not in `.env.local`):

```bash
npx supabase secrets set OPENROUTER_API_KEY=your_openrouter_api_key
npx supabase secrets set TOKEN_ENCRYPTION_KEY=your_32_byte_hex_key
npx supabase secrets set SYNC_CRON_SECRET=your_random_secret_string
```

To generate a secure 32-byte hex key for `TOKEN_ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 3: Google OAuth Setup (Gmail)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a **new project** (or select an existing one)
3. Navigate to **APIs & Services > Library**
4. Search for and enable these APIs:
   - **Gmail API**
   - **Google Calendar API**
5. Navigate to **APIs & Services > Credentials**
6. Click **Create Credentials > OAuth 2.0 Client ID**
7. If prompted, configure the **OAuth consent screen** first:
   - Choose **External** user type
   - Fill in app name, user support email, and developer contact
   - Add scopes: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/gmail.modify`, `https://www.googleapis.com/auth/calendar.readonly`
   - Add your email as a test user (while in testing mode)
8. Back in **Credentials**, create the OAuth 2.0 Client ID:
   - Application type: **Web application**
   - Name: `Omni Email` (or anything)
   - Authorized redirect URIs: `http://localhost:3000/api/auth/oauth/callback`
9. Copy the **Client ID** and **Client Secret**

### Step 4: Microsoft OAuth Setup (Outlook)

1. Go to [Azure Portal](https://portal.azure.com/) > **Azure Active Directory** > **App registrations**
2. Click **New registration**
   - Name: `Omni Email`
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts** (for multi-tenant)
   - Redirect URI: Select **Web** platform, enter `http://localhost:3000/api/auth/oauth/callback`
3. After registration, copy the **Application (client) ID**
4. Go to **Certificates & secrets** > **New client secret**
   - Add a description and select an expiry period
   - Copy the **Value** (not the Secret ID) immediately -- it won't be shown again
5. Go to **API permissions** > **Add a permission** > **Microsoft Graph** > **Delegated permissions**
   - Add: `Mail.ReadWrite`, `Calendars.Read`, `User.Read`, `offline_access`
   - Click **Grant admin consent** if you're an admin (otherwise users will see a consent prompt)

### Step 5: OpenRouter Setup (AI Features)

1. Go to [openrouter.ai](https://openrouter.ai) and create an account
2. Navigate to **Keys** and generate a new API key
3. Add credit to your account (AI features use per-request pricing)
4. Set the key as a Supabase secret (already done in Step 2f):
   ```bash
   npx supabase secrets set OPENROUTER_API_KEY=your_key_here
   ```
5. The default model is **Claude Sonnet** via OpenRouter. To change the model, update the model string in the edge function code -- no other changes needed thanks to the OpenRouter gateway pattern.

### Step 6: Configure Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Encryption (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
TOKEN_ENCRYPTION_KEY=your_32_byte_hex_key
OAUTH_STATE_SECRET=your_random_secret_string

# Google OAuth (Gmail)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Microsoft OAuth (Outlook)
MICROSOFT_CLIENT_ID=your_azure_application_client_id
MICROSOFT_CLIENT_SECRET=your_azure_client_secret_value
MICROSOFT_TENANT=common

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Sync
SYNC_CRON_SECRET=your_random_secret_string
```

### Step 7: Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with a magic link (email OTP). Then connect your Gmail or Outlook account from Settings.

---

## Self-Hosting

### Docker Compose (recommended)

```bash
cp .env.example .env.local
# Edit .env.local with your credentials (see Step 6 above)

docker compose up -d
```

This starts the Next.js app on port 3000. You still need an external Supabase project for the database and edge functions.

### Manual Deployment

Omni Email can be deployed to any platform that supports Next.js:

- **Netlify** -- `netlify deploy`
- **Vercel** -- `vercel deploy`
- **Docker** -- use the included `Dockerfile`
- **Node.js** -- `npm run build && npm start`

### Production Deployment Checklist

When deploying to production, make sure to:

1. **Update environment variables** -- Set all `.env.local` variables in your hosting platform's environment configuration
2. **Update `NEXT_PUBLIC_APP_URL`** -- Change from `http://localhost:3000` to your production domain (e.g., `https://mail.yourdomain.com`)
3. **Update OAuth redirect URIs** -- In both Google Cloud Console and Azure Portal, add your production redirect URI:
   ```
   https://mail.yourdomain.com/api/auth/oauth/callback
   ```
4. **Configure custom domain** -- Set up your domain in your hosting platform (Netlify/Vercel) and configure DNS
5. **Enable HTTPS** -- Ensure your production domain uses HTTPS (required for OAuth)
6. **Set up cron sync** -- Configure a cron job or scheduled function to hit `/api/internal/sync` periodically for background email sync. Protect it with your `SYNC_CRON_SECRET`.
7. **Google OAuth consent screen** -- If you want users beyond your test list, submit your OAuth consent screen for verification by Google
8. **Monitor edge functions** -- Check Supabase dashboard > Edge Functions for invocation logs and errors

---

## Architecture

### Project Structure

```
app/
  layout.tsx                    Root layout
  (app)/                        Protected app shell (21+ pages)
  api/                          107 API route handlers
components/                     55+ React components
hooks/                          Custom React hooks
lib/
  ai/                           AI client + 15 modules
  email/                        Sync engine + outbound
  calendar/                     Calendar sync
  oauth/                        OAuth flows (Google + Microsoft)
  crypto/                       Token encryption (AES-256-GCM)
  rules/                        Rules engine
  automation/                   Auto-archive, auto-delete, auto-send
supabase/
  migrations/                   36 SQL migrations
  functions/                    18 edge functions + shared utilities
```

### Edge Functions (18)

All AI processing runs on Supabase Edge Functions (Deno runtime), keeping API keys secure server-side:

| Function | Purpose |
|----------|---------|
| `ai-analyze-style` | Learn a user's writing style from sent emails |
| `ai-catch-me-up` | Generate "what did I miss" briefings |
| `ai-chat` | Power the natural language "Chat with Inbox" feature |
| `ai-classify` | Classify emails by intent, priority, and category |
| `ai-cold-email` | Detect cold/spam emails using AI analysis |
| `ai-context-draft` | Generate context-aware reply drafts |
| `ai-daily-summary` | Create daily executive email summaries |
| `ai-digest` | Generate digest summaries for grouped emails |
| `ai-embeddings` | Create vector embeddings for semantic search |
| `ai-extract-tasks` | Pull actionable tasks from email content |
| `ai-file-classifier` | Classify documents/attachments for filing |
| `ai-follow-up` | Detect emails needing follow-up responses |
| `ai-improve` | Polish and improve draft email text |
| `ai-meeting-brief` | Generate pre-meeting briefing documents |
| `ai-suggest-reply` | Generate reply suggestions with tone control |
| `ai-suggest-rules` | Suggest inbox rules based on email patterns |
| `ai-summarize` | Summarize email threads |
| `sync-email` | Background email synchronization |

### Database Tables (36 migrations)

The database is organized across 36 migrations, grouped by domain:

**Core Email**
- `email_accounts` -- Connected Gmail/Outlook accounts with encrypted tokens
- `threads` -- Email threads with AI classification, full-text search vectors
- `messages` -- Individual email messages within threads
- `attachments` -- File attachment metadata
- `drafts` -- Saved draft emails

**AI & Classification**
- `ai_feedback` -- User thumbs up/down on AI suggestions
- `behavior_signals` -- Detected tone shifts and urgency patterns
- `tone_profiles` -- Learned user writing styles
- `thread_embeddings` -- Vector embeddings for semantic search
- `risk_opportunity_signals` -- Detected risks and opportunities

**Automation**
- `rules` -- User-defined inbox rules with conditions and actions
- `sender_classifications` -- VIP, safe, blocked, never-auto-send lists
- `auto_archive_settings` -- Auto-archive configuration
- `auto_send_config` -- Auto-send settings with confidence thresholds
- `operating_modes` -- CEO Mode, Focus Mode, Vacation Mode, etc.
- `run_inbox_sessions` -- Run My Inbox autonomous session tracking
- `approval_queue` -- AI-proposed actions awaiting user review

**Organization**
- `tags` -- User-defined tags for threads
- `contacts` -- Extracted contact information with relationship intelligence
- `tasks` -- Tasks extracted from emails
- `follow_ups` -- Follow-up tracking with reminders
- `scheduled_messages` -- Messages queued for future sending
- `auto_snooze_settings` -- Snooze configuration

**Features**
- `daily_summaries` -- Generated daily executive summaries
- `catch_me_up_sessions` -- Catch Me Up briefing sessions
- `meeting_briefs` -- AI-generated meeting preparation documents
- `cold_email_settings` -- Cold email blocker configuration
- `document_filing` -- Filed document records
- `filing_config` -- Filing rules and folder configuration
- `knowledge_base` -- Saved snippets and reference emails
- `email_digests` -- Digest configuration and generated digests
- `newsletter_subscriptions` -- Detected newsletters and unsubscribe tracking
- `chat_history` -- Chat with Inbox conversation history

**System**
- `audit_log` -- Every action logged with undo capability
- `analytics_daily` -- Aggregated daily analytics data

### AI Flow

```
User action
  -> Next.js API route (auth + validation)
    -> Supabase Edge Function (AI processing)
      -> OpenRouter (LLM call)
    <- Structured response
  <- JSON to frontend
```

All AI API keys live in Supabase secrets, never in `.env.local`. The OpenRouter gateway means you can switch between Claude, GPT-4, Gemini, Llama, or any other model by changing a single string.

### Database Design

- **36 migrations** managing the full schema evolution
- **Row Level Security (RLS)** on all user-facing tables
- **JSONB** for flexible data: recipients, labels, attachments, sync state
- **Full-text search** with `tsvector` + GIN indexes (weighted: subject > sender > body)
- **Vector embeddings** for semantic search via `pgvector`
- **UUIDs** for all primary keys
- **Soft operations** -- archive uses `archived_at` timestamp (null = active)

---

## Developing with AI Tools

This project was designed from the ground up to work well with AI development tools. Here's how to use them effectively.

### Using Claude Code

Omni Email includes two key files that make Claude Code extremely effective:

- **`CLAUDE.md`** -- Project-wide instructions, conventions, and architecture overview. Claude Code reads this automatically and follows all conventions (import aliases, auth patterns, response formats, styling rules, etc.)
- **`AGENTS.md`** -- Defines 6 specialist agents with clear ownership boundaries

#### The 6 Specialist Agents

| Agent | Domain | Key Files |
|-------|--------|-----------|
| **Database & Schema** | Migrations, RLS, indexes, triggers | `supabase/migrations/` |
| **Auth & Security** | OAuth, tokens, encryption, sessions | `lib/oauth/`, `lib/crypto/` |
| **Email Sync & Delivery** | Provider sync, sending, attachments | `lib/email/`, `lib/calendar/` |
| **API & Backend Logic** | Route handlers, validation, queries | `app/api/` |
| **AI Features** | OpenRouter, edge functions, prompts | `lib/ai/`, `supabase/functions/` |
| **Frontend & UI** | Components, pages, layouts, styling | `components/`, `app/(app)/` |

When using Claude Code, you can invoke the right specialist agent for any task. The agents coordinate through ownership boundaries -- for example, if you're building a feature that needs a new database column and a new API endpoint, start with the Database agent, then the API agent, then the Frontend agent.

### Using Cursor

1. Open the project folder in Cursor
2. Cursor will auto-detect TypeScript, Tailwind, and the project structure
3. The `CLAUDE.md` file serves as excellent context for Cursor's AI features too
4. Use Cursor's inline edit (Cmd+K) for quick changes and the chat panel for larger refactors
5. Cursor works especially well for the React components in `components/` and the API routes in `app/api/`

### Using GitHub Copilot

- Copilot will pick up patterns from the existing codebase (auth checks, response formats, Supabase client usage)
- The consistent conventions in `CLAUDE.md` mean Copilot suggestions are more accurate because the codebase is uniform
- Works well for writing new API routes, components, and test files that follow established patterns

### Contributing with AI Tools

We encourage contributors to use AI tools! If you're submitting a PR:

1. Feel free to mention which AI tools you used -- we see it as a positive
2. Follow the conventions in `CLAUDE.md` (AI tools will do this automatically if you give them the file as context)
3. Use the specialist agent boundaries in `AGENTS.md` to understand which files belong together
4. Run `npx tsc --noEmit` and `npx next build` before submitting to catch type errors

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

**TL;DR:**

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes (use AI tools -- we encourage it!)
4. Run `npx tsc --noEmit` and `npx next build` to verify
5. Commit with a descriptive message
6. Push to your fork and open a PR

---

## License

[MIT](LICENSE) -- use it however you want.

---

## Acknowledgments

- Built with [Claude Code](https://claude.ai/claude-code) by Anthropic
- Developed in [Cursor](https://cursor.com) -- the AI-powered IDE
- AI pair programming by [GitHub Copilot](https://github.com/features/copilot)
- AI gateway powered by [OpenRouter](https://openrouter.ai)
- Database and auth by [Supabase](https://supabase.com)
- Deployed on [Netlify](https://netlify.com)

---

<p align="center">
  Built with pride by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>
  <br />
  Powered by AI-assisted development with Claude Code, Cursor, and GitHub Copilot
</p>
