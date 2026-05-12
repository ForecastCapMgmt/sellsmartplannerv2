'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { 
  ArrowLeft, ArrowRight, Building2, Calculator, TrendingUp, 
  Scale, Save, RotateCcw, Info, Check, Wallet, Shield, Gauge, Sparkles, Trash2 
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { PlannerData, BusinessInputs, SaleAssumptions, PostSaleProjection } from '@/lib/calculators/types';
import { calculateSaleOutcome, getSaleAssumptionDefaults } from '@/lib/calculators/saleCalculator';
import { hasValidLeadCapture } from '@/lib/leadCapture';
import { cn } from '@/lib/utils';

const STEPS = [
  { id: 1, title: 'Business Inputs', icon: Building2, description: 'Company financials & profile' },
  { id: 2, title: 'Sale Outcome', icon: Calculator, description: 'Taxes, fees & net proceeds' },
  { id: 3, title: 'Post-Sale Projection', icon: TrendingUp, description: 'Wealth after sale' },
  { id: 4, title: 'Keep vs Sell', icon: Scale, description: 'The moment of truth' },
];

const DEFAULT_INPUTS: BusinessInputs = {
  annualRevenue: 8500000,
  ebitda: 1250000,
  ebitdaMargin: 14.7, // Will be overridden by live calculation
  growthRate: 8,
  saleMultiple: 7.5, // Default realistic value; user can test any multiple
  ownerAge: 52,
  yearsToRetirement: 13,
  federalCapitalGainsRate: 23.8,
  stateTaxRate: 5.0,
  qualifiesForQSBS: false,
  currentSalary: 425000,
};

/** Same series math as the Step 4 LineChart — used for chart, Key Insight, and Scenario Comparison table. */
function buildKeepSellChartSeries(
  inputs: BusinessInputs,
  netProceeds: number,
  post: PostSaleProjection
): { keepData: { value: number }[]; sellData: { value: number }[] } {
  const len = post.yearsProjection + 1;
  const keepData = Array.from({ length: len }, (_, i) => ({
    value: Math.round(
      inputs.ebitda * Math.pow(1 + (inputs.growthRate || 8) / 100, i) * (inputs.saleMultiple || 6)
    ),
  }));
  const sellData = Array.from({ length: len }, (_, i) => ({
    value: Math.round(
      netProceeds * Math.pow(1 + (post.investmentReturnRate || 7.5) / 100, i) -
        post.annualSpending * i * 0.7
    ),
  }));
  return { keepData, sellData };
}

function formatAnnualIncomePerYear(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')} per year`;
}

