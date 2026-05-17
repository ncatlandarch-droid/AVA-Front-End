// Netlify Function: image-proxy
// Server-side fetches images and returns base64 — bypasses browser CORS restrictions
// Used for Google Static Maps satellite images sent to Gemini for design generation

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=3600',
};

const ALLOWED_HOSTS = ['maps.googleapis.com', 'maps.gstatic.com'];

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const url = new URL(request.url);
  const imageUrl = url.searchParams.get('url');
  if (!imageUrl) {
    return new Response(JSON.stringify({ error: 'Missing url param' }), { status: 400, headers: CORS });
  }

  let parsed;
  try { parsed = new URL(imageUrl); } catch {
    return new Response(JSON.stringify({ error: 'Invalid url' }), { status: 400, headers: CORS });
  }

  if (!ALLOWED_HOSTS.some(h => parsed.hostname === h)) {
    return new Response(JSON.stringify({ error: 'Host not allowed' }), { status: 403, headers: CORS });
  }

  try {
    const resp = await fetch(imageUrl);
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `Upstream ${resp.status}` }), { status: resp.status, headers: CORS });
    }
    const buffer = await resp.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = resp.headers.get('content-type') || 'image/jpeg';
    return new Response(JSON.stringify({ base64, mimeType }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
};
