'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveLeadCapture } from '@/lib/leadCapture';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function HomepageLeadForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');

  const canContinue =
    fullName.trim().length > 0 && email.trim().length > 0;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canContinue) return;
    saveLeadCapture(fullName, email);
    router.push('/planner');
  };

  const inputClass =
    'h-[56px] min-h-[56px] rounded-2xl border-slate-600/90 bg-[#0f172a] px-5 py-4 text-lg text-slate-100 shadow-inner shadow-black/20 placeholder:text-slate-500 focus-visible:border-emerald-500/50 focus-visible:ring-2 focus-visible:ring-emerald-500/25';

  return (
    <section
      id="lead-form"
      className="relative overflow-hidden border-t border-slate-800/80 bg-[#0a1428] py-24 md:py-32"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse 90% 60% at 50% 20%, rgba(16, 185, 129, 0.12), transparent 55%)',
        }}
      />
      <div className="relative mx-auto max-w-3xl px-6 md:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400 md:text-base">
            Continue to the planner
          </p>
          <h2 className="mt-4 text-balance text-2xl font-semibold tracking-tight text-white md:text-3xl lg:text-4xl">
            One step before the Sell My Business Planner
          </h2>
          <p className="mt-5 text-pretty text-lg leading-relaxed text-slate-400 md:text-xl">
            Enter your name and email. Nothing is sent to a server—details stay in your browser
            so you can pick up where you left off.
          </p>
        </div>

        <div className="mx-auto mt-14 max-w-2xl md:mt-16">
          <div className="rounded-[28px] border border-slate-700/80 bg-slate-900/40 p-8 shadow-2xl shadow-emerald-950/20 ring-1 ring-inset ring-white/[0.04] backdrop-blur-sm md:p-10 lg:p-12">
            <form onSubmit={handleSubmit} className="space-y-8 md:space-y-9">
              <div className="space-y-3">
                <Label
                  htmlFor="lead-full-name"
                  className="text-base font-semibold tracking-wide text-slate-200 md:text-lg"
                >
                  Full name
                </Label>
                <p className="text-sm text-slate-500 md:text-base">
                  As you&apos;d like it to appear if we follow up.
                </p>
                <Input
                  id="lead-full-name"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={inputClass}
                  placeholder="Jane Smith"
                />
              </div>
              <div className="space-y-3">
                <Label
                  htmlFor="lead-email"
                  className="text-base font-semibold tracking-wide text-slate-200 md:text-lg"
                >
                  Email address
                </Label>
                <p className="text-sm text-slate-500 md:text-base">
                  For session continuity only—no marketing lists from this page.
                </p>
                <Input
                  id="lead-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@company.com"
                />
              </div>
              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={!canContinue}
                  className={cn(
                    'h-16 w-full rounded-2xl px-8 text-lg font-semibold shadow-lg transition-all',
                    canContinue
                      ? 'border-0 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-900/40 hover:from-emerald-500 hover:to-teal-500 hover:text-white hover:shadow-[0_0_32px_-6px_rgba(250,204,21,0.45)] hover:ring-2 hover:ring-[#FACC15]/30'
                      : 'cursor-not-allowed bg-slate-800 text-slate-500'
                  )}
                >
                  <span className="inline-flex items-center justify-center gap-3">
                    Continue to the Planner
                    <ArrowRight className="h-5 w-5 shrink-0" />
                  </span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
