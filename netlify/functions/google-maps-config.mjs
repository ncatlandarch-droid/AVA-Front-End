// Serves the Google Maps API key from a Netlify environment variable.
// Set GOOGLE_MAPS_KEY in: Netlify Dashboard → Site → Environment variables
// Returns { key: "AIza..." } — the client uses this to load the Maps script.
export default async () => {
  const key = Netlify.env.get('GOOGLE_MAPS_KEY') || '';

  if (!key) {
    return new Response(JSON.stringify({ key: '' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ key }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=3600'
    }
  });
};
