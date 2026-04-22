export interface BusinessInputs {
  annualRevenue: number;
  ebitda: number;
  ebitdaMargin: number;
  growthRate: number;
  saleMultiple: number;
  ownerAge: number;
  yearsToRetirement: number;
  federalCapitalGainsRate: number;
  stateTaxRate: number;
  qualifiesForQSBS: boolean;
  currentSalary: number;
}

export interface SaleAssumptions {
  saleMultiple: number;
  transactionFeesPercent: number;
  stateTaxRate: number;
  federalTaxRate: number;
  niitRate: number;
  otherCosts: number;
}

export interface PostSaleProjection {
  investmentReturnRate: number;
  annualSpending: number;
  inflationRate: number;
  yearsProjection: number;
}

export interface CalculationResults {
  estimatedSalePrice: number;
  totalTaxes: number;
  netProceeds: number;
  qsbsFederalSavings: number;
  postSaleWealthProjection: number[];
  keepBusinessProjection: number[];
  comparison: {
    sellAdvantage: number;
    recommendation: string;
    insights: string[];
  };
}

export interface PlannerData {
  inputs: BusinessInputs;
  saleAssumptions: SaleAssumptions;
  postSaleProjection: PostSaleProjection;
  results: CalculationResults | null;
  currentStep: number;
  savedScenarios: Array<{
    id: string;
    name: string;
    timestamp: string;
    inputs: BusinessInputs;
    results: CalculationResults;
  }>;
}
