/**
 * Transparent Sale Calculator for Sell My Business Planner
 * All formulas are documented for full transparency.
 * No black-box math - every step is explained.
 */

import { BusinessInputs, SaleAssumptions, CalculationResults } from './types';

export function calculateSaleOutcome(
  inputs: BusinessInputs,
  assumptions: SaleAssumptions
): Partial<CalculationResults> {
  // Step 1: Calculate estimated sale price based on user-provided Sale Multiple
  // Formula: Sale Price = EBITDA × Sale Multiple (user chooses any realistic value)
  const estimatedSalePrice = inputs.ebitda * inputs.saleMultiple;

  // Step 2: Calculate transaction fees
  // Formula: Fees = Sale Price × Fees Percentage
  const transactionFees = estimatedSalePrice * (assumptions.transactionFeesPercent / 100);

  // Step 3: Calculate taxes (simplified but transparent model for high-net-worth individuals)
  // Both Federal Capital Gains and State Tax rates now come from Business Inputs.
  // If qualifiesForQSBS is true, federal tax on the gain is 0%.
  const effectiveFederalRate = inputs.qualifiesForQSBS ? 0 : inputs.federalCapitalGainsRate;
  const taxableGain = estimatedSalePrice - transactionFees; // Simplified - assumes basis adjustment not modeled here
  const federalTax = taxableGain * (effectiveFederalRate / 100);
  const stateTax = taxableGain * (inputs.stateTaxRate / 100);
  const niitTax = taxableGain * (assumptions.niitRate / 100);
  const totalTaxes = federalTax + stateTax + niitTax;

  // QSBS federal tax savings (the amount avoided when enabled)
  const qsbsFederalSavings = inputs.qualifiesForQSBS 
    ? taxableGain * (inputs.federalCapitalGainsRate / 100) 
    : 0;

  // Step 4: Net proceeds after all costs
  // Formula: Net = Sale Price - Fees - Taxes - Other Costs
  const netProceeds = estimatedSalePrice - transactionFees - totalTaxes - assumptions.otherCosts;

  return {
    estimatedSalePrice: Math.round(estimatedSalePrice),
    totalTaxes: Math.round(totalTaxes),
    netProceeds: Math.round(netProceeds),
    qsbsFederalSavings: Math.round(qsbsFederalSavings),
  };
}

/**
 * Example usage and transparency notes:
 * - Multiples typically range 4x-12x EBITDA for $5M+ businesses
 * - Taxes assume long-term capital gains treatment
 * - In real scenarios, basis, depreciation recapture, state specifics, earnouts would adjust this
 * - This tool shows "what if" scenarios with full formula visibility
 */
export function getSaleAssumptionDefaults(): SaleAssumptions {
  return {
    saleMultiple: 7.5,
    transactionFeesPercent: 3.5,
    stateTaxRate: 8.0,
    federalTaxRate: 20.0,
    niitRate: 3.8,
    otherCosts: 50000,
  };
}
