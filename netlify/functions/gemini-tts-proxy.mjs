// Netlify Function: TTS Proxy — keeps Gemini API key server-side
// Used by ThinkAvatarTTS universal module across all Think! apps
export default async (request) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' }
    });
  }

  const GEMINI_KEY = Netlify.env.get('GEMINI_API_KEY');
  if (!GEMINI_KEY) {
    return new Response(JSON.stringify({ error: 'TTS API key not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json();
    const text = body.text;
    const voice = body.voice || 'Kore';
    const model = body.model || 'gemini-2.5-flash-preview-tts';

    if (!text) {
      return new Response(JSON.stringify({ error: 'Missing "text" field' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } }
          }
        }
      })
    });

    const data = await resp.json();

    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};
