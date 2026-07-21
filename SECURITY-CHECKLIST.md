# YARDFLOW — Manual Go-Live Checklist (DB topology & secrets)

These are the steps that live **outside the codebase** (cPanel / Vercel) and cannot be
done from application code. Do them before onboarding real customers. The in-code parts
(TLS/`connection_limit` in `.env.example`, `.env` git-ignored, error sanitization,
auth, concurrency fixes) are already handled in the repo.

## 1. Rotate the exposed database password  ⚠️ do this first
The current MySQL password was present in the working-tree `.env`. Treat it as
compromised.
- cPanel → **MySQL Databases** → *Current Users* → change the password for the DB user.
- Update `DATABASE_URL` with the new password **in Vercel only** (see step 3).

## 2. Rotate / set the session secret
- Generate one: `openssl rand -base64 48`
- Set `SESSION_SECRET` in Vercel (step 3). Rotating it logs everyone out (expected).

## 3. Move secrets to Vercel env vars (not the working tree)
- Vercel → Project → **Settings → Environment Variables**.
- Add `DATABASE_URL` and `SESSION_SECRET` for **Production** (and Preview if used).
- Delete the local `.env`, or keep only a **local-dev** value in it. Never store the
  production password on disk in the repo.

## 4. Require TLS on the DB connection
- Ensure the connection string carries `sslaccept=strict` (already in `.env.example`).
  Verify the cPanel MySQL server accepts TLS; if it uses a self-signed cert and
  `strict` fails, use `sslaccept=accept_invalid_certs` (still encrypted) as a stopgap
  and pursue a valid cert. Goal: no clear-text credentials/queries over the internet.

## 5. Restrict Remote MySQL exposure
- cPanel → **Remote MySQL** → allow only what needs access.
  - Vercel egress isn't a fixed small IP range, so options are:
    - front the DB with a **pooler / proxy** that has a stable egress IP and whitelist
      that, **or**
    - move to a serverless-native DB (PlanetScale / Neon / Vercel Postgres), **or**
    - (least good) time-box a broad allowlist and monitor.
- Do **not** leave `%` (any host) allowed in production long-term.

## 6. Connection pooling (before real traffic)
- Shared-hosting MySQL has a low max-connection cap. With `connection_limit=1` per
  instance you're safer, but a real load still benefits from **Prisma Accelerate** or a
  pooler in front. Add this before onboarding multiple busy tenants.
  *(Pooler wiring is deferred code — flagged here so it isn't forgotten.)*

## 7. Verify after changes
- Redeploy on Vercel so it picks up the new env vars.
- Log in (superadmin `superadmin` / `super123` still works — rotate it later from the
  admin UI if desired), walk one vehicle Entry → Billing → Loading → Exit.
- Confirm no `500`s under a couple of simultaneous actions (connection cap OK).
