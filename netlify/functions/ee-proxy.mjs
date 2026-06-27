// Netlify Function: Earth Engine data proxy — building footprints, DEM tiles, aspect, slope
// Authenticates with a GEE service account and returns GeoJSON or tile URLs
// Requires env vars: GEE_PROJECT_ID, GEE_SERVICE_ACCOUNT_KEY (JSON key)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=600'
};

const MAX_BBOX_DEG = 0.12;

// ---------------------------------------------------------------------------
// Google OAuth2 — get access token from service account key
// ---------------------------------------------------------------------------
let _cachedToken = null;
let _tokenExpiry = 0;

async function getAccessToken() {
  if (_cachedToken && Date.now() < _tokenExpiry - 60000) return _cachedToken;

  const keyJson = process.env.GEE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) throw new Error('GEE_SERVICE_ACCOUNT_KEY not configured');

  let key;
  try {
    const decoded = keyJson.startsWith('{') ? keyJson : atob(keyJson);
    key = JSON.parse(decoded);
  } catch (e) {
    throw new Error('Invalid GEE_SERVICE_ACCOUNT_KEY format');
  }

  // Build JWT
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/earthengine.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };

  const segments = [b64url(JSON.stringify(header)), b64url(JSON.stringify(claim))];
  const sigInput = segments.join('.');

  const pemBody = key.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const binaryKey = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(sigInput));
  const jwt = sigInput + '.' + b64url(sig);

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  if (!tokenResp.ok) {
    const errText = await tokenResp.text();
    throw new Error(`OAuth error: ${tokenResp.status} — ${errText.substring(0, 200)}`);
  }
  const tokenData = await tokenResp.json();
  _cachedToken = tokenData.access_token;
  _tokenExpiry = Date.now() + (tokenData.expires_in || 3600) * 1000;
  return _cachedToken;
}

