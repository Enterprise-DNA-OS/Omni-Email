# QA Health Check — Feature Manifest

Every feature in Omni Email is listed here with its critical files and specific checks.
The `qa-health-check` agent reads this file and systematically verifies each item.

## How to use

Run the `qa-health-check` agent. It will:
1. Read this manifest
2. For each feature, inspect the listed files
3. Run the listed checks (pattern matching, contract validation, etc.)
4. Report all issues found with severity and fix suggestions

---

## Global Checks (run on every feature)

These anti-patterns have caused production bugs. Check ALL components/routes for them:

### SSR Safety
- **Pattern**: `document.` or `window.` accessed outside `useEffect` in `"use client"` components
- **Why**: Crashes the page during server-side rendering (caused Settings page crash)
- **Check**: In every `.tsx` file with `"use client"`, grep for `document\.` and `window\.` — if found outside a `useEffect` callback or event handler, flag it

### Edge Function Auth
- **Pattern**: `Authorization: \`Bearer ${SUPABASE_ANON_KEY}\`` without service role fallback
- **Why**: Supabase sb_publishable_ keys are not JWTs; edge functions reject them (caused Chat 401)
- **Check**: In every `lib/ai/*.ts` file that calls a Supabase edge function, verify the Authorization header uses `SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_ANON_KEY`

### API Contract Match
- **Pattern**: Frontend sends different shape than backend validates
- **Why**: Rules Builder sent `{id, field, operator, value}` but API expected `{field, operator, value, logic}` (caused Rules not saving)
- **Check**: For each API route, compare the `fetch()` call in the component with the validation in the route handler

### Touch/Mobile
- **Pattern**: `opacity-0 group-hover:opacity-100` without mobile fallback
- **Why**: Actions invisible on touch devices (caused reply button being invisible)
- **Check**: Grep for `opacity-0.*group-hover:opacity-100` — must also have `sm:opacity-0` or mobile visibility

### Input Zoom Prevention
- **Pattern**: `<input>` or `<select>` with `text-sm` but no `text-base` at mobile breakpoint
- **Why**: iOS Safari auto-zooms on inputs below 16px
- **Check**: All input/select elements should use `text-base sm:text-sm` or just `text-base`

### Portal SSR Safety
- **Pattern**: `createPortal(content, document.body)` without mount guard
- **Why**: Crashes during SSR (caused Settings page crash)
- **Check**: Any use of `createPortal` must be guarded by a `mounted` state that flips in `useEffect`

### Unguarded .json() Calls
- **Pattern**: `await res.json()` without `.catch()` or try/catch
- **Why**: If an API returns non-JSON (HTML error page, auth redirect), `.json()` throws and crashes the component with no recovery (caused Settings page to stay broken all day)
- **Check**: Every `fetch().then(r => r.json())` or `await res.json()` in client components must have `.catch(() => ({}))` or be inside try/catch. API failures must degrade gracefully, never crash.

### Error Boundaries
- **Pattern**: Route groups without an `error.tsx` file
- **Why**: Without error boundaries, any runtime error shows a blank "This page couldn't load" with no retry option
- **Check**: Every route group under `app/(app)/` should have an `error.tsx`. At minimum, `app/(app)/error.tsx` must exist as a catch-all.

---

## Feature: Authentication & Accounts

### Login Page
- **Files**: `app/login/page.tsx`, `components/LoginForm.tsx`
- **Checks**:
  - Login form renders without errors
  - OAuth connect buttons call `/api/accounts/connect` with correct provider
  - Email input has `inputMode="email"` and `autoCapitalize="none"`

### OAuth Callback
- **Files**: `app/api/auth/oauth/callback/route.ts`, `lib/oauth/*.ts`
- **Checks**:
  - Route exists and exports GET handler
  - Handles both `code` and `error` query params
  - Redirects to `/settings?connected=true` on success

### Account Management
- **Files**: `app/api/accounts/route.ts`, `app/api/accounts/[id]/route.ts`
- **Checks**:
  - GET returns `{ accounts: Account[] }` shape
  - DELETE removes account
  - Auth check at top of each route

---

## Feature: Email Sync

### Sync Kick
- **Files**: `app/api/sync/kick/route.ts`
- **Checks**:
  - POST handler exists with auth check
  - Returns success response

### Cron Sync
- **Files**: `app/api/internal/sync/route.ts`, `netlify/functions/*.ts`
- **Checks**:
  - Validates `SYNC_CRON_SECRET` header
  - Background function exists in netlify/functions/

---

## Feature: Inbox

### Thread List
- **Files**: `components/InboxView.tsx`, `app/api/threads/route.ts`
- **Checks**:
  - API returns `{ threads: Thread[], total: number }`
  - Component handles empty state
  - Filter/search controls work (check fetch URL construction)
  - Bulk select actions (archive, delete, tag, read) call correct APIs
  - Checkbox and archive buttons visible on mobile (no hover-only)

