// Netlify Function: Earth Engine data proxy
// Uses the correct Expression Graph format: { values: {...}, result: "key" }
// Requires env vars: GEE_PROJECT_ID, GEE_SERVICE_ACCOUNT_KEY (JSON key)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=600'
};

const MAX_BBOX_DEG = 0.12;
const EE_API = 'https://earthengine.googleapis.com/v1';

// ---------------------------------------------------------------------------
// OAuth2 — get access token from service account key
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

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/earthengine',
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
  if (!tokenResp.ok) throw new Error(`OAuth error: ${tokenResp.status}`);
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
// EE Expression Graph Builder
// The REST API expects: { values: { "0": {...}, "1": {...} }, result: "N" }
// Each value node is one of: constantValue, functionInvocationValue, valueReference, etc.
// ---------------------------------------------------------------------------
class ExprGraph {
  constructor() { this.values = {}; this.counter = 0; }
  
  // Add a constant value node
  constant(val) {
    const key = String(this.counter++);
    this.values[key] = { constantValue: val };
    return key;
  }
  
  // Add a function invocation node
  call(fnName, args) {
    const key = String(this.counter++);
    const arguments_ = {};
    for (const [name, ref] of Object.entries(args)) {
      arguments_[name] = { valueReference: ref };
    }
    this.values[key] = {
      functionInvocationValue: {
        functionName: fnName,
        arguments: arguments_
      }
    };
    return key;
  }
  
  // Get the final expression object
  build(resultKey) {
    return { values: this.values, result: resultKey };
  }
}

// ---------------------------------------------------------------------------
// EE API helpers
// ---------------------------------------------------------------------------
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
    throw new Error(`EE API ${resp.status}: ${errText.substring(0, 500)}`);
  }
  return resp.json();
}

// ---------------------------------------------------------------------------
// Layer: Building Footprints — OpenStreetMap via Overpass API
// Free, fast, no auth needed. Great coverage for US university campuses.
// ---------------------------------------------------------------------------
async function fetchBuildings(west, south, east, north) {
  const query = `[out:json][timeout:20];way["building"](${south},${west},${north},${east});out body geom;`;
  
  // Use GET with query parameter — POST returns 406 from serverless
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: { 'User-Agent': 'AVA-GIS/1.0 (thinkava.app)' },
    signal: AbortSignal.timeout(22000)
  });
  
  if (!resp.ok) throw new Error(`Overpass API ${resp.status}`);
  const data = await resp.json();
  
  // Convert Overpass elements to GeoJSON FeatureCollection
  const features = data.elements
    .filter(el => el.geometry && el.geometry.length >= 4)
    .slice(0, 500)
    .map(el => {
      const coords = el.geometry.map(p => [p.lon, p.lat]);
      // Close the ring if not already closed
      if (coords.length > 0) {
        const first = coords[0], last = coords[coords.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) coords.push([...first]);
      }
      return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [coords] },
        properties: {
          name: el.tags?.name || null,
          building: el.tags?.building || 'yes',
          levels: el.tags?.['building:levels'] || null,
          osm_id: el.id
        }
      };
    });

  return json({ type: 'FeatureCollection', features }, 200);
}

// ---------------------------------------------------------------------------
// Layer: DEM Elevation Heatmap — USGS 3DEP 10m
// ---------------------------------------------------------------------------
async function fetchDemTiles() {
  const g = new ExprGraph();
  const imgId = g.constant('USGS/3DEP/10m');
  const img = g.call('Image.load', { id: imgId });
  
  const bands = g.constant(['elevation']);
  const minVal = g.constant(200);
  const maxVal = g.constant(350);
  const palette = g.constant(['1a9850','91cf60','d9ef8b','fee08b','fc8d59','d73027','ffffff']);
  const vis = g.call('Image.visualize', {
    image: img, bands, min: minVal, max: maxVal, palette
  });

  const result = await eePost('maps', {
    expression: g.build(vis),
    fileFormat: 'AUTO_JPEG_PNG'
  });

  const name = result.name;
  return json({
    tileUrl: `/.netlify/functions/ee-proxy?layer=tile&map=${encodeURIComponent(name)}&z={z}&x={x}&y={y}`,
    type: 'tiles',
    legend: { title: 'Elevation (m)', stops: [
      { value: 200, color: '#1a9850', label: '200m (low)' },
      { value: 300, color: '#fc8d59', label: '300m' },
      { value: 350, color: '#ffffff', label: '350m (high)' }
    ]}
  }, 200);
}

