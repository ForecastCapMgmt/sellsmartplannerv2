export const LEAD_STORAGE_KEY = 'sellSmartPlannerLead';

/** Saved lead data (first + last name). Legacy payloads may still use `fullName` only. */
export type LeadCapture = {
  firstName: string;
  lastName: string;
  email: string;
};

type StoredLeadPartial = Partial<LeadCapture> & { fullName?: string };

export function hasValidLeadCapture(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(LEAD_STORAGE_KEY);
    if (!raw) return false;
    const o = JSON.parse(raw) as StoredLeadPartial;

    const emailOk =
      typeof o.email === 'string' && o.email.trim().length > 0;

    const legacyNameOk =
      typeof o.fullName === 'string' && o.fullName.trim().length > 0;

    const splitNameOk =
      typeof o.firstName === 'string' &&
      o.firstName.trim().length > 0 &&
      typeof o.lastName === 'string' &&
      o.lastName.trim().length > 0;

    return emailOk && (legacyNameOk || splitNameOk);
  } catch {
    return false;
  }
}

export function saveLeadCapture(
  firstName: string,
  lastName: string,
  email: string
): void {
  const payload: LeadCapture = {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim(),
  };
  localStorage.setItem(LEAD_STORAGE_KEY, JSON.stringify(payload));
}
