// Serves Firebase client config from Netlify environment variables.
// Values are intentionally public (Firebase security is enforced by Security Rules),
// but keeping them out of source control prevents Netlify's secrets scanner from
// blocking builds and avoids accidental exposure in public repos.
export default async () => {
  const config = {
    apiKey:            Netlify.env.get('FIREBASE_API_KEY'),
    authDomain:        Netlify.env.get('FIREBASE_AUTH_DOMAIN'),
    projectId:         Netlify.env.get('FIREBASE_PROJECT_ID'),
    storageBucket:     Netlify.env.get('FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: Netlify.env.get('FIREBASE_MESSAGING_SENDER_ID'),
    appId:             Netlify.env.get('FIREBASE_APP_ID'),
    measurementId:     Netlify.env.get('FIREBASE_MEASUREMENT_ID'),
  };

  if (!config.apiKey || !config.projectId) {
    return new Response(JSON.stringify({ error: 'Firebase env vars not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify(config), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600'
    }
  });
};
