# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Omni Email, please report it responsibly. **Do not open a public GitHub issue for security vulnerabilities.**

### How to Report

Email us at **hello@enterprisedna.co** with:

1. A description of the vulnerability
2. Steps to reproduce the issue
3. The potential impact
4. Any suggested fixes (optional)

### What to Expect

- **Acknowledgment** within 48 hours of your report
- **Status update** within 7 days with our assessment
- **Resolution timeline** communicated once we've triaged the issue
- **Credit** in the release notes (unless you prefer to remain anonymous)

### Scope

The following are in scope:

- Authentication and authorization bypasses
- Token or credential exposure
- SQL injection or other injection attacks
- Cross-site scripting (XSS) or cross-site request forgery (CSRF)
- Sensitive data exposure in API responses
- Insecure default configurations

### Out of Scope

- Vulnerabilities in third-party dependencies (report these upstream)
- Issues requiring physical access to a user's device
- Social engineering attacks
- Denial of service attacks

## Security Best Practices for Self-Hosters

- Never commit `.env.local` or any file containing secrets
- Use strong, unique values for `TOKEN_ENCRYPTION_KEY` and `OAUTH_STATE_SECRET`
- Store AI API keys in Supabase secrets, not in environment variables
- Keep dependencies updated with `npm audit` and `npm update`
- Enable Row Level Security (RLS) on all Supabase tables
- Use HTTPS in production

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |
| Older   | No        |

We only provide security fixes for the latest release.
