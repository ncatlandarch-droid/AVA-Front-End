// Serves the Cesium ion access token from a Netlify environment variable.
// Set CESIUM_TOKEN in: Netlify Dashboard → Site → Environment variables
export default async () => {
  const token = process.env.CESIUM_TOKEN || '';
  return new Response(JSON.stringify({ token }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=3600'
    }
  });
};
