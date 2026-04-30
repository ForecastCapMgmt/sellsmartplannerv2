export const LEAD_STORAGE_KEY = 'sellSmartPlannerLead';

/** Saved lead data. Older browsers may still have `fullName`-only or split first/last only. */
export type LeadCapture = {
  fullName: string;
  email: string;
};

type StoredLeadPartial = Partial<LeadCapture> & {
  firstName?: string;
  lastName?: string;
};

export function hasValidLeadCapture(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(LEAD_STORAGE_KEY);
    if (!raw) return false;
    const o = JSON.parse(raw) as StoredLeadPartial;

    const emailOk =
      typeof o.email === 'string' && o.email.trim().length > 0;

    const fullNameOk =
      typeof o.fullName === 'string' && o.fullName.trim().length > 0;

    const splitNameOk =
      typeof o.firstName === 'string' &&
      o.firstName.trim().length > 0 &&
      typeof o.lastName === 'string' &&
      o.lastName.trim().length > 0;

    return emailOk && (fullNameOk || splitNameOk);
  } catch {
    return false;
  }
}

export function saveLeadCapture(fullName: string, email: string): void {
  const payload: LeadCapture = {
    fullName: fullName.trim(),
    email: email.trim(),
  };
  localStorage.setItem(LEAD_STORAGE_KEY, JSON.stringify(payload));
}
