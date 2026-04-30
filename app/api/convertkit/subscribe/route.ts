import { NextResponse } from 'next/server';

const CONVERTKIT_FORM_ID = '9384989';
const SUBSCRIBE_URL = `https://api.convertkit.com/v3/forms/${CONVERTKIT_FORM_ID}/subscribe`;

/** Split on first whitespace; remainder is last name (may be empty). */
function splitFullName(trimmed: string): { firstName: string; lastName: string } {
  const i = trimmed.search(/\s/);
  if (i === -1) {
    return { firstName: trimmed, lastName: '' };
  }
  return {
    firstName: trimmed.slice(0, i).trim(),
    lastName: trimmed.slice(i + 1).trim(),
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.CONVERTKIT_API_KEY;
  if (!apiKey) {
    console.error('[Kit] Missing CONVERTKIT_API_KEY');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { fullName, email } = body as { fullName?: string; email?: string };
  const trimmedEmail = email?.trim();
  const trimmedName = fullName?.trim();

  if (!trimmedEmail || !trimmedName) {
    return NextResponse.json({ error: 'fullName and email are required' }, { status: 400 });
  }

  const { firstName, lastName } = splitFullName(trimmedName);

  const fields: Record<string, string> = {
    full_name: trimmedName,
  };
  if (lastName.length > 0) {
    fields.last_name = lastName;
  }

  const kitRes = await fetch(SUBSCRIBE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      api_key: apiKey,
      email: trimmedEmail,
      first_name: firstName,
      fields,
    }),
  });

  const kitData: unknown = await kitRes.json().catch(() => ({}));

  if (!kitRes.ok) {
    console.error('[Kit] ConvertKit API error', kitRes.status, kitData);
    return NextResponse.json(
      { error: 'ConvertKit request failed', status: kitRes.status, details: kitData },
      { status: 502 }
    );
  }

  return NextResponse.json(kitData);
}