// ---------------------------------------------------------------------------
// Layer: Aspect / Sun Exposure
// ---------------------------------------------------------------------------
async function fetchAspectTiles() {
  const g = new ExprGraph();
  const imgId = g.constant('USGS/3DEP/10m');
  const img = g.call('Image.load', { id: imgId });
  const aspect = g.call('Terrain.aspect', { input: img });
  
  const minVal = g.constant(0);
  const maxVal = g.constant(360);
  const palette = g.constant(['2196F3','4CAF50','FFC107','F44336','E91E63','9C27B0','2196F3']);
  const vis = g.call('Image.visualize', {
    image: aspect, min: minVal, max: maxVal, palette
  });

  const result = await eePost('maps', {
    expression: g.build(vis),
    fileFormat: 'AUTO_JPEG_PNG'
  });

  const name = result.name;
  return json({
    tileUrl: `/.netlify/functions/ee-proxy?layer=tile&map=${encodeURIComponent(name)}&z={z}&x={x}&y={y}`,
    type: 'tiles',
    legend: { title: 'Sun Exposure', stops: [
      { value: 'N', color: '#2196F3', label: 'North — shade' },
      { value: 'S', color: '#F44336', label: 'South — full sun' },
      { value: 'W', color: '#FFC107', label: 'West — afternoon' }
    ]}
  }, 200);
}

// ---------------------------------------------------------------------------
// Layer: Slope Analysis
// ---------------------------------------------------------------------------
async function fetchSlopeTiles() {
  const g = new ExprGraph();
  const imgId = g.constant('USGS/3DEP/10m');
  const img = g.call('Image.load', { id: imgId });
  const slope = g.call('Terrain.slope', { input: img });
  
  const minVal = g.constant(0);
  const maxVal = g.constant(30);
  const palette = g.constant(['1a9850','66bd63','a6d96a','fee08b','fdae61','f46d43','d73027']);
  const vis = g.call('Image.visualize', {
    image: slope, min: minVal, max: maxVal, palette
  });

  const result = await eePost('maps', {
    expression: g.build(vis),
    fileFormat: 'AUTO_JPEG_PNG'
  });

  const name = result.name;
  return json({
    tileUrl: `/.netlify/functions/ee-proxy?layer=tile&map=${encodeURIComponent(name)}&z={z}&x={x}&y={y}`,
    type: 'tiles',
    legend: { title: 'Slope', stops: [
      { value: '0-5%', color: '#1a9850', label: 'Flat — buildable' },
      { value: '5-15%', color: '#fee08b', label: 'Moderate' },
      { value: '15%+', color: '#d73027', label: 'Steep — erosion risk' }
    ]}
  }, 200);
}

// ---------------------------------------------------------------------------
// Tile Proxy — auth'd tile forwarding
// ---------------------------------------------------------------------------
async function proxyTile(mapName, z, x, y) {
  const token = await getAccessToken();
  const tileUrl = `${EE_API}/${mapName}/tiles/${z}/${x}/${y}`;
  const resp = await fetch(tileUrl, {
    headers: { 'Authorization': `Bearer ${token}` },
    signal: AbortSignal.timeout(15000)
  });
  if (!resp.ok) return new Response(`Tile error: ${resp.status}`, { status: resp.status, headers: CORS });
  const body = await resp.arrayBuffer();
  return new Response(body, {
    status: 200,
    headers: { ...CORS, 'Content-Type': resp.headers.get('Content-Type') || 'image/png', 'Cache-Control': 'public, max-age=86400' }
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export default async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(request.url);
  const layer = url.searchParams.get('layer');

  if (!process.env.GEE_PROJECT_ID || !process.env.GEE_SERVICE_ACCOUNT_KEY) {
    return json({ error: 'Earth Engine not configured' }, 503);
  }

  // Tile proxy: ?layer=tile&map=...&z=...&x=...&y=...
  if (layer === 'tile') {
    const mapName = url.searchParams.get('map');
    const z = url.searchParams.get('z');
    const x = url.searchParams.get('x');
    const y = url.searchParams.get('y');
    if (!mapName || !z || !x || !y) return json({ error: 'Missing tile params' }, 400);
    try { return await proxyTile(mapName, z, x, y); }
    catch (err) { return new Response('Tile error', { status: 502, headers: CORS }); }
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
      case 'dem':       return await fetchDemTiles();
      case 'aspect':    return await fetchAspectTiles();
      case 'slope':     return await fetchSlopeTiles();
      default:          return json({ error: `Unknown layer: ${layer}` }, 400);
    }
  } catch (err) {
    console.error('[ee-proxy]', layer, err.message);
    return json({ error: err.message, layer }, 502);
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}
