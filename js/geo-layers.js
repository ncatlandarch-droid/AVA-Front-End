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
  let _selectedParcel = null;
  let _panelVisible   = false;
  let _panelMinimized = false;
  const STORE_KEY_PANEL = 'ava-layer-panel-vis';
  const STORE_KEY_MIN   = 'ava-layer-panel-min';

  const PROXY = '/.netlify/functions/gis-proxy';
  const MAX_BBOX_DEG  = 0.12;   // ~12 km — refuse queries wider than this
  const JD = () => Cesium.JulianDate.now();

  /* ── Layer definitions ─────────────────────────────────── */
  const LAYER_DEFS = [
    { id: 'roads',    label: 'Streets & Labels', icon: 'signpost',  accent: '#4285F4', type: 'imagery' },
    { id: 'parcels',  label: 'Parcels',          icon: 'texture',   accent: '#FDB927', type: 'geojson',
      style: { stroke: '#FDB927', fill: 'rgba(253,185,39,0.07)', strokeWidth: 1.5 } },
    { id: 'contours', label: 'Contours',         icon: 'terrain',   accent: '#C8A876', type: 'geojson',
      style: { stroke: '#D4B483', fill: 'transparent', strokeWidth: 1 } },
    { id: 'soils',    label: 'Soils (SSURGO)',   icon: 'grass',     accent: '#4CAF50', type: 'geojson',
      style: { stroke: '#4CAF50', fill: 'rgba(76,175,80,0.1)',  strokeWidth: 1 } },
    { id: 'zoning',   label: 'Zoning',           icon: 'home_work', accent: '#AB47BC', type: 'geojson',
      style: { stroke: '#AB47BC', fill: 'rgba(171,71,188,0.09)', strokeWidth: 1.5 } },
  ];

  // Runtime state per layer
  const _st = {};
  LAYER_DEFS.forEach(d => { _st[d.id] = { active: false, loading: false, ref: null }; });

  /* ── Init ──────────────────────────────────────────────── */

  function init(viewer, mapsKey) {
    _viewer  = viewer;
    _mapsKey = mapsKey;
    _buildUI();
    _addClickHandler();
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
      if (layerId === 'roads') {
        _loadRoads();
      } else {
        const bbox = _viewportBbox();
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
        st.ref = await _addGeoJson(layerId, geojson, def.style);
        _toast(`${def.label} loaded — ${geojson.features.length} features`, 'success');
      }
      st.active = true;
    } catch (e) {
      if (!['no bbox','too wide','empty'].includes(e.message)) {
        console.warn('[AVA LAYERS]', layerId, e);
        _toast(`${def.label} unavailable`, 'warn');
      }
    }

    st.loading = false;
    _refreshRow(layerId);
  }

  function _deactivate(layerId) {
    const st = _st[layerId];
    if (layerId === 'roads') {
      if (st.ref) _viewer.imageryLayers.remove(st.ref);
    } else {
      if (st.ref) _viewer.dataSources.remove(st.ref, true);
    }
    st.ref    = null;
    st.active = false;
    _refreshRow(layerId);
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
    const fill = style.fill === 'transparent'
      ? Cesium.Color.TRANSPARENT
      : Cesium.Color.fromCssColorString(style.fill);
    const ds = new Cesium.GeoJsonDataSource(layerId);
    await ds.load(geojson, {
      stroke:        Cesium.Color.fromCssColorString(style.stroke),
      fill,
      strokeWidth:   style.strokeWidth,
      clampToGround: true
    });
    // Strip point/billboard/label entities (parcel centroids from Regrid etc).
    // Set ClassificationType.BOTH so polygons drape over Google Photorealistic
    // 3D Tiles AND terrain — without this they render below the tile surfaces.
    ds.entities.values.forEach(e => {
      e.billboard = undefined;
      e.point     = undefined;
      e.label     = undefined;
      if (e.polygon) {
        e.polygon.classificationType = Cesium.ClassificationType.BOTH;
      }
      if (e.polyline) {
        e.polyline.clampToGround = true;
      }
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
      const picked = _viewer.scene.pick(evt.position);
      if (!Cesium.defined(picked)) return;
      const entity = picked.id;
      if (!(entity instanceof Cesium.Entity)) return;
      if (entity.entityCollection?.owner !== _st.parcels.ref) return;
      _showParcelCard(entity);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  function _showParcelCard(entity) {
    // Highlight selected parcel
    if (_selectedParcel?.entity?.polygon) {
      _selectedParcel.entity.polygon.material = Cesium.Color.fromCssColorString('#FDB927').withAlpha(0.07);
    }
    entity.polygon.material    = Cesium.Color.fromCssColorString('#FDB927').withAlpha(0.28);
    entity.polygon.outlineColor = Cesium.Color.fromCssColorString('#FDB927');

    const p = entity.properties;
    _selectedParcel = {
      entity,
      // Regrid normalized fields first, then county ArcGIS variants
      id:       _prop(p, 'll_uuid','parcelnumb','PARCEL_ID','PIN','PARID','APN','parcel_id','PARCELNUMB'),
      owner:    _prop(p, 'owner','OWNER_NAME','OWNER','OWNER1','OWNERNM','OWN_NAME','GRANTEE'),
      address:  _prop(p, 'sadd','mailadd','SITUS_ADDRESS','SITE_ADDR','SITE_ADDRESS','ADDR','PROP_ADDR'),
      acres:    _prop(p, 'acres','ACREAGE','TOTAL_ACRES','ACRES','GISACRES','CALCACRES','GIS_ACRES'),
      landUse:  _prop(p, 'usedesc','usecode','LAND_USE_CD','LAND_USE','LANDUSE','PROP_USE','LU_CODE'),
      zone:     _prop(p, 'zoning','zoning_description','ZONING','ZONING_CODE','ZONE_CODE','ZONECODE'),
      soilName: null,
      hydroGrp: null,
    };

    const card = document.getElementById('ava-parcel-card');
    if (!card) return;

    const acres = _selectedParcel.acres ? (+_selectedParcel.acres).toFixed(2) : null;
    card.innerHTML = `
      <button class="pcard-close" onclick="document.getElementById('ava-parcel-card').style.display='none'">
        <span class="material-symbols-outlined" style="font-size:16px;font-weight:400">close</span>
      </button>
      ${_selectedParcel.id      ? `<div class="pcard-pin">PIN: ${_selectedParcel.id}</div>` : ''}
      ${_selectedParcel.owner   ? `<div class="pcard-owner">${_selectedParcel.owner}</div>` : ''}
      ${_selectedParcel.address ? `<div class="pcard-address">${_selectedParcel.address}</div>` : ''}
      <div class="pcard-meta">
        ${acres              ? `<span>${acres} ac</span>` : ''}
        ${_selectedParcel.zone     ? `<span>${_selectedParcel.zone}</span>` : ''}
        ${_selectedParcel.landUse  ? `<span>${_selectedParcel.landUse}</span>` : ''}
      </div>
      <div class="pcard-soils" id="pcard-soil-line" style="display:none"></div>
      <div class="pcard-actions">
        <button class="pcard-btn pcard-btn-create" onclick="GEO_LAYERS.createProjectFromParcel()">
          + Create Project
        </button>
        <button class="pcard-btn pcard-btn-design" onclick="GEO_LAYERS.captureForDesign()">
          Plan View
        </button>
      </div>`;
    card.style.display = 'block';

    // Async-enrich with soils data
    _enrichWithSoils(entity);
  }

  async function _enrichWithSoils(entity) {
    const positions = entity.polygon?.hierarchy?.getValue(JD())?.positions;
    if (!positions?.length) return;
    const carto = Cesium.Cartographic.fromCartesian(positions[0]);
    const lat   = Cesium.Math.toDegrees(carto.latitude);
    const lng   = Cesium.Math.toDegrees(carto.longitude);
    const d     = 0.001;
    try {
      const resp = await fetch(`${PROXY}?service=soils&bbox=${lng-d},${lat-d},${lng+d},${lat+d}`);
      if (!resp.ok) return;
      const gj = await resp.json();
      const f  = gj?.features?.[0]?.properties;
      if (!f) return;
      const name  = f.MUNAME || f.muname || f.musym || '';
      const hydro = f.hydgrpdcd || f.HYDGRP || '';
      if (_selectedParcel) { _selectedParcel.soilName = name; _selectedParcel.hydroGrp = hydro; }
      const line = document.getElementById('pcard-soil-line');
      if (line && name) {
        line.textContent = name + (hydro ? `  ·  Hydro Grp ${hydro}` : '');
        line.style.display = '';
      }
    } catch (_) {}
  }

  /* ── Public actions from parcel card ──────────────────── */

  function createProjectFromParcel() {
    if (!_selectedParcel || typeof ADMIN === 'undefined') return;
    const positions = _selectedParcel.entity.polygon?.hierarchy?.getValue(JD())?.positions || [];
    let lat = '', lng = '';
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
        _selectedParcel.soilName && `Primary soil: ${_selectedParcel.soilName}`,
        _selectedParcel.hydroGrp && `Hydrologic group: ${_selectedParcel.hydroGrp}`,
        _selectedParcel.landUse  && `Current land use: ${_selectedParcel.landUse}`,
        _selectedParcel.zone     && `Zoning: ${_selectedParcel.zone}`,
      ].filter(Boolean).join('\n'));
      if (typeof openModal === 'function') openModal('adminProjectModal');
    }, 120);
  }

  async function captureForDesign() {
    if (!_selectedParcel?.entity || !_viewer) return;
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

    const imageData = _viewer.scene.canvas.toDataURL('image/jpeg', 0.92);

    document.dispatchEvent(new CustomEvent('ava:planViewCapture', {
      detail: {
        imageData,
        parcel: {
          address:  _selectedParcel.address,
          owner:    _selectedParcel.owner,
          acres:    _selectedParcel.acres,
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
      <span class="layer-panel-title">DATA LAYERS</span>
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
        <label class="layer-row-label" onclick="GEO_LAYERS.toggle('${def.id}')">
          <span class="material-symbols-outlined layer-icon" style="color:${def.accent}">${def.icon}</span>
          <span class="layer-label-text">${def.label}</span>
        </label>
        <button class="layer-toggle-btn" id="layer-tb-${def.id}"
                onclick="GEO_LAYERS.toggle('${def.id}')" title="Toggle ${def.label}">
          <span class="layer-toggle-track"><span class="layer-toggle-thumb"></span></span>
        </button>`;
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
    const st = _st[layerId];
    const tb = document.getElementById(`layer-tb-${layerId}`);
    const row = document.getElementById(`layer-row-${layerId}`);
    if (!tb) return;
    tb.style.opacity = st.loading ? '0.5' : '1';
    tb.classList.toggle('active', !!st.active);
    if (row) row.classList.toggle('on', !!st.active);
    tb.title = st.loading ? 'Loading…' : (st.active ? 'ON — click to hide' : 'OFF — click to show');
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
        align-items: center;
        justify-content: space-between;
        padding: 7px 14px;
        transition: background 0.15s;
      }
      .layer-row:hover {
        background: rgba(255,255,255,0.06);
      }
      .layer-row.on {
        background: rgba(0, 70, 132, 0.25);
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
        left: 16px;
        z-index: 45;
        background: rgba(0, 20, 50, 0.92);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 12px;
        padding: 16px;
        min-width: 240px;
        max-width: 320px;
        color: #fff;
        font-family: 'Inter', system-ui, sans-serif;
        box-shadow: 0 8px 32px rgba(0,0,0,0.35);
      }
      .pcard-close {
        position: absolute;
        top: 8px;
        right: 8px;
        background: none;
        border: none;
        color: rgba(255,255,255,0.5);
        cursor: pointer;
      }
      .pcard-close:hover { color: #fff; }
      .pcard-pin { font-size: 10px; color: rgba(255,255,255,0.5); letter-spacing: 1px; margin-bottom: 4px; }
      .pcard-owner { font-size: 14px; font-weight: 700; margin-bottom: 2px; }
      .pcard-address { font-size: 12px; color: rgba(255,255,255,0.7); margin-bottom: 8px; }
      .pcard-meta { display: flex; gap: 10px; font-size: 11px; color: rgba(255,255,255,0.6); margin-bottom: 8px; }
      .pcard-soils { font-size: 11px; color: rgba(76,175,80,0.9); margin-bottom: 10px; }
      .pcard-actions { display: flex; gap: 8px; }
      .pcard-btn {
        flex: 1;
        padding: 8px 12px;
        border: none;
        border-radius: 8px;
        font-family: inherit;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        transition: opacity 0.15s;
      }
      .pcard-btn:hover { opacity: 0.85; }
      .pcard-btn-create { background: linear-gradient(135deg, #004684, #002B52); color: #fff; }
      .pcard-btn-design { background: rgba(255,255,255,0.12); color: #fff; border: 1px solid rgba(255,255,255,0.2); }
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

  /* ── Helpers ───────────────────────────────────────────── */

  function _viewportBbox() {
    if (!_viewer) return null;
    try {
      const rect = _viewer.camera.computeViewRectangle();
      if (Cesium.defined(rect)) {
        return {
          west:  Cesium.Math.toDegrees(rect.west),
          south: Cesium.Math.toDegrees(rect.south),
          east:  Cesium.Math.toDegrees(rect.east),
          north: Cesium.Math.toDegrees(rect.north),
        };
      }
    } catch (_) {}
    // Fallback for top-down or near-vertical camera: fixed 0.05° box around camera footprint
    const carto = Cesium.Cartographic.fromCartesian(_viewer.camera.position);
    if (!Cesium.defined(carto)) return null;
    const lat = Cesium.Math.toDegrees(carto.latitude);
    const lng = Cesium.Math.toDegrees(carto.longitude);
    const d = 0.04;
    return { west: lng - d, south: lat - d, east: lng + d, north: lat + d };
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

  function _toast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type);
  }

  /* ── Exports ───────────────────────────────────────────── */
  return {
    init,
    toggle,
    getSelectedParcel,
    createProjectFromParcel,
    captureForDesign,
  };

})();
