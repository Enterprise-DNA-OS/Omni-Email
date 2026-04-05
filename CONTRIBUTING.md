# Contributing to Omni Email

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)
- An [OpenRouter](https://openrouter.ai) API key

### Getting Started

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/Omni-Email.git
cd Omni-Email

# Install dependencies
npm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your credentials

# Set up database
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push

# Deploy edge functions
npx supabase functions deploy

# Start dev server
npm run dev
```

## Project Structure

```
app/           Next.js pages and API routes
components/    React components (55+)
hooks/         Custom React hooks
lib/           Business logic modules
supabase/      Migrations and edge functions
AGENTS.md      Agent architecture definitions
```

See `CLAUDE.md` and `AGENTS.md` for detailed architecture documentation.

## Making Changes

### Before You Start

1. Check existing [issues](https://github.com/Enterprise-DNA-OS/Omni-Email/issues) for the feature/bug
2. Open an issue to discuss significant changes before implementing
3. Read `CLAUDE.md` for coding conventions and patterns

### Coding Standards

- **TypeScript strict mode** -- no `any` types
- **Tailwind CSS 4 only** -- no inline styles, no CSS modules
- **Lucide React** -- the only icon library
- **`@/` imports** -- always use the path alias, never relative `../../../`
- **Mobile-first** -- base styles are for mobile, add `sm:`, `md:`, `lg:` for larger screens

### Key Patterns to Follow

**Auth check** -- Every API route starts with:
```typescript
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
```

**Supabase clients:**
- `createClient()` for reads (RLS-scoped to user)
- `createAdminClient()` for writes that need to bypass RLS

**Edge function auth:**
```typescript
Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_ANON_KEY}`,
```

**Mobile requirements:**
- Touch targets >= 44px
- Inputs use `text-base sm:text-sm` (prevents iOS zoom)
- No hover-only actions -- use `opacity-100 sm:opacity-0 sm:group-hover:opacity-100`
- Modals use bottom-sheet pattern on mobile

**JSON safety** -- All `.json()` calls in client components must have `.catch()`:
```typescript
const data = await res.json().catch(() => ({}));
```

### Verification

Before submitting a PR, run:

```bash
# Type check
npx tsc --noEmit

# Build
npx next build
```

Both must pass with zero errors.

## Pull Request Process

1. **Fork** the repo and create a feature branch
2. **Make your changes** following the coding standards above
3. **Verify** with `npx tsc --noEmit && npx next build`
4. **Write a clear PR description** explaining what and why
5. **Submit** -- maintainers will review within a few days

### PR Title Convention

Use descriptive titles that explain the change:
- `Add: snooze reminder notifications`
- `Fix: settings page crash on auth failure`
- `Improve: inbox loading performance with pagination`

### What Makes a Good PR

- Focused on one thing (don't mix features with refactors)
- Includes context on why, not just what
- Doesn't break existing features
- Follows the existing code patterns
- Works on mobile

## Reporting Bugs

Open an issue with:
1. What you expected to happen
2. What actually happened
3. Steps to reproduce
4. Browser/device info
5. Screenshots if applicable

## Feature Requests

Open an issue describing:
1. The problem you're trying to solve
2. Your proposed solution
3. Alternatives you've considered

## AI-Assisted Development

AI-assisted development is welcome and encouraged. Many contributors use tools like:

- **Claude Code** -- the project includes agent definitions in `AGENTS.md` for specialized development
- **Cursor** / **Copilot** -- great for working within established patterns
- Any other AI coding tool

When submitting AI-assisted PRs, please review the generated code for correctness and ensure it follows the project's conventions.

### Agent Architecture for Contributors

This project uses a multi-agent architecture defined in `AGENTS.md`. Each agent owns a specific domain (database, auth, email sync, API, AI, frontend, etc.). When contributing, check which domain your change falls into -- the agent definitions contain useful context about patterns and ownership boundaries.

## Code of Conduct

Be respectful. We're all here to build something great. Harassment, discrimination, and toxic behavior will not be tolerated.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
