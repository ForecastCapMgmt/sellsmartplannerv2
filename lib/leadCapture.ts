export const LEAD_STORAGE_KEY = 'sellSmartPlannerLead';

export type LeadCapture = { fullName: string; email: string };

export function hasValidLeadCapture(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(LEAD_STORAGE_KEY);
    if (!raw) return false;
    const o = JSON.parse(raw) as Partial<LeadCapture>;
    return (
      typeof o.fullName === 'string' &&
      o.fullName.trim().length > 0 &&
      typeof o.email === 'string' &&
      o.email.trim().length > 0
    );
  } catch {
    return false;
  }
}

export function saveLeadCapture(fullName: string, email: string): void {
  const payload: LeadCapture = { fullName: fullName.trim(), email: email.trim() };
  localStorage.setItem(LEAD_STORAGE_KEY, JSON.stringify(payload));
}
