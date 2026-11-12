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

1. **Charter** — the demo project has 3 members and a $3,000 lump sum. Priya
   takes a 10% finder fee and a 5% lead fee off the top ($450), leaving a
   $2,550 work pool. Editing the charter starts a new version: everyone must
   confirm again before scoring unlocks.
2. **Contributions** — "Sync both" pulls GitHub + Trello activity; log a client
   call to show that quiet work is captured too.
3. **Score with AI** — splits the work pool, each share with a plain-language
   reason, impact/complexity/effort bars and evidence chips.
4. **Review** — edit a share of the work pool. Charter fees stay fixed. Edited
   shares are **pinned** and the rest rescale proportionally so the work pool
   always totals exactly 100%. The "Where the money goes" waterfall shows fees +
   work pool summing to $3,000.00 to the cent.
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
| `GITHUB_TOKEN` | Optional. Fine-grained, read-only token for syncing real PRs, commits and reviews. |
| `TRELLO_KEY` / `TRELLO_TOKEN` | Optional. Trello API key + token for syncing Done cards. |

Nothing external is required to run the demo. If a real PayPal call fails, the
payout falls back to a clearly-marked simulated sandbox receipt instead of
crashing the flow.

## Using it on a real project

1. Put `GITHUB_TOKEN` and/or `TRELLO_KEY` + `TRELLO_TOKEN` in `.env.local` and set
   `DEMO_MODE=false` (with `DEMO_MODE=true`, sync always uses sample activity).
2. Create a project, open **Sources**, add the repos (`owner/name`) and paste the
   Trello board URL. **Test connection** shows who it found.
3. **Sync both**, then map each GitHub login / Trello member to a team member.
   Mapping re-attributes already-synced items; anything unmapped is scored as
   unassigned and can be routed to a person on the scoring screen.

What counts:

- **GitHub:** merged PRs (size = lines changed), the commits that shipped them
  (folded into the PR, merge commits dropped; a co-author's commits keep their
  own credit), and reviews on other people's PRs as quiet review work. Bots are
  ignored. Up to 200 PRs per repo, merged on or after the optional "since" date.
- **Trello:** cards in a list whose name matches the Done pattern
  (`done|complete|shipped` by default), credited to every member on the card.

Re-syncing updates items in place. Manual work is never touched.

## API

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/projects` | `GET` / `POST` | List (and seed the demo) / create a project |
| `/api/projects/[id]` | `GET` / `PATCH` | Full state / confirm the charter for everyone (demo) |
| `/api/projects/[id]/pool-config` | `GET` / `POST` | Fees + work-pool preview / save a new charter version |
| `/api/projects/[id]/confirm-charter` | `GET` / `PATCH` | Per-member sign-off on the current charter version |
| `/api/contributions` | `POST` | Log manual work |
| `/api/contributions/sync` | `POST` | Sync GitHub / Trello (mocked in demo mode); upserts, never duplicates |
| `/api/projects/[id]/sources` | `PUT` | Connect repos (`owner/name`) and a Trello board |
| `/api/projects/[id]/sources/test` | `GET` | Which tokens are configured, reachability, people found |
| `/api/projects/[id]/identities` | `PATCH` | Map a member to a GitHub login / Trello member |
| `/api/score` | `POST` | Score contributions → proposals + decisions |
| `/api/split` | `POST` | Approve / adjust / dispute work-pool shares; rescales to 100% |
| `/api/payout` | `POST` | PayPal sandbox batch (or simulated fallback) |
| `/api/dashboard?projectId=` | `GET` | Chart data + payout history |

## Notes

- Data lives in memory and resets when the dev server restarts. Restart to get a
  clean demo state.
- Percentages are shares of the work pool and are normalised server-side so
  they always sum to 100. Money is integer cents end to end; charter fees plus
  work-pool slices always add up to the project total.
- A disputed member's work-pool slice is withheld at payout; their charter fees
  are still paid.
- The demo-safe scoring engine is deterministic, so the demo looks the same every
  time even with no API keys and no network.

## License

MIT — see [LICENSE](./LICENSE).
