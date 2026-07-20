# YARDFLOW — Database Setup & Deployment

YARDFLOW now stores all data in a real **MySQL/MariaDB** database via **Prisma**
(it used to use JSON files that vanished on restart).

**Hosting layout:**
- **App → Vercel** (free tier, deploys from GitHub).
- **Database → your cPanel MySQL**, reached over the internet via cPanel's
  **Remote MySQL**. App and DB are on different servers, so the connection uses
  the cPanel **server IP**, not `localhost` and not your website domain.

---

## 1. Create the database in cPanel

cPanel → **MySQL Databases**:
1. Create a database — cPanel prefixes it, e.g. `acct_yardflow`.
2. Create a user with a **strong password**, e.g. `acct_yfuser`.
3. Add the user to the database with **ALL PRIVILEGES**.

cPanel → **Remote MySQL**:
4. Add an **Access Host** of `%` (allow any host). Vercel's outbound IPs are
   dynamic, so a fixed whitelist won't work; security rests on the strong
   password. (If your host forbids `%`, see "If cPanel MySQL won't work" below.)

Find the **DB host** — cPanel home page, right sidebar, **"Shared IP Address"**
(or a hostname like `serverXX.yourhost.com`). **Not your website domain** — that
points to Vercel.

Your connection string:
```
mysql://acct_yfuser:THE_PASSWORD@CPANEL_SERVER_IP:3306/acct_yardflow?connection_limit=3
```

---

## 2. Create the tables

From a machine that can reach the DB (Remote MySQL `%` allows any):
1. Put the connection string in a local `.env` (copy from `.env.example`).
2. Create all tables:
   ```
   npx prisma db push
   ```
   (`db push` syncs the schema directly — no migration/shadow-DB needed, which
   shared cPanel MySQL users typically can't create.)
3. Verify in cPanel **phpMyAdmin** that the 8 tables exist.

---

## 3. Deploy the app to Vercel

1. Push the repo to GitHub (Vercel builds from it).
2. Vercel → **Add New… → Project** → import the GitHub repo.
3. **Settings → Environment Variables** → add `DATABASE_URL` = the connection
   string from step 1 (apply to Production, Preview, and Development).
4. **Deploy.** Vercel runs `prisma generate && next build` automatically.
5. Open the Vercel URL — the app **auto-seeds** the default operators,
   permissions, and settings on first load. Log in with the existing demo
   accounts (e.g. `admin` / `admin123`).

Every later `git push` to the connected branch redeploys automatically. Because
the schema rarely changes, you normally don't rerun `prisma db push`; when the
schema *does* change, run `npx prisma db push` again against the DB before/after
deploying.

---

## Notes

- **Data is durable now.** Redeploying or restarting no longer wipes tickets,
  operators, or onboarded clients — everything lives in your cPanel MySQL.
- **Daily reset still works.** Tickets and the G-/B-/L- serials reset at midnight
  in the configured timezone (default `Asia/Kolkata`); the BOE counter does not
  reset. Runs lazily on the first request after midnight.
- **Rotate the DB password** if it was ever shared in chat/support. Change it in
  cPanel → MySQL Databases, then update `DATABASE_URL` in Vercel and redeploy.
- **Passwords are still stored as-is** in this phase to keep the current login
  working. Hashing + server-side sessions + strict per-client data isolation come
  in the next phase (project plan, Phase 3) before onboarding real clients.

### If cPanel MySQL won't work
Some shared hosts block Remote MySQL `%` or firewall port 3306 externally, and
shared MySQL has low connection limits. If you hit "too many connections" or
can't connect at all, move **only the database** to a free managed MySQL
(PlanetScale, Railway, Aiven) — **no code changes**, just swap `DATABASE_URL` in
Vercel and rerun `npx prisma db push`.
