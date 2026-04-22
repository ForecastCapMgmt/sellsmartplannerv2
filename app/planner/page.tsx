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
      <div className="min-h-screen bg-[#0a1428] text-slate-200 flex">
        {/* Progress Sidebar */}
        <div className="w-80 bg-[#111827] border-r border-slate-700 flex-shrink-0 p-8 flex flex-col">
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
        <div className="flex-1 p-10 overflow-auto">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-10">
              <div>
                <div className="uppercase text-xs tracking-[3px] text-emerald-500 font-medium mb-1">FLAGTOOL</div>
                <h1 className="text-5xl font-semibold tracking-tighter text-white">Sell My Business Planner</h1>
                <p className="text-xl text-slate-400 mt-3 max-w-md">
                  Will selling your company actually make you wealthier in the long run?
                </p>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm text-slate-400">Current Step</div>
                  <div className="text-2xl font-semibold text-white">{currentStepInfo.title}</div>
                </div>
                <div className="w-px h-12 bg-slate-700" />
                <Button onClick={prevStep} disabled={data.currentStep === 1} variant="outline" size="icon">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <Button 
                  onClick={nextStep} 
                  disabled={data.currentStep === 4}
                  className="bg-emerald-600 hover:bg-emerald-500"
                >
                  {data.currentStep === 4 ? 'FINISH' : 'NEXT'} 
                  <ArrowRight className="w-4 h-4 ml-2" />
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

              <CardContent className="p-10">
                {data.currentStep === 1 && (
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-8">
                      <div>
                        <Label className="text-slate-400">Annual Revenue</Label>
                        <div className="mt-2 relative">
                          <span className="absolute left-4 top-3 text-slate-500">$</span>
                          <Input
                            type="number"
                            value={data.inputs.annualRevenue}
                            onChange={(e) => updateInputs({ annualRevenue: parseInt(e.target.value) || 0 })}
                            className="pl-8 bg-slate-950 border-slate-700 text-xl h-14"
                          />
                        </div>
                        <p className="text-xs text-slate-500 mt-1.5">Last fiscal year revenue</p>
                      </div>

                      <div>
                        <Label className="text-slate-400">EBITDA</Label>
                        <div className="mt-2 relative">
                          <span className="absolute left-4 top-3 text-slate-500">$</span>
                          <Input
                            type="number"
                            value={data.inputs.ebitda}
                            onChange={(e) => updateInputs({ ebitda: parseInt(e.target.value) || 0 })}
                            className="pl-8 bg-slate-950 border-slate-700 text-xl h-14"
                          />
                        </div>
                        <p className="text-xs text-slate-500 mt-1.5">Earnings before interest, taxes, depreciation &amp; amortization</p>
                      </div>

                      <div>
                        <Label className="text-slate-400 flex items-center gap-2">
                          EBITDA Margin <span className="text-xs text-slate-500">(auto • live)</span>
                        </Label>
                        <div className="text-2xl font-semibold text-emerald-400">
                          {ebitdaMargin}%
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Formula: (EBITDA ÷ Revenue) × 100 — updates live
                        </p>
                      </div>
                    </div>

                    <div className="space-y-8">
                      <div>
                        <Label className="text-slate-400">Annual Growth Rate</Label>
                        <div className="flex items-center gap-4 mt-3">
                          <Slider
                            value={[data.inputs.growthRate]}
                            onValueChange={(values) => updateInputs({ growthRate: values[0] })}
                            max={25}
                            min={0}
                            step={0.5}
                            className="flex-1"
                          />
                          <div className="w-16 font-mono text-right text-emerald-400">{data.inputs.growthRate}%</div>
                        </div>
                      </div>

                      <div>
                        <Label className="text-slate-400">Sale Multiple</Label>
                        <div className="flex items-center gap-4 mt-3">
                          <Slider
                            value={[data.inputs.saleMultiple]}
                            onValueChange={(values) => updateInputs({ saleMultiple: values[0] })}
                            max={15}
                            min={3}
                            step={0.25}
                            className="flex-1"
                          />
                          <div className="w-16 font-mono text-right text-emerald-400">{data.inputs.saleMultiple.toFixed(1)}x</div>
                        </div>
                        <p className="text-xs text-slate-500 mt-2">What multiple do you expect for your business sale? (e.g. 5x, 8x, 12x EBITDA)</p>
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <Label className="text-slate-400">Owner Age</Label>
                          <Input
                            type="number"
                            value={data.inputs.ownerAge}
                            onChange={(e) => updateInputs({ ownerAge: parseInt(e.target.value) || 0 })}
                            className="mt-2 bg-slate-950 border-slate-700"
                          />
                        </div>
                        <div>
                          <Label className="text-slate-400">Years to Retirement</Label>
                          <Input
                            type="number"
                            value={data.inputs.yearsToRetirement}
                            onChange={(e) => updateInputs({ yearsToRetirement: parseInt(e.target.value) || 0 })}
                            className="mt-2 bg-slate-950 border-slate-700"
                          />
                        </div>
                      </div>

                      <div>
                        <Label className="text-slate-400">Federal Capital Gains Tax Rate</Label>
                        <div className="relative mt-3 max-w-[160px]">
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="40"
                            value={data.inputs.federalCapitalGainsRate ?? 23.8}
                            onChange={(e) => updateInputs({ federalCapitalGainsRate: parseFloat(e.target.value) || 23.8 })}
                            className="pl-4 pr-8 py-3 text-xl font-mono bg-slate-950 border-slate-700 focus:border-emerald-500"
                          />
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-lg text-slate-400 pointer-events-none">%</div>
                        </div>
                        <p className="text-xs text-slate-500 mt-2">Long-term capital gains rate applied to the business sale. Most qualified sales use this rate.</p>
                      </div>

                      <div>
                        <Label className="text-slate-400">State Tax Rate</Label>
                        <div className="relative mt-3 max-w-[160px]">
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="20"
                            value={data.inputs.stateTaxRate ?? 5.0}
                            onChange={(e) => updateInputs({ stateTaxRate: parseFloat(e.target.value) || 5.0 })}
                            className="pl-4 pr-8 py-3 text-xl font-mono bg-slate-950 border-slate-700 focus:border-emerald-500"
                          />
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-lg text-slate-400 pointer-events-none">%</div>
                        </div>
                        <p className="text-xs text-slate-500 mt-2">Additional state capital gains or income tax rate applied to the sale.</p>
                      </div>

                      <div className="flex items-center justify-between pt-6 border-t border-slate-700">
                        <div>
                          <Label>Qualifies for QSBS Exclusion (Section 1202)?</Label>
                          <p className="text-xs text-slate-500">Can exclude up to 100% of capital gains on qualified small business stock</p>
                        </div>
                        <Switch 
                          checked={data.inputs.qualifiesForQSBS || false}
                          onCheckedChange={(checked) => updateInputs({ qualifiesForQSBS: checked })}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {data.currentStep === 2 && (
                  <div className="max-w-2xl space-y-10">
                    <div className="bg-slate-950/50 border border-slate-700 rounded-3xl p-8">
                      <h3 className="font-semibold text-lg mb-6 flex items-center gap-2">
                        <Calculator className="w-5 h-5 text-emerald-400" /> 
                        Sale Outcome Summary
                      </h3>
                      {data.results && (
                        <div className="grid grid-cols-3 gap-6">
                          <div className="bg-[#0a1428] p-6 rounded-2xl border border-slate-700">
                            <div className="text-xs text-slate-500 mb-1">ESTIMATED SALE PRICE</div>
                            <div className="text-4xl font-semibold text-white tabular-nums">
                              ${(data.results.estimatedSalePrice / 1000000).toFixed(1)}M
                            </div>
                          </div>
                          <div className="bg-[#0a1428] p-6 rounded-2xl border border-slate-700">
                            <div className="text-xs text-slate-500 mb-1">TOTAL TAXES &amp; FEES</div>
                            <div className="text-4xl font-semibold text-rose-400 tabular-nums">
                              ${(data.results.totalTaxes / 1000000).toFixed(1)}M
                            </div>
                          </div>
                          <div className="bg-[#0a1428] p-6 rounded-2xl border border-emerald-500/30">
                            <div className="text-xs text-emerald-400 mb-1">YOUR NET PROCEEDS</div>
                            <div className="text-4xl font-semibold text-emerald-400 tabular-nums">
                              ${(data.results.netProceeds / 1000000).toFixed(1)}M
                            </div>
                          </div>
                        </div>
                      )}
                      {data.inputs.qualifiesForQSBS && data.results && data.results.qsbsFederalSavings > 0 && (
                        <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
                          <div className="text-emerald-400 font-medium flex items-center gap-2">
                            <Check className="w-4 h-4" />
                            QSBS Exclusion Applied — ${(data.results.qsbsFederalSavings / 1000000).toFixed(1)}M in federal tax savings
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
                  <div className="space-y-8 max-w-xl">
                    <p className="text-slate-400">Project your post-sale financial picture. All assumptions editable below.</p>
                    
                    <div className="space-y-6">
                      <div>
                        <Label>Expected Annual Investment Return</Label>
                        <div className="relative mt-3 max-w-[180px]">
                          <Input
                            type="number"
                            step="0.01"
                            min="1"
                            max="999"
                            value={data.postSaleProjection.investmentReturnRate}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val)) {
                                updatePostSaleProjection({ investmentReturnRate: Math.max(1, Math.min(999, val)) });
                              }
                            }}
                            className="pl-4 pr-12 py-6 text-4xl font-mono bg-slate-950 border-slate-700 focus:border-emerald-500 text-emerald-400"
                          />
                          <div className="absolute right-6 top-1/2 -translate-y-1/2 text-3xl font-light text-slate-400 pointer-events-none">%</div>
                        </div>
                        <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                          This represents the expected annual returns on an investment portfolio (e.g., stocks, bonds, private credit, private equity, hedge funds, etc.). Historical long-term stock market returns average ~7–10% nominal, but actual results vary significantly.
                        </p>
                      </div>
                      {/* Similar controls for spending, inflation, horizon */}
                    </div>
                    <div className="disclaimer">
                      These projections assume constant rates and do not account for market volatility, taxes on investment gains, or lifestyle changes. They are for illustrative purposes only.
                    </div>
                  </div>
                )}

                {data.currentStep === 4 && data.results && (
                  <div>
                    <div className="mb-8">
                      <h3 className="text-2xl font-semibold text-white mb-2">Keep vs Sell Comparison</h3>
                      <p className="text-slate-400">Over a {data.postSaleProjection.yearsProjection}-year horizon</p>
                    </div>
                    
                    <div className="h-[420px] bg-[#1e2937] rounded-3xl p-8 mb-8">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={Array.from({ length: data.postSaleProjection.yearsProjection + 1 }, (_, i) => ({
                          year: i,
                          keep: keepData[i].value,
                          sell: sellData[i].value,
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey="year" stroke="#64748b" />
                          <YAxis tickFormatter={(v) => `$${(v / 1000000).toFixed(0)}M`} stroke="#64748b" />
                          <RechartsTooltip 
                            formatter={(value: number) => [`$${(value / 1000000).toFixed(1)}M`, '']}
                            labelFormatter={(label) => `Year ${label}`}
                          />
                          <Legend />
                          <Line 
                            type="monotone" 
                            dataKey="keep" 
                            stroke="#FACC15" 
                            strokeWidth={5} 
                            name="Keep Business (Projected Value)" 
                            dot={{ fill: '#FACC15', r: 6 }}
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
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-3xl p-8">
                      <div className="flex items-start gap-4">
                        <div className="mt-1">
                          <div className="w-10 h-10 bg-emerald-500/20 rounded-2xl flex items-center justify-center">
                            <Info className="w-5 h-5 text-emerald-400" />
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="uppercase text-xs tracking-widest text-emerald-400 font-medium mb-2">KEY INSIGHT</div>
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
                                  'text-2xl font-semibold leading-tight mb-3',
                                  keepWins ? 'text-[#FACC15]' : 'text-[#34D399]'
                                )}
                              >
                                {insightMessage}
                              </div>
                            );
                          })()}
                          <p className="text-slate-400 text-[15px]">
                            Over the {data.postSaleProjection.yearsProjection}-year horizon. This comparison uses the final projected wealth from both scenarios.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Sustainable Annual Income — net proceeds × withdrawal tiers; adjusts with expected return */}
                    <div className="mt-10">
                      <Card className="border border-emerald-500/35 bg-slate-950/60 overflow-hidden shadow-lg shadow-emerald-950/20">
                        <CardHeader className="border-b border-emerald-500/20 bg-emerald-500/[0.07] pb-5">
                          <CardTitle className="text-xl text-white tracking-tight flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                              <Wallet className="w-5 h-5 text-emerald-400" />
                            </div>
                            Sustainable Annual Income Projection
                          </CardTitle>
                          <CardDescription className="text-slate-400 text-sm mt-3 leading-relaxed">
                            Based on net proceeds (Sell &amp; Invest){' '}
                            <span className="text-emerald-300 font-mono tabular-nums">
                              ${((data.results?.netProceeds ?? 0) / 1_000_000).toFixed(2)}M
                            </span>
                            {' · '}
                            Expected annual investment return{' '}
                            <span className="text-teal-300 font-mono tabular-nums">
                              {data.postSaleProjection.investmentReturnRate ?? 7.5}%
                            </span>
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                          <div className="divide-y divide-slate-800/80">
                            <div className="flex items-start gap-4 px-6 py-5 hover:bg-slate-900/40 transition-colors">
                              <div className="mt-0.5 w-9 h-9 rounded-lg bg-teal-500/15 border border-teal-500/25 flex items-center justify-center shrink-0">
                                <Shield className="w-4 h-4 text-teal-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-slate-300">
                                  Conservative <span className="text-slate-500 font-normal">(4.0% withdrawal)</span>
                                </div>
                                <div className="text-2xl font-semibold text-teal-300 font-mono tabular-nums mt-1">
                                  {formatAnnualIncomePerYear(sustainableAnnualIncome.conservative)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-start gap-4 px-6 py-5 hover:bg-slate-900/40 transition-colors">
                              <div className="mt-0.5 w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
                                <Gauge className="w-4 h-4 text-emerald-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-slate-300">
                                  Moderate <span className="text-slate-500 font-normal">(5.0% withdrawal)</span>
                                </div>
                                <div className="text-2xl font-semibold text-emerald-300 font-mono tabular-nums mt-1">
                                  {formatAnnualIncomePerYear(sustainableAnnualIncome.moderate)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-start gap-4 px-6 py-5 hover:bg-slate-900/40 transition-colors">
                              <div className="mt-0.5 w-9 h-9 rounded-lg bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center shrink-0">
                                <Sparkles className="w-4 h-4 text-cyan-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-slate-300">
                                  Optimistic <span className="text-slate-500 font-normal">(7.0% withdrawal)</span>
                                </div>
                                <div className="text-2xl font-semibold text-cyan-300 font-mono tabular-nums mt-1">
                                  {formatAnnualIncomePerYear(sustainableAnnualIncome.optimistic)}
                                </div>
                              </div>
                            </div>
                          </div>
                          <p className="text-xs text-slate-500 leading-relaxed px-6 py-5 border-t border-slate-800 bg-slate-950/40">
                            Estimated sustainable annual spending from your invested net proceeds. Based on your chosen investment return and a 4.0%–7.0% withdrawal rate. These are conservative to optimistic scenarios designed to preserve principal over 30+ years. This is for illustrative purposes only.
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Scenario Comparison Table (full columns + saved scenario rows) */}
                    <div className="mt-10">
                      <h4 className="text-xl font-semibold text-white mb-6 flex items-center gap-3">
                        Scenario Comparison
                        <span className="text-xs bg-slate-700 px-3 py-1 rounded-full font-mono text-slate-400">Saved Scenarios</span>
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b border-slate-700">
                              <th className="text-left py-4 px-6 text-sm font-medium text-slate-400">Scenario</th>
                              <th className="text-right py-4 px-6 text-sm font-medium text-slate-400">Keep Business</th>
                              <th className="text-right py-4 px-6 text-sm font-medium text-slate-400">Sell &amp; Invest</th>
                              <th className="text-right py-4 px-6 text-sm font-medium text-slate-400">Difference</th>
                              <th className="text-left py-4 px-6 text-sm font-medium text-slate-400">Better</th>
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
                                <tr key={scenario.id} className={`transition-colors ${isActive ? 'bg-emerald-500/10' : 'hover:bg-slate-800/50'}`}>
                                  <td className="py-5 px-6 font-medium text-white">{scenario.name}</td>
                                  <td className="py-5 px-6 text-right font-mono text-emerald-400">
                                    ${(keepFinal / 1000000).toFixed(1)}M
                                  </td>
                                  <td className="py-5 px-6 text-right font-mono text-teal-400">
                                    ${(sellFinal / 1000000).toFixed(1)}M
                                  </td>
                                  <td className={`py-5 px-6 text-right font-mono ${isBetterKeep ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {isBetterKeep ? '+' : ''}${(Math.abs(difference) / 1000000).toFixed(1)}M
                                  </td>
                                  <td className="py-5 px-6">
                                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                                      isBetterKeep 
                                        ? 'bg-emerald-500/20 text-emerald-400' 
                                        : 'bg-rose-500/20 text-rose-400'
                                    }`}>
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
                        <p className="text-slate-400 text-center py-12">Save scenarios in Step 1 or 2 to see comparison here.</p>
                      )}
                    </div>

                    <div className="mt-12">
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            Key Insights <Info className="w-4 h-4" />
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm">
                          {data.results.comparison.insights.map((insight, i) => (
                            <div key={i} className="pl-4 border-l-2 border-slate-700 text-slate-300">
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
            <div className="mt-12 text-center max-w-md mx-auto">
              <div className="disclaimer text-xs mx-auto">
                This tool provides illustrative scenarios based on user inputs and standard financial assumptions. 
                It is NOT financial, tax, or investment advice. Actual results will vary significantly. 
                Always consult with qualified CPAs, CFPs, and M&amp;A advisors. Past performance is not indicative of future results.
              </div>
            </div>
          </div>
        </div>

        {/* Assumptions & Insights Sidebar */}
        <div className="w-80 bg-[#111827] border-l border-slate-700 p-8 flex-shrink-0 overflow-auto">
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
