# StreamLearn — Security Documentation

## Security Model

StreamLearn is a production-grade edtech platform built with a layered security model. This document describes the security controls in place and how to deploy safely.

---

## Authentication

| Property | Implementation |
|---|---|
| Password hashing | scrypt (N=16384, r=8, p=1, keylen=64) — OWASP minimum |
| Token format | JWT HS256 — access (15m) + refresh (7d) |
| Cookie security | HttpOnly + Secure + SameSite=Strict + Path scoping |
| Timing attacks | timingSafeEqual on all password and token comparisons |
| Session storage | Redis + PostgreSQL (dual layer, SHA-256 hash stored) |
| Token rotation | Refresh token rotated on every use — old token revoked |

### Token lifecycle

```
Login → signAccessToken (15m) + signRefreshToken (7d)
     → store hashed refresh token in Redis + DB
     → set HttpOnly cookies

Every 14 min (client) → POST /api/auth/refresh
     → verify refresh token (Redis hash compare)
     → rotate session → issue new pair

Logout → revoke session in Redis + DB
       → clear both cookies (always returns 200)

Password reset → revokeAllSessionsForUser → force re-login on all devices
```

---

## Authorisation (RBAC)

Three roles with strict separation:

| Role | Capabilities |
|---|---|
| STUDENT | Enroll, watch lessons, take quizzes, download own certificates |
| TUTOR | Create/edit own courses, upload videos, create quizzes |
| ADMIN | Full system access, user management, audit log, export data |

**Enforcement layers:**

1. **Middleware** (Edge) — JWT verify + role check on every request
2. **Route handlers** — `requireAdmin()`, `requireTutor()`, `requireOwnerOrAdmin()`
3. **Database** — row-level filtering (`WHERE user_id = $1`)

---

## Input Security

| Vector | Control |
|---|---|
| SQL injection | Drizzle ORM parametrised queries everywhere |
| XSS | Input sanitisation (`sanitiseText`), CSP header, React escaping |
| Path traversal | File keys validated against expected prefixes |
| CSRF | SameSite=Strict cookies + Origin header validation |
| Upload abuse | MIME type + extension + file size validation |
| Rate limiting | Redis INCR sliding window on auth, payment, upload, email routes |

---

## API Security

| Endpoint class | Controls |
|---|---|
| Auth endpoints | Rate limit (10/min/IP), timing-safe comparison, generic error messages |
| Payment init | Idempotency key (Redis 24h), rate limit (5/min/user) |
| Webhook endpoints | HMAC-SHA512 (Paystack) / HMAC-SHA256 (Mux) signature verify |
| File uploads | Pre-signed R2 URLs (15m TTL), files go directly to R2 (never proxied) |
| Admin routes | requireAdmin() + RBAC middleware — double enforced |
| SSE | JWT-gated before stream opens |

---

## Transport Security

- TLS 1.2+ enforced by Render.com (termination at load balancer)
- HSTS header: `max-age=31536000; includeSubDomains; preload`
- All cookies are `Secure` in production
- API responses include `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` prevents clickjacking

---

## Content Security Policy

```
default-src 'self';
script-src 'self' https://cdn.mux.com https://js.paystack.co;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
img-src 'self' data: blob: https://*.r2.dev https://image.mux.com;
media-src 'self' blob: https://stream.mux.com;
connect-src 'self' https://api.mux.com https://stream.mux.com;
frame-src 'self' https://js.paystack.co;
object-src 'none';
frame-ancestors 'none';
upgrade-insecure-requests
```

---

## Audit Logging

All security-relevant events are recorded in the `audit_logs` table:

- User registration, login, logout, token refresh
- Password reset (request + completion)
- Email verification
- Admin user management actions (activate, deactivate, role change)
- Payment events (initiated, success, failed)
- Course publish/archive/delete
- Quiz submissions

Audit logs are **append-only** — no UPDATE or DELETE is ever issued.

---

## Pre-Deployment Security Checklist

### Environment Variables
- [ ] `JWT_ACCESS_SECRET` — minimum 32 random bytes (use `openssl rand -hex 48`)
- [ ] `JWT_REFRESH_SECRET` — different from access secret, minimum 32 bytes
- [ ] `PAYSTACK_SECRET_KEY` — use live key (`sk_live_...`) in production
- [ ] `PAYSTACK_WEBHOOK_SECRET` — verify matches Paystack dashboard
- [ ] `MUX_WEBHOOK_SECRET` — verify matches Mux dashboard
- [ ] `DATABASE_URL` — PgBouncer pooler URL, port 6543
- [ ] `COOKIE_DOMAIN` — set to `.yourdomain.com` for subdomain sharing

### Database
- [ ] Run all migrations: `DATABASE_DIRECT_URL=... pnpm db:migrate`
- [ ] Verify connection pool limit does not exceed Supabase plan limit
- [ ] Enable RLS on Supabase if using direct client access
- [ ] Database password is strong (generated, not human-chosen)

### Webhooks
- [ ] Mux webhook URL registered: `https://your-app.com/api/webhooks/mux`
- [ ] Paystack webhook URL registered: `https://your-app.com/api/webhooks/paystack`
- [ ] Both webhook secrets match what is in the respective dashboards

### Render.com
- [ ] Health check path set to `/api/health`
- [ ] Auto-deploy from `main` branch only
- [ ] Worker service in the same region as web service
- [ ] Environment variables set in Render dashboard (not in render.yaml)

### Post-deploy verification
- [ ] `GET /api/health` returns `{ status: "healthy" }` with 200
- [ ] Login flow works end-to-end
- [ ] Payment flow works in Paystack test mode
- [ ] Mux video upload and playback works
- [ ] Email delivery works (check spam folder)
- [ ] Check browser console for CSP violations

---

## Responsible Disclosure

If you discover a security vulnerability, please report it privately:

**Email:** security@streamlearn.ng  
**Response time:** Within 72 hours  
**Scope:** Authentication bypass, privilege escalation, payment fraud, PII exposure

Please do not:
- Test against production with real user data
- Exploit the vulnerability beyond proof-of-concept
- Disclose publicly before a fix is deployed

We appreciate responsible disclosure and will credit researchers in our security advisories.