function b64url(input) {
  let str;
  if (typeof input === 'string') str = btoa(input);
  else {
    const bytes = new Uint8Array(input);
    let binary = '';
    bytes.forEach(b => binary += String.fromCharCode(b));
    str = btoa(binary);
  }
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// Earth Engine REST API — correct expression graph format
// ---------------------------------------------------------------------------
const EE_API = 'https://earthengine.googleapis.com/v1';

async function eePost(path, body) {
  const projectId = process.env.GEE_PROJECT_ID;
  if (!projectId) throw new Error('GEE_PROJECT_ID not configured');
  const token = await getAccessToken();
  const resp = await fetch(`${EE_API}/projects/${projectId}/${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000)
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`EE API ${resp.status}: ${errText.substring(0, 400)}`);
  }
  return resp.json();
}

// Helper: Build EE expression graph nodes
function eeVal(val) { return { constantValue: val }; }
function eeCall(fn, args) {
  const a = {};
  for (const [k, v] of Object.entries(args)) a[k] = v;
  return { functionInvocationValue: { functionName: fn, arguments: a } };
}
function eeRef(ref) { return { valueReference: ref }; }

// ---------------------------------------------------------------------------
// Layer: Building Footprints — Google Open Buildings V3
// Uses computeFeatures with correct expression graph
// ---------------------------------------------------------------------------
async function fetchBuildings(west, south, east, north) {
  // Build expression: ee.FeatureCollection('GOOGLE/Research/open-buildings/v3/polygons')
  //   .filterBounds(ee.Geometry.Rectangle([w,s,e,n]))
  //   .filter(ee.Filter.gte('confidence', 0.65))
  const rect = eeCall('Geometry.Rectangle', {
    coordinates: eeVal([west, south, east, north])
  });
  const fc = eeCall('Collection.loadTable', {
    tableId: eeVal('GOOGLE/Research/open-buildings/v3/polygons')
  });
  const filtered = eeCall('Collection.filter', {
    collection: fc,
    filter: eeCall('Filter.and', {
      filters: {
        arrayValue: {
          values: [
            eeCall('Filter.bounds', { geometry: rect }),
            eeCall('Filter.greaterThanOrEquals', {
              name: eeVal('confidence'),
              value: eeVal(0.65)
            })
          ]
        }
      }
    })
  });

  const result = await eePost('table:computeFeatures', {
    expression: filtered
  });

  return json(result, 200);
}

// ---------------------------------------------------------------------------
// Layer: DEM Elevation Heatmap — USGS 3DEP 10m
// Returns map tile URL
// ---------------------------------------------------------------------------
async function fetchDemTiles(west, south, east, north) {
  const dem = eeCall('Image.load', { id: eeVal('USGS/3DEP/10m') });
  const vis = eeCall('Image.visualize', {
    image: dem,
    bands: eeVal(['elevation']),
    min: eeVal(200),
    max: eeVal(350),
    palette: eeVal(['1a9850','91cf60','d9ef8b','fee08b','fc8d59','d73027','ffffff'])
  });

  const result = await eePost('maps', {
    expression: vis,
    fileFormat: 'AUTO_PNG_OR_JPG'
  });

  const name = result.name; // projects/{id}/maps/{mapId}
  return json({
    tileUrl: `/.netlify/functions/ee-proxy?layer=tile&map=${encodeURIComponent(name)}&z={z}&x={x}&y={y}`,
    type: 'tiles',
    legend: {
      title: 'Elevation (m)',
      stops: [
        { value: 200, color: '#1a9850', label: '200m (low)' },
        { value: 250, color: '#d9ef8b', label: '250m' },
        { value: 300, color: '#fc8d59', label: '300m' },
        { value: 350, color: '#ffffff', label: '350m (high)' }
      ]
    }
  }, 200);
}

// ---------------------------------------------------------------------------
// Layer: Aspect / Sun Exposure — derived from 3DEP DEM
// ---------------------------------------------------------------------------
async function fetchAspectTiles(west, south, east, north) {
  const dem = eeCall('Image.load', { id: eeVal('USGS/3DEP/10m') });
  const aspect = eeCall('Terrain.aspect', { input: dem });
  const vis = eeCall('Image.visualize', {
    image: aspect,
    min: eeVal(0),
    max: eeVal(360),
    palette: eeVal(['2196F3','4CAF50','8BC34A','FFC107','FF9800','F44336','E91E63','9C27B0','2196F3'])
  });

  const result = await eePost('maps', {
    expression: vis,
    fileFormat: 'AUTO_PNG_OR_JPG'
  });

  const name = result.name;
  return json({
    tileUrl: `/.netlify/functions/ee-proxy?layer=tile&map=${encodeURIComponent(name)}&z={z}&x={x}&y={y}`,
    type: 'tiles',
    legend: {
      title: 'Sun Exposure (Aspect)',
      stops: [
        { value: 'N (0°)', color: '#2196F3', label: 'North — full shade' },
        { value: 'E (90°)', color: '#4CAF50', label: 'East — morning sun' },
        { value: 'S (180°)', color: '#F44336', label: 'South — full sun' },
        { value: 'W (270°)', color: '#FFC107', label: 'West — afternoon sun' }
      ]
    }
  }, 200);
}

// ---------------------------------------------------------------------------
// Layer: Slope Analysis — derived from 3DEP DEM
// ---------------------------------------------------------------------------
async function fetchSlopeTiles(west, south, east, north) {
  const dem = eeCall('Image.load', { id: eeVal('USGS/3DEP/10m') });
  const slope = eeCall('Terrain.slope', { input: dem });
  const vis = eeCall('Image.visualize', {
    image: slope,
    min: eeVal(0),
    max: eeVal(30),
    palette: eeVal(['1a9850','66bd63','a6d96a','fee08b','fdae61','f46d43','d73027'])
  });

  const result = await eePost('maps', {
    expression: vis,
    fileFormat: 'AUTO_PNG_OR_JPG'
  });

  const name = result.name;
  return json({
    tileUrl: `/.netlify/functions/ee-proxy?layer=tile&map=${encodeURIComponent(name)}&z={z}&x={x}&y={y}`,
    type: 'tiles',
    legend: {
      title: 'Slope (%)',
      stops: [
        { value: '0–5%', color: '#1a9850', label: 'Flat — buildable' },
        { value: '5–15%', color: '#fee08b', label: 'Moderate — grading needed' },
        { value: '15–30%', color: '#f46d43', label: 'Steep — erosion risk' },
        { value: '30%+', color: '#d73027', label: 'Very steep — not buildable' }
      ]
    }
  }, 200);
}

// ---------------------------------------------------------------------------
// Tile Proxy — serves EE map tiles through our function with auth
// ---------------------------------------------------------------------------
async function proxyTile(mapName, z, x, y) {
  const token = await getAccessToken();
  const tileUrl = `${EE_API}/${mapName}/tiles/${z}/${x}/${y}`;
  const resp = await fetch(tileUrl, {
    headers: { 'Authorization': `Bearer ${token}` },
    signal: AbortSignal.timeout(15000)
  });
  if (!resp.ok) {
    return new Response(`Tile error: ${resp.status}`, { status: resp.status, headers: CORS });
  }
  const body = await resp.arrayBuffer();
  return new Response(body, {
    status: 200,
    headers: {
      ...CORS,
      'Content-Type': resp.headers.get('Content-Type') || 'image/png',
      'Cache-Control': 'public, max-age=86400'
    }
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(request.url);
  const layer = url.searchParams.get('layer');

  if (!process.env.GEE_PROJECT_ID || !process.env.GEE_SERVICE_ACCOUNT_KEY) {
    return json({
      error: 'Earth Engine not configured',
      message: 'Set GEE_PROJECT_ID and GEE_SERVICE_ACCOUNT_KEY in Netlify env vars',
      setup_url: 'https://code.earthengine.google.com/register'
    }, 503);
  }

  // Tile proxy route: ?layer=tile&map=projects/.../maps/...&z=14&x=1234&y=5678
  if (layer === 'tile') {
    const mapName = url.searchParams.get('map');
    const z = url.searchParams.get('z');
    const x = url.searchParams.get('x');
    const y = url.searchParams.get('y');
    if (!mapName || !z || !x || !y) return json({ error: 'Missing tile params' }, 400);
    try {
      return await proxyTile(mapName, z, x, y);
    } catch (err) {
      console.error('[ee-proxy] tile error', err.message);
      return new Response('Tile error', { status: 502, headers: CORS });
    }
  }

  const bbox = url.searchParams.get('bbox');
  if (!layer) return json({ error: 'Missing layer parameter' }, 400);
  if (!bbox) return json({ error: 'Missing bbox parameter' }, 400);
  const parts = bbox.split(',').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return json({ error: 'Invalid bbox' }, 400);
  const [west, south, east, north] = parts;

  if ((east - west) > MAX_BBOX_DEG || (north - south) > MAX_BBOX_DEG) {
    return json({ error: 'bbox_too_large', message: 'Zoom in to load this layer' }, 400);
  }

  try {
    switch (layer) {
      case 'buildings': return await fetchBuildings(west, south, east, north);
      case 'dem':       return await fetchDemTiles(west, south, east, north);
      case 'aspect':    return await fetchAspectTiles(west, south, east, north);
      case 'slope':     return await fetchSlopeTiles(west, south, east, north);
      default:          return json({ error: `Unknown layer: ${layer}` }, 400);
    }
  } catch (err) {
    console.error('[ee-proxy] ERROR', layer, err.message, err.stack?.split('\n')[1] || '');
    return json({ error: err.message, layer }, 502);
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}

