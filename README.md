# YARDFLOW — Yard Management System

Operations software for an industrial logistics terminal. YARDFLOW tracks every
vehicle through its full yard lifecycle:

**Entry Gate → Loading Approval → Billing Approval → Exit Gate**

with a live dashboard, FIFO queue enforcement, printable gate tokens (with QR),
reporting, and a complete transaction audit trail.

Product by **Cubiqlab Technologies**.

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui** + **lucide-react**
- Client state via **zustand**; server API routes back the data layer

## Prerequisites

- **Node.js 20+** (developed on Node 22)
- **npm** (bundled with Node)

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Start the app
npm run dev
```

Then open the URL printed in the terminal — **http://localhost:3000**
(if 3000 is busy it picks the next free port, e.g. 3001).

That's it. There is **no database to set up and no environment variables to
configure** for this build.

## How data is stored

This build persists all activity to a local folder created automatically on
first run:

```
transactions/
  ledger.json         # live source of truth (vehicles, alerts)
  activity-log.json   # append-only audit trail of every movement
```

- Data survives page refreshes and server restarts.
- The `transactions/` folder is git-ignored, so each environment keeps its own
  data. Delete the two JSON files (or use **Admin → Clear Yard Data**) to reset
  to an empty yard.

## Using the app

1. **Entry Gate** — register a vehicle; a numbered gate token (with QR) is issued
   and can be printed.
2. **Loading Approval** — process the FIFO queue: scan the pass, mark loading
   complete, or skip a vehicle to the back of the line.
3. **Billing Approval** — enter the invoice number to clear billing (locked to
   the FIFO order; a vehicle appears only after loading is complete).
4. **Exit Gate** — verify the workflow, then permit exit (issues a gate pass) or
   place the vehicle on hold.
5. **Dashboard / Reports** — live KPIs, pipeline status, and the full
   transaction log.

## Available scripts

```bash
npm run dev     # start the dev server
npm run build   # production build
npm run start   # run the production build
```
