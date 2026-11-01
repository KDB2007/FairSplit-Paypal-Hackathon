import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ArrowRight } from "lucide-react";
import { LoopVideo, Reveal } from "./landing-client";
import "./landing.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["300", "400", "500", "600", "800"] });

const STEPS = [
  {
    n: "01",
    title: "Capture every contribution",
    body: "GitHub PRs, commits and reviews, Trello cards, plus the quiet work — client calls, unblocking, admin.",
    icon: <RadarIcon />,
  },
  {
    n: "02",
    title: "AI judges, code does the maths",
    body: "Three independent AI reads per item, a median, and a deterministic formula — with a plain-language reason for every share.",
    icon: <ChartIcon />,
  },
  {
    n: "03",
    title: "Approve, then pay via PayPal",
    body: "The team signs the charter, a human approves or overrides the split, and payouts go out in one batch.",
    icon: <SheetsIcon />,
  },
];

export default function LandingPage() {
  return (
    <main className={`${jakarta.className} bg-black text-white`}>
      {/* Hero — Sellix */}
      <section className="relative h-dvh min-h-[560px] overflow-hidden">
        <div className="absolute inset-0">
          <LoopVideo
            src="/media/globe.mp4"
            poster="/media/globe-poster.webp"
            className="absolute inset-0 h-full w-full object-cover object-[51%_8%]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black" />
        </div>

        <header className="relative z-10 flex h-16 items-center px-6 sm:px-8">
          <Link href="/" className="mk-lift text-2xl font-extrabold tracking-tight" style={{ animationDelay: ".46s" }}>
            FairSplit
          </Link>
          <nav aria-label="Primary" className="absolute left-1/2 hidden -translate-x-1/2 gap-6 text-sm text-white/80 md:flex">
            {[
              ["How it works", "#how"],
              ["Demo", "/project/demo"],
              ["Projects", "/projects"],
            ].map(([label, href], i) => (
              <Link key={label} href={href} className="mk-lift transition-colors hover:text-white" style={{ animationDelay: `${0.54 + i * 0.045}s` }}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/projects" className="mk-pill hidden h-8 items-center rounded-full bg-[#181818] px-4 text-sm text-white/90 hover:bg-[#232323] sm:inline-flex" style={{ animationDelay: ".68s" }}>
              Projects
            </Link>
            <Link href="/project/demo" className="mk-pill inline-flex h-8 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-black" style={{ animationDelay: ".73s" }}>
              Get started <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </header>

        <div className="relative z-10 flex h-[calc(100%-4rem)] flex-col items-center justify-center px-5 text-center">
          <h1 className="text-[clamp(3rem,9vw,6.5rem)] font-medium leading-[1.02] tracking-[-0.02em]">
            <span className="mk-ln"><span>Fair splits.</span></span>
            <span className="mk-ln"><span>Explained.</span></span>
          </h1>
          <p className="mk-sub mt-5 max-w-[42ch] text-[clamp(1rem,1.6vw,1.15rem)] font-light leading-relaxed text-white/90">
            Capture real contribution, let AI propose a split with a reason for every percentage,
            approve it, and pay your team through PayPal.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/project/demo" className="mk-pill inline-flex h-11 items-center gap-2 rounded-full bg-white px-6 text-sm font-medium text-black hover:bg-white" style={{ animationDelay: ".9s" }}>
              Open the demo <ArrowRight className="size-4" />
            </Link>
            <Link href="/projects/new" className="mk-pill inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-black/70 px-6 text-sm text-white/85 backdrop-blur-sm hover:border-white/20 hover:bg-black/60" style={{ animationDelay: ".97s" }}>
              Create a project <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* How it works — Capabilities */}
      <section id="how" className="relative bg-[#050505] px-5 py-24 sm:px-8">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/3 w-px bg-white/[.03]" />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-2/3 w-px bg-white/[.03]" />
        <div className="relative mx-auto max-w-6xl">
          <Reveal>
            <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[.275em] text-white/45">
              <span className="flex items-center gap-3">01 <span className="h-px w-8 bg-white/30" /></span>
              <span>{"// How it works"}</span>
              <span className="hidden sm:inline">Full visibility</span>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <h2 className="mt-10 text-[clamp(2.25rem,5vw,3.75rem)] font-normal leading-[1.02] tracking-[-0.05em]">
              <span className="mk-amber">Clarity</span> across every contribution
            </h2>
            <p className="mt-4 max-w-xl text-base font-light text-white/65">
              One view of who did what — including the work that never shows up as a commit — and
              a split everyone can read and agree on.
            </p>
          </Reveal>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <Reveal key={step.n} delay={200 + i * 120}>
                <article className="mk-glass flex h-full min-h-72 flex-col rounded-md">
                  <div className="flex h-44 items-center justify-center">{step.icon}</div>
                  <div className="p-6 pt-0">
                    <p className="font-mono text-[11px] tracking-[.2em] text-white/40">{step.n}</p>
                    <h3 className="mt-2 text-lg font-medium text-white/95">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/58">{step.body}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Footer — Lumina */}
      <section className="relative overflow-hidden px-5 pb-8 sm:px-8">
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src="/media/footer.mp4"
          poster="/media/footer-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-transparent to-black/40" />
        <div className="relative z-10 mx-auto flex min-h-[90vh] max-w-6xl flex-col justify-end">
          <Reveal className="mb-24 text-center">
            <h2 className="text-[clamp(2rem,4.5vw,3.25rem)] font-medium tracking-tight">Pay your team fairly.</h2>
            <Link href="/project/demo" className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-white px-6 text-sm font-medium text-black">
              Try the demo <ArrowRight className="size-4" />
            </Link>
          </Reveal>
          <Reveal>
            <footer className="liquid-glass w-full rounded-3xl p-6 text-white/70 md:p-10">
              <div className="mb-10 grid grid-cols-1 gap-10 md:grid-cols-12">
                <div className="md:col-span-5">
                  <p className="text-xl font-medium text-white">FairSplit</p>
                  <p className="mt-3 max-w-sm text-sm leading-relaxed">
                    Fair, explainable team payouts. AI proposes, people decide, PayPal pays.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:col-span-7">
                  {[
                    ["Product", [["How it works", "#how"], ["Demo project", "/project/demo"], ["Projects", "/projects"]]],
                    ["Workflow", [["Charter", "/projects/new"], ["AI scoring", "/project/demo"], ["Payouts", "/project/demo"]]],
                    ["Built with", [["PayPal Payouts (sandbox)", "#"], ["GitHub & Trello", "#"], ["Explainable AI", "#how"]]],
                  ].map(([heading, links]) => (
                    <div key={heading as string}>
                      <p className="mb-4 text-sm font-medium uppercase tracking-wider text-white">{heading as string}</p>
                      <ul className="space-y-2 text-xs">
                        {(links as string[][]).map(([label, href]) => (
                          <li key={label}>
                            <Link href={href} className="transition-colors hover:text-white">{label}</Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 md:flex-row">
                <p className="text-[10px] uppercase tracking-widest opacity-50">PayPal hackathon · sandbox demo — no real money moves</p>
                <p className="text-[10px] uppercase tracking-widest opacity-50">© FairSplit</p>
              </div>
            </footer>
          </Reveal>
        </div>
      </section>
    </main>
  );
}

/* Glowing amber wireframe icons (the prompt's icon images aren't provided, so these are SVG). */
function Glow({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 160 120" className="h-32 w-44 drop-shadow-[0_0_12px_rgba(233,147,30,.55)]" fill="none" stroke="#F0A53A" strokeWidth="1.2" aria-hidden>
      {children}
    </svg>
  );
}
function RadarIcon() {
  return (
    <Glow>
      {[18, 32, 46].map((r) => <circle key={r} cx="80" cy="60" r={r} opacity={1 - r / 70} />)}
      <circle cx="80" cy="60" r="7" fill="#FFC24A" stroke="none" />
      <circle cx="122" cy="44" r="3" fill="#FFC24A" stroke="none" />
    </Glow>
  );
}
function ChartIcon() {
  return (
    <Glow>
      {[[40, 50], [56, 34], [72, 62], [88, 22]].map(([x, h]) => <rect key={x} x={x} y={100 - h} width="9" height={h} rx="4" opacity=".85" />)}
      <circle cx="118" cy="62" r="16" opacity=".8" />
      <circle cx="128" cy="70" r="16" opacity=".55" />
      {[40, 56, 72].map((x) => <line key={x} x1={x} y1="20" x2={x + 8} y2="20" />)}
    </Glow>
  );
}
function SheetsIcon() {
  return (
    <Glow>
      {[0, 10, 20].map((o) => (
        <g key={o} opacity={1 - o / 40} transform={`translate(${44 + o} ${18 + o})`}>
          <rect width="62" height="76" rx="5" />
          {[16, 28, 40].map((y) => <line key={y} x1="10" y1={y} x2="50" y2={y} />)}
        </g>
      ))}
    </Glow>
  );
}
