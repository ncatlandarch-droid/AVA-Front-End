/* ava-commands.js — AVA Natural Language → Map Command Bridge
   Think! Design and Planning, LLC

   AVA's Gemini responses may include command tokens:
     [CMD:toggle_layer:parcels]
     [CMD:fly_to:123 Main St, Greensboro NC]
     [CMD:focus_site:holland-bowl]
     [CMD:reset_view]
     [CMD:zoom_in]
     [CMD:zoom_out]

   Call AVA_COMMANDS.execute(responseText) → returns cleaned text with
   commands stripped, and fires each command against GEO / GEO_LAYERS.
*/

window.AVA_COMMANDS = (() => {

  const CMD_RE = /\[CMD:([a-z_]+):?([^\]]*)\]/gi;

  /* ── Public: parse + execute all commands in a response string ── */
  function execute(text) {
    const commands = [];
    const clean = text.replace(CMD_RE, (_, action, arg) => {
      commands.push({ action: action.toLowerCase(), arg: (arg || '').trim() });
      return '';
    }).trim();

    // Fire commands after a short delay so the text renders first
    if (commands.length) setTimeout(() => commands.forEach(_run), 200);
    return clean;
  }

  function _run({ action, arg }) {
    switch (action) {
      case 'toggle_layer':
        if (window.GEO_LAYERS && arg) {
          GEO_LAYERS.toggle(arg);
          _toast(`${_layerLabel(arg)} toggled`, 'info');
        }
        break;

      case 'fly_to':
        if (arg) _geocodeAndFly(arg);
        break;

      case 'focus_site': {
        if (!arg || !window.GEO) break;
        // Accept either exact id or partial name match
        const siteId = _resolvesite(arg);
        if (siteId) {
          GEO.focusSite(siteId);
          _toast(`Navigating to ${SITE_CONFIGS[siteId]?.name || siteId}`, 'info');
        }
        break;
      }

      case 'reset_view':
        if (window.GEO) { GEO.resetView(); _toast('Overview reset', 'info'); }
        break;

      case 'zoom_in':
        _adjustZoom(1);
        break;

      case 'zoom_out':
        _adjustZoom(-1);
        break;
    }
  }

  /* ── Geocode address via Nominatim (free, no key) then fly ── */
  async function _geocodeAndFly(address) {
    try {
      _toast(`Locating "${address}"…`, 'info');
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
      const resp = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      if (!resp.ok) throw new Error('geocode failed');
      const results = await resp.json();
      if (!results.length) { _toast(`Couldn't find "${address}"`, 'warn'); return; }
      const { lat, lon, display_name } = results[0];
      if (window.GEO?.mode === 'cesium' && window.Cesium) {
        // Access the viewer via GEO internals isn't exposed — use focusSite pattern
        // Dispatch a custom event that geo.js can listen for
        document.dispatchEvent(new CustomEvent('ava:flyToLatLng', {
          detail: { lat: parseFloat(lat), lng: parseFloat(lon), label: display_name }
        }));
      }
      _toast(`Flying to ${display_name.split(',').slice(0,2).join(',')}`, 'success');
    } catch (e) {
      _toast('Location not found', 'warn');
    }
  }

  /* ── Zoom helpers ── */
  function _adjustZoom(dir) {
    document.dispatchEvent(new CustomEvent('ava:adjustZoom', { detail: { dir } }));
  }

  /* ── Resolve site name/id ── */
  function _resolvesite(query) {
    if (!window.SITE_CONFIGS) return null;
    const q = query.toLowerCase().replace(/[-_\s]/g, '');
    return Object.keys(SITE_CONFIGS).find(id => {
      const idNorm  = id.toLowerCase().replace(/-/g, '');
      const nameNorm = (SITE_CONFIGS[id].name || '').toLowerCase().replace(/\s/g, '');
      return idNorm.includes(q) || nameNorm.includes(q) || q.includes(idNorm);
    }) || null;
  }

  function _layerLabel(id) {
    const labels = { roads: 'Streets', parcels: 'Parcels', contours: 'Contours', soils: 'Soils', zoning: 'Zoning' };
    return labels[id] || id;
  }

  function _toast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type);
  }

  return { execute };

})();
