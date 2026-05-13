// Netlify Function: GIS data proxy — routes parcel, contour, soils, zoning requests
// Adds CORS headers and caches responses for 5 minutes
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=300'
};

const MAX_BBOX_DEG = 0.12;

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const url = new URL(request.url);
  const service = url.searchParams.get('service');
  const bbox = url.searchParams.get('bbox'); // W,S,E,N

  if (!service || !bbox) return json({ error: 'Missing service or bbox' }, 400);

  const parts = bbox.split(',').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return json({ error: 'Invalid bbox' }, 400);
  const [west, south, east, north] = parts;

  if ((east - west) > MAX_BBOX_DEG || (north - south) > MAX_BBOX_DEG) {
    return json({ error: 'bbox_too_large', message: 'Zoom in to load GIS data' }, 400);
  }

  try {
    switch (service) {
      case 'parcels':  return await fetchParcels(west, south, east, north);
      case 'contours': return await fetchContours(west, south, east, north);
      case 'soils':    return await fetchSoils(west, south, east, north);
      case 'zoning':   return await fetchZoning(west, south, east, north);
      default:         return json({ error: `Unknown service: ${service}` }, 400);
    }
  } catch (err) {
    console.error('[gis-proxy]', service, err.message);
    return json({ error: err.message }, 502);
  }
};

// ---------------------------------------------------------------------------
// Shared ArcGIS query helper — tries each URL in order, returns first success
// ---------------------------------------------------------------------------
async function arcgisQuery(urls, params) {
  let lastErr;
  for (const base of urls) {
    try {
      const resp = await fetch(`${base}?${params}`, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) { lastErr = new Error(`HTTP ${resp.status} from ${base}`); continue; }
      const data = await resp.json();
      // ArcGIS error object (service exists but query failed)
      if (data?.error) { lastErr = new Error(data.error.message || JSON.stringify(data.error)); continue; }
      return data;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('All endpoints failed');
}

// ---------------------------------------------------------------------------
// Parcels — Guilford County ArcGIS (multiple candidate URLs)
// ---------------------------------------------------------------------------
async function fetchParcels(w, s, e, n) {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${w},${s},${e},${n}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: 500
  });

  const data = await arcgisQuery([
    'https://maps.guilfordcountync.gov/arcgis/rest/services/Guilford_Parcels/MapServer/0/query',
    'https://maps.guilfordcountync.gov/arcgis/rest/services/BaseLayers/ParcelViewer/MapServer/0/query',
    'https://gis.guilfordcountync.gov/arcgis/rest/services/Parcels/FeatureServer/0/query',
    // NC OneMap statewide parcel fallback (public)
    'https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/FeatureServer/0/query',
  ], params);

  return geojsonResp(data);
}

// ---------------------------------------------------------------------------
// Contours — USGS National Map 3DEP (topo contours)
// ---------------------------------------------------------------------------
async function fetchContours(w, s, e, n) {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${w},${s},${e},${n}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'ContourElevation,ContourType',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: 1000
  });

  const data = await arcgisQuery([
    'https://carto.nationalmap.gov/arcgis/rest/services/contours/MapServer/1/query',
    'https://carto.nationalmap.gov/arcgis/rest/services/contours/MapServer/0/query',
    'https://services.nationalmap.gov/arcgis/rest/services/Elevation/3DEPElevationIndex/MapServer/0/query',
  ], params);

  return geojsonResp(data);
}

// ---------------------------------------------------------------------------
// Soils — USDA SSURGO via public ArcGIS services
// ---------------------------------------------------------------------------
async function fetchSoils(w, s, e, n) {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${w},${s},${e},${n}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'musym,muname,drclassdcd,hydgrpdcd,mukey',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: 500
  });

  const data = await arcgisQuery([
    // USDA NRCS SSURGO via ArcGIS Online (public, no auth)
    'https://services.arcgis.com/SXbDpmb7xQkk44JV/arcgis/rest/services/SSURGO_Mapunit_Boundaries/FeatureServer/0/query',
    // ESRI Living Atlas USA Soils (may require ArcGIS Online session — try anyway)
    'https://landscape.arcgis.com/arcgis/rest/services/Soil/USA_Soils_Map_Units/MapServer/0/query',
    'https://landscape11.arcgis.com/arcgis/rest/services/USA_Soils_Map_Units/MapServer/0/query',
  ], params);

  return geojsonResp(data);
}

// ---------------------------------------------------------------------------
// Zoning — Guilford County / City of Greensboro / High Point
// ---------------------------------------------------------------------------
async function fetchZoning(w, s, e, n) {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${w},${s},${e},${n}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: 500
  });

  const data = await arcgisQuery([
    'https://maps.guilfordcountync.gov/arcgis/rest/services/BaseLayers/Zoning/MapServer/0/query',
    'https://gis.guilfordcountync.gov/arcgis/rest/services/Zoning/FeatureServer/0/query',
    // City of Greensboro zoning (covers most of the project area)
    'https://services1.arcgis.com/R8iuKqEFWQ0IQtOp/arcgis/rest/services/Greensboro_Zoning/FeatureServer/0/query',
  ], params);

  return geojsonResp(data);
}

// ---------------------------------------------------------------------------
function geojsonResp(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/geo+json', ...CORS }
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json', ...CORS }
  });
}
