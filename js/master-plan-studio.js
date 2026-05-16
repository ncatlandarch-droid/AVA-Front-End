/* master-plan-studio.js — Admin Master Plan Studio for AVA V.4
 * Admin-only: generates AI master plans from parcel GIS data + design prompts.
 * Rendering via Replicate (REPLICATE_API_TOKEN in Netlify env) + Gemini for zones.
 * Exposes: window.MASTER_PLAN_STUDIO
 */

window.MASTER_PLAN_STUDIO = (() => {

  /* ── State ─────────────────────────────────────────────── */
  let _parcel    = null;
  let _lat       = null;
  let _lng       = null;
  let _gmMap     = null;
  let _zonesLayer = null;
  let _drawingMgr = null;
  let _savedZones = null;
  let _tab       = 'brief';

  const RENDER_PROXY = '/.netlify/functions/master-plan-render';

  /* ── Public API ────────────────────────────────────────── */

  function open(parcel, lat, lng, gmMap) {
    if (typeof COMMUNITY === 'undefined' || !COMMUNITY.isAdmin()) {
      if (typeof showToast === 'function') showToast('Admin access required', 'warn');
      return;
    }
    if (!lat || !lng) {
      if (typeof showToast === 'function') showToast('Switch to Plan View (Google Maps) to use Master Plan Studio', 'warn');
      return;
    }
    _parcel = parcel;
    _lat    = lat;
    _lng    = lng;
    _gmMap  = gmMap;

    _populateHeader();
    _switchTab('brief');
    document.getElementById('mpsOverlay').classList.add('mps-open');
  }

  function close() {
    document.getElementById('mpsOverlay').classList.remove('mps-open');
    if (_zonesLayer) { _zonesLayer.setMap(null); _zonesLayer = null; }
    if (_drawingMgr) { _drawingMgr.setMap(null); _drawingMgr = null; }
  }

  function _switchTab(tab) {
    _tab = tab;
    ['brief', 'analysis', 'plan'].forEach(t => {
      document.getElementById(`mpsTab-${t}`).classList.toggle('mps-tab-active', t === tab);
      document.getElementById(`mpsPane-${t}`).style.display = t === tab ? '' : 'none';
    });
    if (tab === 'analysis') _loadAnalysis();
    if (tab === 'plan' && _savedZones) _renderZoneList(_savedZones);
  }

  /* ── Header ────────────────────────────────────────────── */

  function _populateHeader() {
    const p = _parcel || {};
    const acres = p.acres ? (+p.acres).toFixed(2) : null;
    document.getElementById('mpsParcelTitle').textContent =
      p.address || p.owner || p.id || 'Selected Parcel';
    document.getElementById('mpsParcelMeta').textContent =
      [p.id ? `PIN: ${p.id}` : '', acres ? `${acres} ac` : '', p.zone || '']
        .filter(Boolean).join('  ·  ');
  }

  /* ── Site Analysis Tab ─────────────────────────────────── */

  function _loadAnalysis() {
    const p = _parcel || {};
    const pane = document.getElementById('mpsPane-analysis');
    pane.innerHTML = `
      <div class="mps-section-label">Site Dossier</div>
      <div class="mps-dossier">
        ${_dRow('PIN',          p.id)}
        ${_dRow('Owner',        p.owner)}
        ${_dRow('Address',      p.address)}
        ${_dRow('Area',         p.acres ? (+p.acres).toFixed(2) + ' acres  (' + Math.round(+p.acres * 43560).toLocaleString() + ' sf)' : null)}
        ${_dRow('Land Use',     p.landUse)}
        ${_dRow('Zoning',       p.zone ? p.zone + (p.zoneDesc ? ' — ' + p.zoneDesc : '') : null)}
        ${_dRow('Soils',        p.soilName ? p.soilName + (p.hydroGrp ? ' · Hyd Grp ' + p.hydroGrp : '') + (p.drainClass ? ' · ' + p.drainClass : '') : null)}
        ${_dRow('Assessed Value', p.parval ? '$' + Number(p.parval).toLocaleString() : null)}
      </div>
      <div class="mps-section-label" style="margin-top:16px">Conservation Opportunity Check</div>
      <div id="mps-opp-check" class="mps-opp-check">
        <div class="mps-loading"><div class="spinner" style="width:14px;height:14px;border-width:2px"></div> Checking GIS layers…</div>
      </div>`;
    _fetchConservationIndicators();
  }

  function _dRow(label, value) {
    if (!value) return '';
    return `<div class="mps-dossier-row"><span class="mps-dossier-label">${label}</span><strong class="mps-dossier-val">${value}</strong></div>`;
  }

  async function _fetchConservationIndicators() {
    const el = document.getElementById('mps-opp-check');
    if (!el || !_lat || !_lng) return;
    const d = 0.003;
    const bbox = `${_lng - d},${_lat - d},${_lng + d},${_lat + d}`;

    let floodZone = null, hydGrp = null;
    try {
      const [fr, sr] = await Promise.allSettled([
        fetch(`/.netlify/functions/gis-proxy?service=floodplain&bbox=${bbox}`).then(r => r.json()),
        fetch(`/.netlify/functions/gis-proxy?service=soils&bbox=${bbox}`).then(r => r.json()),
      ]);
      if (fr.status === 'fulfilled') {
        const zones = (fr.value?.features || []).map(f =>
          f.properties?.FLD_ZONE || f.properties?.ZONE_SUBTY || f.properties?.FZONE || '').filter(Boolean);
        floodZone = zones[0] || 'Outside mapped area';
      }
      if (sr.status === 'fulfilled') {
        const f = sr.value?.features?.[0]?.properties;
        hydGrp = f?.hydgrpdcd || f?.HYDGRP || null;
      }
    } catch (_) {}

    const p = _parcel || {};
    const inFloodplain = floodZone && (floodZone.startsWith('A') || floodZone.startsWith('V'));
    const hydricSoil   = hydGrp && ['C', 'D'].includes(hydGrp.toUpperCase());
    const agZone       = _isAgZoning(p.zone);

    const checks = [
      { label: 'Agricultural land use (EQIP / CRP eligible)', ok: agZone },
      { label: `Flood Zone: ${floodZone || 'checking…'}`, ok: null, info: inFloodplain ? 'ACEP-FPE candidate' : null },
      { label: `Hydro Group: ${hydGrp || 'unknown'}`, ok: null, info: hydricSoil ? 'Wetland restoration potential' : null },
      { label: '100-yr floodplain present (ACEP-FPE)', ok: inFloodplain },
      { label: 'Hydric soils detected (ACEP-WRE)', ok: hydricSoil },
      { label: 'VAPG eligible (value-added enterprise)', ok: agZone },
    ];

    el.innerHTML = checks.map(c => `
      <div class="mps-opp-row">
        <span class="mps-opp-icon">${c.ok === true ? '✅' : c.ok === false ? '⬜' : 'ℹ️'}</span>
        <span class="mps-opp-label">${c.label}${c.info ? `<span class="mps-opp-tag">${c.info}</span>` : ''}</span>
      </div>`).join('');
  }

  function _isAgZoning(zone) {
    if (!zone) return false;
    return /\b(ag|ar|a-?1|a-?2|ra|r-?a|farm|rural|agri)/i.test(zone);
  }

  /* ── Zone Generation (Gemini) ──────────────────────────── */

  async function generateZones() {
    const prompt = document.getElementById('mpsPrompt')?.value?.trim();
    if (!prompt) { showToast('Enter a design prompt first', 'warn'); return; }

    const geminiKey = localStorage.getItem('ava_gemini_key') || '';
    if (!geminiKey) { showToast('Add your Gemini API key in Settings first', 'warn'); return; }

    const btn = document.getElementById('mpsBtnGenerate');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;margin-right:6px"></div> Generating…';

    try {
      const geoJson = await _callGeminiForZones(prompt, geminiKey);
      if (geoJson?.features?.length) {
        _savedZones = geoJson;
        _renderZonesOnMap(geoJson);
        _switchTab('plan');
        _renderZoneList(geoJson);
        showToast(`${geoJson.features.length} plan zones generated`, 'success');
      } else {
        showToast('No zones returned — try a more specific prompt', 'warn');
      }
    } catch (e) {
      console.error('[MPS] Zone generation error:', e);
      showToast('Zone generation failed: ' + e.message, 'error');
    }

    btn.disabled = false;
    btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle">architecture</span> Generate Master Plan';
  }

  async function _callGeminiForZones(prompt, apiKey) {
    const p      = _parcel || {};
    const acres  = p.acres ? (+p.acres).toFixed(2) : '2';
    const style  = document.getElementById('mpsStyle')?.value || 'hybrid';
    const use    = document.getElementById('mpsLandUse')?.value || 'mixed';
    const d      = Math.sqrt(+acres * 4047) / 111320; // approx half-side in degrees
    const dLng   = d / Math.cos(_lat * Math.PI / 180);

    const styleDesc = style === 'sasaki'
      ? 'Sasaki Associates — clean, diagrammatic, crisp geometric zones'
      : style === 'edsa'
      ? 'EDSA — lush, organic, flowing naturalistic forms'
      : 'hybrid Sasaki/EDSA — clear program zones with organic planting edges';

    const systemPrompt = `You are a licensed landscape architect generating a GeoJSON master plan for a site in North Carolina.

SITE CENTROID: latitude ${_lat.toFixed(6)}, longitude ${_lng.toFixed(6)}
PARCEL AREA: approximately ${acres} acres
LAND USE: ${use}
DESIGN STYLE: ${styleDesc}

SITE CONDITIONS:
- Soils: ${p.soilName || 'unknown'}${p.hydroGrp ? ' (Hydro Group ' + p.hydroGrp + ')' : ''}${p.drainClass ? ', ' + p.drainClass : ''}
- Zoning: ${p.zone || 'unknown'}${p.zoneDesc ? ' — ' + p.zoneDesc : ''}

DESIGN PROMPT: "${prompt}"

COORDINATE BOUNDS (ALL coordinates MUST stay within this box):
  Latitude:  ${(_lat - d).toFixed(6)} to ${(_lat + d).toFixed(6)}
  Longitude: ${(_lng - dLng).toFixed(6)} to ${(_lng + dLng).toFixed(6)}

Generate a GeoJSON FeatureCollection of 4 to 7 plan zones.

RULES:
1. Every coordinate pair MUST be [longitude, latitude] order (GeoJSON standard)
2. All coordinates MUST be within the bounds above — NO exceptions
3. Zones should together cover most of the parcel without overlapping
4. Make polygon shapes realistic (not perfect rectangles) — use 5-8 vertices per zone

Each feature properties MUST include:
- "name": human-readable zone name (e.g. "Riparian Buffer", "Food Forest")
- "type": one of: food_forest, wetland_buffer, building_envelope, pasture, stream_corridor, orchard, garden, farmstead, conservation, meadow, circulation, parking
- "color": hex color for plan diagram (#1B5E20 forest, #1565C0 water, #33691E vegetation, #795548 earth, #F57F17 warm, #880E4F accent)
- "area_acres": estimated area as a number
- "description": one sentence describing the zone's ecological or program function
- "nrcs_practice": the most relevant NRCS practice standard code + name if applicable, else null

Return ONLY the raw GeoJSON FeatureCollection — no markdown, no explanation, no code fences.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }],
        generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
      }),
    });
    if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text  = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
  }

  /* ── Map Zone Rendering ────────────────────────────────── */

  function _renderZonesOnMap(geoJson) {
    if (!_gmMap) return;
    if (_zonesLayer) _zonesLayer.setMap(null);
    _zonesLayer = new google.maps.Data({ map: _gmMap });
    _zonesLayer.addGeoJson(geoJson);
    _zonesLayer.setStyle(f => {
      const color = f.getProperty('color') || '#4CAF50';
      return { fillColor: color, fillOpacity: 0.38, strokeColor: color, strokeOpacity: 0.85, strokeWeight: 2.5 };
    });
    _zonesLayer.addListener('click', evt => {
      const n = evt.feature.getProperty('name') || '';
      const d = evt.feature.getProperty('description') || '';
      const r = evt.feature.getProperty('nrcs_practice') || '';
      showToast(`${n}${d ? ' — ' + d : ''}${r ? ' · ' + r : ''}`, 'info');
    });
  }

  function _renderZoneList(geoJson) {
    const el = document.getElementById('mpsZoneList');
    if (!el) return;
    if (!geoJson?.features?.length) {
      el.innerHTML = '<div class="mps-empty">Generate a master plan to see zones here</div>';
      return;
    }
    el.innerHTML = geoJson.features.map(f => {
      const p = f.properties;
      const acres = typeof p.area_acres === 'number' ? p.area_acres.toFixed(1) + ' ac' : '';
      return `
        <div class="mps-zone-row">
          <span class="mps-zone-dot" style="background:${p.color || '#aaa'}"></span>
          <div class="mps-zone-info">
            <strong>${p.name || 'Zone'}</strong>
            <span>${p.description || ''}</span>
            ${p.nrcs_practice ? `<span class="mps-nrcs-tag">${p.nrcs_practice}</span>` : ''}
          </div>
          ${acres ? `<span class="mps-zone-acres">${acres}</span>` : ''}
        </div>`;
    }).join('');
  }

  /* ── Rendering (Replicate) ─────────────────────────────── */

  async function generateRendering() {
    const btn = document.getElementById('mpsBtnRender');
    if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }

    const prompt  = document.getElementById('mpsPrompt')?.value?.trim() || 'landscape master plan';
    const style   = document.getElementById('mpsStyle')?.value || 'hybrid';
    const acres   = _parcel?.acres ? (+_parcel.acres).toFixed(1) : '2';

    const styleDesc = style === 'sasaki'
      ? 'Sasaki Associates landscape architecture plan view rendering, clean diagrammatic, crisp colored zone fills, black linework, professional graphic, white paper background'
      : style === 'edsa'
      ? 'EDSA landscape architecture plan rendering, lush illustrative, rich vegetation textures, resort-style, warm earth tones, aerial view'
      : 'professional landscape architecture master plan rendering, plan view, Sasaki Associates graphic style, colored zone fills, tree canopy circles, organic planting edges, warm earth palette';

    try {
      const res = await fetch(RENDER_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:  'render-plan',
          prompt:  `${styleDesc}, ${prompt}, ${acres}-acre site, North Carolina piedmont, aerial plan view, no text labels`,
          lat:     _lat,
          lng:     _lng,
        }),
      });
      const data = await res.json();
      if (data.url) {
        const img = document.getElementById('mpsRenderImg');
        if (img) { img.src = data.url; img.style.display = 'block'; }
        const ph = document.getElementById('mpsRenderPlaceholder');
        if (ph) ph.style.display = 'none';
        showToast('Rendering complete', 'success');
      } else {
        throw new Error(data.error || 'No image returned');
      }
    } catch (e) {
      console.error('[MPS] Render error:', e);
      showToast('Rendering requires REPLICATE_API_TOKEN in Netlify env vars', 'warn');
    }

    if (btn) { btn.disabled = false; btn.textContent = 'Generate Rendering'; }
  }

  /* ── Drawing Tools ─────────────────────────────────────── */

  function enableDrawing() {
    if (!_gmMap || !window.google?.maps?.drawing) {
      showToast('Drawing tools load with the Google Maps library', 'info');
      return;
    }
    if (_drawingMgr) { _drawingMgr.setMap(null); _drawingMgr = null; }
    _drawingMgr = new google.maps.drawing.DrawingManager({
      drawingMode: google.maps.drawing.OverlayType.POLYGON,
      drawingControl: true,
      drawingControlOptions: {
        position: google.maps.ControlPosition.TOP_CENTER,
        drawingModes: [
          google.maps.drawing.OverlayType.POLYGON,
          google.maps.drawing.OverlayType.POLYLINE,
          google.maps.drawing.OverlayType.RECTANGLE,
        ],
      },
      polygonOptions:  { fillColor: '#4CAF50', fillOpacity: 0.3, strokeWeight: 2, editable: true, strokeColor: '#2E7D32' },
      polylineOptions: { strokeColor: '#795548', strokeWeight: 2, editable: true },
    });
    _drawingMgr.setMap(_gmMap);
    showToast('Drawing tools active — draw zones directly on the map', 'info');
  }

  /* ── HTML Shell ────────────────────────────────────────── */

  function init() {
    if (document.getElementById('mpsOverlay')) return;
    const div = document.createElement('div');
    div.innerHTML = _html();
    document.body.appendChild(div.firstElementChild);
  }

  function _html() {
    return `
<div id="mpsOverlay" class="mps-overlay">
  <div class="mps-panel">

    <!-- Header -->
    <div class="mps-header">
      <div class="mps-header-left">
        <span class="material-symbols-outlined mps-header-icon">architecture</span>
        <div>
          <div class="mps-title">Master Plan Studio</div>
          <div class="mps-subtitle" id="mpsParcelTitle">—</div>
        </div>
      </div>
      <div class="mps-header-right">
        <div class="mps-meta" id="mpsParcelMeta"></div>
        <button class="mps-close-btn" onclick="MASTER_PLAN_STUDIO.close()">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="mps-tabs">
      <button class="mps-tab mps-tab-active" id="mpsTab-brief"    onclick="MASTER_PLAN_STUDIO._switchTab('brief')">Design Brief</button>
      <button class="mps-tab"                id="mpsTab-analysis" onclick="MASTER_PLAN_STUDIO._switchTab('analysis')">Site Analysis</button>
      <button class="mps-tab"                id="mpsTab-plan"     onclick="MASTER_PLAN_STUDIO._switchTab('plan')">Generated Plan</button>
    </div>

    <!-- BRIEF TAB -->
    <div id="mpsPane-brief" class="mps-pane">
      <div class="mps-section-label">Land Use Type</div>
      <select id="mpsLandUse" class="mps-select">
        <option value="mixed">Mixed Agricultural</option>
        <option value="regenerative">Regenerative Farm</option>
        <option value="crop">Row Crop Farm</option>
        <option value="pasture">Pasture / Livestock</option>
        <option value="forest">Working Forest</option>
        <option value="farmstead">Farmstead / Homestead</option>
        <option value="conservation">Conservation Land</option>
        <option value="agritourism">Agritourism</option>
      </select>

      <div class="mps-section-label">Rendering Style</div>
      <div class="mps-style-row">
        <label class="mps-style-opt">
          <input type="radio" name="mpsStyleR" value="sasaki" onchange="document.getElementById('mpsStyle').value=this.value">
          <div class="mps-style-card">
            <div class="mps-swatch mps-swatch-sasaki"></div>
            <span>Sasaki</span>
            <small>Diagrammatic</small>
          </div>
        </label>
        <label class="mps-style-opt">
          <input type="radio" name="mpsStyleR" value="edsa" onchange="document.getElementById('mpsStyle').value=this.value">
          <div class="mps-style-card">
            <div class="mps-swatch mps-swatch-edsa"></div>
            <span>EDSA</span>
            <small>Illustrative</small>
          </div>
        </label>
        <label class="mps-style-opt">
          <input type="radio" name="mpsStyleR" value="hybrid" checked onchange="document.getElementById('mpsStyle').value=this.value">
          <div class="mps-style-card mps-style-selected">
            <div class="mps-swatch mps-swatch-hybrid"></div>
            <span>Hybrid</span>
            <small>Balanced</small>
          </div>
        </label>
      </div>
      <input type="hidden" id="mpsStyle" value="hybrid">

      <div class="mps-section-label">Design Vision</div>
      <textarea id="mpsPrompt" class="mps-textarea" rows="5"
        placeholder="Describe the vision for this site…&#10;e.g. 'Regenerative farm with guest cabin, food forest along the creek corridor, stormwater wetland in the low northeast area, farm stand and parking near the road frontage'"></textarea>

      <div class="mps-section-label">Conservation Programs</div>
      <div class="mps-check-row-group">
        <label class="mps-check-label"><input type="checkbox" id="mpsPgmEQIP"> NRCS EQIP</label>
        <label class="mps-check-label"><input type="checkbox" id="mpsPgmCRP"> CRP</label>
        <label class="mps-check-label"><input type="checkbox" id="mpsPgmACEP"> ACEP</label>
        <label class="mps-check-label"><input type="checkbox" id="mpsPgmVAPG"> USDA VAPG</label>
      </div>

      <div class="mps-actions">
        <button id="mpsBtnGenerate" class="mps-btn mps-btn-primary" onclick="MASTER_PLAN_STUDIO.generateZones()">
          <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle">architecture</span>
          Generate Master Plan
        </button>
        <button class="mps-btn mps-btn-ghost" onclick="MASTER_PLAN_STUDIO.enableDrawing()">
          <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle">draw</span>
          Draw Tools
        </button>
      </div>
    </div>

    <!-- ANALYSIS TAB -->
    <div id="mpsPane-analysis" class="mps-pane" style="display:none">
      <div class="mps-loading"><div class="spinner" style="width:14px;height:14px;border-width:2px"></div> Loading…</div>
    </div>

    <!-- PLAN TAB -->
    <div id="mpsPane-plan" class="mps-pane" style="display:none">
      <div class="mps-section-label">Plan Zones</div>
      <div id="mpsZoneList" class="mps-zone-list">
        <div class="mps-empty">Generate a master plan to see zones here</div>
      </div>

      <div class="mps-section-label" style="margin-top:18px">Sasaki / EDSA Style Rendering</div>
      <div id="mpsRenderPlaceholder" class="mps-render-ph">
        <span class="material-symbols-outlined" style="font-size:40px;opacity:0.25;display:block;margin-bottom:8px">image</span>
        <div style="font-size:11px;opacity:0.45;line-height:1.6">
          Add <strong>REPLICATE_API_TOKEN</strong> to Netlify env vars,<br>then click below to generate a styled plan rendering.
        </div>
        <button id="mpsBtnRender" class="mps-btn mps-btn-ghost" style="margin-top:12px" onclick="MASTER_PLAN_STUDIO.generateRendering()">
          <span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle">auto_awesome</span>
          Generate Rendering
        </button>
      </div>
      <img id="mpsRenderImg" class="mps-render-img" style="display:none" alt="AI Plan Rendering">
    </div>

  </div>
</div>`;
  }

  /* ── Boot ──────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { open, close, generateZones, generateRendering, enableDrawing, _switchTab };

})();
