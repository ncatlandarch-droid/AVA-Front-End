/* ============================================================
   geo-layers.js  —  GIS Data Layer Manager for AVA
   Think! Design and Planning, LLC

   Five toggleable overlays on the Cesium 3D viewer:
     roads     → Google hybrid labels/streets (ImageryLayer)
     parcels   → Parcel boundaries + owner info  (GeoJSON via proxy)
     contours  → USGS 3DEP 10m elevation contours (GeoJSON via proxy)
     soils     → NRCS SSURGO soil map units        (GeoJSON via proxy)
     zoning    → Municipal zoning classifications  (GeoJSON via proxy)

   Public API:  window.GEO_LAYERS
     .init(viewer, mapsKey)        wire to active Cesium viewer
     .toggle(layerId)              show/hide a layer
     .getSelectedParcel()          returns current parcel object or null
     .createProjectFromParcel()    pre-fills ADMIN form + opens modal
     .captureForDesign()           overhead screenshot → plan view design
   ============================================================ */

window.GEO_LAYERS = (() => {

  let _viewer  = null;
  let _mapsKey = null;
  let _gmMap               = null;
  let _gmParcelIdleListener = null;
  let _gmParcelLastBbox     = null;
  let _gmZoningIdleListener = null;
  let _gmZoningLastBbox     = null;
  let _gmSoilsIdleListener      = null;
  let _gmSoilsLastBbox          = null;
  let _gmHydrologyIdleListener  = null;
  let _gmHydrologyLastBbox      = null;
  let _gmFloodplainIdleListener = null;
  let _gmFloodplainLastBbox     = null;
  let _gmWetlandsIdleListener   = null;
  let _gmWetlandsLastBbox       = null;
  let _selectedParcel = null;
  let _panelVisible   = false;
  let _panelMinimized = false;
  const STORE_KEY_PANEL  = 'ava-layer-panel-vis';
  const STORE_KEY_MIN    = 'ava-layer-panel-min';
  const STORE_KEY_LAYERS = 'ava-active-layers';

  const PROXY = '/.netlify/functions/gis-proxy';
  const MAX_BBOX_DEG  = 0.12;   // ~12 km — refuse queries wider than this
  const JD = () => Cesium.JulianDate.now();

  /* ── Layer definitions ─────────────────────────────────── */
  const LAYER_DEFS = [
    { id: 'roads',    label: 'Clean Satellite',  icon: 'satellite_alt', accent: '#90A4AE', type: 'imagery' },
    { id: 'parcels',  label: 'Parcels',          icon: 'texture',   accent: '#FDB927', type: 'geojson',
      style: { stroke: '#FDB927', fill: 'rgba(253,185,39,0.07)', strokeWidth: 1.5 } },
    { id: 'contours', label: 'Contours',         icon: 'terrain',   accent: '#C8A876', type: 'geojson',
      style: { stroke: '#D4B483', fill: 'transparent', strokeWidth: 1 } },
    { id: 'soils',    label: 'Soils (SSURGO)',   icon: 'grass',     accent: '#4CAF50', type: 'geojson',
      style: { stroke: '#4CAF50', fill: 'rgba(76,175,80,0.1)',  strokeWidth: 1 } },
    { id: 'zoning',   label: 'Zoning',           icon: 'home_work', accent: '#AB47BC', type: 'geojson',
      style: { stroke: '#AB47BC', fill: 'rgba(171,71,188,0.09)', strokeWidth: 1.5 } },
    { id: 'overlay',  label: 'Overlay Districts', icon: 'layers',    accent: '#5C6BC0', type: 'geojson',
      style: { stroke: '#5C6BC0', fill: 'rgba(92,107,192,0.12)', strokeWidth: 2 } },
    { id: 'historic', label: 'Historic Districts', icon: 'account_balance', accent: '#BF360C', type: 'geojson',
      style: { stroke: '#BF360C', fill: 'rgba(191,54,12,0.12)',  strokeWidth: 2 } },
    { id: 'futurelu', label: 'Future Land Use',   icon: 'map',       accent: '#F57F17', type: 'geojson',
      style: { stroke: '#F57F17', fill: 'rgba(245,127,23,0.15)', strokeWidth: 1.5 } },
    { id: 'hydrology',  label: 'Water Bodies & Streams', icon: 'waves', accent: '#1E88E5', type: 'geojson',
      style: { stroke: '#0D47A1', fill: 'rgba(30,136,229,0.45)', strokeWidth: 2 } },
    { id: 'floodplain', label: 'Flood Zones',    icon: 'water',     accent: '#2196F3', type: 'geojson',
      style: { stroke: '#1565C0', fill: 'rgba(33,150,243,0.12)',  strokeWidth: 1.5 } },
    { id: 'wetlands',   label: 'Wetlands (NWI)',  icon: 'water_drop', accent: '#00897B', type: 'geojson',
      style: { stroke: '#00695C', fill: 'rgba(0,137,123,0.12)',  strokeWidth: 1 } },
  ];

  // Runtime state per layer
  const _st = {};
  LAYER_DEFS.forEach(d => { _st[d.id] = { active: false, loading: false, ref: null, opacity: 1.0 }; });

  /* ── Init ──────────────────────────────────────────────── */

  function init(viewer, mapsKey) {
    _viewer  = viewer;
    _mapsKey = mapsKey;
    _buildUI();
    _addClickHandler();
    // Restore previously active layers after a short delay (let map settle)
    setTimeout(_restoreLayerState, 2500);
  }

  /* ── Public: toggle ────────────────────────────────────── */

  function toggle(layerId) {
    if (_st[layerId]?.active) _deactivate(layerId);
    else                       _activate(layerId);
  }

  function getSelectedParcel() { return _selectedParcel; }

  /* ── Layer activation ──────────────────────────────────── */

  async function _activate(layerId) {
    const def = LAYER_DEFS.find(d => d.id === layerId);
    const st  = _st[layerId];
    if (!def || st.loading) return;

    st.loading = true;
    _refreshRow(layerId);

    try {
      // Clean Satellite — hide all Google Maps labels/roads when in plan view
      if (layerId === 'roads' && _inGmMode()) {
        _gmMap.setOptions({ styles: [
          { elementType: 'labels',           stylers: [{ visibility: 'off' }] },
          { featureType: 'road',             stylers: [{ visibility: 'off' }] },
          { featureType: 'transit',          stylers: [{ visibility: 'off' }] },
          { featureType: 'poi',              stylers: [{ visibility: 'off' }] },
          { featureType: 'administrative',   elementType: 'labels', stylers: [{ visibility: 'off' }] },
        ]});
        st.ref = { setMap: () => {}, setStyle: () => {}, setOpacity: () => {} };
        _toast('Clean Satellite — labels hidden', 'success');
        st.loading = false;
        st.active  = true;
        _refreshRow(layerId);
        _saveLayerState();
        return;
      }
      if (layerId === 'roads') {
        _loadRoads();
      } else {
        const bbox = _inGmMode() ? _gmBbox() : _viewportBbox();
        if (!bbox) {
          _toast('Navigate to a location first, then toggle layers', 'info');
          throw new Error('no bbox');
        }
        const spanLng = bbox.east  - bbox.west;
        const spanLat = bbox.north - bbox.south;
        if (spanLng > MAX_BBOX_DEG || spanLat > MAX_BBOX_DEG) {
          _toast(`Zoom in to load ${def.label}`, 'info');
          throw new Error('too wide');
        }
        const bboxStr = `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
        const resp = await fetch(`${PROXY}?service=${layerId}&bbox=${bboxStr}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const geojson = await resp.json();
        if (!geojson?.features?.length) {
          _toast(`No ${def.label} data in this area`, 'info');
          throw new Error('empty');
        }
        if (_inGmMode()) {
          st.ref = _addGmLayer(layerId, geojson, def.style);
          if (layerId === 'parcels')   { _startGmParcelRefresh(); _gmParcelLastBbox = bbox; }
          if (layerId === 'zoning')   { _startGmZoningRefresh(); _gmZoningLastBbox = bbox; }
          if (layerId === 'soils')    { _startGmSoilsRefresh();  _gmSoilsLastBbox  = bbox; }
          if (layerId === 'contours')   { _contoursRefresh.start();   _contoursRefresh.setBbox(bbox);   }
          if (layerId === 'hydrology')  { _hydrologyRefresh.start();  _hydrologyRefresh.setBbox(bbox);  }
          if (layerId === 'floodplain') { _floodplainRefresh.start(); _floodplainRefresh.setBbox(bbox); }
          if (layerId === 'wetlands')   { _wetlandsRefresh.start();   _wetlandsRefresh.setBbox(bbox);   }
          if (layerId === 'overlay')    { _overlayRefresh.start();    _overlayRefresh.setBbox(bbox);    }
          if (layerId === 'historic')   { _historicRefresh.start();   _historicRefresh.setBbox(bbox);   }
          if (layerId === 'futurelu')   { _futureLuRefresh.start();   _futureLuRefresh.setBbox(bbox);   }
        } else {
          st.ref = await _addGeoJson(layerId, geojson, def.style);
        }
        _toast(`${def.label} loaded — ${geojson.features.length} features`, 'success');
      }
      st.active = true;
    } catch (e) {
      if (!['no bbox','too wide','empty'].includes(e.message)) {
        console.warn('[AVA LAYERS]', layerId, e);
        const msg = e.message?.includes('502')
          ? `${def.label} — GIS service temporarily unavailable, try again later`
          : `${def.label} unavailable — check connection`;
        _toast(msg, 'warn');
      }
    }

    st.loading = false;
    _refreshRow(layerId);
    _saveLayerState();
  }

  function _deactivate(layerId) {
    const st = _st[layerId];
    if (layerId === 'roads') {
      if (_inGmMode()) { _gmMap.setOptions({ styles: [] }); }
      else if (st.ref) { _viewer.imageryLayers.remove(st.ref); }
    } else if (st.ref && typeof st.ref.setMap === 'function') {
      st.ref.setMap(null);
      if (layerId === 'parcels')   _stopGmParcelRefresh();
      if (layerId === 'zoning')   _stopGmZoningRefresh();
      if (layerId === 'soils')    _stopGmSoilsRefresh();
      if (layerId === 'contours')   _contoursRefresh.stop();
      if (layerId === 'hydrology')  _hydrologyRefresh.stop();
      if (layerId === 'floodplain') _floodplainRefresh.stop();
      if (layerId === 'wetlands')   _wetlandsRefresh.stop();
      if (layerId === 'overlay')    _overlayRefresh.stop();
      if (layerId === 'historic')   _historicRefresh.stop();
      if (layerId === 'futurelu')   _futureLuRefresh.stop();
    } else {
      if (st.ref) _viewer.dataSources.remove(st.ref, true);
    }
    st.ref    = null;
    st.active = false;
    _refreshRow(layerId);
    _saveLayerState();
  }

  /* ── Layer state persistence ─────────────────────────── */

  function _saveLayerState() {
    try {
      const active = Object.entries(_st)
        .filter(([, s]) => s.active)
        .map(([id]) => id);
      localStorage.setItem(STORE_KEY_LAYERS, JSON.stringify(active));
    } catch (e) { /* quota exceeded — ignore */ }
  }

  function _restoreLayerState() {
    try {
      const raw = localStorage.getItem(STORE_KEY_LAYERS);
      if (!raw) return;
      const ids = JSON.parse(raw);
      if (!Array.isArray(ids)) return;
      ids.forEach(id => {
        if (_st[id] && !_st[id].active) toggle(id);
      });
    } catch (e) { console.warn('[AVA LAYERS] restore failed', e); }
  }

  function _loadRoads() {
    // Primary: ESRI World Transportation overlay (roads + labels, no key needed)
    // Secondary: Google hybrid overlay (richer labels, requires Maps API key)
    const url = _mapsKey
      ? `https://mt1.google.com/vt/lyrs=h&x={x}&y={y}&z={z}&key=${_mapsKey}`
      : 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}';
    const credit = _mapsKey
      ? new Cesium.Credit('© Google', true)
      : new Cesium.Credit('© Esri, HERE, Garmin, OpenStreetMap', true);
    const provider = new Cesium.UrlTemplateImageryProvider({ url, credit });
    const layer    = _viewer.imageryLayers.addImageryProvider(provider);
    layer.alpha    = 0.85;
    _st.roads.ref  = layer;
    _toast('Streets & Labels on', 'success');
  }

  async function _addGeoJson(layerId, geojson, style) {
    // ClassificationType.BOTH silently drops polygon.outline on GroundPrimitives,
    // so we render outlines as separate clamped GroundPolyline entities below.
    const fillCss = style.fill === 'transparent' ? null : style.fill;
    // Bump minimum alpha to 0.22 so fills are visible; keep originals that are already higher.
    const fillColor = fillCss
      ? (() => {
          const c = Cesium.Color.fromCssColorString(fillCss);
          c.alpha = Math.max(c.alpha, 0.22);
          return c;
        })()
      : Cesium.Color.TRANSPARENT;
    const strokeColor = Cesium.Color.fromCssColorString(style.stroke).withAlpha(1.0);

    const ds = new Cesium.GeoJsonDataSource(layerId);
    await ds.load(geojson, {
      stroke:        strokeColor,
      fill:          fillColor,
      strokeWidth:   style.strokeWidth,
      clampToGround: true
    });

    const now = Cesium.JulianDate.now();
    // Collect outline positions BEFORE mutating entities collection
    const outlines = [];

    ds.entities.values.forEach(e => {
      e.billboard = undefined;
      e.label     = undefined;
      if (e.polygon) {
        e.point = undefined;
        // Render fill on top of terrain AND Google Photorealistic 3D Tiles
        e.polygon.classificationType = Cesium.ClassificationType.BOTH;
        e.polygon.heightReference    = Cesium.HeightReference.CLAMP_TO_GROUND;
        // Collect boundary positions for outline GroundPolylines
        try {
          const hier = e.polygon.hierarchy.getValue(now);
          if (hier?.positions?.length > 1) {
            // Close the ring
            outlines.push([...hier.positions, hier.positions[0]]);
          }
        } catch (_) {}
      } else if (e.point) {
        e.point.color    = strokeColor;
        e.point.pixelSize = new Cesium.ConstantProperty(10);
        e.point.outlineColor = Cesium.Color.BLACK;
        e.point.outlineWidth = new Cesium.ConstantProperty(2);
        e.point.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND;
        e.point.disableDepthTestDistance = Number.POSITIVE_INFINITY;
        e.point.scaleByDistance = new Cesium.NearFarScalar(500, 1.5, 20000, 0.5);
      }
      if (e.polyline) {
        e.polyline.clampToGround = true;
      }
    });

    // Add clamped GroundPolyline outline for every polygon —
    // the only reliable way to render parcel borders on both terrain and 3D tiles.
    outlines.forEach(positions => {
      ds.entities.add({
        polyline: {
          positions,
          width:          style.strokeWidth || 1.5,
          material:       strokeColor,
          clampToGround:  true,
          classificationType: Cesium.ClassificationType.BOTH,
        }
      });
    });

    await _viewer.dataSources.add(ds);
    return ds;
  }

  /* ── Parcel click interaction ──────────────────────────── */

  function _addClickHandler() {
    if (!_viewer) return;
    const handler = new Cesium.ScreenSpaceEventHandler(_viewer.scene.canvas);
    handler.setInputAction(evt => {
      if (!_st.parcels.active || !_st.parcels.ref) return;
      // drillPick instead of pick — outline GroundPolylines sit above polygon fills
      // and would otherwise swallow every click on a parcel boundary.
      const picks = _viewer.scene.drillPick(evt.position, 8);
      const match = picks.find(p => {
        const e = p?.id;
        return e instanceof Cesium.Entity && e.polygon &&
               e.entityCollection?.owner === _st.parcels.ref;
      });
      if (!match) return;
      _showParcelCard(match.id);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  /* ── Zoning color coding ──────────────────────────────── */
  function _zoningBadgeColor(zone) {
    if (!zone) return '#666';
    const z = zone.toUpperCase();
    if (/^R|RESID|RS|RL|RM|RH|R-/.test(z))   return '#2E8B57';  // green — residential
    if (/^B|COM|COMM|C-|CB|CC|CG|CS/.test(z)) return '#004684';  // blue  — commercial
    if (/^I|IND|LI|HI|M-|MFG/.test(z))        return '#e65100';  // orange — industrial
    if (/^A|AG|AGRI|FARM|RUR/.test(z))         return '#827717';  // olive  — agricultural
    if (/^O|OF|OFFICE|OP|OI/.test(z))          return '#6a1b9a';  // purple — office/professional
    if (/^MX|MIXED|MU|PUD/.test(z))            return '#00838f';  // teal   — mixed use / PUD
    if (/^PI|P-I|PB|INST|CIVIC|CF|GI/.test(z)) return '#c2185b'; // pink/magenta — public & institutional
    return '#555';
  }

  function _zoningLabel(zone) {
    if (!zone) return '';
    const z = zone.toUpperCase();
    if (/^RS|R-1|RL/.test(z))  return 'Single Family Residential';
    if (/^RM|R-2|R-3/.test(z)) return 'Multi-Family Residential';
    if (/^RH/.test(z))         return 'High Density Residential';
    if (/^CB|CC/.test(z))      return 'Community / Commercial';
    if (/^CG|C-2|C-3/.test(z)) return 'General Commercial';
    if (/^CS|C-1/.test(z))     return 'Commercial Strip';
    if (/^LI|I-1/.test(z))     return 'Light Industrial';
    if (/^HI|I-2/.test(z))     return 'Heavy Industrial';
    if (/^AG|A-1/.test(z))     return 'Agricultural';
    if (/^MX|MU/.test(z))      return 'Mixed Use';
    if (/^PUD/.test(z))        return 'Planned Unit Development';
    if (/^O|OP|OI/.test(z))    return 'Office / Professional';
    if (/^PI|P-I|PB|INST|CIVIC|CF|GI/.test(z)) return 'Public & Institutional';
    return zone;
  }

  function _showParcelCard(entity) {
    // De-highlight previously selected parcel (Cesium path)
    if (_selectedParcel?.entity?.polygon) {
      _selectedParcel.entity.polygon.material    = Cesium.Color.fromCssColorString('#FDB927').withAlpha(0.07);
      _selectedParcel.entity.polygon.outlineColor = Cesium.Color.fromCssColorString('#FDB927').withAlpha(0.5);
    }

    entity.polygon.material    = Cesium.Color.fromCssColorString('#FDB927').withAlpha(0.32);
    entity.polygon.outlineColor = Cesium.Color.fromCssColorString('#FDB927');
    entity.polygon.outlineWidth = 2.5;

    const p = entity.properties;
    _selectedParcel = {
      entity,
      id:      _prop(p, 'll_uuid','parcelnumb','parno','PARCEL_ID','PIN','PARID','APN','parcel_id','PARCELNUMB'),
      owner:   _prop(p, 'owner','ownname','OWNER_NAME','OWNER','OWNER1','OWNERNM','OWN_NAME','GRANTEE'),
      address: _prop(p, 'sadd','mailadd','siteadd','SITUS_ADDRESS','SITE_ADDR','SITE_ADDRESS','ADDR','PROP_ADDR'),
      acres:   _prop(p, 'acres','gisacres','ACREAGE','TOTAL_ACRES','ACRES','GISACRES','CALCACRES','GIS_ACRES'),
      landUse: _prop(p, 'usedesc','parusedesc','usecode','LAND_USE_CD','LAND_USE','LANDUSE','PROP_USE','LU_CODE'),
      zone:    _prop(p, 'zoning','zoning_description','ZONING','ZONING_CODE','ZONE_CODE','ZONECODE'),
      parval:  _prop(p, 'parval','assessed_value','TOTAL_VALUE','APPRAISAL','MARKET_VALUE'),
      soilName: null, hydroGrp: null,
    };

    _renderParcelCard();
    _toast(`Parcel selected${_selectedParcel.address ? ' — ' + _selectedParcel.address : ''}`, 'info');
    _enrichWithSoils(entity);
    const carto0 = Cesium.Cartographic.fromCartesian(
      entity.polygon.hierarchy.getValue(JD()).positions[0]
    );
    _enrichWithZoning(
      Cesium.Math.toDegrees(carto0.latitude),
      Cesium.Math.toDegrees(carto0.longitude)
    );
  }

  // Shared card renderer — works for both Cesium and Google Maps selections.
  function _renderParcelCard() {
    const card = document.getElementById('ava-parcel-card');
    if (!card) return;

    const acres     = _selectedParcel.acres ? (+_selectedParcel.acres).toFixed(2) : null;
    const zone      = _selectedParcel.zone;
    const zoneColor = _zoningBadgeColor(zone);
    const zoneLabel = _zoningLabel(zone);
    const sqft      = acres ? Math.round(+acres * 43560).toLocaleString() : null;

    card.innerHTML = `
      <button class="pcard-close" onclick="document.getElementById('ava-parcel-card').style.display='none'">
        <span class="material-symbols-outlined" style="font-size:16px;font-weight:300">close</span>
      </button>

      ${_selectedParcel.id      ? `<div class="pcard-pin"><span class="material-symbols-outlined" style="font-size:11px;vertical-align:middle">tag</span> ${_selectedParcel.id}</div>` : ''}
      ${_selectedParcel.owner   ? `<div class="pcard-owner">${_selectedParcel.owner}</div>` : '<div class="pcard-owner" style="color:rgba(255,255,255,0.4)">Owner Unknown</div>'}
      ${_selectedParcel.address ? `<div class="pcard-address"><span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle">location_on</span> ${_selectedParcel.address}</div>` : ''}

      <div id="pcard-zone-area">${zone ? `
        <div class="pcard-zone-badge" style="background:${zoneColor}22;border:1px solid ${zoneColor}66;color:${zoneColor}">
          <span class="material-symbols-outlined" style="font-size:12px">home_work</span>
          <strong>${zone}</strong>${zoneLabel !== zone ? ` — ${zoneLabel}` : ''}
        </div>` : ''}</div>

      <div class="pcard-meta">
        ${acres  ? `<span><span class="material-symbols-outlined" style="font-size:11px">straighten</span> ${acres} ac (${sqft} sf)</span>` : ''}
        ${_selectedParcel.landUse ? `<span>${_selectedParcel.landUse}</span>` : ''}
        ${_selectedParcel.parval  ? `<span><span class="material-symbols-outlined" style="font-size:11px">payments</span> $${Number(_selectedParcel.parval).toLocaleString()} assessed</span>` : ''}
      </div>

      <div class="pcard-soils" id="pcard-soil-line" style="display:none"></div>

      <div class="pcard-actions">
        <button class="pcard-btn pcard-btn-design" onclick="GEO_LAYERS.captureForDesign()" title="Set design extents to this parcel">
          <span class="material-symbols-outlined" style="font-size:14px">auto_awesome</span> Design This Site
        </button>
        <button class="pcard-btn pcard-btn-create" onclick="GEO_LAYERS.createProjectFromParcel()" title="Register as a new AVA project">
          <span class="material-symbols-outlined" style="font-size:14px">add_circle</span> New Project
        </button>
      </div>
      ${typeof COMMUNITY !== 'undefined' && COMMUNITY.isAdmin() ? `
      <button class="pcard-btn pcard-btn-studio" onclick="GEO_LAYERS.openMasterPlanStudio()" title="Open Master Plan Studio (Admin)">
        <span class="material-symbols-outlined" style="font-size:14px">architecture</span> Master Plan Studio
      </button>` : ''}`;
    card.style.display = 'block';
  }

  async function _enrichWithSoils(entity) {
    const positions = entity.polygon?.hierarchy?.getValue(JD())?.positions;
    if (!positions?.length) return;
    const carto = Cesium.Cartographic.fromCartesian(positions[0]);
    await _enrichWithSoilsLatLng(
      Cesium.Math.toDegrees(carto.latitude),
      Cesium.Math.toDegrees(carto.longitude)
    );
  }

  async function _enrichWithSoilsLatLng(lat, lng) {
    const d = 0.001;
    try {
      const resp = await fetch(`${PROXY}?service=soils&bbox=${lng-d},${lat-d},${lng+d},${lat+d}`);
      if (!resp.ok) return;
      const gj = await resp.json();
      const f  = gj?.features?.[0]?.properties;
      if (!f) return;
      const name  = f.muname   || f.MUNAME   || f.musym || '';
      const drain = f.drclassdcd || f.DRCLASSDCD || '';
      const hydro = f.hydgrpdcd || f.HYDGRP   || '';
      if (_selectedParcel) {
        _selectedParcel.soilName   = name;
        _selectedParcel.hydroGrp   = hydro;
        _selectedParcel.drainClass = drain;
      }
      const line = document.getElementById('pcard-soil-line');
      if (line && name) {
        line.textContent = name
          + (drain ? `  ·  ${drain}` : '')
          + (hydro  ? `  ·  Hydro Grp ${hydro}` : '');
        line.style.display = '';
      }
    } catch (_) {}
  }

  async function _enrichWithZoning(lat, lng) {
    const d = 0.001;
    try {
      const resp = await fetch(`${PROXY}?service=zoning&bbox=${lng-d},${lat-d},${lng+d},${lat+d}`);
      if (!resp.ok) return;
      const gj = await resp.json();
      const f  = gj?.features?.[0]?.properties;
      if (!f) return;
      const zone     = f.zoning             || f.ZONE        || f.ZONING || f.ZoneCode || '';
      const zoneDesc = f.zoning_description || f.DESCRIPTION || f.DISTRICTNA || '';
      if (!zone) return;
      if (_selectedParcel) {
        _selectedParcel.zone     = zone;
        _selectedParcel.zoneDesc = zoneDesc;
      }
      const area = document.getElementById('pcard-zone-area');
      if (area) {
        const color = _zoningBadgeColor(zone);
        const label = zoneDesc || _zoningLabel(zone);
        area.innerHTML = `
          <div class="pcard-zone-badge" style="background:${color}22;border:1px solid ${color}66;color:${color}">
            <span class="material-symbols-outlined" style="font-size:12px">home_work</span>
            <strong>${zone}</strong>${label && label !== zone ? ` — ${label}` : ''}
          </div>`;
      }
    } catch (_) {}
  }

  /* ── Public actions from parcel card ──────────────────── */

  function createProjectFromParcel() {
    if (!_selectedParcel || typeof ADMIN === 'undefined') return;
    let lat = '', lng = '';
    if (_inGmMode()) {
      if (_selectedParcel.centLat != null) {
        lat = _selectedParcel.centLat.toFixed(6);
        lng = _selectedParcel.centLng.toFixed(6);
      }
    } else if (_selectedParcel.entity) {
      const positions = _selectedParcel.entity.polygon?.hierarchy?.getValue(JD())?.positions || [];
      if (positions.length) {
        let sLat = 0, sLng = 0;
        positions.forEach(p => {
          const c = Cesium.Cartographic.fromCartesian(p);
          sLat += Cesium.Math.toDegrees(c.latitude);
          sLng += Cesium.Math.toDegrees(c.longitude);
        });
        lat = (sLat / positions.length).toFixed(6);
        lng = (sLng / positions.length).toFixed(6);
      }
    }
    ADMIN.openProjectForm();
    setTimeout(() => {
      const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
      set('adminProjectLat',  lat);
      set('adminProjectLng',  lng);
      set('adminProjectArea', _selectedParcel.acres ? (+_selectedParcel.acres).toFixed(2) : '');
      set('adminProjectName', _selectedParcel.address || '');
      set('adminProjectShortName', (_selectedParcel.address || '').split(',')[0].trim());
      set('adminSiteContext', [
        _selectedParcel.address  && `Address: ${_selectedParcel.address}`,
        _selectedParcel.owner    && `Owner: ${_selectedParcel.owner}`,
        _selectedParcel.id       && `Parcel PIN: ${_selectedParcel.id}`,
        _selectedParcel.acres    && `Site area: ${(+_selectedParcel.acres).toFixed(2)} acres`,
        _selectedParcel.soilName   && `Primary soil: ${_selectedParcel.soilName}`,
        _selectedParcel.drainClass && `Drainage class: ${_selectedParcel.drainClass}`,
        _selectedParcel.hydroGrp   && `Hydrologic group: ${_selectedParcel.hydroGrp}`,
        _selectedParcel.landUse  && `Current land use: ${_selectedParcel.landUse}`,
        _selectedParcel.zone     && `Zoning: ${_selectedParcel.zone}`,
      ].filter(Boolean).join('\n'));
      if (typeof openModal === 'function') openModal('adminProjectModal');
    }, 120);
  }

  async function captureForDesign() {
    if (!_selectedParcel) return;

    // Google Maps plan-view path — build a temporary project from parcel data
    if (_inGmMode() && _selectedParcel.gmFeature) {
      const geom = _selectedParcel.gmFeature.getGeometry();
      let _parcBounds = null;
      if (geom?.getType() === 'Polygon') {
        _parcBounds = new google.maps.LatLngBounds();
        geom.getArray()[0].getArray().forEach(pt => _parcBounds.extend(pt));
        _gmMap.fitBounds(_parcBounds, { padding: 60 });
      }

      const lat      = _selectedParcel.centLat || 0;
      const lng      = _selectedParcel.centLng || 0;
      const acresNum = _selectedParcel.acres ? (+_selectedParcel.acres).toFixed(2) : null;
      const addr     = _selectedParcel.address || 'Selected Parcel';
      const shortName = addr.split(',')[0].trim();
      const soilDesc = [_selectedParcel.soilName, _selectedParcel.drainClass].filter(Boolean).join(' · ');
      const soilLine = soilDesc ? `Primary soil: ${soilDesc}.` : '';
      const areaLine = acresNum ? `${acresNum} acres.` : '';

      // Satellite thumbnail: use visible bounds so the full parcel fits in frame
      let baselineImage = '';
      if (_mapsKey) {
        if (_parcBounds) {
          const sw = _parcBounds.getSouthWest();
          const ne = _parcBounds.getNorthEast();
          baselineImage = `https://maps.googleapis.com/maps/api/staticmap?visible=${sw.lat()},${sw.lng()}|${ne.lat()},${ne.lng()}&size=800x600&maptype=satellite&key=${_mapsKey}`;
        } else {
          baselineImage = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=18&size=800x600&maptype=satellite&key=${_mapsKey}`;
        }
      }

      // Register a temporary SITE_CONFIGS entry so openDesignSheet can open
      const acresFloat = acresNum ? parseFloat(acresNum) : 0;
      const tempId = `parcel_${_selectedParcel.id || Date.now()}`;
      if (typeof SITE_CONFIGS !== 'undefined') {
        SITE_CONFIGS[tempId] = {
          id: tempId,
          name: addr,
          shortName,
          baselineImage,
          lat, lng,
          baselineScore: 0,
          sections: [],
          metrics: {
            totalAreaAcres: acresFloat,
            totalArea: Math.round(acresFloat * 43560),
            soilType: _selectedParcel.soilName || 'Unknown',
            elevationDrop: 0,
          },
          history: {
            summary: [
              areaLine,
              soilLine,
              _selectedParcel.landUse ? `Current use: ${_selectedParcel.landUse}.` : '',
              _selectedParcel.zone    ? `Zoning: ${_selectedParcel.zone}.` : '',
              _selectedParcel.owner   ? `Owner: ${_selectedParcel.owner}.` : '',
            ].filter(Boolean).join(' ') || 'Parcel selected from the Geoscope.',
          },
          scores: {},
        };
      }

      if (typeof openDesignSheet === 'function') {
        openDesignSheet(tempId);
      }
      return;
    }

    // Cesium 3D path — fly overhead and screenshot
    if (!_selectedParcel.entity || !_viewer) return;
    const positions = _selectedParcel.entity.polygon?.hierarchy?.getValue(JD())?.positions;
    if (!positions?.length) return;

    const sphere = Cesium.BoundingSphere.fromPoints(positions);
    _toast('Capturing plan view overhead…', 'info');

    await new Promise(resolve =>
      _viewer.camera.flyToBoundingSphere(sphere, {
        offset:   new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-90), sphere.radius * 2.8),
        duration: 1.8,
        complete: resolve
      })
    );
    // Wait for tiles to finish rendering
    await new Promise(r => setTimeout(r, 1400));

    const imageDataUrl = _viewer.scene.canvas.toDataURL('image/jpeg', 0.92);

    // Build parcel context strings for the design prompt
    const acresNum = _selectedParcel.acres ? (+_selectedParcel.acres).toFixed(2) : null;
    const soils    = [_selectedParcel.soilName, _selectedParcel.hydroGrp ? `Hydro Grp ${_selectedParcel.hydroGrp}` : null].filter(Boolean).join(', ');

    document.dispatchEvent(new CustomEvent('ava:planViewCapture', {
      detail: {
        imageDataUrl,   // ← key used by design-engine.js
        address: _selectedParcel.address,
        area:    acresNum,
        soils:   soils || null,
        parcel: {
          address:  _selectedParcel.address,
          owner:    _selectedParcel.owner,
          acres:    acresNum,
          soil:     _selectedParcel.soilName,
          hydro:    _selectedParcel.hydroGrp,
          landUse:  _selectedParcel.landUse,
          zone:     _selectedParcel.zone,
        }
      }
    }));
    _toast('Plan view captured — opening design workspace', 'success');
  }

  /* ── UI builder ────────────────────────────────────────── */

  function _buildUI() {
    const hud    = document.getElementById('canvasHud');
    const canvas = document.getElementById('three-canvas');
    if (!hud || !canvas) return;

    // Inject layer-panel CSS once
    _injectStyles();

    // Restore previous panel state from localStorage
    const storedVis = localStorage.getItem(STORE_KEY_PANEL);
    const storedMin = localStorage.getItem(STORE_KEY_MIN);
    _panelVisible   = storedVis === 'true';
    _panelMinimized = storedMin === 'true';

    // Layer panel (fixed, above viewport)
    const panel = document.createElement('div');
    panel.id        = 'ava-layer-panel';
    panel.className = 'ava-layer-panel';
    panel.style.display = _panelVisible ? 'block' : 'none';
    canvas.appendChild(panel);

    // Header with title + minimize button
    const hdr = document.createElement('div');
    hdr.className = 'layer-panel-header';
    hdr.innerHTML = `
      <span class="layer-panel-title">GEOSCOPE LAYERS</span>
      <button class="layer-panel-minimize" id="layer-min-btn" title="Minimize panel">
        <span class="material-symbols-outlined" style="font-size:16px;font-weight:400">expand_less</span>
      </button>`;
    panel.appendChild(hdr);

    // Layer rows container (for minimize/expand)
    const body = document.createElement('div');
    body.id = 'layer-panel-body';
    body.className = 'layer-panel-body';
    if (_panelMinimized) body.style.display = 'none';
    panel.appendChild(body);

    LAYER_DEFS.forEach(def => {
      const row = document.createElement('div');
      row.className = 'layer-row';
      row.id        = `layer-row-${def.id}`;
      row.innerHTML = `
        <div class="layer-row-main">
          <label class="layer-row-label" onclick="GEO_LAYERS.toggle('${def.id}')">
            <span class="material-symbols-outlined layer-icon" style="color:${def.accent}">${def.icon}</span>
            <span class="layer-label-text">${def.label}</span>
          </label>
          <button class="layer-toggle-btn" id="layer-tb-${def.id}"
                  onclick="GEO_LAYERS.toggle('${def.id}')" title="Toggle ${def.label}">
            <span class="layer-toggle-track"><span class="layer-toggle-thumb"></span></span>
          </button>
        </div>
        <div class="layer-opacity-row" id="layer-op-${def.id}" style="display:none">
          <span class="material-symbols-outlined layer-opacity-icon">opacity</span>
          <input type="range" class="layer-opacity-slider" min="0.05" max="1" step="0.05" value="1"
            oninput="GEO_LAYERS.setOpacity('${def.id}', this.value)">
        </div>`;
      body.appendChild(row);
    });

    // Minimize button handler
    const minBtn = document.getElementById('layer-min-btn');
    minBtn.addEventListener('click', () => {
      _panelMinimized = !_panelMinimized;
      body.style.display = _panelMinimized ? 'none' : '';
      minBtn.querySelector('.material-symbols-outlined').textContent =
        _panelMinimized ? 'expand_more' : 'expand_less';
      minBtn.title = _panelMinimized ? 'Expand panel' : 'Minimize panel';
      localStorage.setItem(STORE_KEY_MIN, _panelMinimized);
    });
    // Set initial icon
    if (_panelMinimized) {
      minBtn.querySelector('.material-symbols-outlined').textContent = 'expand_more';
      minBtn.title = 'Expand panel';
    }

    // HUD toggle button (same style as Campus / Walk / N↑)
    const btn = _hudBtn('layers', 'Layers', () => {
      _panelVisible = !_panelVisible;
      panel.style.display = _panelVisible ? 'block' : 'none';
      btn.style.background = _panelVisible ? 'rgba(0,70,132,0.95)' : 'rgba(0,0,0,0.88)';
      btn.style.color      = '#fff';
      localStorage.setItem(STORE_KEY_PANEL, _panelVisible);
    });
    btn.id = 'ava-layer-hud-btn';
    if (_panelVisible) btn.style.background = 'rgba(0,70,132,0.95)';
    hud.appendChild(btn);

    // Parcel info card
    const card = document.createElement('div');
    card.id        = 'ava-parcel-card';
    card.className = 'ava-parcel-card';
    card.style.display = 'none';
    canvas.appendChild(card);
  }

  function _refreshRow(layerId) {
    const st  = _st[layerId];
    const tb  = document.getElementById(`layer-tb-${layerId}`);
    const row = document.getElementById(`layer-row-${layerId}`);
    const opRow = document.getElementById(`layer-op-${layerId}`);
    if (!tb) return;
    tb.style.opacity = st.loading ? '0.5' : '1';
    tb.classList.toggle('active', !!st.active);
    if (row) row.classList.toggle('on', !!st.active);
    tb.title = st.loading ? 'Loading…' : (st.active ? 'ON — click to hide' : 'OFF — click to show');
    if (opRow) {
      opRow.style.display = st.active ? '' : 'none';
      const slider = opRow.querySelector('input');
      if (slider) slider.value = st.opacity ?? 1.0;
    }
  }

  /* ── Injected CSS for the layer panel ───────────────────── */
  function _injectStyles() {
    if (document.getElementById('ava-layer-css')) return;
    const s = document.createElement('style');
    s.id = 'ava-layer-css';
    s.textContent = `
      .ava-layer-panel {
        position: absolute;
        top: 52px;
        right: 12px;
        z-index: 40;
        background: rgba(0, 20, 50, 0.92);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 12px;
        min-width: 220px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.35);
        font-family: 'Inter', system-ui, sans-serif;
        color: #fff;
        overflow: hidden;
        transition: opacity 0.2s;
      }
      .layer-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px 8px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      .layer-panel-title {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        color: rgba(255,255,255,0.65);
      }
      .layer-panel-minimize {
        background: none;
        border: none;
        color: rgba(255,255,255,0.5);
        cursor: pointer;
        padding: 2px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        transition: color 0.15s, background 0.15s;
      }
      .layer-panel-minimize:hover {
        color: #fff;
        background: rgba(255,255,255,0.1);
      }
      .layer-panel-body {
        padding: 6px 0;
      }
      .layer-row {
        display: flex;
        flex-direction: column;
        padding: 7px 0 0;
        transition: background 0.15s;
      }
      .layer-row:hover {
        background: rgba(255,255,255,0.06);
      }
      .layer-row.on {
        background: rgba(0, 70, 132, 0.25);
      }
      .layer-row-main {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
      }
      .layer-opacity-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 2px 14px 7px;
      }
      .layer-opacity-icon {
        font-size: 13px;
        color: rgba(255,255,255,0.35);
        flex-shrink: 0;
      }
      .layer-opacity-slider {
        flex: 1;
        height: 3px;
        accent-color: #FDB927;
        cursor: pointer;
        appearance: none;
        background: rgba(255,255,255,0.15);
        border-radius: 2px;
        outline: none;
      }
      .layer-opacity-slider::-webkit-slider-thumb {
        appearance: none;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #FDB927;
        cursor: pointer;
      }
      .layer-row-label {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.2px;
      }
      .layer-icon {
        font-size: 16px !important;
        font-weight: 400;
        opacity: 0.8;
      }
      /* Toggle switch */
      .layer-toggle-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        flex-shrink: 0;
      }
      .layer-toggle-track {
        display: block;
        width: 32px;
        height: 18px;
        background: rgba(255,255,255,0.15);
        border-radius: 10px;
        position: relative;
        transition: background 0.2s;
      }
      .layer-toggle-thumb {
        display: block;
        width: 14px;
        height: 14px;
        background: rgba(255,255,255,0.5);
        border-radius: 50%;
        position: absolute;
        top: 2px;
        left: 2px;
        transition: transform 0.2s, background 0.2s;
      }
      .layer-toggle-btn.active .layer-toggle-track {
        background: rgba(0, 100, 200, 0.8);
      }
      .layer-toggle-btn.active .layer-toggle-thumb {
        transform: translateX(14px);
        background: #fff;
      }
      /* Parcel card */
      .ava-parcel-card {
        position: absolute;
        bottom: 16px;
        right: 16px;
        z-index: 45;
        max-height: calc(100% - 80px);
        overflow-y: auto;
        background: rgba(0, 14, 38, 0.95);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(253,185,39,0.22);
        border-radius: 14px;
        padding: 16px 16px 14px;
        min-width: 260px;
        max-width: 340px;
        color: #fff;
        font-family: 'Inter', system-ui, sans-serif;
        box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(253,185,39,0.08);
        animation: pcardIn 0.22s cubic-bezier(0.34,1.56,0.64,1);
      }
      @keyframes pcardIn {
        from { opacity: 0; transform: translateY(10px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      .pcard-close {
        position: absolute;
        top: 8px;
        right: 8px;
        background: rgba(255,255,255,0.06);
        border: none;
        color: rgba(255,255,255,0.45);
        cursor: pointer;
        border-radius: 6px;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s, color 0.15s;
      }
      .pcard-close:hover { background: rgba(255,255,255,0.12); color: #fff; }
      .pcard-pin {
        font-size: 9px;
        color: rgba(253,185,39,0.7);
        letter-spacing: 1.5px;
        text-transform: uppercase;
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        gap: 3px;
      }
      .pcard-owner { font-size: 14px; font-weight: 700; margin-bottom: 3px; line-height: 1.3; padding-right: 24px; }
      .pcard-address {
        font-size: 11px;
        color: rgba(255,255,255,0.6);
        margin-bottom: 10px;
        display: flex;
        align-items: flex-start;
        gap: 3px;
      }
      .pcard-zone-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 11px;
        font-weight: 700;
        padding: 4px 10px;
        border-radius: 20px;
        margin-bottom: 10px;
        line-height: 1.2;
      }
      .pcard-meta {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 11px;
        color: rgba(255,255,255,0.55);
        margin-bottom: 10px;
      }
      .pcard-meta span { display: flex; align-items: center; gap: 4px; }
      .pcard-soils {
        font-size: 11px;
        color: rgba(76,175,80,0.95);
        margin-bottom: 10px;
        padding: 5px 8px;
        background: rgba(76,175,80,0.1);
        border-radius: 6px;
        border-left: 2px solid rgba(76,175,80,0.6);
      }
      .pcard-actions { display: flex; gap: 8px; margin-top: 4px; }
      .pcard-btn {
        flex: 1;
        padding: 9px 10px;
        border: none;
        border-radius: 10px;
        font-family: inherit;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        transition: opacity 0.15s, transform 0.1s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        letter-spacing: 0.2px;
      }
      .pcard-btn:hover { opacity: 0.9; transform: translateY(-1px); }
      .pcard-btn:active { transform: translateY(0); }
      .pcard-btn-design {
        background: linear-gradient(135deg, #FDB927, #e6a520);
        color: #002B52;
        flex: 1.5;
      }
      .pcard-btn-create {
        background: rgba(255,255,255,0.1);
        color: rgba(255,255,255,0.85);
        border: 1px solid rgba(255,255,255,0.15);
      }
    `;
    document.head.appendChild(s);
  }

  function _hudBtn(icon, label, onClick) {
    const b = document.createElement('button');
    b.style.cssText = [
      'pointer-events:auto','background:rgba(0,0,0,0.88)','color:#fff',
      'border:1px solid rgba(255,255,255,0.18)','border-radius:8px',
      'padding:7px 12px','font-family:inherit','font-size:11px','font-weight:700',
      'cursor:pointer','backdrop-filter:blur(8px)','display:flex',
      'align-items:center','gap:5px','box-shadow:0 2px 8px rgba(0,0,0,0.3)',
      'transition:background 0.15s,color 0.15s'
    ].join(';');
    b.innerHTML = `<span style="font-family:'Material Symbols Outlined';font-size:15px;font-weight:400">${icon}</span>${label}`;
    b.onmouseenter = () => { if (b.id !== 'ava-layer-hud-btn' || !_panelVisible) b.style.background = 'rgba(0,60,120,0.95)'; };
    b.onmouseleave = () => { if (b.id !== 'ava-layer-hud-btn' || !_panelVisible) b.style.background = 'rgba(0,0,0,0.88)'; };
    b.addEventListener('click', onClick);
    return b;
  }

  /* ── Google Maps support ───────────────────────────────── */

  function setGmMap(gmMap) {
    _gmMap = gmMap;
    _addGmSearchBox();
  }

  function _inGmMode() {
    if (!_gmMap) return false;
    const gm = document.getElementById('google-map');
    return !!(gm && gm.style.display !== 'none');
  }

  function _gmBbox() {
    if (!_gmMap) return null;
    const b = _gmMap.getBounds();
    if (!b) return null;
    const ne = b.getNorthEast(), sw = b.getSouthWest();
    return { west: sw.lng(), south: sw.lat(), east: ne.lng(), north: ne.lat() };
  }

  function _addGmSearchBox() {
    if (!_gmMap || !window.google?.maps?.places) return;
    if (document.getElementById('ava-gm-search')) return;
    const input = document.createElement('input');
    input.id          = 'ava-gm-search';
    input.type        = 'text';
    input.placeholder = 'Search address or place…';
    input.style.cssText = [
      'width:260px', 'height:36px', 'padding:0 12px',
      'font-family:Inter,system-ui,sans-serif', 'font-size:13px', 'font-weight:500',
      'border:none', 'border-radius:8px',
      'box-shadow:0 2px 12px rgba(0,0,0,0.35)',
      'background:rgba(0,14,38,0.95)', 'color:#fff',
      'outline:none', 'margin:10px 0 0 10px',
    ].join(';');
    input.addEventListener('focus', () => { input.style.boxShadow = '0 0 0 2px #FDB927,0 2px 12px rgba(0,0,0,0.4)'; });
    input.addEventListener('blur',  () => { input.style.boxShadow = '0 2px 12px rgba(0,0,0,0.35)'; });
    const ac = new google.maps.places.Autocomplete(input, {
      types:  ['geocode', 'establishment'],
      fields: ['geometry', 'name', 'formatted_address'],
    });
    ac.bindTo('bounds', _gmMap);
    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (place.geometry?.viewport) _gmMap.fitBounds(place.geometry.viewport);
      else if (place.geometry?.location) { _gmMap.panTo(place.geometry.location); _gmMap.setZoom(18); }
    });
    _gmMap.controls[google.maps.ControlPosition.TOP_LEFT].push(input);
  }

  function _startGmZoningRefresh() {
    if (_gmZoningIdleListener) return;
    let _debounce = null;
    _gmZoningIdleListener = _gmMap.addListener('idle', () => {
      if (!_st.zoning.active) return;
      clearTimeout(_debounce);
      _debounce = setTimeout(_refreshGmZoning, 700);
    });
  }

  function _stopGmZoningRefresh() {
    if (_gmZoningIdleListener) {
      google.maps.event.removeListener(_gmZoningIdleListener);
      _gmZoningIdleListener = null;
    }
    _gmZoningLastBbox = null;
  }

  async function _refreshGmZoning() {
    if (!_st.zoning.active || !_inGmMode()) return;
    const bbox = _gmBbox();
    if (!bbox) return;
    const spanLng = bbox.east  - bbox.west;
    const spanLat = bbox.north - bbox.south;
    if (spanLng > MAX_BBOX_DEG || spanLat > MAX_BBOX_DEG) return;
    if (_gmZoningLastBbox) {
      const dl = Math.abs(bbox.west  - _gmZoningLastBbox.west);
      const ds = Math.abs(bbox.south - _gmZoningLastBbox.south);
      if (dl < spanLng * 0.25 && ds < spanLat * 0.25) return;
    }
    try {
      const resp = await fetch(`${PROXY}?service=zoning&bbox=${bbox.west},${bbox.south},${bbox.east},${bbox.north}`);
      if (!resp.ok) return;
      const geojson = await resp.json();
      if (!geojson?.features?.length) return;
      const def = LAYER_DEFS.find(d => d.id === 'zoning');
      const newLayer = _addGmLayer('zoning', geojson, def.style);
      if (_st.zoning.ref?.setMap) _st.zoning.ref.setMap(null);
      _st.zoning.ref = newLayer;
      _gmZoningLastBbox = bbox;
    } catch (_) {}
  }

  function _startGmSoilsRefresh() {
    if (_gmSoilsIdleListener) return;
    let _debounce = null;
    _gmSoilsIdleListener = _gmMap.addListener('idle', () => {
      if (!_st.soils.active) return;
      clearTimeout(_debounce);
      _debounce = setTimeout(_refreshGmSoils, 700);
    });
  }

  function _stopGmSoilsRefresh() {
    if (_gmSoilsIdleListener) {
      google.maps.event.removeListener(_gmSoilsIdleListener);
      _gmSoilsIdleListener = null;
    }
    _gmSoilsLastBbox = null;
  }

  async function _refreshGmSoils() {
    if (!_st.soils.active || !_inGmMode()) return;
    const bbox = _gmBbox();
    if (!bbox) return;
    const spanLng = bbox.east  - bbox.west;
    const spanLat = bbox.north - bbox.south;
    if (spanLng > MAX_BBOX_DEG || spanLat > MAX_BBOX_DEG) return;
    if (_gmSoilsLastBbox) {
      const dl = Math.abs(bbox.west  - _gmSoilsLastBbox.west);
      const ds = Math.abs(bbox.south - _gmSoilsLastBbox.south);
      if (dl < spanLng * 0.25 && ds < spanLat * 0.25) return;
    }
    try {
      const resp = await fetch(`${PROXY}?service=soils&bbox=${bbox.west},${bbox.south},${bbox.east},${bbox.north}`);
      if (!resp.ok) return;
      const geojson = await resp.json();
      if (!geojson?.features?.length) return;
      const def = LAYER_DEFS.find(d => d.id === 'soils');
      const newLayer = _addGmLayer('soils', geojson, def.style);
      if (_st.soils.ref?.setMap) _st.soils.ref.setMap(null);
      _st.soils.ref = newLayer;
      _gmSoilsLastBbox = bbox;
    } catch (_) {}
  }

  function _makeGmRefresh(layerId, listenerVar, bboxVar) {
    return {
      start() {
        if (listenerVar.v) return;
        let debounce = null;
        listenerVar.v = _gmMap.addListener('idle', () => {
          if (!_st[layerId].active) return;
          clearTimeout(debounce);
          debounce = setTimeout(refresh, 700);
        });
        async function refresh() {
          if (!_st[layerId].active || !_inGmMode()) return;
          const bbox = _gmBbox();
          if (!bbox) return;
          const spanLng = bbox.east - bbox.west;
          const spanLat = bbox.north - bbox.south;
          if (spanLng > MAX_BBOX_DEG || spanLat > MAX_BBOX_DEG) return;
          if (bboxVar.v) {
            const dl = Math.abs(bbox.west  - bboxVar.v.west);
            const ds = Math.abs(bbox.south - bboxVar.v.south);
            if (dl < spanLng * 0.25 && ds < spanLat * 0.25) return;
          }
          try {
            const resp = await fetch(`${PROXY}?service=${layerId}&bbox=${bbox.west},${bbox.south},${bbox.east},${bbox.north}`);
            if (!resp.ok) return;
            const geojson = await resp.json();
            if (!geojson?.features?.length) return;
            const def = LAYER_DEFS.find(d => d.id === layerId);
            const newLayer = _addGmLayer(layerId, geojson, def.style);
            if (_st[layerId].ref?.setMap) _st[layerId].ref.setMap(null);
            _st[layerId].ref = newLayer;
            bboxVar.v = bbox;
          } catch (_) {}
        }
      },
      stop() {
        if (listenerVar.v) { google.maps.event.removeListener(listenerVar.v); listenerVar.v = null; }
        bboxVar.v = null;
      },
      setBbox(b) { bboxVar.v = b; },
    };
  }

  // Viewport-following refresh controllers for each GM layer
  const _contoursRefresh   = _makeGmRefresh('contours',   { v: null }, { v: null });
  const _hydrologyRefresh  = _makeGmRefresh('hydrology',  { v: null }, { v: null });
  const _floodplainRefresh = _makeGmRefresh('floodplain', { v: null }, { v: null });
  const _wetlandsRefresh   = _makeGmRefresh('wetlands',   { v: null }, { v: null });
  const _overlayRefresh    = _makeGmRefresh('overlay',    { v: null }, { v: null });
  const _historicRefresh   = _makeGmRefresh('historic',   { v: null }, { v: null });
  const _futureLuRefresh   = _makeGmRefresh('futurelu',   { v: null }, { v: null });

  function _startGmParcelRefresh() {
    if (_gmParcelIdleListener) return;
    let _debounce = null;
    _gmParcelIdleListener = _gmMap.addListener('idle', () => {
      if (!_st.parcels.active) return;
      clearTimeout(_debounce);
      _debounce = setTimeout(_refreshGmParcels, 700);
    });
  }

  function _stopGmParcelRefresh() {
    if (_gmParcelIdleListener) {
      google.maps.event.removeListener(_gmParcelIdleListener);
      _gmParcelIdleListener = null;
    }
    _gmParcelLastBbox = null;
  }

  async function _refreshGmParcels() {
    if (!_st.parcels.active || !_inGmMode()) return;
    const bbox = _gmBbox();
    if (!bbox) return;
    const spanLng = bbox.east - bbox.west;
    const spanLat = bbox.north - bbox.south;
    if (spanLng > MAX_BBOX_DEG || spanLat > MAX_BBOX_DEG) return;
    // Skip if map hasn't moved more than 25% of the current view span
    if (_gmParcelLastBbox) {
      const dl = Math.abs(bbox.west  - _gmParcelLastBbox.west);
      const ds = Math.abs(bbox.south - _gmParcelLastBbox.south);
      if (dl < spanLng * 0.25 && ds < spanLat * 0.25) return;
    }
    try {
      const bboxStr = `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
      const resp = await fetch(`${PROXY}?service=parcels&bbox=${bboxStr}`);
      if (!resp.ok) return;
      const geojson = await resp.json();
      if (!geojson?.features?.length) return;
      const def = LAYER_DEFS.find(d => d.id === 'parcels');
      const newLayer = _addGmLayer('parcels', geojson, def.style);
      if (_st.parcels.ref?.setMap) _st.parcels.ref.setMap(null);
      _st.parcels.ref = newLayer;
      _gmParcelLastBbox = bbox;
    } catch (_) {}
  }

  function _addContourPolylines(geojson) {
    const polylines = [];
    (geojson.features || []).forEach(f => {
      const isIndex = f.properties?.isIndex;
      const type    = f.geometry?.type;
      const sets    = type === 'LineString'      ? [f.geometry.coordinates]
                    : type === 'MultiLineString'  ?  f.geometry.coordinates
                    : [];
      sets.forEach(coords => {
        if (!coords?.length) return;
        const pl = new google.maps.Polyline({
          path:           coords.map(([lng, lat]) => ({ lat, lng })),
          map:            _gmMap,
          strokeOpacity:  0,
          _isIndex:       isIndex,
          icons: [{
            icon: {
              path:          'M 0,-1 0,1',
              strokeOpacity: isIndex ? 0.85 : 0.5,
              strokeColor:   '#ffffff',
              scale:         isIndex ? 4 : 2.5,
            },
            offset: '0',
            repeat: isIndex ? '20px' : '12px',
          }],
          clickable: false,
          zIndex:    isIndex ? 120 : 110,
        });
        polylines.push(pl);
      });
    });
    return {
      setMap(m)       { polylines.forEach(pl => pl.setMap(m)); },
      setOpacity(op)  {
        polylines.forEach(pl => {
          const isIndex = pl.get('_isIndex');
          pl.setOptions({ icons: [{
            icon: { path: 'M 0,-1 0,1', strokeOpacity: (isIndex ? 0.85 : 0.5) * op, strokeColor: '#ffffff', scale: isIndex ? 4 : 2.5 },
            offset: '0', repeat: isIndex ? '20px' : '12px',
          }]});
        });
      },
      addListener()   { return { remove() {} }; },
      revertStyle()   {},
      overrideStyle() {},
    };
  }

  function _addGmLayer(layerId, geojson, style) {
    if (layerId === 'contours') return _addContourPolylines(geojson);

    const layer = new google.maps.Data({ map: _gmMap });
    layer.addGeoJson(geojson);

    const _op = () => _st[layerId].opacity ?? 1.0;

    let styleFn;
    if (layerId === 'zoning') {
      styleFn = feature => {
        const op = _op(), zone = feature.getProperty('zoning') || feature.getProperty('ZONINGDISTRICT') || '';
        const color = _zoningBadgeColor(zone);
        return { fillColor: color, fillOpacity: 0.28 * op, strokeColor: '#ffffff', strokeOpacity: 0.7 * op, strokeWeight: 1.5, clickable: false };
      };
    } else if (layerId === 'floodplain') {
      styleFn = feature => {
        const op = _op(), zone = (feature.getProperty('FLD_ZONE') || '').toUpperCase();
        const color = (zone === 'AE' || zone === 'VE') ? '#B71C1C' : zone.startsWith('A') ? '#E53935' : zone === 'X' ? '#FDD835' : '#90CAF9';
        const base  = (zone === 'AE' || zone === 'VE' || zone.startsWith('A')) ? 0.45 : 0.28;
        return { fillColor: color, fillOpacity: base * op, strokeColor: '#ffffff', strokeOpacity: 0.6 * op, strokeWeight: 1, clickable: false };
      };
    } else if (layerId === 'wetlands') {
      styleFn = feature => {
        const op = _op(), type = (feature.getProperty('WETLAND_TYPE') || '').toLowerCase();
        const color = type.includes('forested') ? '#2E7D32' : type.includes('emergent') ? '#66BB6A' : type.includes('pond') ? '#1E88E5' : '#26A69A';
        return { fillColor: color, fillOpacity: 0.45 * op, strokeColor: '#ffffff', strokeOpacity: 0.6 * op, strokeWeight: 1, clickable: false };
      };
    } else if (layerId === 'futurelu') {
      styleFn = feature => {
        const op = _op(), d = (feature.getProperty('DISTRICT') || '').toLowerCase();
        const color = d === 'residential'   ? '#F9A825'
                    : d === 'commercial'    ? '#E65100'
                    : d === 'downtown'      ? '#880E4F'
                    : d === 'industrial'    ? '#546E7A'
                    : d === 'major campus'  ? '#1565C0'
                    : d === 'airport'       ? '#607D8B'
                    : d === 'reserve'       ? '#2E7D32'
                    : '#00838F'; // neighborhood plans
        return { fillColor: color, fillOpacity: 0.22 * op, strokeColor: color, strokeOpacity: 0.65 * op, strokeWeight: 1, clickable: false };
      };
    } else if (layerId === 'overlay') {
      styleFn = feature => {
        const op = _op(), type = (feature.getProperty('TYPE') || '').toLowerCase();
        const color = type.includes('pedestrian') ? '#7B1FA2' : type.includes('visual') ? '#C2185B' : type.includes('central') ? '#1565C0' : '#5C6BC0';
        return { fillColor: color, fillOpacity: 0.13 * op, strokeColor: color, strokeOpacity: 0.85 * op, strokeWeight: 2.5, clickable: false };
      };
    } else if (layerId === 'historic') {
      styleFn = () => {
        const op = _op();
        return { fillColor: '#BF360C', fillOpacity: 0.12 * op, strokeColor: '#BF360C', strokeOpacity: 0.9 * op, strokeWeight: 2.5, clickable: false };
      };
    } else if (layerId === 'hydrology') {
      styleFn = feature => {
        const op = _op(), geom = feature.getGeometry()?.getType() || '';
        const isLine = geom === 'LineString' || geom === 'MultiLineString';
        return { fillColor: '#1E88E5', fillOpacity: isLine ? 0 : 0.55 * op, strokeColor: '#0D47A1', strokeOpacity: op, strokeWeight: isLine ? 2.5 : 1.5, clickable: false };
      };
    } else if (layerId === 'soils') {
      styleFn = feature => {
        const op = _op(), hydro = (feature.getProperty('hydgrpdcd') || feature.getProperty('HYDGRP') || '').toUpperCase();
        const color = hydro.startsWith('A') ? '#00E5FF' : hydro.startsWith('B') ? '#69F0AE' : hydro.startsWith('C') ? '#FF6D00' : hydro.startsWith('D') ? '#FF1744' : '#CE93D8';
        return { fillColor: color, fillOpacity: 0.50 * op, strokeColor: '#ffffff', strokeOpacity: 0.8 * op, strokeWeight: 1.5, clickable: false };
      };
    } else {
      styleFn = () => ({ fillColor: style.stroke, fillOpacity: 0.08 * _op(), strokeColor: style.stroke, strokeWeight: style.strokeWidth || 1.5, clickable: layerId === 'parcels' });
    }

    layer.setStyle(styleFn);
    layer._avaStyleFn = styleFn;

    if (layerId === 'parcels') {
      layer.addListener('click',     evt => _showParcelCardGm(evt.feature));
      layer.addListener('mouseover', evt => layer.overrideStyle(evt.feature, { fillOpacity: 0.28, strokeWeight: 2.5 }));
      layer.addListener('mouseout',  evt => {
        if (_selectedParcel?.gmFeature !== evt.feature) layer.revertStyle(evt.feature);
      });
    }
    return layer;
  }

  function _showParcelCardGm(feature) {
    // De-highlight previous GM selection
    const layer = _st.parcels.ref;
    if (_selectedParcel?.gmFeature && layer?.revertStyle) layer.revertStyle(_selectedParcel.gmFeature);
    if (layer?.overrideStyle) layer.overrideStyle(feature, { fillOpacity: 0.35, strokeWeight: 3, strokeColor: '#FDB927' });

    const g = k => { const v = feature.getProperty(k); return (v != null && String(v) !== '') ? String(v) : null; };
    _selectedParcel = {
      gmFeature: feature,
      id:      g('parcelnumb') || g('parno') || g('PIN') || g('PARCEL_ID') || g('ll_uuid') || g('APN'),
      owner:   g('owner')     || g('ownname') || g('OWNER') || g('OWNER_NAME') || g('OWNER1'),
      address: g('mailadd')   || g('siteadd') || g('SITUS_ADDRESS') || g('sadd') || g('SITE_ADDRESS'),
      acres:   g('GISACRES')  || g('gisacres') || g('acres') || g('ACREAGE') || g('TOTAL_ACRES'),
      landUse: g('usedesc')   || g('parusedesc') || g('LAND_USE') || g('landuse') || g('usecode'),
      zone:    g('zoning')    || g('ZONING') || g('ZONE_CODE') || g('zoning_description'),
      parval:  g('parval')    || g('TOTAL_VALUE') || g('assessed_value') || g('MARKET_VALUE'),
      soilName: null, hydroGrp: null,
    };

    _renderParcelCard();
    _toast(`Parcel selected${_selectedParcel.address ? ' — ' + _selectedParcel.address : ''}`, 'info');

    const geom = feature.getGeometry();
    if (geom?.getType() === 'Polygon') {
      const ring = geom.getArray()[0]?.getArray() || [];
      if (ring.length) {
        const pt = ring[0];
        _enrichWithSoilsLatLng(pt.lat(), pt.lng());
        _enrichWithZoning(pt.lat(), pt.lng());
        // Compute centroid for Master Plan Studio
        let sLat = 0, sLng = 0;
        ring.forEach(p => { sLat += p.lat(); sLng += p.lng(); });
        _selectedParcel.centLat = sLat / ring.length;
        _selectedParcel.centLng = sLng / ring.length;
      }
    }
  }

  /* ── Helpers ───────────────────────────────────────────── */

  function _viewportBbox() {
    if (!_viewer) return null;
    try {
      const rect = _viewer.camera.computeViewRectangle();
      if (Cesium.defined(rect)) {
        const spanLng = Cesium.Math.toDegrees(rect.east  - rect.west);
        const spanLat = Cesium.Math.toDegrees(rect.north - rect.south);
        // Only use the full view rectangle when camera is near-nadir (overhead).
        // In tilted 3D perspective, computeViewRectangle extends to the horizon
        // (0.5°–2°+) which always exceeds MAX_BBOX_DEG — fall through to look-at.
        if (spanLng < 0.45 && spanLat < 0.45) {
          console.log('[AVA LAYERS] bbox from viewRect:', spanLng.toFixed(4), spanLat.toFixed(4));
          return {
            west:  Cesium.Math.toDegrees(rect.west),
            south: Cesium.Math.toDegrees(rect.south),
            east:  Cesium.Math.toDegrees(rect.east),
            north: Cesium.Math.toDegrees(rect.north),
          };
        }
      }
    } catch (_) {}

    // Fallback: project screen centre onto the globe to find what the camera
    // is LOOKING AT (not where it IS in the air — those differ on a tilted view).
    try {
      const canvas = _viewer.scene.canvas;
      const sc = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
      // globe.pick respects terrain; pickEllipsoid is the no-terrain safety net.
      let pos;
      try {
        const ray = _viewer.camera.getPickRay(sc);
        pos = _viewer.scene.globe.pick(ray, _viewer.scene);
      } catch (_) {}
      if (!Cesium.defined(pos)) pos = _viewer.camera.pickEllipsoid(sc);
      if (Cesium.defined(pos)) {
        const carto = Cesium.Cartographic.fromCartesian(pos);
        const lat = Cesium.Math.toDegrees(carto.latitude);
        const lng = Cesium.Math.toDegrees(carto.longitude);
        const d = 0.04;
        console.log('[AVA LAYERS] bbox from look-at:', lat.toFixed(4), lng.toFixed(4));
        return { west: lng - d, south: lat - d, east: lng + d, north: lat + d };
      }
    } catch (_) {}
    return null;
  }

  function _prop(bag, ...keys) {
    if (!bag) return null;
    const now = JD();
    for (const k of keys) {
      const v = bag[k];
      if (v == null) continue;
      const raw = (v && typeof v.getValue === 'function') ? v.getValue(now) : v;
      if (raw != null && raw !== '') return String(raw);
    }
    return null;
  }

  function setOpacity(layerId, val) {
    const st = _st[layerId];
    if (!st) return;
    st.opacity = parseFloat(val);
    const ref = st.ref;
    if (!ref) return;
    if (typeof ref.setOpacity === 'function') {
      ref.setOpacity(st.opacity);                   // contour polylines
    } else if (typeof ref._avaStyleFn === 'function') {
      ref.setStyle(ref._avaStyleFn);                // Data layers — re-evaluate with new opacity
    } else if (ref.alpha !== undefined) {
      ref.alpha = st.opacity;                       // Cesium imagery layer
    }
    const slider = document.querySelector(`#layer-op-${layerId} input`);
    if (slider) slider.value = st.opacity;
  }

  function _toast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type);
  }

  function openMasterPlanStudio() {
    if (typeof MASTER_PLAN_STUDIO === 'undefined') {
      showToast('Master Plan Studio not loaded', 'warn');
      return;
    }
    if (!_selectedParcel?.centLat) {
      showToast('Select a parcel in Plan View (Google Maps) first', 'warn');
      return;
    }
    MASTER_PLAN_STUDIO.open(_selectedParcel, _selectedParcel.centLat, _selectedParcel.centLng, _gmMap);
  }

  /* ── Exports ───────────────────────────────────────────── */
  return {
    init,
    toggle,
    setOpacity,
    getSelectedParcel,
    createProjectFromParcel,
    captureForDesign,
    setGmMap,
    openMasterPlanStudio,
  };

})();
