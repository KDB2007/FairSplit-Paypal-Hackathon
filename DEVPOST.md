# FairSplit — the story

[▶ Watch the demo on YouTube](https://youtu.be/DqwqzeYyMyQ)

## Why I built this

I've been on both sides of an awkward payout.

The project ends, the money lands, and someone says "so... how do we split this?" And then you watch the quiet people in the room start losing immediately. The person who reviewed everyone's PRs and caught the bad ones. The person who took the client call that killed a three-week detour. The person who answered "I'm blocked" at 2 a.m. — none of that is in the repo. GitHub shows commits, and commits are all the evidence anyone looks at.

So the "fair" options are all fake. Equal split is unfair to whoever carried it. Hours punish fast people. Lines of code — you already know how that game gets played.

I had two ideas going in, and honestly one of them was wrong.

The first: if quiet work is the problem, capture it. Sync GitHub and Trello for the loud work, but let people log the client calls, the unblocking, the admin — with evidence.

The second idea — the wrong one — was "then let AI decide the split." I got about a day into that before it felt gross. Imagine a black box telling three teammates "the AI says you get 43%." Doesn't matter if it's right. It's dead on arrival. Nobody trusts that, and they shouldn't.

So I flipped the architecture: **the AI judges the work, the code does the math, and a human pulls the trigger.** The model never says a number. It never touches a cent. It just reads evidence and gives opinions, and every opinion gets checked before it's used.

That's FairSplit.

## What it actually does

You set up a charter first — who gets a finder fee, who gets a lead fee, both carved off the top. Everyone has to confirm it before scoring unlocks, and if you edit it later, the version bumps and everyone re-confirms. I stole this from how constitutions work: agree on the rules *before* anyone knows their share, and suddenly the rules are much easier to agree on.

Then you sync contributions (GitHub PRs, commits, reviews; Trello done-cards) and hand-log the quiet stuff. Hit "Score with AI" and you get a split of the work pool — each share with a plain-language reason, impact/complexity bars, and evidence chips you can click through to the actual PR.

A human reviews it, drags any share around (edited ones get pinned, the rest rescale so it always totals 100%), and then one click pays everyone through a PayPal batch. Batch ID, per-person transaction IDs, printable receipt. Done.

There's also a live equal/merit/hybrid/hours toggle so the team can argue about *philosophy* instead of *personalities*. That turned out to be the feature people play with the most.

## How I built it

Next.js 16, TypeScript, Tailwind v4, Recharts, OpenAI, PayPal sandbox Payouts. No database, no auth — the whole thing runs in memory, seeded with a demo project ($3,000, three people), because it needed to survive a 3-minute live demo on conference wifi that may not exist.

The scoring pipeline is where all the actual thinking went. It's five steps:

**Normalize.** Merge GitHub, Trello and manual entries into one clean list. Commits fold into the PR that shipped them, so nobody gets double-counted for the same work. Merge commits and whitespace-only changes get dropped — but I surface the counts in the UI rather than silently binning them, because silently disappearing data is exactly how you lose trust. Anything I can't attribute to a team member goes to an "unassigned" tray instead of me guessing.

**Judge.** This is the only place the model has opinions. Per contribution it returns a category, impact (1–5), complexity (1–5), and a ≤20-word rationale. The trick: I run it **three times** and take the median per item (majority vote on category). One model run is an opinion. Three runs and a median starts being a measurement.

**Compute.** Pure, boring, deterministic math. Each item's value:

$$v = \text{impact} \times \text{complexity} \times w_{\text{category}}$$

Then per person I sum values *per category through a square root*:

$$S_i = \sum_k \sqrt{V_{i,k}}$$

That sqrt is my favorite line in the codebase. $\sqrt{10} + \sqrt{10} > \sqrt{20}$ — so doing solid work across five different categories beats spamming twenty items in one. You can't game it by volume. Merit share is $S_i / \sum S_j$, hybrid blends $0.7$ merit + $0.3$ hours, and fees come off the top first ($\text{total} = \text{finder} + \text{lead} + \text{work pool}$), so the model's numbers only ever divide the work pool.

The exact same compute code runs on the server *and in the browser*. That's why the what-if toggle is instant — and why the client and server can never disagree about the math.

**Explain.** The model writes the prose, but its evidence citations get filtered against the IDs that actually exist. If it cites a contribution that isn't real, it doesn't ship.

**Confidence.** Since the model is non-deterministic, I compare merit shares across the three runs. If someone's share moves more than 5 points run-to-run, the split gets flagged "lower confidence" and shows the range. I really like this part — instead of pretending the number is truth, the UI tells you exactly which share is soft.

Money is integer cents end to end, with percentages in basis points, both distributed by largest-remainder (floor everything, hand the leftovers to the biggest fractional parts). PayPal-wise it's OAuth client credentials then one `POST /v1/payments/payouts` batch — and if the sandbox is down, it falls back to a clearly-marked simulated receipt instead of dying on stage.

## The bugs that taught me things

**My first split summed to $2,999.99.** I rounded each percentage to two decimals, multiplied, rounded again — and watched the total drift. Classic. It's the same apportionment problem that comes up in proportional representation, and the fix is a hundred years old: largest-remainder method. Everything integer, everything reconciles to the cent. The payout endpoint now literally refuses to send money if the lines don't add up to the project total.

**The model lied to me, constantly.** Category labels like `"pr"` and `"implementation"` (not in my taxonomy). Impact scores of 7 on a 1–5 scale. Evidence IDs for contributions that don't exist. At some point I stopped treating model output as text and started treating it like user input in a form: validate, clamp, reconcile against what I actually sent, reject the run on garbage. There's a whole synonym table mapping the labels the model reaches for onto my seven categories. The judge module is a trust boundary, full stop.

**Same project, three runs, three different splits.** For a weather app, fine. For money, no. The median ensemble fixed most of it, and the confidence step turned the rest into a feature — you see the range instead of a confident lie.

**Editing one share broke the others.** First version of the review screen: you type 45%, and I rescale everything else proportionally — including the share someone had carefully set five minutes earlier. The fix is pinning: edited shares lock, only the unlocked remainder rescales, and rounding drift lands on the biggest unlocked row so it still totals exactly 100.

**The stack fought me.** Next 16, Tailwind v4 and Base UI are all different from what my hands remembered. `render` props instead of `asChild`. A render-time random class in a sidebar component caused hydration mismatches at 2 a.m. before I understood why. The answer was boring: actually read the docs in `node_modules/next/dist/docs` instead of assuming.

## What I'm proud of

The **hidden contributor** flag. When someone's merit share beats their raw activity-count share by 8+ points *and* over half their value is quiet work, the UI calls them out by name. That's the person the raw numbers would've short-changed — the whole reason I started this thing.

Also: the demo runs with zero API keys and zero network, because "DEMO_MODE" replays canned judgments through the *real* formula. Same math, identical every time, no russian roulette on stage. And every number on screen traces back through the formula to evidence you can click on.

## What I learned

The big one: in a money workflow, the model's job isn't to produce numbers — it's to produce **judgments with receipts**. Once I drew that line, everything got easier. Failures degrade into fallbacks instead of wrong payouts. The same math runs everywhere. You can audit any share down to the PR it came from.

Also — how you *show* uncertainty matters as much as reducing it. Three runs and a median made the numbers stable, but showing the disagreement range is what made them feel honest.

And honestly, the demo constraint saved the product. Every fallback I built so the 3-minute demo couldn't die made the real flow harder to break.

## What's next

A real database, production PayPal, per-member payout acceptance instead of one approver — and pulling in more quiet-work sources: Slack threads, Figma comments, meeting notes, all through the same normalize → judge → compute pipeline. The quiet work is out there. It's just not in the repo yet.

## PayPal & AI tools used

### PayPal developer platform

**1. PayPal Sandbox** (free developer environment) — the entire payout path runs against `https://api-m.sandbox.paypal.com` using a sandbox business app's client ID and secret. No real money ever moves, but every request is the real API.

**2. PayPal OAuth 2.0 — Client Credentials grant** (`POST /v1/oauth2/token`) — the payout endpoint exchanges the sandbox credentials for a bearer access token before every batch. It's a two-call flow: token first, then money.

**3. PayPal Payouts API** (`POST /v1/payments/payouts`) — this is the money movement. One click in FairSplit builds a single batch payout containing one item per teammate — recipient email, exact USD amount (computed in integer cents, rendered to two decimals), a personalized note, and a `sender_item_id`. PayPal answers with a `payout_batch_id` and batch status, which become the batch ID, the per-person transaction IDs and the printable receipt in the UI. The whole team gets paid in one API call. If credentials are missing or the sandbox hiccups, the flow degrades to a clearly-labeled simulated receipt instead of dying on stage.

### AI

**4. OpenAI Chat Completions API** (official `openai` Node SDK; default model **gpt-4o-mini**, configurable via `OPENAI_MODEL`) — I use it for exactly two jobs, both JSON-mode calls with temperature ~0.2–0.3:

- **Judging contributions (scoring).** Each work item — PR, commit, review, Trello card, manual log — is sent as JSON, and the model returns a structured judgment: category (one of seven: code, review, design, client_comms, unblocking, admin, planning), impact 1–5, complexity 1–5, an `is_quiet_work` flag, and a ≤20-word rationale. Every project is judged by three independent runs, median-combined per item. The model never sees money and never produces a number that becomes one — percentages and cents are computed by pure TypeScript from its judgments.
- **Explaining the split.** After the math computes everyone's share, the model writes the plain-language reason on each person's card (max two sentences, explicitly forbidden from writing any number) and nominates evidence IDs — which are then filtered against the contribution IDs that actually exist, so hallucinated citations never ship.

Everything the model returns is treated as untrusted input: validated, clamped to range, and reconciled against the IDs we sent. If the API fails or no key is configured, scoring falls back to a deterministic engine so the demo runs with zero credentials.

## Testing instructions for judges

**You need zero credentials.** The app ships in `DEMO_MODE=true`: AI scoring runs on canned judgments replayed through the real formula, syncs return sample activity, and payouts produce a clearly-labeled simulated receipt. It works fully offline.

**Run it (Node 20+):**

```bash
npm install
cp .env.example .env.local   # DEMO_MODE=true is the only setting you need
npm run dev                  # → http://localhost:3000
```

**The 3-minute path:**

1. Click **Open the demo project** — "Client Website," $3,000, three members, charter already confirmed. Priya holds a 10% finder fee + 5% lead fee ($450 off the top), leaving a $2,550 work pool.
2. On **Contributions**, hit **Sync both** — sample GitHub + Trello activity appears (upserted, never duplicated). Then **log a manual item** (e.g. a client call, 1.5h) to see quiet work captured.
3. Click **Score with AI** — each person gets a share with a plain-language reason, impact/complexity bars, and clickable evidence chips. Check the **How this was calculated** panel: formula, runs, and confidence are all surfaced.
4. On **Review**, type a new percentage into any share — edited rows pin, the rest rescale, and the total stays exactly 100%. The waterfall at the bottom reconciles fees + work pool to $3,000.00 to the cent. Approve when happy.
5. Click **Send payouts** — you get a batch ID, per-person transaction IDs and a printable receipt. It's marked *simulated* in demo mode; no money moves.
6. Open the **Dashboard** — pie chart, payout history, and the live equal / merit / hybrid / hours what-if toggle.

Want a clean slate? Restart the dev server — the store is in memory.

**Optional — try the real integrations.** All keys go in `.env.local`, and set `DEMO_MODE=false`:

| To test | Provide |
| --- | --- |
| Real AI judging | `OPENAI_API_KEY` (any OpenAI key; model defaults to `gpt-4o-mini`) |
| Real PayPal sandbox payouts | `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET` from a free [developer.paypal.com](https://developer.paypal.com) sandbox business account |
| Real GitHub sync | `GITHUB_TOKEN` — fine-grained, read-only (Metadata, Contents, Pull requests) |
| Real Trello sync | `TRELLO_KEY` + `TRELLO_TOKEN` from trello.com/power-ups/admin |

Even in live mode, every integration fails soft: no OpenAI key → deterministic scoring; a PayPal error → clearly-marked simulated receipt instead of a crash. Nothing can take the demo down.

## Overall experience feedback

Honestly? This was the most fun I've had shipping something in a long time.

What made it work was the constraint. "PayPal + AI" could easily have produced a gimmick — an AI that writes payment summaries, whatever. Instead it forced the interesting question: what does AI-assisted money movement look like when you take trust seriously? That question ended up being my whole architecture — the model judges evidence, code computes every cent, a human approves — and I'm not sure I'd have arrived at that without a payments platform sitting there demanding it. The requirement made the product better, which is the best thing you can say about a hackathon constraint.

Working with the PayPal Payouts API was genuinely pleasant for this use case: one batch call, everyone gets paid, receipts for everyone. That's the right shape for team payouts, so the integration felt like the product belonged on the platform instead of being bolted on.

The low points were mine, not the organizers': percentages that summed to $2,999.99, hydration errors at 2 a.m., a model that kept inventing evidence IDs for contributions that didn't exist. But that's the deal — you trade sleep for stories, and the codebase is genuinely better for every one of those fights.

One suggestion for next time: more discussion of where AI belongs in a payments flow — model output as suggestion vs. decision, trust boundaries, validation. I landed hard on "the model never produces a number that becomes money" and would have loved to compare notes with other teams on where they drew that line.

Would do it again. Already sketching v2.

## AI tools leveraged while working on this project

Two kinds: the AI *inside* the product, and the AI I used to *build* it.

**Inside the product:** OpenAI's Chat Completions API (`gpt-4o-mini`, official Node SDK) — it judges every work item (category, impact, complexity, quiet-work flag) and writes the plain-language explanations. Detailed above.

**While building:** I built this with **Claude Code** (Anthropic's agentic CLI) as my pair programmer — honestly closer to pair-plus-reviewer-plus-junior-dev. I owned the product thinking (the trust boundary, integer-only money, the median ensemble); it owned the typing. Supporting cast:

- **Claude Code** — implementation, refactors, and the Vitest suite. My project rules file (`CLAUDE.md`) got weirdly specific ("never let the CLI overwrite `src/lib/utils.ts`", "no raw `slate-*` colors, use tokens") because that's what it takes to keep an AI agent from enthusiastically breaking your invariants at 1 a.m.
- **shadcn MCP** — the shadcn registry connected to the agent as an MCP server, so it pulled UI components straight from the source instead of hallucinating stale copies from training data. New stack, real components, no "asChild" bugs from outdated memory.
- **MotionSites MCP** — design briefs for the marketing page (hero, capabilities, footer). It supplied direction, not code.

The part I keep telling people about is the symmetry: I used AI to build a product whose entire architecture is "never trust AI output with money." Claude wrote the judge module; the OpenAI model's judgments still get validated, clamped, and reconciled against the IDs we actually sent before a single cent moves. Practice what you preach.
