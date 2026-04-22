'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calculator, Download, Trash2 } from 'lucide-react';
import Link from 'next/link';

interface SavedScenario {
  id: string;
  name: string;
  timestamp: string;
  inputs: any;
  results: any;
}

export default function ProfilePage() {
  const [scenarios, setScenarios] = useState<SavedScenario[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('sellSmartPlannerData');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setScenarios(parsed.savedScenarios || []);
      } catch (e) {}
    }
    setLoaded(true);
  }, []);

  const clearAll = () => {
    if (confirm('Clear all saved scenarios?')) {
      localStorage.removeItem('sellSmartPlannerData');
      setScenarios([]);
    }
  };

  if (!loaded) return <div className="p-12">Loading...</div>;

  return (
    <div className="min-h-screen bg-[#0a1428] text-slate-200 p-12">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-end mb-12">
          <div>
            <div className="flex items-center gap-3">
              <div className="text-emerald-500">
                <Calculator className="w-10 h-10" />
              </div>
              <div>
                <h1 className="text-6xl font-semibold tracking-tighter text-white">Your Scenarios</h1>
                <p className="text-slate-400 text-xl">SellSmartPlanner • Wealth Lab</p>
              </div>
            </div>
          </div>
          <div className="flex gap-4">
            <Link href="/planner">
              <Button variant="outline" className="border-emerald-500 text-emerald-400">
                ← Back to Planner
              </Button>
            </Link>
            <Button onClick={clearAll} variant="destructive" className="gap-2">
              <Trash2 className="w-4 h-4" />
              CLEAR ALL
            </Button>
          </div>
        </div>

        {scenarios.length === 0 ? (
          <Card className="glass p-16 text-center border-slate-700">
            <div className="mx-auto w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-6">
              <Calculator className="w-8 h-8 text-slate-500" />
            </div>
            <h3 className="text-2xl text-white mb-3">No saved scenarios yet</h3>
            <p className="text-slate-400 max-w-xs mx-auto mb-8">
              Run the planner and save interesting scenarios to compare them here.
            </p>
            <Link href="/planner">
              <Button size="lg" className="bg-emerald-600 hover:bg-emerald-500">Open Planner</Button>
            </Link>
          </Card>
        ) : (
          <div className="grid gap-6">
            {scenarios.map((scenario) => (
              <Card key={scenario.id} className="glass border-slate-700 hover:border-emerald-500/50 transition-colors">
                <CardHeader>
                  <CardTitle className="flex justify-between items-start">
                    <span>{scenario.name}</span>
                    <span className="text-xs font-mono text-slate-500">
                      {new Date(scenario.timestamp).toLocaleString()}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-12">
                    <div>
                      <div className="text-xs text-slate-500 mb-1">NET PROCEEDS</div>
                      <div className="text-5xl font-semibold text-emerald-400 tabular-nums tracking-tighter">
                        ${(scenario.results.netProceeds / 1000000).toFixed(1)}M
                      </div>
                    </div>
                    <div className="text-sm text-slate-400 max-w-xs pt-3">
                      EBITDA: ${(scenario.inputs.ebitda / 1000000).toFixed(1)}M • Multiple: {scenario.inputs.industryMultiple}x<br />
                      Recommendation: <span className="text-white">{scenario.results.comparison?.recommendation || 'Keep vs Sell'}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-16 text-center text-xs text-slate-500">
          All scenarios are stored securely in your browser&apos;s localStorage. 
          Nothing is sent to any servers.
        </div>
      </div>
    </div>
  );
}
