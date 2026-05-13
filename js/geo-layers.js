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
    if (!_mapsKey) { _toast('Google Maps key required for Streets layer', 'warn'); return; }
    // lyrs=h  →  hybrid overlay: transparent roads + labels on top of any base
    const provider = new Cesium.UrlTemplateImageryProvider({
      url:    `https://mt1.google.com/vt/lyrs=h&x={x}&y={y}&z={z}&key=${_mapsKey}`,
      credit: new Cesium.Credit('© Google', true)
    });
    const layer  = _viewer.imageryLayers.addImageryProvider(provider);
    layer.alpha  = 0.88;
    _st.roads.ref = layer;
    _toast('Streets & Labels on', 'success');
  }

  async function _addGeoJson(layerId, geojson, style) {
    const fill = style.fill === 'transparent'
      ? Cesium.Color.TRANSPARENT
      : Cesium.Color.fromCssColorString(style.fill);
    const ds = new Cesium.GeoJsonDataSource(layerId);
    await ds.load(geojson, {
      stroke:      Cesium.Color.fromCssColorString(style.stroke),
      fill,
      strokeWidth: style.strokeWidth,
      clampToGround: true
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
      id:       _prop(p, 'PARCEL_ID','PIN','parcel_id','pin','PARID','APN'),
      owner:    _prop(p, 'OWNER','OWNER1','OWNERNM','owner'),
      address:  _prop(p, 'SITE_ADDR','SITE_ADDRESS','SITEADDRESS','address'),
      acres:    _prop(p, 'TOTAL_ACRES','ACRES','GISACRES','CALCACRES','acres'),
      landUse:  _prop(p, 'LAND_USE','LANDUSE','PROP_USE','propuse'),
      zone:     _prop(p, 'ZONING','ZONE_CODE','ZONECODE','zoning'),
      soilName: null,
      hydroGrp: null,
    };

    const card = document.getElementById('ava-parcel-card');
    if (!card) return;

    const acres = _selectedParcel.acres ? (+_selectedParcel.acres).toFixed(2) : '—';
    card.innerHTML = `
      <div class="pcard-hdr">
        <span class="pcard-title">
          <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">texture</span>
          PARCEL
        </span>
        <button onclick="document.getElementById('ava-parcel-card').style.display='none'"
                style="background:none;border:none;color:rgba(255,255,255,0.5);cursor:pointer;padding:0">
          <span class="material-symbols-outlined" style="font-size:16px">close</span>
        </button>
      </div>
      <div class="pcard-body">
        ${_prow('PIN',        _selectedParcel.id)}
        ${_prow('Owner',      _selectedParcel.owner)}
        ${_prow('Address',    _selectedParcel.address)}
        ${_prow('Acres',      acres)}
        ${_prow('Land Use',   _selectedParcel.landUse)}
        ${_prow('Zone',       _selectedParcel.zone)}
        <div id="pcard-soil-row" style="display:none">${_prow('Soil','<span id="pcard-soil-val">…</span>')}</div>
      </div>
      <div class="pcard-actions">
        <button class="pcard-btn pcard-btn-primary" onclick="GEO_LAYERS.createProjectFromParcel()">
          <span class="material-symbols-outlined" style="font-size:14px">add_circle</span>
          Create AVA Project
        </button>
        <button class="pcard-btn" onclick="GEO_LAYERS.captureForDesign()">
          <span class="material-symbols-outlined" style="font-size:14px">photo_camera</span>
          Design in Plan View
        </button>
      </div>`;
    card.style.display = 'block';

    // Async-enrich with soils data
    _enrichWithSoils(entity);
  }

  function _prow(label, val) {
    if (!val || val === '—' || val === 'null') return '';
    return `<div class="pcard-row"><span class="pcard-label">${label}</span><span class="pcard-val">${val}</span></div>`;
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
      const row = document.getElementById('pcard-soil-row');
      const val = document.getElementById('pcard-soil-val');
      if (row && val && name) {
        val.textContent = name + (hydro ? `  ·  Hydro ${hydro}` : '');
        row.style.display = '';
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

    // Layer panel (fixed, above viewport)
    const panel = document.createElement('div');
    panel.id        = 'ava-layer-panel';
    panel.className = 'ava-layer-panel';
    panel.style.display = 'none';
    canvas.appendChild(panel);

    const hdr = document.createElement('div');
    hdr.className   = 'layer-panel-hdr';
    hdr.textContent = 'DATA LAYERS';
    panel.appendChild(hdr);

    LAYER_DEFS.forEach(def => {
      const row = document.createElement('div');
      row.className = 'layer-row';
      row.id        = `layer-row-${def.id}`;
      row.innerHTML = `
        <div class="layer-row-info">
          <span class="layer-dot" id="layer-dot-${def.id}" style="background:${def.accent};opacity:0.3"></span>
          <span class="material-symbols-outlined layer-icon">${def.icon}</span>
          <span class="layer-row-label">${def.label}</span>
        </div>
        <button class="layer-toggle-btn" id="layer-tb-${def.id}"
                onclick="GEO_LAYERS.toggle('${def.id}')" title="Toggle ${def.label}">
          <span id="layer-spinner-${def.id}" class="layer-spinner" style="display:none">⟳</span>
          <span id="layer-state-${def.id}">OFF</span>
        </button>`;
      panel.appendChild(row);
    });

    // HUD toggle button (same style as Campus / Walk / N↑)
    const btn = _hudBtn('layers', 'Layers', () => {
      _panelVisible = !_panelVisible;
      panel.style.display = _panelVisible ? 'block' : 'none';
      btn.style.background = _panelVisible ? 'rgba(253,185,39,0.9)' : 'rgba(0,0,0,0.88)';
      btn.style.color      = _panelVisible ? '#000' : '#fff';
    });
    btn.id = 'ava-layer-hud-btn';
    hud.appendChild(btn);

    // Parcel info card
    const card = document.createElement('div');
    card.id        = 'ava-parcel-card';
    card.className = 'ava-parcel-card';
    card.style.display = 'none';
    canvas.appendChild(card);
  }

  function _refreshRow(layerId) {
    const st   = _st[layerId];
    const tb   = document.getElementById(`layer-tb-${layerId}`);
    const dot  = document.getElementById(`layer-dot-${layerId}`);
    const spin = document.getElementById(`layer-spinner-${layerId}`);
    const lbl  = document.getElementById(`layer-state-${layerId}`);
    if (!tb) return;
    if (st.loading) {
      spin && (spin.style.display = 'inline');
      lbl  && (lbl.textContent = '…');
      tb.style.opacity = '0.6';
    } else {
      spin && (spin.style.display = 'none');
      if (st.active) {
        lbl  && (lbl.textContent = 'ON');
        tb.style.background = 'rgba(253,185,39,0.85)';
        tb.style.color      = '#000';
        dot  && (dot.style.opacity = '1');
      } else {
        lbl  && (lbl.textContent = 'OFF');
        tb.style.background = 'rgba(255,255,255,0.08)';
        tb.style.color      = 'rgba(255,255,255,0.7)';
        dot  && (dot.style.opacity = '0.3');
      }
      tb.style.opacity = '1';
    }
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
    b.onmouseenter = () => { if (b.id !== 'ava-layer-hud-btn' || !_panelVisible) b.style.background = 'rgba(40,40,40,0.95)'; };
    b.onmouseleave = () => { if (b.id !== 'ava-layer-hud-btn' || !_panelVisible) b.style.background = 'rgba(0,0,0,0.88)'; };
    b.addEventListener('click', onClick);
    return b;
  }

  /* ── Helpers ───────────────────────────────────────────── */

  function _viewportBbox() {
    if (!_viewer) return null;
    const rect = _viewer.camera.computeViewRectangle();
    if (!Cesium.defined(rect)) return null;
    return {
      west:  Cesium.Math.toDegrees(rect.west),
      south: Cesium.Math.toDegrees(rect.south),
      east:  Cesium.Math.toDegrees(rect.east),
      north: Cesium.Math.toDegrees(rect.north),
    };
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
