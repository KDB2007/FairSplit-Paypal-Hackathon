# FairSplit

Fair, explainable team payouts. Capture real contribution (including the quiet
work), let AI propose a split with a reason and evidence for every percentage,
let a human approve or override it, then pay out via PayPal sandbox.

Built for the PayPal hackathon on Next.js 16 (App Router), TypeScript, Tailwind v4,
Recharts and the OpenAI + PayPal APIs. No database, no auth — an in-memory store
seeded with a demo project, designed to survive a live 3-minute demo.

## Quick start

```bash
npm install
cp .env.example .env.local   # DEMO_MODE=true is all you need
npm run dev                  # http://localhost:3000
```

Then open **http://localhost:3000** and click **Open the demo project**.

## The 3-minute demo

1. **Charter** — the demo project has 3 members and a $3,000 lump sum.
2. **Contributions** — "Sync both" pulls GitHub + Trello activity; log a client
   call to show that quiet work is captured too.
3. **Score with AI** — returns Priya 45% / Leo 35% / Maya 20%, each with a
   plain-language reason, impact/complexity/effort bars and evidence chips.
4. **Review** — edit a share. Edited shares are **pinned** and the rest rescale
   proportionally so the total is always exactly 100%. Try Priya → 40, Maya → 25
   to land on 40 / 35 / 25.
5. **Payout** — one click sends the batch; you get a batch ID, per-person
   transaction IDs and a printable receipt.
6. **Dashboard** — pie chart, payout history and a live equal / merit / hours
   what-if toggle.

## Environment

| Variable | Purpose |
| --- | --- |
| `DEMO_MODE` | `true` uses canned AI scoring, mock syncs and simulated payouts. |
| `OPENAI_API_KEY` | Optional. Without it, deterministic heuristic scoring is used. |
| `OPENAI_MODEL` | Optional, defaults to `gpt-4o-mini`. |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | Optional. Without them, payouts are clearly marked as simulated. |
| `PAYPAL_API_BASE` | Optional, defaults to the sandbox host. |

Nothing external is required to run the demo. If a real PayPal call fails, the
payout falls back to a clearly-marked simulated sandbox receipt instead of
crashing the flow.

## API

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/projects` | `GET` / `POST` | List (and seed the demo) / create a project |
| `/api/projects/[id]` | `GET` / `PATCH` | Full state / confirm the charter |
| `/api/contributions` | `POST` | Log manual work |
| `/api/contributions/sync` | `POST` | Sync GitHub / Trello (mocked in demo mode) |
| `/api/score` | `POST` | Score contributions → proposals + decisions |
| `/api/split` | `POST` | Approve / adjust / dispute; rescales to 100% |
| `/api/payout` | `POST` | PayPal sandbox batch (or simulated fallback) |
| `/api/dashboard?projectId=` | `GET` | Chart data + payout history |

## Notes

- Data lives in memory and resets when the dev server restarts. Restart to get a
  clean demo state.
- Percentages are normalised server-side so they always sum to 100.
- The demo-safe scoring engine is deterministic, so the demo looks the same every
  time even with no API keys and no network.
