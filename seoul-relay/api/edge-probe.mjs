export const config = { runtime: 'edge', regions: ['icn1'] };

// Temporary fixed-public-target diagnostic; no user-supplied destinations or source content returned.
export default async function handler(request) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (request.method !== 'POST') return new Response(null, { status: 405, headers });
  const key = process.env.POLICY_SEOUL_RELAY_TOKEN;
  if (!key || key.length < 32) return new Response(null, { status: 503, headers });
  const digest = async text => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  const [actual, expected] = await Promise.all([digest(request.headers.get('authorization') || ''), digest('Bearer ' + key)]);
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ expected[i];
  if (difference) return new Response(null, { status: 401, headers });
  const targets = ['https://www.open.go.kr/', 'https://opengov.seoul.go.kr/section/D0000057368455'];
  const results = await Promise.all(targets.map(async url => {
    const started = Date.now();
    try {
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(12000) });
      let bytes = 0;
      if (response.body) {
        const reader = response.body.getReader();
        try { while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 1024 * 1024) break; } }
        finally { await reader.cancel(); }
      }
      return { url, status: response.status, bytes, ms: Date.now() - started };
    } catch (error) { return { url, error: error.name, ms: Date.now() - started }; }
  }));
  return new Response(JSON.stringify({ runtime: 'edge', region: process.env.VERCEL_REGION, results }), { headers });
}
