import { NextResponse } from 'next/server';

const CONVERTKIT_FORM_ID = '9384989';
const SUBSCRIBE_URL = `https://api.convertkit.com/v3/forms/${CONVERTKIT_FORM_ID}/subscribe`;

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

  const kitRes = await fetch(SUBSCRIBE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      api_key: apiKey,
      email: trimmedEmail,
      first_name: trimmedName,
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