### Thread Detail
- **Files**: `components/ThreadView.tsx`, `app/(app)/thread/[id]/page.tsx`
- **Checks**:
  - Page fetches thread data and passes to ThreadView
  - Reply box has ref for scroll-to
  - Send button shows loading state (`busy === "reply"`)
  - "Use this reply" from AI panel triggers toast + scroll
  - HTML email body wrapped in `overflow-x-auto`
  - Action buttons (archive, delete, unread) have loading states

### Reply/Send
- **Files**: `components/ThreadView.tsx` (reply section), `app/api/threads/[id]/reply/route.ts`
- **Checks**:
  - API accepts both JSON and FormData (for attachments)
  - Frontend shows "Sending..." toast before send
  - Frontend shows "Reply sent successfully!" on success
  - Frontend shows error message on failure
  - Draft saved to localStorage, cleared on send

---

## Feature: Compose

### Compose Modal
- **Files**: `components/ComposeModal.tsx`, `app/api/compose/send/route.ts`
- **Checks**:
  - Modal opens from FAB (ComposeButton rendered in AppShell)
  - Input fields use `text-base sm:text-sm` (iOS zoom prevention)
  - Send API accepts `to`, `subject`, `bodyText`, `bodyHtml`, `accountId`

### Forward Modal
- **Files**: `components/ForwardModal.tsx`
- **Checks**:
  - Opens when forward button clicked in thread
  - Uses bottom-sheet pattern on mobile (`items-end` → `md:items-center`)

---

## Feature: AI Panel

### Summarize
- **Files**: `components/AIPanel.tsx`, `app/api/ai/summarize/route.ts`
- **Checks**:
  - API route calls edge function with service role key auth
  - Component shows loading skeleton during fetch
  - Error state displayed on failure

### Suggest Reply
- **Files**: `components/AIPanel.tsx`, `app/api/ai/suggest-reply/route.ts`
- **Checks**:
  - Tone dropdown works (11 modes from `lib/ai/reply-modes.ts`)
  - "Use this reply" button calls `onInsertReply` prop
  - Custom instruction input works
  - Loading/error states present

### Improve Draft
- **Files**: `components/AIPanel.tsx`, `app/api/ai/improve/route.ts`
- **Checks**:
  - Only shows when draft text is non-empty
  - "Use improved version" calls `onInsertReply`

---

## Feature: Chat with Inbox

### Chat Panel
- **Files**: `components/ChatPanel.tsx`, `app/api/chat/route.ts`, `lib/ai/chat-with-inbox.ts`
- **Checks**:
  - Edge function auth uses `SUPABASE_SERVICE_ROLE_KEY`
  - Chat history persisted via `/api/chat/history`
  - Quick-prompt pills trigger messages
  - Send button has loading state
  - Error messages shown in chat bubble, not raw JSON

### Chat History
- **Files**: `app/api/chat/history/route.ts`
- **Checks**:
  - GET returns `{ messages: ChatMessage[] }`
  - Auth check present

---

## Feature: Rules Engine

### Rule Builder
- **Files**: `components/RuleBuilder.tsx`, `app/api/rules/route.ts`, `app/api/rules/[id]/route.ts`
- **Checks**:
  - **CONTRACT**: `handleSave` transforms conditions to API format: `{field, operator, value, logic}` (not `{id, field, operator, value}`)
  - **CONTRACT**: `handleSave` transforms actions to API format: `{type, params: object}` (not `{id, type, params: string}`)
  - `parseConditions` and `parseActions` convert backend → frontend when editing
  - `VALID_OPERATORS` in both API routes includes `not_contains`
  - Boolean fields (has_attachments) mapped to `value: true/false`

### Rules List
- **Files**: `components/RulesList.tsx`
- **Checks**:
  - Create/Edit opens RuleBuilder in Modal
  - Delete calls API with confirmation
  - Toggle enabled/disabled works

---

## Feature: Navigation

### Sidebar Nav
- **Files**: `components/SidebarNav.tsx`, `lib/nav/navItems.ts`
- **Checks**:
  - Imports `navSections` from shared module (not inline array)
  - Uses `useNavBadges()` hook (not inline fetch)
  - Collapsible sections work (toggle, persist to localStorage)
  - Auto-expands section containing active route

### Mobile Sidebar
- **Files**: `components/MobileSidebar.tsx`, `components/MobileHeader.tsx`
- **Checks**:
  - Imports same `navSections` from shared module
  - Uses same `useNavBadges()` hook
  - Has ALL nav items (same count as desktop)
  - Drawer width is `w-[min(288px,85vw)]` (not fixed `w-72`)
  - Focus trap implemented
  - Close on Escape
  - Touch targets ≥ 44px

