/* master-plan-render.mjs — Netlify function for Master Plan Studio rendering
 * POST /.netlify/functions/master-plan-render
 * Body: { action: 'render-plan', prompt: string, lat: number, lng: number }
 * Requires: REPLICATE_API_TOKEN in Netlify environment variables
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
  if (req.method !== 'POST') return _err(405, 'Method not allowed');

  let body;
  try { body = await req.json(); } catch { return _err(400, 'Invalid JSON body'); }

  const { action, prompt, lat, lng } = body;
  if (!action) return _err(400, 'Missing action');

  if (action === 'render-plan') {
    return renderPlan(prompt, lat, lng);
  }

  return _err(400, `Unknown action: ${action}`);
}

/* ── Replicate FLUX rendering ──────────────────────────── */

async function renderPlan(prompt, lat, lng) {
  const token = Netlify.env.get('REPLICATE_API_TOKEN');
  if (!token) {
    return _err(503, 'REPLICATE_API_TOKEN not configured in Netlify environment variables. Add it at Netlify → Site Settings → Environment Variables.');
  }

  const fullPrompt = prompt || 'professional landscape architecture master plan, plan view, aerial, colored zones, tree canopy, Sasaki style';

  try {
    // Use FLUX Schnell — fast (5-10s), high quality, great for architectural renders
    const res = await fetch(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions',
      {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json',
          'Prefer':        'wait=25',
        },
        body: JSON.stringify({
          input: {
            prompt:         fullPrompt,
            num_outputs:    1,
            aspect_ratio:   '4:3',
            output_quality: 85,
            output_format:  'webp',
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Replicate API ${res.status}: ${errText.slice(0, 200)}`);
    }

    const prediction = await res.json();

    // Synchronous response (Prefer: wait) — output is already available
    const outputUrls = prediction.output;
    if (Array.isArray(outputUrls) && outputUrls.length > 0) {
      return _ok({ url: outputUrls[0], prediction_id: prediction.id });
    }

    // Fallback: poll if not immediately ready (Prefer: wait timed out)
    if (prediction.id && prediction.status !== 'failed') {
      const polledUrl = await _pollPrediction(token, prediction.id, 20_000);
      if (polledUrl) return _ok({ url: polledUrl, prediction_id: prediction.id });
    }

    throw new Error('Replicate returned no output URL');
  } catch (e) {
    console.error('[AVA Master Plan Render]', e.message);
    return _err(500, e.message);
  }
}

/* ── Polling fallback ──────────────────────────────────── */

async function _pollPrediction(token, id, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000));
    const res  = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.status === 'succeeded') return data.output?.[0] || null;
    if (data.status === 'failed')   throw new Error('Replicate prediction failed: ' + data.error);
  }
  return null;
}

/* ── Helpers ───────────────────────────────────────────── */

function _ok(data)       { return new Response(JSON.stringify(data),            { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }); }
function _err(code, msg) { return new Response(JSON.stringify({ error: msg }),  { status: code, headers: { ...CORS, 'Content-Type': 'application/json' } }); }
