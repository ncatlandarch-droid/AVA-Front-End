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

  // Guard against overloaded queries
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
    return json({ error: err.message }, 502);
  }
};

// ---------------------------------------------------------------------------
// Parcels — Guilford County ArcGIS REST
// ---------------------------------------------------------------------------
async function fetchParcels(w, s, e, n) {
  const base = 'https://maps.guilfordcountync.gov/arcgis/rest/services/BaseLayers/ParcelViewer/MapServer/0/query';
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${w},${s},${e},${n}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'PARCEL_ID,OWNER_NAME,SITUS_ADDRESS,LAND_USE_CD,ACREAGE,ZONING',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: 500
  });
  const resp = await fetch(`${base}?${params}`);
  if (!resp.ok) throw new Error(`Parcels HTTP ${resp.status}`);
  const data = await resp.json();
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/geo+json', ...CORS } });
}

// ---------------------------------------------------------------------------
// Contours — USGS National Map Elevation Contours
// ---------------------------------------------------------------------------
async function fetchContours(w, s, e, n) {
  const base = 'https://services.nationalmap.gov/arcgis/rest/services/Elevation/3DEPElevationIndex/MapServer/0/query';
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${w},${s},${e},${n}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'CONTOURELVMAJORVALUE,ELEVATION',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: 1000
  });
  const resp = await fetch(`${base}?${params}`);
  if (!resp.ok) throw new Error(`Contours HTTP ${resp.status}`);
  const data = await resp.json();
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/geo+json', ...CORS } });
}

// ---------------------------------------------------------------------------
// Soils — ESRI Living Atlas SSURGO Web Feature Service
// ---------------------------------------------------------------------------
async function fetchSoils(w, s, e, n) {
  const base = 'https://landscape11.arcgis.com/arcgis/rest/services/USA_Soils_Map_Units/MapServer/0/query';
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${w},${s},${e},${n}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'musym,muname,drclassdcd,hydgrpdcd',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: 500
  });
  const resp = await fetch(`${base}?${params}`);
  if (!resp.ok) throw new Error(`Soils HTTP ${resp.status}`);
  const data = await resp.json();
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/geo+json', ...CORS } });
}

// ---------------------------------------------------------------------------
// Zoning — Guilford County ArcGIS REST
// ---------------------------------------------------------------------------
async function fetchZoning(w, s, e, n) {
  const base = 'https://maps.guilfordcountync.gov/arcgis/rest/services/BaseLayers/Zoning/MapServer/0/query';
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${w},${s},${e},${n}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'ZONING_CODE,ZONING_DESCRIPTION,JURISDICTION',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: 500
  });
  const resp = await fetch(`${base}?${params}`);
  if (!resp.ok) throw new Error(`Zoning HTTP ${resp.status}`);
  const data = await resp.json();
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/geo+json', ...CORS } });
}

// ---------------------------------------------------------------------------
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json', ...CORS }
  });
}
