import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Building2,
  Calculator,
  Eye,
  Lock,
  Scale,
  TrendingUp,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { HomepageLeadForm } from '@/components/homepage-lead-form';

/** Logomark: bold “S” filling most of a compact 40px emerald–teal tile. */
function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex size-10 shrink-0 select-none items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-500/95 to-teal-600 shadow-md shadow-emerald-950/40 ring-1 ring-inset ring-white/15',
        className
      )}
      aria-hidden
    >
      <svg
        className="size-8 shrink-0"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <text
          x="12"
          y="12"
          textAnchor="middle"
          dominantBaseline="central"
          fill="#f8fafc"
          style={{
            fontSize: 20,
            fontWeight: 700,
            fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
            letterSpacing: '-0.08em',
          }}
        >
          S
        </text>
      </svg>
    </div>
  );
}

const VALUE_PROPS = [
  {
    icon: Eye,
    title: 'Transparent calculations',
    description:
      'Every estimate is built from inputs you control—sale multiples, tax rates, fees, and growth assumptions. No black box, no hidden formulas.',
  },
  {
    icon: Scale,
    title: 'The uncomfortable truth',
    description:
      'Side-by-side wealth trajectories often show that keeping and compounding the business wins. We surface that honestly so you can plan with clarity.',
  },
  {
    icon: Users,
    title: 'Built for founders and executives',
    description:
      'Designed for high-net-worth owners and advisors who need institutional-grade framing without a data warehouse or sales pitch.',
  },
  {
    icon: Lock,
    title: '100% private',
    description:
      'All scenarios live in your browser via localStorage only. Nothing is uploaded, tracked, or stored on our servers.',
  },
] as const;