### Compose FAB
- **Files**: `components/AppShell.tsx`, `components/ComposeButton.tsx`
- **Checks**:
  - `<ComposeButton variant="fab" />` rendered in AppShell
  - FAB uses `lg:hidden` (only shows on mobile)
  - Has safe-area-inset-bottom offset

---

## Feature: Settings

### Settings Page
- **Files**: `app/(app)/settings/page.tsx`
- **Checks**:
  - Page loads without crash (all child components valid)
  - Account connect/remove works
  - Tag create/delete works
  - Sync kick button works
  - All child components (SenderClassifications, ModeSelector, AutoSendConfig, AuditLogViewer) imported correctly

### Modal (shared)
- **Files**: `components/Modal.tsx`
- **Checks**:
  - `mounted` state guard before `createPortal` (SSR safety)
  - Body scroll lock in useEffect
  - Focus trap
  - Escape to close

---

## Feature: Calendar

### Calendar Page
- **Files**: `app/(app)/calendar/page.tsx`, `app/api/events/route.ts`
- **Checks**:
  - Defaults to day view on mobile (`window.innerWidth < 768`)
  - Week view has `overflow-x-auto` wrapper
  - API returns events with proper date format

---

## Feature: Tasks

### Tasks View
- **Files**: `components/TasksView.tsx`, `app/api/tasks/route.ts`
- **Checks**:
  - Dismiss button visible on mobile (not hover-only)
  - Checkbox has adequate touch target
  - CRUD operations work (create, complete, dismiss)

---

## Feature: Approvals

### Approval Queue
- **Files**: `components/ApprovalQueue.tsx`, `app/api/approval-queue/route.ts`
- **Checks**:
  - Approve/Reject buttons are full-width on mobile (not compressed inline)
  - Batch toolbar stacks on mobile
  - Count badge updates

---

## Feature: Analytics

### Inbox Health Dashboard
- **Files**: `components/InboxHealthDashboard.tsx`, `app/api/analytics/route.ts`
- **Checks**:
  - Heatmap has condensed mobile view
  - Two-column grid uses `md:grid-cols-2` (not `lg:`)

---

## Feature: Contacts

### Contacts View
- **Files**: `components/ContactsView.tsx`, `app/api/contacts/route.ts`
- **Checks**:
  - Search input uses `type="search" inputMode="search"`
  - External link icon visible on mobile

### Relationship Dashboard
- **Files**: `components/RelationshipDashboard.tsx`
- **Checks**:
  - Companies table wrapped in `overflow-x-auto`

---

## Feature: Snoozed/Scheduled

### Snooze
- **Files**: `components/SnoozeButton.tsx`, `app/api/threads/[id]/snooze/route.ts`
- **Checks**:
  - Dropdown doesn't overflow viewport on mobile
  - API accepts ISO-8601 `snoozeUntil`

### Scheduled View
- **Files**: `components/ScheduledView.tsx`
- **Checks**:
  - datetime-local edit form stacks on mobile
  - Cancel/reschedule buttons have loading states

---

## Feature: Alerts

### Alerts View
- **Files**: `components/AlertsView.tsx`, `app/api/threads/alerts/route.ts`
- **Checks**:
  - Tab bar uses `px-4 sm:px-6` (not fixed px-6)
  - Timestamp inside content column on mobile

---

## Feature: Drafts

### Drafts List
- **Files**: `components/DraftsList.tsx`
- **Checks**:
  - Edit/Send/Discard buttons visible on mobile (not hover-only)
  - Edit modal footer buttons stack on mobile

---

## Feature: Daily Summary / Catch Me Up

### Summary
- **Files**: `components/DailySummary.tsx`, `app/api/summaries/route.ts`
- **Checks**:
  - Edge function auth uses service role key
  - Stats grid handles odd number of items on mobile

### Catch Me Up
- **Files**: `components/CatchMeUp.tsx`, `app/api/ai/catch-me-up/route.ts`
- **Checks**:
  - Edge function auth uses service role key
  - Footer stacks on mobile
  - Action buttons have adequate touch targets

---

## Feature: Toast System

### Toast
- **Files**: `components/Toast.tsx`
- **Checks**:
  - Full-width bottom on mobile, top-right on desktop
  - Max 3 toasts visible
  - Dismiss button has adequate touch target

---

## Feature: Command Palette

### Command Palette
- **Files**: `components/CommandPalette.tsx`
- **Checks**:
  - Positioned `top-4` on mobile (above keyboard)
  - Results max-height uses `max-h-[50vh]` on mobile
  - Keyboard shortcuts hidden on mobile

---

## Feature: Dropdown (shared)

### Dropdown
- **Files**: `components/Dropdown.tsx`
- **Checks**:
  - `touchstart` listener for outside-tap dismissal
  - `max-h-[60vh] overflow-y-auto` on menu
  - Trigger is a `button` (not div) with `aria-haspopup`