function PlannerContent() {
  const [data, setData] = useState<PlannerData>({
    inputs: {
      ...DEFAULT_INPUTS,
      federalCapitalGainsRate: 23.8,
      stateTaxRate: 5.0,
      qualifiesForQSBS: false, // ensure never undefined
    },
    saleAssumptions: getSaleAssumptionDefaults(),
    postSaleProjection: {
      investmentReturnRate: 7.5,
      annualSpending: 250000,
      inflationRate: 2.5,
      yearsProjection: 20,
    },
    results: null,
    currentStep: 1,
    savedScenarios: [],
  });

  const [isCalculating, setIsCalculating] = useState(false);
  /** Which saved scenario is loaded in the planner (sidebar + Step 4 table highlight). */
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);

  // EBITDA Margin - fully derived with useMemo (never stored in mutable form state)
  const annualRevenue = data.inputs.annualRevenue;
  const ebitda = data.inputs.ebitda;
  const ebitdaMargin = useMemo(() => {
    if (!annualRevenue || annualRevenue === 0) return 0;

    return Math.round((ebitda / annualRevenue) * 100 * 10) / 10;
  }, [annualRevenue, ebitda]);

  // KeepData and SellData — single source: buildKeepSellChartSeries (chart, Key Insight, table)
  const { keepData, sellData } = useMemo(
    () =>
      buildKeepSellChartSeries(
        data.inputs,
        data.results?.netProceeds ?? 6500000,
        data.postSaleProjection
      ),
    [data.inputs, data.results?.netProceeds, data.postSaleProjection]
  );

  /** 4% / 5% / 7% of net proceeds (Sell & Invest), tilted slightly by expected return so UI updates when Step 3 return changes. */
  const sustainableAnnualIncome = useMemo(() => {
    const net = data.results?.netProceeds ?? 0;
    const r = data.postSaleProjection.investmentReturnRate ?? 7.5;
    const adj = 1 + (r - 7.5) / 100;
    return {
      conservative: Math.round(net * 0.04 * adj),
      moderate: Math.round(net * 0.05 * adj),
      optimistic: Math.round(net * 0.07 * adj),
    };
  }, [data.results?.netProceeds, data.postSaleProjection.investmentReturnRate]);

  // Load from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem('sellSmartPlannerData');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setData(parsed);
      } catch (e) {
        console.error('Failed to parse saved data');
      }
    }
  }, []);

  // Trigger initial calculation after mount (ensures Step 2 shows realistic numbers)
  useEffect(() => {
    const timer = setTimeout(() => {
      calculateResults();
    }, 150);
    return () => clearTimeout(timer);
  }, []); // Empty deps to run once after mount (calculateResults is stable via useCallback)

  // Save to localStorage whenever data changes
  useEffect(() => {
    localStorage.setItem('sellSmartPlannerData', JSON.stringify(data));
  }, [data]);

  // Real-time calculation engine - fully transparent
  const calculateResults = useCallback(() => {
    setIsCalculating(true);
    
    // Sale calculation (transparent formulas in saleCalculator.ts)
    // Uses live business inputs from Step 1 (Revenue, EBITDA, etc.)
    const saleResults = calculateSaleOutcome(data.inputs, data.saleAssumptions);
    
    // Simple projection simulation (transparent linear growth model for demo)
    const years = Array.from({ length: data.postSaleProjection.yearsProjection + 1 }, (_, i) => i);
    
    // Keep business projection: growing EBITDA converted to owner value at multiple
    // Uses current data.inputs (same state as table and loadScenario)
    const keepProjection = years.map((year) => {
      const grownEbitda = data.inputs.ebitda * Math.pow(1 + data.inputs.growthRate / 100, year);
      return Math.round(grownEbitda * (data.inputs.saleMultiple || 6)); // Use the loaded saleMultiple
    });
    
    // Post-sale projection: net proceeds growing at investment rate minus spending adjusted for inflation
    const netProceeds = saleResults.netProceeds || 6500000;
    const postSaleProjection = years.map((year) => {
      const inflatedSpending = data.postSaleProjection.annualSpending * 
        Math.pow(1 + data.postSaleProjection.inflationRate / 100, year);
      const growthFactor = Math.pow(1 + data.postSaleProjection.investmentReturnRate / 100, year);
      return Math.round(netProceeds * growthFactor - inflatedSpending * year * 0.7);
    });

    const results = {
      estimatedSalePrice: saleResults.estimatedSalePrice || 9375000,
      totalTaxes: saleResults.totalTaxes || 0,
      netProceeds: saleResults.netProceeds || 6500000,
      qsbsFederalSavings: saleResults.qsbsFederalSavings || 0,
      postSaleWealthProjection: postSaleProjection,
      keepBusinessProjection: keepProjection,
      comparison: {
        sellAdvantage: postSaleProjection[postSaleProjection.length - 1] - keepProjection[keepProjection.length - 1],
        recommendation: keepProjection[keepProjection.length - 1] > postSaleProjection[postSaleProjection.length - 1] 
          ? "Keep the business" 
          : "Sell & Invest",
        insights: [
          "Keeping the business often compounds wealth faster due to continued growth.",
          "Taxes on sale can significantly reduce net proceeds.",
          "Investment returns post-sale need to outperform business growth to be comparable.",
          "This is a simplified model. Real outcomes depend on many variables.",
        ],
      },
    };

    setData(prev => ({ ...prev, results }));
    setIsCalculating(false);
  }, [data.inputs, data.saleAssumptions, data.postSaleProjection]);

  // Run calculations when inputs change (including the single Sale Multiple from Step 1)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      calculateResults();
    }, 300); // Debounce calculations

    return () => clearTimeout(timeoutId);
  }, [calculateResults]);

  const updateInputs = (updates: Partial<BusinessInputs>) => {
    setData(prev => {
      const newInputs = { ...prev.inputs, ...updates };
      // EBITDA Margin is fully derived and transparent (per .cursorrules)
      // Formula: EBITDA Margin % = (EBITDA / Annual Revenue) × 100
      if (newInputs.annualRevenue > 0 && newInputs.ebitda !== undefined) {
        const computedMargin = (newInputs.ebitda / newInputs.annualRevenue) * 100;
        newInputs.ebitdaMargin = Math.round(computedMargin * 10) / 10; // 1 decimal place
      }
      return {
        ...prev,
        inputs: newInputs
      };
    });
  };

  const updateSaleAssumptions = (updates: Partial<SaleAssumptions>) => {
    setData(prev => ({
      ...prev,
      saleAssumptions: { ...prev.saleAssumptions, ...updates }
    }));
  };

  const updatePostSaleProjection = (updates: Partial<PostSaleProjection>) => {
    setData(prev => ({
      ...prev,
      postSaleProjection: { ...prev.postSaleProjection, ...updates }
    }));
  };

  const nextStep = () => {
    if (data.currentStep < 4) {
      setData(prev => ({ ...prev, currentStep: prev.currentStep + 1 }));
    }
  };

  const prevStep = () => {
    if (data.currentStep > 1) {
      setData(prev => ({ ...prev, currentStep: prev.currentStep - 1 }));
    }
  };

  const goToStep = (step: number) => {
    setData(prev => ({ ...prev, currentStep: step }));
  };

  const saveScenario = () => {
    if (!data.results) {
      alert("Please complete the inputs to generate results before saving.");
      return;
    }
    
    const name = prompt("Name this scenario:", `Scenario ${data.savedScenarios.length + 1}`);
    if (!name) return;
    
    const newScenario = {
      id: Date.now().toString(),
      name: name.trim(),
      timestamp: new Date().toISOString(),
      inputs: { ...data.inputs },
      results: { ...data.results },
    };
    
    setData(prev => ({
      ...prev,
      savedScenarios: [newScenario, ...prev.savedScenarios].slice(0, 5), // Keep last 5
    }));

    // Simple toast notification
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-6 right-6 bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 z-50';
    toast.innerHTML = `
      <div class="w-5 h-5 bg-white/20 rounded-xl flex items-center justify-center">✓</div>
      Scenario saved successfully
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  };

  const loadScenario = (scenario: any) => {
    setActiveScenarioId(scenario.id);
    // Completely replace current inputs, results, and force recalculation of projections/chart
    // Do NOT change currentStep so user stays on the step they clicked from
    setData(prev => {
      const newInputs = { ...scenario.inputs };
      const newResults = { ...scenario.results };
      
      // Force recalculation of projections using the loaded inputs
      const years = Array.from({ length: prev.postSaleProjection.yearsProjection + 1 }, (_, i) => i);
      const keepProjection = years.map((year) => {
        const grownEbitda = newInputs.ebitda * Math.pow(1 + (newInputs.growthRate || 8) / 100, year);
        return Math.round(grownEbitda * (newInputs.saleMultiple || 6));
      });
      
      const netProceeds = newResults.netProceeds || 6500000;
      const postSaleProjection = years.map((year) => {
        const inflatedSpending = prev.postSaleProjection.annualSpending * 
          Math.pow(1 + (prev.postSaleProjection.inflationRate || 2.5) / 100, year);
        const growthFactor = Math.pow(1 + (prev.postSaleProjection.investmentReturnRate || 7.5) / 100, year);
        return Math.round(netProceeds * growthFactor - inflatedSpending * year * 0.7);
      });
      
      newResults.keepBusinessProjection = keepProjection;
      newResults.postSaleWealthProjection = postSaleProjection;
      newResults.comparison.sellAdvantage = postSaleProjection[postSaleProjection.length - 1] - keepProjection[keepProjection.length - 1];
      
      return {
        ...prev,
        inputs: newInputs,
        results: newResults,
        // Do not reset currentStep - keep user on the current view (Step 4 stays in Step 4)
      };
    });

    // Toast notification
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-6 right-6 bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 z-50';
    toast.innerHTML = `
      <div class="w-5 h-5 bg-white/20 rounded-xl flex items-center justify-center">✓</div>
      Loaded "${scenario.name}" successfully
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  };

  const deleteScenario = (scenarioId: string) => {
    setActiveScenarioId((prev) => (prev === scenarioId ? null : prev));
    setData((prev) => ({
      ...prev,
      savedScenarios: prev.savedScenarios.filter((s) => s.id !== scenarioId),
    }));
    const toast = document.createElement('div');
    toast.className =
      'fixed bottom-6 right-6 bg-slate-800 text-white px-6 py-3 rounded-2xl shadow-xl z-50 border border-slate-600';
    toast.textContent = 'Scenario deleted';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  };

  const resetToDefaults = () => {
    setActiveScenarioId(null);
    setData(prev => ({
      ...prev,
      savedScenarios: [], // Only clear saved scenarios, leave current inputs/results intact
    }));
    
    localStorage.setItem('sellSmartPlannerData', JSON.stringify({
      ...data,
      savedScenarios: [],
    }));

    // Toast notification
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-6 right-6 bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 z-50';
    toast.innerHTML = `
      <div class="w-5 h-5 bg-white/20 rounded-xl flex items-center justify-center">✓</div>
      All saved scenarios have been cleared
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  };

  const currentStepInfo = STEPS.find(s => s.id === data.currentStep)!;
  const progress = ((data.currentStep - 1) / (STEPS.length - 1)) * 100;

  return (
    <TooltipProvider>
      <div className="flex min-h-screen flex-col bg-[#0a1428] text-slate-200 md:flex-row">
        {/* Progress Sidebar — desktop only */}
        <div className="hidden w-80 shrink-0 flex-col border-r border-slate-700 bg-[#111827] p-8 md:flex">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center">
              <Calculator className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-semibold text-xl tracking-tight text-white">SellSmartPlanner</div>
              <div className="text-xs text-emerald-400">WEALTH LAB</div>
            </div>
          </div>

          <div className="mb-8">
            <div className="flex justify-between text-xs uppercase tracking-widest text-slate-500 mb-3">
              <div>PROGRESS</div>
              <div>{data.currentStep} OF {STEPS.length}</div>
            </div>
            <Progress value={progress} className="h-2 bg-slate-800" />
          </div>

          <div className="space-y-2 mb-auto">
            {STEPS.map((step, index) => {
              const isActive = step.id === data.currentStep;
              const isCompleted = step.id < data.currentStep;
              const Icon = step.icon;
              
              return (
                <button
                  key={step.id}
                  onClick={() => goToStep(step.id)}
                  className={cn(
                    "w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all progress-step group",
                    isActive 
                      ? "bg-emerald-500/10 border border-emerald-500 active-step" 
                      : "hover:bg-slate-800 border border-transparent"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors",
                    isActive ? "bg-emerald-500 text-white" : isCompleted ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 text-slate-400 group-hover:text-slate-300"
                  )}>
                    {isCompleted ? '✓' : <Icon className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={cn(
                      "font-medium text-sm",
                      isActive ? "text-white" : "text-slate-300"
                    )}>
                      {step.title}
                    </div>
                    <div className="text-xs text-slate-500 line-clamp-1">{step.description}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-auto pt-8 border-t border-slate-700">
            <Button 
              onClick={saveScenario} 
              variant="outline" 
              className="w-full mb-3 border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-400"
              disabled={!data.results}
            >
              <Save className="w-4 h-4 mr-2" />
              SAVE SCENARIO
            </Button>
            <Button 
              onClick={resetToDefaults} 
              variant="ghost" 
              className="w-full text-slate-400 hover:text-slate-200"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              RESET TO DEFAULTS
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          {/* Mobile: top progress stepper + quick actions (replaces left sidebar navigation) */}
          <div className="sticky top-0 z-40 border-b border-slate-700/80 bg-[#0a1428]/95 backdrop-blur-md px-4 pb-4 pt-4 md:hidden">
            <div className="flex items-center justify-between gap-2">
              {STEPS.map((step) => {
                const isActive = step.id === data.currentStep;
                const isCompleted = step.id < data.currentStep;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => goToStep(step.id)}
                    className={cn(
                      'flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-xl py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60',
                      isActive && 'bg-emerald-500/10'
                    )}
                    aria-current={isActive ? 'step' : undefined}
                    aria-label={`Go to step ${step.id}: ${step.title}`}
                  >
                    <span
                      className={cn(
                        'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums transition-colors',
                        isActive
                          ? 'bg-emerald-500 text-[#0a1428] shadow-lg shadow-emerald-900/40 ring-2 ring-emerald-400/40'
                          : isCompleted
                            ? 'bg-emerald-500/25 text-emerald-300 ring-1 ring-emerald-500/30'
                            : 'bg-slate-800 text-slate-500 ring-1 ring-slate-700'
                      )}
                    >
                      {isCompleted ? (
                        <Check className="h-5 w-5 text-emerald-400" strokeWidth={3} />
                      ) : (
                        step.id
                      )}
                    </span>
                    <span
                      className={cn(
                        'line-clamp-2 w-full px-0.5 text-center text-[10px] font-medium uppercase leading-tight tracking-wide',
                        isActive ? 'text-emerald-400' : 'text-slate-500'
                      )}
                    >
                      {step.title}
                    </span>
                  </button>
                );
              })}
            </div>
            <Progress value={progress} className="mt-3 h-2 bg-slate-800" />
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                onClick={saveScenario}
                variant="outline"
                disabled={!data.results}
                className="min-h-11 flex-1 border-emerald-500/35 text-sm text-emerald-400 hover:bg-emerald-500/10"
              >
                <Save className="mr-2 h-4 w-4 shrink-0" />
                Save scenario
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={resetToDefaults}
                className="min-h-11 shrink-0 px-3 text-sm text-slate-400 hover:text-slate-200"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mx-auto max-w-5xl px-4 py-6 md:px-10 md:py-10">
            <div className="mb-8 flex flex-col gap-6 md:mb-10 md:flex-row md:items-center md:justify-between md:gap-8">
              <div className="min-w-0">
                <div className="mb-1 text-xs font-medium uppercase tracking-[3px] text-emerald-500">FLAGTOOL</div>
                <h1 className="text-3xl font-semibold tracking-tighter text-white md:text-5xl">
                  Sell My Business Planner
                </h1>
                <p className="mt-3 max-w-md text-base leading-relaxed text-slate-400 md:text-xl">
                  Will selling your company actually make you wealthier in the long run?
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-3 md:gap-4">
                <div className="min-w-[8rem] flex-1 text-right md:flex-none md:text-right">
                  <div className="text-xs text-slate-400 md:text-sm">Current Step</div>
                  <div className="text-lg font-semibold text-white md:text-2xl">{currentStepInfo.title}</div>
                </div>
                <div className="hidden h-12 w-px bg-slate-700 md:block" />
                <Button
                  type="button"
                  onClick={prevStep}
                  disabled={data.currentStep === 1}
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  onClick={nextStep}
                  disabled={data.currentStep === 4}
                  className="h-11 shrink-0 bg-emerald-600 px-5 hover:bg-emerald-500 md:h-10"
                >
                  {data.currentStep === 4 ? 'FINISH' : 'NEXT'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Step Content */}
            <Card className="glass border-slate-700 shadow-2xl">
              <CardHeader className="border-b border-slate-700 pb-8">
                <div className="flex items-start gap-4">
                    <div className="mt-1">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                        {React.createElement(currentStepInfo.icon, { className: "w-6 h-6 text-white" })}
                      </div>
                    </div>
                  <div className="flex-1">
                    <CardTitle className="text-3xl text-white tracking-tight">{currentStepInfo.title}</CardTitle>
                    <CardDescription className="text-lg text-slate-400 mt-2">{currentStepInfo.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className={cn(data.currentStep === 1 ? 'p-10 py-12 md:p-14' : 'p-10')}>
                {data.currentStep === 1 && (
                  <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-14">
                    <div className="flex flex-col gap-12">
                      {/* Revenue & EBITDA */}
                      <div className="rounded-2xl border border-slate-700/90 bg-[#0f172a]/40 p-8 shadow-inner shadow-black/20 ring-1 ring-white/[0.03] md:p-10">
                        <div className="mb-8 flex items-center gap-4 border-b border-slate-700/70 pb-5">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
                            <Wallet className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold tracking-tight text-white md:text-xl">
                              Revenue &amp; EBITDA
                            </h3>
                            <p className="mt-0.5 text-sm text-slate-500">Core financial baseline</p>
                          </div>
                        </div>
                        <div className="space-y-10">
                          <div>
                            <Label className="text-sm font-medium uppercase tracking-wider text-slate-300">
                              Annual revenue
                            </Label>
                            <div className="relative mt-3">
                              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-base text-slate-500">$</span>
                              <Input
                                type="number"
                                value={data.inputs.annualRevenue}
                                onChange={(e) => updateInputs({ annualRevenue: parseInt(e.target.value) || 0 })}
                                className="h-16 border-slate-700 bg-slate-950 pl-10 text-2xl text-slate-100 md:h-[4.25rem]"
                              />
                            </div>
                            <p className="mt-2 text-sm text-slate-500">Trailing 12-month figure</p>
                          </div>
                          <div>
                            <Label className="text-sm font-medium uppercase tracking-wider text-slate-300">EBITDA</Label>
                            <div className="relative mt-3">
                              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-base text-slate-500">$</span>
                              <Input
                                type="number"
                                value={data.inputs.ebitda}
                                onChange={(e) => updateInputs({ ebitda: parseInt(e.target.value) || 0 })}
                                className="h-16 border-slate-700 bg-slate-950 pl-10 text-2xl text-slate-100 md:h-[4.25rem]"
                              />
                            </div>
                            <p className="mt-2 text-sm text-slate-500">
                              Earnings before interest, taxes, depreciation &amp; amortization
                            </p>
                          </div>
                          <div className="rounded-xl border border-slate-700/80 bg-slate-950/60 px-5 py-6 md:px-6 md:py-7">
                            <Label className="text-sm font-medium uppercase tracking-wider text-slate-300">
                              EBITDA margin <span className="font-normal normal-case text-slate-500">(live)</span>
                            </Label>
                            <div className="mt-2 text-4xl font-semibold tabular-nums text-emerald-400 md:text-[2.5rem]">
                              {ebitdaMargin}%
                            </div>
                            <p className="mt-2 text-sm text-slate-500">(EBITDA ÷ revenue) × 100 — updates as you type</p>
                          </div>
                        </div>
                      </div>

                      {/* Growth & valuation */}
                      <div className="rounded-2xl border border-slate-700/90 bg-[#0f172a]/40 p-8 shadow-inner shadow-black/20 ring-1 ring-white/[0.03] md:p-10">
                        <div className="mb-8 flex items-center gap-4 border-b border-slate-700/70 pb-5">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-400 ring-1 ring-teal-500/20">
                            <TrendingUp className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold tracking-tight text-white md:text-xl">
                              Growth &amp; valuation
                            </h3>
                            <p className="mt-0.5 text-sm text-slate-500">Trajectory and implied sale multiple</p>
                          </div>
                        </div>
                        <div className="space-y-10">
                          <div>
                            <Label className="text-sm font-medium uppercase tracking-wider text-slate-300">
                              Annual growth rate
                            </Label>
                            <div className="mt-4 flex items-center gap-6">
                              <Slider
                                value={[data.inputs.growthRate]}
                                onValueChange={(values) => updateInputs({ growthRate: values[0] })}
                                max={25}
                                min={0}
                                step={0.5}
                                className="flex-1"
                              />
                              <div className="w-[4.5rem] shrink-0 text-right font-mono text-lg font-medium text-emerald-400 tabular-nums md:text-xl">
                                {data.inputs.growthRate}%
                              </div>
                            </div>
                          </div>
                          <div>
                            <Label className="text-sm font-medium uppercase tracking-wider text-slate-300">
                              Sale multiple <span className="font-normal normal-case text-slate-500">(× EBITDA)</span>
                            </Label>
                            <div className="mt-4 flex items-center gap-6">
                              <Slider
                                value={[data.inputs.saleMultiple]}
                                onValueChange={(values) => updateInputs({ saleMultiple: values[0] })}
                                max={15}
                                min={3}
                                step={0.25}
                                className="flex-1"
                              />
                              <div className="w-[4.5rem] shrink-0 text-right font-mono text-lg font-medium text-emerald-400 tabular-nums md:text-xl">
                                {data.inputs.saleMultiple.toFixed(1)}x
                              </div>
                            </div>
                            <p className="mt-3 text-sm text-slate-500">
                              Typical range varies by industry and size; adjust to stress-test your outcome.
                            </p>
                          </div>
                          <div>
                            <p className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500 md:text-sm">
                              Owner &amp; horizon
                            </p>
                            <div className="grid grid-cols-2 gap-5 md:gap-6">
                              <div>
                                <Label className="text-sm text-slate-300">Owner age</Label>
                                <Input
                                  type="number"
                                  value={data.inputs.ownerAge}
                                  onChange={(e) => updateInputs({ ownerAge: parseInt(e.target.value) || 0 })}
                                  className="mt-2.5 h-14 border-slate-700 bg-slate-950 text-lg md:h-16 md:text-xl"
                                />
                              </div>
                              <div>
                                <Label className="text-sm text-slate-300">Years to retirement</Label>
                                <Input
                                  type="number"
                                  value={data.inputs.yearsToRetirement}
                                  onChange={(e) => updateInputs({ yearsToRetirement: parseInt(e.target.value) || 0 })}
                                  className="mt-2.5 h-14 border-slate-700 bg-slate-950 text-lg md:h-16 md:text-xl"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Tax assumptions */}
                    <div className="rounded-2xl border border-slate-700/90 bg-[#0f172a]/40 p-8 shadow-inner shadow-black/20 ring-1 ring-white/[0.03] md:p-10 lg:min-h-0">
                      <div className="mb-8 flex items-center gap-4 border-b border-slate-700/70 pb-5">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#FACC15]/10 text-[#FACC15] ring-1 ring-[#FACC15]/20">
                          <Shield className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold tracking-tight text-white md:text-xl">Tax assumptions</h3>
                          <p className="mt-0.5 text-sm text-slate-500">Applied to the modeled business sale</p>
                        </div>
                      </div>
                      <div className="space-y-10">
                        <div>
                          <Label className="text-sm font-medium uppercase tracking-wider text-slate-300">
                            Federal LT cap gains
                          </Label>
                          <div className="relative mt-3 max-w-[15rem]">
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              max="40"
                              value={data.inputs.federalCapitalGainsRate ?? 23.8}
                              onChange={(e) => updateInputs({ federalCapitalGainsRate: parseFloat(e.target.value) || 23.8 })}
                              className="h-16 border-slate-700 bg-slate-950 py-3 pl-5 pr-10 font-mono text-2xl text-slate-100 focus-visible:border-emerald-500"
                            />
                            <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-lg text-slate-400">
                              %
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-slate-500">
                            Long-term rate on the modeled sale (before state / QSBS nuances in later steps).
                          </p>
                        </div>
                        <div>
                          <Label className="text-sm font-medium uppercase tracking-wider text-slate-300">
                            State capital gains / income add-on
                          </Label>
                          <div className="relative mt-3 max-w-[15rem]">
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              max="20"
                              value={data.inputs.stateTaxRate ?? 5.0}
                              onChange={(e) => updateInputs({ stateTaxRate: parseFloat(e.target.value) || 5.0 })}
                              className="h-16 border-slate-700 bg-slate-950 py-3 pl-5 pr-10 font-mono text-2xl text-slate-100 focus-visible:border-emerald-500"
                            />
                            <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-lg text-slate-400">
                              %
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-slate-500">
                            Combined state-level burden you want reflected in the illustration.
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-700/80 bg-slate-950/50 px-5 py-6 md:px-6 md:py-7">
                          <div className="flex items-start justify-between gap-5">
                            <div className="min-w-0 space-y-2">
                              <Label className="text-base font-medium leading-snug text-slate-200">
                                QSBS (Section 1202)
                              </Label>
                              <p className="text-sm leading-relaxed text-slate-500">
                                Exclude up to eligible federal gain on qualified small business stock.
                              </p>
                            </div>
                            <Switch
                              checked={data.inputs.qualifiesForQSBS || false}
                              onCheckedChange={(checked) => updateInputs({ qualifiesForQSBS: checked })}
                              className="mt-1 shrink-0 scale-110"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {data.currentStep === 2 && (
                  <div className="mx-auto w-full max-w-2xl space-y-10">
                    <div className="rounded-3xl border border-slate-700/90 bg-slate-950/45 p-5 shadow-2xl shadow-black/40 ring-1 ring-white/[0.05] backdrop-blur-md sm:p-8">
                      <h3 className="mb-6 flex items-center gap-3 text-xl font-semibold tracking-tight text-white sm:mb-8 sm:text-xl md:text-lg">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/25">
                          <Calculator className="h-5 w-5 text-emerald-400" />
                        </span>
                        Sale Outcome Summary
                      </h3>
                      {data.results && (
                        <div className="grid grid-cols-1 gap-5 sm:gap-6 md:grid-cols-3 md:gap-6">
                          <div className="rounded-2xl border border-slate-700/80 bg-[#0a1428]/80 p-6 shadow-inner backdrop-blur-sm sm:p-7">
                            <div className="mb-3 text-[11px] font-medium uppercase tracking-wider text-slate-500 md:mb-2 md:text-xs">
                              Estimated sale price
                            </div>
                            <div className="text-4xl font-semibold tabular-nums leading-none tracking-tight text-white sm:text-5xl md:text-4xl">
                              ${(data.results.estimatedSalePrice / 1000000).toFixed(1)}M
                            </div>
                          </div>
                          <div className="rounded-2xl border border-slate-700/80 bg-[#0a1428]/80 p-6 shadow-inner backdrop-blur-sm sm:p-7">
                            <div className="mb-3 text-[11px] font-medium uppercase tracking-wider text-slate-500 md:mb-2 md:text-xs">
                              Total taxes &amp; fees
                            </div>
                            <div className="text-4xl font-semibold tabular-nums leading-none tracking-tight text-rose-400 sm:text-5xl md:text-4xl">
                              ${(data.results.totalTaxes / 1000000).toFixed(1)}M
                            </div>
                          </div>
                          <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/[0.08] p-6 shadow-inner shadow-emerald-950/20 backdrop-blur-sm ring-1 ring-emerald-500/20 sm:p-7 md:ring-emerald-500/30">
                            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-emerald-400/95 md:mb-2 md:text-xs">
                              Your net proceeds
                            </div>
                            <div className="text-4xl font-semibold tabular-nums leading-none tracking-tight text-emerald-300 sm:text-[2.85rem] md:text-4xl">
                              ${(data.results.netProceeds / 1000000).toFixed(1)}M
                            </div>
                          </div>
                        </div>
                      )}
                      {data.inputs.qualifiesForQSBS && data.results && data.results.qsbsFederalSavings > 0 && (
                        <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 sm:mt-8 sm:p-5">
                          <div className="flex flex-wrap items-start gap-3 text-sm font-medium leading-relaxed text-emerald-400 sm:text-base">
                            <Check className="mt-0.5 h-5 w-5 shrink-0 sm:h-6 sm:w-6" />
                            <span>
                              QSBS exclusion applied —{' '}
                              <span className="font-mono tabular-nums">
                                ${(data.results.qsbsFederalSavings / 1000000).toFixed(1)}M
                              </span>{' '}
                              in modeled federal tax savings
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-8">
                      {/* Sale Multiple is now controlled exclusively from Step 1 Business Inputs (per requirements). Other assumptions can be added here later. */}
                    </div>
                  </div>
                )}

                {data.currentStep === 3 && (
                  <div className="max-w-2xl space-y-10">
                    <p className="text-lg leading-relaxed text-slate-400">
                      Project your post-sale financial picture. All assumptions editable below.
                    </p>

                    <div className="rounded-2xl border border-slate-700/90 bg-[#0f172a]/40 p-8 shadow-inner shadow-black/20 ring-1 ring-white/[0.03] md:p-10">
                      <div className="mb-8 flex items-center gap-4 border-b border-slate-700/70 pb-5">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-400 ring-1 ring-teal-500/20">
                          <TrendingUp className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold tracking-tight text-white md:text-xl">
                            Post-sale projection
                          </h3>
                          <p className="mt-0.5 text-sm text-slate-500">Return, draw, inflation, horizon</p>
                        </div>
                      </div>

                      <div className="space-y-10">
                        <div>
                          <Label className="text-sm font-medium uppercase tracking-wider text-slate-300">
                            Expected annual investment return
                          </Label>
                          <div className="relative mt-3 max-w-[15rem]">
                            <Input
                              type="number"
                              step={0.25}
                              min={1}
                              max={999}
                              value={data.postSaleProjection.investmentReturnRate}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val)) {
                                  updatePostSaleProjection({
                                    investmentReturnRate: Math.max(1, Math.min(999, val)),
                                  });
                                }
                              }}
                              className="h-16 border-slate-700 bg-slate-950 py-3 pl-5 pr-12 font-mono text-2xl text-emerald-400 focus-visible:border-emerald-500 md:h-[4.25rem]"
                            />
                            <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-lg text-slate-400">
                              %
                            </span>
                          </div>
                          <p className="mt-3 text-sm leading-relaxed text-slate-500">
                            Portfolio-style annual return assumption (nominal). Long-run public markets often land in roughly 7–10%, but outcomes vary materially.
                          </p>
                        </div>

                        <div>
                          <Label className="text-sm font-medium uppercase tracking-wider text-slate-300">
                            Annual lifestyle draw
                          </Label>
                          <div className="relative mt-3 max-w-[20rem]">
                            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-base text-slate-500">$</span>
                            <Input
                              type="number"
                              min={0}
                              step={10000}
                              value={data.postSaleProjection.annualSpending}
                              onChange={(e) =>
                                updatePostSaleProjection({
                                  annualSpending: Math.max(0, parseInt(e.target.value, 10) || 0),
                                })
                              }
                              className="h-16 border-slate-700 bg-slate-950 pl-10 text-2xl text-slate-100 md:h-[4.25rem]"
                            />
                          </div>
                          <p className="mt-3 text-sm leading-relaxed text-slate-500">
                            Spending taken from proceeds over the projection horizon (Illustrative; see formula in scenario engine).
                          </p>
                        </div>

                        <div>
                          <Label className="text-sm font-medium uppercase tracking-wider text-slate-300">
                            Expected inflation
                          </Label>
                          <div className="mt-4 flex items-center gap-6">
                            <Slider
                              value={[data.postSaleProjection.inflationRate]}
                              onValueChange={(values) =>
                                updatePostSaleProjection({ inflationRate: values[0] })
                              }
                              max={12}
                              min={0}
                              step={0.25}
                              className="flex-1 max-w-xl"
                            />
                            <div className="w-[4.5rem] shrink-0 text-right font-mono text-lg font-medium text-emerald-400 tabular-nums md:text-xl">
                              {data.postSaleProjection.inflationRate}%
                            </div>
                          </div>
                          <p className="mt-3 text-sm text-slate-500">Annual inflation applied to assumed spending trajectory.</p>
                        </div>

                        <div>
                          <Label className="text-sm font-medium uppercase tracking-wider text-slate-300">
                            Projection horizon
                          </Label>
                          <div className="mt-4 flex items-center gap-6">
                            <Slider
                              value={[data.postSaleProjection.yearsProjection]}
                              onValueChange={(values) =>
                                updatePostSaleProjection({ yearsProjection: values[0] })
                              }
                              max={35}
                              min={5}
                              step={1}
                              className="flex-1 max-w-xl"
                            />
                            <div className="min-w-[5.5rem] shrink-0 text-right font-mono text-lg font-medium text-emerald-400 tabular-nums md:text-xl">
                              {data.postSaleProjection.yearsProjection} yrs
                            </div>
                          </div>
                          <p className="mt-3 text-sm text-slate-500">
                            Years plotted in Step 4 and used for post-sale wealth math.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-700/80 bg-slate-950/50 px-5 py-4 text-sm leading-relaxed text-slate-500 md:px-6 md:py-5">
                      These projections assume constant rates and do not account for market volatility, taxes on
                      investment gains, or lifestyle changes. They are for illustrative purposes only.
                    </div>
                  </div>
                )}

                {data.currentStep === 4 && data.results && (
                  <div className="space-y-12">
                    <div className="mb-2">
                      <h3 className="text-3xl font-semibold tracking-tight text-white md:text-[2rem]">
                        Keep vs Sell Comparison
                      </h3>
                      <p className="mt-2 text-lg text-slate-400">
                        Over a {data.postSaleProjection.yearsProjection}-year horizon
                      </p>
                    </div>

                    <div className="h-[460px] rounded-3xl border border-slate-700/60 bg-[#1e2937] p-8 shadow-inner shadow-black/20 md:h-[480px] md:p-10">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          margin={{ top: 12, right: 8, left: 4, bottom: 8 }}
                          data={Array.from({ length: data.postSaleProjection.yearsProjection + 1 }, (_, i) => ({
                            year: i,
                            keep: keepData[i].value,
                            sell: sellData[i].value,
                          }))}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis
                            dataKey="year"
                            stroke="#64748b"
                            tick={{ fontSize: 14 }}
                            tickMargin={12}
                          />
                          <YAxis
                            tickFormatter={(v) => `$${(v / 1000000).toFixed(0)}M`}
                            stroke="#64748b"
                            tick={{ fontSize: 14 }}
                            tickMargin={8}
                            width={56}
                          />
                          <RechartsTooltip
                            contentStyle={{
                              borderRadius: 12,
                              border: '1px solid #334155',
                              fontSize: 14,
                              backgroundColor: '#0f172a',
                            }}
                            formatter={(value: number) => [`$${(value / 1000000).toFixed(1)}M`, '']}
                            labelFormatter={(label) => `Year ${label}`}
                          />
                          <Legend
                            wrapperStyle={{ fontSize: 14, paddingTop: 16 }}
                            iconType="circle"
                          />
                          <Line
                            type="monotone"
                            dataKey="keep"
                            stroke="#FACC15"
                            strokeWidth={5}
                            name="Keep Business (Projected Value)"
                            dot={{ fill: '#FACC15', r: 7 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="sell"
                            stroke="#10b981"
                            strokeWidth={4}
                            name="Sell & Invest (Net Wealth)"
                            dot={{ fill: '#10b981', r: 6 }}
                            strokeDasharray="5 2"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Key Insight Summary — box stays original dark teal; only main line color shifts gold vs teal */}
                    <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-8 md:p-10">
                      <div className="flex items-start gap-5 md:gap-6">
                        <div className="mt-0.5 shrink-0">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 md:h-14 md:w-14">
                            <Info className="h-6 w-6 text-emerald-400 md:h-7 md:w-7" />
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400 md:text-sm">
                            Key insight
                          </div>
                          {(() => {
                            const finalKeepWealth = keepData[keepData.length - 1]?.value || 0;
                            const finalSellWealth = sellData[sellData.length - 1]?.value || 0;
                            const difference = Math.abs(finalKeepWealth - finalSellWealth);
                            const keepWins = finalKeepWealth > finalSellWealth;
                            const insightMessage = keepWins
                              ? `Keeping the business is projected to create $${(difference / 1000000).toFixed(1)}M more wealth`
                              : `Selling and investing the proceeds is projected to create $${(difference / 1000000).toFixed(1)}M more wealth`;

                            return (
                              <div
                                className={cn(
                                  'text-2xl font-semibold leading-snug md:text-3xl',
                                  keepWins ? 'text-[#FACC15]' : 'text-[#34D399]'
                                )}
                              >
                                {insightMessage}
                              </div>
                            );
                          })()}
                          <p className="mt-4 text-base leading-relaxed text-slate-400">
                            Over the {data.postSaleProjection.yearsProjection}-year horizon. This comparison uses the
                            final projected wealth from both scenarios.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Sustainable Annual Income — net proceeds × withdrawal tiers; adjusts with expected return */}
                    <div>
                      <Card className="overflow-hidden border border-emerald-500/35 bg-slate-950/60 shadow-xl shadow-emerald-950/20">
                        <CardHeader className="border-b border-emerald-500/20 bg-emerald-500/[0.07] px-6 pb-7 pt-7 md:px-8 md:pb-8 md:pt-8">
                          <CardTitle className="flex flex-wrap items-center gap-4 text-xl tracking-tight text-white md:text-2xl md:gap-5">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/20 md:h-14 md:w-14">
                              <Wallet className="h-6 w-6 text-emerald-400 md:h-7 md:w-7" />
                            </div>
                            Sustainable Annual Income Projection
                          </CardTitle>
                          <CardDescription className="mt-4 text-base leading-relaxed text-slate-400">
                            Based on net proceeds (Sell &amp; Invest){' '}
                            <span className="font-mono text-lg tabular-nums text-emerald-300">
                              ${((data.results?.netProceeds ?? 0) / 1_000_000).toFixed(2)}M
                            </span>
                            {' · '}
                            Expected annual investment return{' '}
                            <span className="font-mono text-lg tabular-nums text-teal-300">
                              {data.postSaleProjection.investmentReturnRate ?? 7.5}%
                            </span>
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                          <div className="divide-y divide-slate-800/80">
                            <div className="flex items-start gap-5 px-6 py-6 transition-colors hover:bg-slate-900/40 md:gap-6 md:px-8 md:py-8">
                              <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-teal-500/25 bg-teal-500/15">
                                <Shield className="h-5 w-5 text-teal-400" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-base font-medium text-slate-300">
                                  Conservative <span className="font-normal text-slate-500">(4.0% withdrawal)</span>
                                </div>
                                <div className="mt-2 font-mono text-3xl font-semibold tabular-nums text-teal-300 md:text-[2rem]">
                                  {formatAnnualIncomePerYear(sustainableAnnualIncome.conservative)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-start gap-5 px-6 py-6 transition-colors hover:bg-slate-900/40 md:gap-6 md:px-8 md:py-8">
                              <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/15">
                                <Gauge className="h-5 w-5 text-emerald-400" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-base font-medium text-slate-300">
                                  Moderate <span className="font-normal text-slate-500">(5.0% withdrawal)</span>
                                </div>
                                <div className="mt-2 font-mono text-3xl font-semibold tabular-nums text-emerald-300 md:text-[2rem]">
                                  {formatAnnualIncomePerYear(sustainableAnnualIncome.moderate)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-start gap-5 px-6 py-6 transition-colors hover:bg-slate-900/40 md:gap-6 md:px-8 md:py-8">
                              <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-cyan-500/25 bg-cyan-500/15">
                                <Sparkles className="h-5 w-5 text-cyan-400" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-base font-medium text-slate-300">
                                  Optimistic <span className="font-normal text-slate-500">(7.0% withdrawal)</span>
                                </div>
                                <div className="mt-2 font-mono text-3xl font-semibold tabular-nums text-cyan-300 md:text-[2rem]">
                                  {formatAnnualIncomePerYear(sustainableAnnualIncome.optimistic)}
                                </div>
                              </div>
                            </div>
                          </div>
                          <p className="border-t border-slate-800 bg-slate-950/40 px-6 py-6 text-sm leading-relaxed text-slate-500 md:px-8 md:py-7">
                            Estimated sustainable annual spending from your invested net proceeds. Based on your chosen investment return and a 4.0%–7.0% withdrawal rate. These are conservative to optimistic scenarios designed to preserve principal over 30+ years. This is for illustrative purposes only.
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Scenario Comparison Table (full columns + saved scenario rows) */}
                    <div>
                      <h4 className="mb-6 flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight text-white md:text-[1.75rem]">
                        Scenario Comparison
                        <span className="rounded-full bg-slate-700 px-4 py-1.5 font-mono text-xs text-slate-300 md:text-sm">
                          Saved Scenarios
                        </span>
                      </h4>
                      <div className="overflow-x-auto rounded-2xl border border-slate-700/70">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b border-slate-700 bg-slate-900/40">
                              <th className="px-6 py-5 text-left text-sm font-semibold uppercase tracking-wide text-slate-400 md:px-8 md:text-base">
                                Scenario
                              </th>
                              <th className="px-6 py-5 text-right text-sm font-semibold uppercase tracking-wide text-slate-400 md:px-8 md:text-base">
                                Keep Business
                              </th>
                              <th className="px-6 py-5 text-right text-sm font-semibold uppercase tracking-wide text-slate-400 md:px-8 md:text-base">
                                Sell &amp; Invest
                              </th>
                              <th className="px-6 py-5 text-right text-sm font-semibold uppercase tracking-wide text-slate-400 md:px-8 md:text-base">
                                Difference
                              </th>
                              <th className="px-6 py-5 text-left text-sm font-semibold uppercase tracking-wide text-slate-400 md:px-8 md:text-base">
                                Better
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {data.savedScenarios.map((scenario) => {
                              const { keepData: rowKeep, sellData: rowSell } = buildKeepSellChartSeries(
                                scenario.inputs,
                                scenario.results.netProceeds ?? 6500000,
                                data.postSaleProjection
                              );
                              const keepFinal = rowKeep[rowKeep.length - 1]?.value ?? 0;
                              const sellFinal = rowSell[rowSell.length - 1]?.value ?? 0;
                              const difference = keepFinal - sellFinal;
                              const isBetterKeep = difference > 0;
                              const isActive = scenario.id === activeScenarioId;

                              return (
                                <tr
                                  key={scenario.id}
                                  className={`transition-colors ${isActive ? 'bg-emerald-500/10' : 'hover:bg-slate-800/50'}`}
                                >
                                  <td className="px-6 py-6 text-base font-medium text-white md:px-8 md:py-7 md:text-lg">
                                    {scenario.name}
                                  </td>
                                  <td className="px-6 py-6 text-right font-mono text-lg text-emerald-400 md:px-8 md:py-7 md:text-xl">
                                    ${(keepFinal / 1000000).toFixed(1)}M
                                  </td>
                                  <td className="px-6 py-6 text-right font-mono text-lg text-teal-400 md:px-8 md:py-7 md:text-xl">
                                    ${(sellFinal / 1000000).toFixed(1)}M
                                  </td>
                                  <td
                                    className={`px-6 py-6 text-right font-mono text-lg md:px-8 md:py-7 md:text-xl ${
                                      isBetterKeep ? 'text-emerald-400' : 'text-rose-400'
                                    }`}
                                  >
                                    {isBetterKeep ? '+' : ''}${(Math.abs(difference) / 1000000).toFixed(1)}M
                                  </td>
                                  <td className="px-6 py-6 md:px-8 md:py-7">
                                    <span
                                      className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-semibold ${
                                        isBetterKeep
                                          ? 'bg-emerald-500/20 text-emerald-400'
                                          : 'bg-rose-500/20 text-rose-400'
                                      }`}
                                    >
                                      {isBetterKeep ? 'Keep' : 'Sell'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {data.savedScenarios.length === 0 && (
                        <p className="rounded-2xl border border-dashed border-slate-700 py-14 text-center text-base text-slate-400 md:py-16 md:text-lg">
                          Save scenarios in Step 1 or 2 to see comparison here.
                        </p>
                      )}
                    </div>

                    <div>
                      <Card className="border-slate-700/90 bg-[#0f172a]/30 shadow-lg shadow-black/20">
                        <CardHeader className="space-y-1 border-b border-slate-700/70 pb-6 pt-8 md:px-8 md:pb-8">
                          <CardTitle className="flex items-center gap-3 text-xl text-white md:text-2xl">
                            Key Insights
                            <Info className="h-5 w-5 text-emerald-400 md:h-6 md:w-6" />
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-5 px-6 py-8 text-base leading-relaxed text-slate-300 md:px-8 md:py-10">
                          {data.results.comparison.insights.map((insight, i) => (
                            <div
                              key={i}
                              className="border-l-4 border-emerald-500/25 pl-5 text-[15px] text-slate-300 md:border-l-[5px] md:pl-6 md:text-base"
                            >
                              {insight}
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Strong Disclaimers */}
            <div className="mx-auto mt-12 max-w-md px-2 text-center md:px-0">
              <div className="disclaimer mx-auto text-xs md:text-xs">
                This tool provides illustrative scenarios based on user inputs and standard financial assumptions. 
                It is NOT financial, tax, or investment advice. Actual results will vary significantly. 
                Always consult with qualified CPAs, CFPs, and M&amp;A advisors. Past performance is not indicative of future results.
              </div>
            </div>
          </div>
        </div>

        {/* Assumptions & Insights Sidebar — desktop only so main column can use full width on mobile */}
        <div className="hidden w-80 shrink-0 overflow-auto border-l border-slate-700 bg-[#111827] p-8 md:flex md:flex-col">
          <h3 className="uppercase text-xs tracking-widest text-slate-500 mb-6">ASSUMPTIONS &amp; INSIGHTS</h3>
          
          <Accordion className="w-full">
            <AccordionItem value="assumptions">
              <AccordionTrigger className="text-sm hover:no-underline">Key Assumptions</AccordionTrigger>
              <AccordionContent className="text-xs text-slate-400 space-y-4">
                <div>
                  <div className="font-mono text-emerald-400 mb-1">EBITDA MULTIPLE</div>
                  <div>Based on industry benchmarks for businesses with $5M–$50M+ revenue.</div>
                </div>
                <div>
                  <div className="font-mono text-emerald-400 mb-1">TAX RATES</div>
                  <div>20% federal LTCG + 3.8% NIIT + state (customizable). Assumes qualified sale structure.</div>
                </div>
                <Separator className="bg-slate-700" />
                <div className="text-[10px] leading-relaxed opacity-75">
                  All calculations are performed locally in your browser. No data ever leaves your device.
                </div>
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="disclaimers">
              <AccordionTrigger className="text-sm hover:no-underline">Important Disclaimers</AccordionTrigger>
              <AccordionContent className="text-xs text-rose-400/90 space-y-3">
                <div>• This is a simulation tool only.</div>
                <div>• Does not replace professional advice.</div>
                <div>• Market conditions, personal circumstances, and tax laws change.</div>
                <div>• Projections are hypothetical and subject to significant variance.</div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {data.savedScenarios.length > 0 && (
            <>
              <Separator className="my-8 bg-slate-700" />
              <div>
                <div className="text-xs uppercase tracking-widest text-slate-500 mb-4 flex items-center justify-between">
                  <span>MY SAVED SCENARIOS ({data.savedScenarios.length})</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={resetToDefaults}
                    className="text-xs h-auto py-0.5 px-2 text-slate-400 hover:text-white"
                  >
                    Clear All
                  </Button>
                </div>
                <div className="space-y-3">
                  {data.savedScenarios.map((scenario) => {
                    const isActive = scenario.id === activeScenarioId;
                    return (
                      <div 
                        key={scenario.id} 
                        className={`text-xs p-4 rounded-2xl border-2 transition-all ${
                          isActive 
                            ? 'border-emerald-400 bg-emerald-500/15 shadow-[0_0_0_1px_rgba(52,211,153,0.35)] ring-2 ring-emerald-500/30' 
                            : 'border-slate-700 bg-slate-900/50 hover:border-slate-600'
                        }`}
                      >
                        <div className="font-medium text-slate-300 flex justify-between">
                          {scenario.name}
                          <span className="text-[10px] text-slate-500 font-mono">
                            {new Date(scenario.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="text-emerald-400 mt-2 font-mono text-sm">
                          ${(scenario.results.netProceeds / 1000000).toFixed(1)}M net
                        </div>
                        <div className="mt-3 flex items-stretch gap-2">
                          <Button
                            type="button"
                            onClick={() => loadScenario(scenario)}
                            size="sm"
                            className="min-w-0 flex-1 text-xs h-7 bg-[#FACC15] hover:bg-[#EAB308] text-[#0a1428] font-medium shadow-lg"
                          >
                            Load Scenario
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => deleteScenario(scenario.id)}
                            className="h-7 w-7 shrink-0 border-slate-600 bg-slate-900/60 text-slate-400 hover:border-rose-500/50 hover:bg-rose-950/40 hover:text-rose-400"
                            aria-label={`Delete ${scenario.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <div className="mt-12 text-[10px] text-slate-500 leading-relaxed">
            Built with Next.js 16 • Recharts • shadcn/ui • 100% localStorage<br />
            Premium dark finance aesthetic for high-net-worth decision making.
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default function SellMyBusinessPlanner() {
  const router = useRouter();
  const [accessOk, setAccessOk] = useState(false);

  useEffect(() => {
    if (hasValidLeadCapture()) {
      setAccessOk(true);
    } else {
      router.replace('/');
    }
  }, [router]);

  if (!accessOk) {
    return <div className="min-h-screen bg-[#0a1428]" aria-hidden />;
  }

  return <PlannerContent />;
}