const STEPS = [
  {
    step: 1,
    icon: Building2,
    title: 'Business Inputs',
    teaser: 'Revenue, EBITDA, growth, sale multiple, and tax posture—including QSBS where relevant.',
  },
  {
    step: 2,
    icon: Calculator,
    title: 'Sale Outcome',
    teaser: 'Estimated sale price, taxes and fees, and net proceeds you would actually walk away with.',
  },
  {
    step: 3,
    icon: TrendingUp,
    title: 'Post-Sale Projection',
    teaser: 'Investment return, spending, and horizon—so the “sell and invest” path is modeled, not guessed.',
  },
  {
    step: 4,
    icon: Scale,
    title: 'Keep vs Sell',
    teaser: 'One chart, one decision frame: projected wealth if you keep growing the business versus selling and reinvesting.',
  },
] as const;

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0a1428] text-slate-200">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-[#0a1428]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 md:px-10">
          <Link
            href="/"
            className="group flex items-center gap-3 text-white transition-opacity hover:opacity-95"
          >
            <BrandMark className="transition-shadow group-hover:shadow-lg group-hover:ring-emerald-400/25" />
            <span className="text-lg font-semibold tracking-tight text-white">SellSmartPlanner</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm text-slate-400">
            <a
              href="#value"
              className="transition-colors duration-200 hover:text-[#FACC15]"
            >
              Why it&apos;s different
            </a>
            <a
              href="#how-it-works"
              className="transition-colors duration-200 hover:text-[#FACC15]"
            >
              How it works
            </a>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            aria-hidden
            style={{
              background:
                'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(16, 185, 129, 0.15), transparent 55%)',
            }}
          />
          <div className="relative mx-auto max-w-4xl px-6 pb-24 pt-20 text-center md:px-10 md:pt-28 md:pb-32">
            <p className="mb-6 inline-flex items-center rounded-full border border-emerald-500/25 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium tracking-[0.2em] text-emerald-400">
              WEALTH LAB · PRIVATE · ILLUSTRATIVE ONLY
            </p>
            <h1 className="text-balance text-4xl font-semibold tracking-tight text-white md:text-5xl lg:text-6xl lg:leading-[1.1]">
              Will selling your company actually make you wealthier in the long run?
            </h1>
            <p className="mx-auto mt-8 max-w-2xl text-pretty text-lg leading-relaxed text-slate-400 md:text-xl">
              Realistic modeling of sale outcomes, taxes, net proceeds, and a Keep vs Sell comparison.
            </p>
          </div>
        </section>

        <HomepageLeadForm />

        {/* Value proposition */}
        <section id="value" className="border-t border-slate-800/80 bg-[#0d1829] py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-6 md:px-10">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
                Why this tool is different
              </h2>
              <p className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Clarity for a decision that is rarely simple
              </p>
              <p className="mt-4 text-slate-400 leading-relaxed">
                SellSmartPlanner is built to respect your intelligence—and your privacy.
              </p>
            </div>
            <div className="mt-16 grid gap-6 md:grid-cols-2">
              {VALUE_PROPS.map(({ icon: Icon, title, description }) => (
                <Card
                  key={title}
                  className="border-slate-700/80 border-l-2 border-l-transparent bg-[#1e2937]/80 shadow-none transition-all duration-300 hover:border-emerald-500/30 hover:border-l-[#EAB308]/70"
                >
                  <CardHeader className="pb-3">
                    <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
                      <Icon className="h-5 w-5 text-emerald-400" />
                    </div>
                    <CardTitle className="text-xl text-white">{title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-[15px] leading-relaxed text-slate-400">
                      {description}
                    </CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-t border-slate-800/80 py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-6 md:px-10">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
                How it works
              </h2>
              <p className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Four steps from inputs to the moment of truth
              </p>
            </div>
            <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(({ step, icon: Icon, title, teaser }) => (
                <div
                  key={step}
                  className="group/step relative rounded-3xl border border-slate-700/80 bg-[#111827]/60 p-8 transition-all duration-300 hover:border-emerald-500/30"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <span className="font-mono text-xs text-emerald-500/80 transition-colors duration-300 group-hover/step:text-[#FACC15]">
                      STEP {step}
                    </span>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-transparent bg-slate-800 text-emerald-400 transition-all duration-300 group-hover/step:border-[#FACC15]/25 group-hover/step:bg-[#FACC15]/10 group-hover/step:text-[#FACC15]">
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-white">{title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">{teaser}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-slate-800/80 bg-gradient-to-b from-[#0a1428] to-[#070d18] py-20 md:py-24">
          <div className="mx-auto max-w-2xl px-6 text-center md:px-10">
            <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
              Model the decision with discipline—not optimism alone
            </h2>
            <p className="mt-5 text-base leading-relaxed text-slate-400 md:text-lg">
              Walk through sale economics, taxes, reinvestment, and a Keep vs Sell comparison in one focused session.
              Everything stays on your device.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-[#070d18]">
        <div className="mx-auto max-w-6xl px-6 py-16 md:px-10">
          <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
            <div className="max-w-xl">
              <div className="flex items-center gap-3 text-white">
                <BrandMark />
                <span className="font-semibold">SellSmartPlanner</span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-slate-500">
                This site provides illustrative scenarios based on user inputs and simplified assumptions. It is{' '}
                <strong className="font-medium text-slate-400">not</strong> financial, tax, legal, or investment
                advice. Actual sale outcomes, taxes, and investment results will differ materially. Past performance
                does not guarantee future results. Consult qualified CPAs, attorneys, and investment advisors before
                making decisions.
              </p>
            </div>
            <div className="flex flex-col gap-4 text-sm text-slate-500 md:text-right">
              <p>
                Built with{' '}
                <span className="text-slate-400">Next.js</span>,{' '}
                <span className="text-slate-400">Recharts</span>, and{' '}
                <span className="text-slate-400">shadcn/ui</span>.
              </p>
            </div>
          </div>
          <Separator className="my-10 bg-slate-800" />
          <p className="text-center text-xs text-slate-600">
            © {new Date().getFullYear()} SellSmartPlanner · www.sellsmartplanner.com
          </p>
        </div>
      </footer>
    </div>
  );
}
