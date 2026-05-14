/* AVA V.4 — Campus Map  (triple-mode)
 *
 * MODE A — CesiumJS + Google Photorealistic 3D Tiles
 *   - True 3D photorealistic mesh, free-orbit camera
 *   - Fly to ground level anywhere on campus
 *   - Falls back to Cesium World Terrain + ESRI satellite if no Google key
 *   Requires: Cesium ion token (free at cesium.com/ion)
 *             Google Maps key with Map Tiles API enabled
 *
 * MODE B — Google Maps JS API  (tilt:45 fallback)
 *   - Photorealistic satellite + 45° 3D buildings
 *   - Elevation API, Places API scaffold
 *   Requires: Google Maps key only
 *
 * MODE C — Leaflet + ESRI satellite  (zero-config fallback)
 *   - No API key, no billing, always works
 *
 * Exposes: window.GEO
 *   GEO.init(mapsKey?, cesiumToken?)  load map
 *   GEO.focusSite(id)                 fly/pan to site
 *   GEO.resetView()                   zoom back to campus
 *   GEO.isReady()                     true once map mounted
 *   GEO.mode                          'cesium' | 'google' | 'leaflet' | null
 */

window.GEO = (() => {

  /* ── Shared constants ─────────────────────────────────── */
  const CAMPUS_CENTER = { lat: 36.0730, lng: -79.7750 };
  // NC A&T elevation ~270m above WGS84 ellipsoid
  const CAMPUS_ALT    = 270;
  const SITE_H        = CAMPUS_ALT + 90;    // ~90m above campus

  const CAMPUS_ZOOM_G = 17;
  const SITE_ZOOM_G   = 19;
  const CAMPUS_ZOOM_L = 17;
  const SITE_ZOOM_L   = 19;

  /* ── State ────────────────────────────────────────────── */
  let _mode       = null;

  // Cesium
  let _cemViewer          = null;
  let _cemEntities        = {};
  let _cemActivePopupSiteId = null;

  // Google Maps
  let _gmMap      = null;
  let _gmMarkers  = {};
  let _gmInfoWin  = {};
  let _elevSvc    = null;
  let _placesSvc  = null;

  // Leaflet
  let _lfMap      = null;
  let _lfMarkers  = {};

  /* ── Public API ───────────────────────────────────────── */

  function init(mapsKey, cesiumToken) {
    if (_mode) return;
    if (cesiumToken) {
      _mode = 'cesium';
      _loadCesium(mapsKey, cesiumToken);
    } else if (mapsKey) {
      _mode = 'google';
      _loadGoogleMaps(mapsKey);
    } else {
      _mode = 'leaflet';
      _initLeaflet();
    }
  }

  function focusSite(siteId) {
    if (_mode === 'cesium')  _cemFocusSite(siteId);
    else if (_mode === 'google')  _gmFocusSite(siteId);
    else if (_mode === 'leaflet') _lfFocusSite(siteId);
  }

  function resetView() {
    if (_mode === 'cesium')  _cemResetView();
    else if (_mode === 'google')  _gmResetView();
    else if (_mode === 'leaflet') _lfResetView();
  }

  function isReady() {
    if (_mode === 'cesium')  return !!_cemViewer;
    if (_mode === 'google')  return !!_gmMap;
    return !!_lfMap;
  }

  /* ════════════════════════════════════════════════════════
     MODE A — CESIUM 3D
  ════════════════════════════════════════════════════════ */

  function _loadCesium(mapsKey, cesiumToken) {
    if (window.Cesium) { _cemOnLoaded(mapsKey, cesiumToken); return; }

    const CESIUM_VER = '1.115';
    if (!document.getElementById('cesium-css')) {
      const link  = document.createElement('link');
      link.id     = 'cesium-css';
      link.rel    = 'stylesheet';
      link.href   = `https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VER}/Build/Cesium/Widgets/widgets.css`;
      document.head.appendChild(link);
    }
    const script    = document.createElement('script');
    script.src      = `https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VER}/Build/Cesium/Cesium.js`;
    script.onload   = () => _cemOnLoaded(mapsKey, cesiumToken);
    script.onerror  = () => {
      console.error('[AVA GEO] CesiumJS load failed — falling back to Leaflet');
      _mode = 'leaflet';
      _initLeaflet();
    };
    document.head.appendChild(script);
  }

  async function _cemOnLoaded(mapsKey, cesiumToken) {
    const canvas      = document.getElementById('three-canvas');
    const placeholder = document.getElementById('canvasPlaceholder');
    if (!canvas) return;

    Cesium.Ion.defaultAccessToken = cesiumToken;

    // Container div
    const mapDiv = document.createElement('div');
    mapDiv.id    = 'cesium-container';
    mapDiv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    canvas.appendChild(mapDiv);

    // Credit container (required by Cesium/Google ToS — positioned unobtrusively)
    const creditDiv = document.createElement('div');
    creditDiv.id    = 'cem-credits';
    creditDiv.style.cssText = 'position:absolute;bottom:4px;left:4px;z-index:5;pointer-events:none';
    canvas.appendChild(creditDiv);

    _cemViewer = new Cesium.Viewer(mapDiv, {
      baseLayerPicker:        false,
      geocoder:               false,
      homeButton:             false,
      sceneModePicker:        false,
      navigationHelpButton:   false,
      animation:              false,
      timeline:               false,
      fullscreenButton:       false,
      selectionIndicator:     false,
      infoBox:                false,
      imageryProvider:        false,
      shouldAnimate:          false,
      creditContainer:        creditDiv
    });

    // Auto-fit overview to all project locations
    const _initOv = _cemComputeOverview();
    _cemViewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(_initOv.lng, _initOv.lat - _initOv.latOffset, _initOv.height),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(_initOv.pitch), roll: 0 }
    });

    // Always add ESRI place-name labels as a base imagery layer.
    // These appear on flat/terrain areas and between 3D tile buildings —
    // giving street names and city labels without requiring any API key.
    _cemViewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url:    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        credit: new Cesium.Credit('© Esri', true)
      })
    );

    // Load Google Photorealistic 3D Tiles (the actual 3D mesh)
    if (mapsKey) {
      try {
        const tileset = await Cesium.Cesium3DTileset.fromUrl(
          `https://tile.googleapis.com/v1/3dtiles/root.json?key=${encodeURIComponent(mapsKey)}`
        );
        _cemViewer.scene.primitives.add(tileset);
        // Load Cesium World Terrain alongside 3D tiles so CLAMP_TO_GROUND
        // has accurate ellipsoid heights — without this, pins clamp to sea level.
        Cesium.createWorldTerrainAsync({ requestVertexNormals: false })
          .then(tp => { if (_cemViewer) _cemViewer.terrainProvider = tp; })
          .catch(() => {});
        if (placeholder) placeholder.style.display = 'none';
        if (typeof showToast === 'function') showToast('Geoscope 3D loaded', 'success');
      } catch (e) {
        console.error('[AVA GEO] Google 3D Tiles failed:', e);
        _cemLoadBaseImagery();
        if (placeholder) placeholder.style.display = 'none';
        if (typeof showToast === 'function') showToast('Geoscope terrain loaded', 'info');
      }
    } else {
      _cemLoadBaseImagery();
      if (placeholder) placeholder.style.display = 'none';
    }

    _cemAddMarkers();
    _cemAddClickHandler();
    _cemAddHUD();

    if (window.GEO_LAYERS) GEO_LAYERS.init(_cemViewer, mapsKey);

    // AVA command bridge — fly to geocoded location
    document.addEventListener('ava:flyToLatLng', ({ detail }) => {
      if (!_cemViewer) return;
      _cemViewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(detail.lng, detail.lat, 800),
        duration: 2.5
      });
    });

    // AVA command bridge — relative zoom
    document.addEventListener('ava:adjustZoom', ({ detail }) => {
      if (!_cemViewer) return;
      const cam = _cemViewer.camera;
      const pos = cam.positionCartographic;
      const newHeight = Math.max(100, pos.height * (detail.dir > 0 ? 0.5 : 2.0));
      cam.flyTo({
        destination: Cesium.Cartesian3.fromRadians(pos.longitude, pos.latitude, newHeight),
        duration: 1.0
      });
    });

    // Keep popup anchored to marker as camera moves
    _cemViewer.scene.postRender.addEventListener(() => {
      if (!_cemActivePopupSiteId) return;
      const site = typeof SITE_CONFIGS !== 'undefined' ? SITE_CONFIGS[_cemActivePopupSiteId] : null;
      if (!site) return;
      const popup = document.getElementById('cem-popup');
      if (!popup || popup.style.display === 'none') return;
      const worldPos  = Cesium.Cartesian3.fromDegrees(site.lng, site.lat, CAMPUS_ALT);
      const screenPos = _cemViewer.scene.cartesianToCanvasCoordinates(worldPos);
      if (screenPos) {
        popup.style.left = screenPos.x + 'px';
        popup.style.top  = (screenPos.y - 300) + 'px';
      }
    });
  }

  function _cemLoadBaseImagery() {
    // ESRI satellite + Cesium World Terrain — no Google key needed
    _cemViewer.scene.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url:    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        credit: 'Tiles © Esri'
      })
    );
    Cesium.createWorldTerrainAsync({ requestVertexNormals: true })
      .then(tp => { if (_cemViewer) _cemViewer.terrainProvider = tp; })
      .catch(() => {});
  }

  function _cemAddMarkers() {
    if (typeof SITE_CONFIGS === 'undefined') return;
    Object.values(SITE_CONFIGS).forEach((site, idx) => {
      if (!site.lat || !site.lng) return;
      const [r, g, b] = site.pinColor || [253, 185, 39];
      const hex       = _rgbToHex(r, g, b);

      // Use per-site elevation if available, fallback to CAMPUS_ALT
      const siteAlt   = (site.elevation || CAMPUS_ALT) + 15;

      // --- Bounce-in animation: pin drops from +40m above over 1.2s ---
      const startTime   = Cesium.JulianDate.now();
      const bounceStart = siteAlt + 40;
      const bounceDur   = 1.2;                       // seconds
      const delay       = idx * 0.25;                 // stagger per pin

      const animPosition = new Cesium.CallbackProperty(time => {
        const elapsed = Cesium.JulianDate.secondsDifference(time, startTime) - delay;
        if (elapsed < 0)        return Cesium.Cartesian3.fromDegrees(site.lng, site.lat, bounceStart);
        if (elapsed >= bounceDur) return Cesium.Cartesian3.fromDegrees(site.lng, site.lat, siteAlt);
        // ease-out bounce curve
        const t = elapsed / bounceDur;
        const ease = 1 - Math.pow(1 - t, 3);         // cubic ease-out
        const alt  = bounceStart + (siteAlt - bounceStart) * ease;
        return Cesium.Cartesian3.fromDegrees(site.lng, site.lat, alt);
      }, false);

      const entity = _cemViewer.entities.add({
        id:       site.id,
        name:     site.name,
        position: animPosition,
        billboard: {
          image:                        _pinSVG(hex),
          width:                        44,
          height:                       55,
          verticalOrigin:               Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance:      Number.POSITIVE_INFINITY,
          scaleByDistance:               new Cesium.NearFarScalar(200, 1.4, 8000, 0.5)
        },
        label: {
          text:                         site.shortName || site.name,
          font:                         '13px Inter, sans-serif',
          fillColor:                    Cesium.Color.WHITE,
          outlineColor:                 Cesium.Color.BLACK,
          outlineWidth:                 3,
          style:                        Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin:               Cesium.VerticalOrigin.TOP,
          pixelOffset:                  new Cesium.Cartesian2(0, 8),
          disableDepthTestDistance:      Number.POSITIVE_INFINITY,
          scaleByDistance:               new Cesium.NearFarScalar(200, 1.0, 8000, 0.4),
          showBackground:               true,
          backgroundColor:              new Cesium.Color(0, 0.11, 0.34, 0.75)
        }
      });

      // After bounce completes, freeze position (save CPU)
      setTimeout(() => {
        try { entity.position = Cesium.Cartesian3.fromDegrees(site.lng, site.lat, siteAlt); } catch(e) {}
      }, (delay + bounceDur + 0.5) * 1000);

      _cemEntities[site.id] = entity;
    });
  }

  function _cemAddClickHandler() {
    const handler = new Cesium.ScreenSpaceEventHandler(_cemViewer.scene.canvas);
    handler.setInputAction(evt => {
      const picked = _cemViewer.scene.pick(evt.position);
      if (Cesium.defined(picked) && picked.id instanceof Cesium.Entity) {
        const siteId = picked.id.id;
        if (typeof SITE_CONFIGS !== 'undefined' && SITE_CONFIGS[siteId]) {
          _cemFocusSite(siteId);
        }
      } else {
        _cemHidePopup();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  function _cemAddHUD() {
    const hud = document.getElementById('canvasHud');
    if (!hud) return;

    function _btn(icon, label, onClick) {
      const b = document.createElement('button');
      b.style.cssText = [
        'pointer-events:auto',
        'background:rgba(0,46,88,0.88)',
        'color:#fff',
        'border:1px solid rgba(255,255,255,0.18)',
        'border-radius:8px',
        'padding:7px 12px',
        'font-family:inherit',
        'font-size:11px',
        'font-weight:700',
        'cursor:pointer',
        'backdrop-filter:blur(8px)',
        'display:flex',
        'align-items:center',
        'gap:5px',
        'box-shadow:0 2px 8px rgba(0,0,0,0.3)',
        'transition:background 0.15s'
      ].join(';');
      b.innerHTML = `<span style="font-family:'Material Symbols Outlined';font-size:15px;font-weight:400">${icon}</span>${label}`;
      b.onmouseenter = () => { b.style.background = 'rgba(0,70,132,0.95)'; };
      b.onmouseleave = () => { b.style.background = 'rgba(0,46,88,0.88)'; };
      b.addEventListener('click', onClick);
      return b;
    }

    // Reset view
    hud.appendChild(_btn('home', 'Campus', () => _cemResetView()));

    // Ground-level walk mode
    let walkMode = false;
    const walkBtn = _btn('directions_walk', 'Walk', () => {
      walkMode = !walkMode;
      walkBtn.style.background = walkMode ? 'rgba(253,185,39,0.9)' : 'rgba(0,46,88,0.88)';
      walkBtn.style.color      = walkMode ? '#002B52' : '#fff';
      if (walkMode) {
        if (typeof showToast === 'function') showToast('Click anywhere on the Geoscope to walk there', 'info');
        _cemEnableWalkClick();
      } else {
        _cemDisableWalkClick();
      }
    });
    hud.appendChild(walkBtn);

    // North up
    hud.appendChild(_btn('explore', 'N↑', () => {
      if (!_cemViewer) return;
      const pos = _cemViewer.camera.position;
      _cemViewer.camera.flyTo({
        destination: pos,
        orientation: { heading: 0, pitch: _cemViewer.camera.pitch, roll: 0 },
        duration: 0.8
      });
    }));
  }

  let _walkHandler = null;
  function _cemEnableWalkClick() {
    if (_walkHandler) _walkHandler.destroy();
    _walkHandler = new Cesium.ScreenSpaceEventHandler(_cemViewer.scene.canvas);
    _walkHandler.setInputAction(evt => {
      // pickPosition hits the actual 3D tile surface, not the WGS84 terrain model
      const cartesian = _cemViewer.scene.pickPosition(evt.position);
      if (Cesium.defined(cartesian)) {
        const carto = Cesium.Cartographic.fromCartesian(cartesian);
        _cemViewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromRadians(
            carto.longitude, carto.latitude, carto.height + 1.7
          ),
          orientation: { heading: _cemViewer.camera.heading, pitch: Cesium.Math.toRadians(-5), roll: 0 },
          duration: 1.5
        });
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  function _cemDisableWalkClick() {
    if (_walkHandler) { _walkHandler.destroy(); _walkHandler = null; }
    // Re-attach marker click handler
    _cemAddClickHandler();
  }

  function _cemFocusSite(siteId) {
    const cfg = typeof SITE_CONFIGS !== 'undefined' ? SITE_CONFIGS[siteId] : null;
    if (!cfg?.lat || !_cemViewer) return;
    _cemViewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(cfg.lng, cfg.lat, SITE_H),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-22), roll: 0 },
      duration: 2.0
    });
    setTimeout(() => _cemShowPopup(siteId), 2200);
  }

  function _cemResetView() {
    if (!_cemViewer) return;
    _cemHidePopup();
    const ov = _cemComputeOverview();
    _cemViewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(ov.lng, ov.lat - ov.latOffset, ov.height),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(ov.pitch), roll: 0 },
      duration: 1.8
    });
  }

  // Computes a camera overview that fits all project locations, regardless of geography
  function _cemComputeOverview() {
    const sites = typeof SITE_CONFIGS !== 'undefined'
      ? Object.values(SITE_CONFIGS).filter(s => s.lat && s.lng)
      : [];
    if (!sites.length) return { lng: CAMPUS_CENTER.lng, lat: CAMPUS_CENTER.lat, height: CAMPUS_ALT + 500, pitch: -50, latOffset: 0.018 };

    const lats = sites.map(s => s.lat);
    const lngs = sites.map(s => s.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    const spanM = Math.max(
      (maxLat - minLat) * 111000,
      (maxLng - minLng) * 83500,
      500
    );
    // 1.5x span gives comfortable margin; cap at 15 km to keep 3D tiles usable
    const altAboveTerrain = Math.min(spanM * 1.5, 15000);

    if (spanM > 1000) {
      // Multiple spread-out sites: look straight down so all markers are in frame
      return { lng: centerLng, lat: centerLat, height: CAMPUS_ALT + altAboveTerrain, pitch: -90, latOffset: 0 };
    }
    // Tight cluster: use perspective pitch with south offset
    const latOffset = (altAboveTerrain * 0.839) / 111000;
    return { lng: centerLng, lat: centerLat, height: CAMPUS_ALT + altAboveTerrain, pitch: -50, latOffset };
  }

  function _cemShowPopup(siteId) {
    const site = typeof SITE_CONFIGS !== 'undefined' ? SITE_CONFIGS[siteId] : null;
    if (!site || !_cemViewer) return;

    let popup = document.getElementById('cem-popup');
    if (!popup) {
      popup = document.createElement('div');
      popup.id = 'cem-popup';
      popup.style.cssText = [
        'position:absolute',
        'z-index:50',
        'pointer-events:auto',
        'transform:translateX(-50%)',
        'transition:opacity 0.2s'
      ].join(';');
      document.getElementById('three-canvas').appendChild(popup);
    }

    _cemActivePopupSiteId = siteId;
    popup.innerHTML = _popupHTML(site);
    popup.style.display = 'block';
    popup.style.opacity = '0';

    // Initial position — postRender listener keeps it tracked as camera moves
    const worldPos  = Cesium.Cartesian3.fromDegrees(site.lng, site.lat, CAMPUS_ALT);
    const screenPos = _cemViewer.scene.cartesianToCanvasCoordinates(worldPos);
    if (screenPos) {
      popup.style.left = screenPos.x + 'px';
      popup.style.top  = (screenPos.y - 300) + 'px';
    } else {
      const c = document.getElementById('three-canvas');
      popup.style.left = (c.offsetWidth / 2) + 'px';
      popup.style.top  = '60px';
    }

    requestAnimationFrame(() => { popup.style.opacity = '1'; });
  }

  function _cemHidePopup() {
    _cemActivePopupSiteId = null;
    const popup = document.getElementById('cem-popup');
    if (popup) popup.style.display = 'none';
  }

  /* ════════════════════════════════════════════════════════
     MODE B — GOOGLE MAPS JS API  (tilt:45 fallback)
  ════════════════════════════════════════════════════════ */

  function _loadGoogleMaps(key) {
    window._gmapsReady = _gmOnLoaded;
    const s    = document.createElement('script');
    s.src      = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places,elevation&callback=_gmapsReady`;
    s.async    = true;
    s.onerror  = () => {
      console.error('[AVA GEO] Google Maps script failed — falling back to Leaflet');
      _mode = 'leaflet';
      _initLeaflet();
    };
    document.head.appendChild(s);
  }

  function _gmOnLoaded() {
    const canvas      = document.getElementById('three-canvas');
    const placeholder = document.getElementById('canvasPlaceholder');
    if (!canvas) return;

    const mapDiv = document.createElement('div');
    mapDiv.id    = 'google-map';
    mapDiv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:1';
    canvas.appendChild(mapDiv);

    _gmMap = new google.maps.Map(mapDiv, {
      center:                   { lat: CAMPUS_CENTER.lat, lng: CAMPUS_CENTER.lng },
      zoom:                     CAMPUS_ZOOM_G,
      mapTypeId:                google.maps.MapTypeId.HYBRID,
      tilt:                     45,
      heading:                  0,
      rotateControl:            false,
      streetViewControl:        false,
      scaleControl:             false,
      fullscreenControl:        true,
      fullscreenControlOptions: { position: google.maps.ControlPosition.TOP_RIGHT },
      zoomControl:              true,
      zoomControlOptions:       { position: google.maps.ControlPosition.RIGHT_BOTTOM },
      mapTypeControl:           false,
      gestureHandling:          'greedy',
      styles: [
        { featureType: 'poi',     elementType: 'labels', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] }
      ]
    });

    _elevSvc   = new google.maps.ElevationService();
    _placesSvc = new google.maps.places.PlacesService(_gmMap);

    google.maps.event.addListenerOnce(_gmMap, 'tilesloaded', () => {
      if (placeholder) placeholder.style.display = 'none';
      if (typeof showToast === 'function') showToast('Geoscope loaded', 'success');
    });

    _gmAddMarkers();
    _gmAddTiltControls();
  }

  function _gmAddMarkers() {
    if (typeof SITE_CONFIGS === 'undefined') return;
    Object.values(SITE_CONFIGS).forEach(site => {
      if (!site.lat || !site.lng) return;
      const [r, g, b] = site.pinColor || [253, 185, 39];
      const hex = _rgbToHex(r, g, b);

      const marker = new google.maps.Marker({
        position:  { lat: site.lat, lng: site.lng },
        map:       _gmMap,
        title:     site.name,
        animation: google.maps.Animation.DROP,
        icon: {
          url:        _pinSVG(hex),
          scaledSize: new google.maps.Size(40, 50),
          anchor:     new google.maps.Point(20, 50)
        }
      });

      const infoWin = new google.maps.InfoWindow({ content: _popupHTML(site), maxWidth: 260 });
      marker.addListener('click', () => {
        Object.values(_gmInfoWin).forEach(iw => iw.close());
        infoWin.open(_gmMap, marker);
        _fetchElevation(site);
      });

      _gmMarkers[site.id] = marker;
      _gmInfoWin[site.id] = infoWin;
    });
  }

  function _gmFocusSite(siteId) {
    const cfg = typeof SITE_CONFIGS !== 'undefined' ? SITE_CONFIGS[siteId] : null;
    if (!cfg?.lat || !_gmMap) return;
    _gmMap.panTo({ lat: cfg.lat, lng: cfg.lng });
    _gmMap.setZoom(SITE_ZOOM_G);
    _gmMap.setTilt(45);
    Object.values(_gmInfoWin).forEach(iw => iw.close());
    setTimeout(() => {
      if (_gmInfoWin[siteId] && _gmMarkers[siteId]) {
        _gmInfoWin[siteId].open(_gmMap, _gmMarkers[siteId]);
      }
    }, 600);
  }

  function _gmResetView() {
    if (!_gmMap) return;
    Object.values(_gmInfoWin).forEach(iw => iw.close());
    _gmMap.panTo({ lat: CAMPUS_CENTER.lat, lng: CAMPUS_CENTER.lng });
    _gmMap.setZoom(CAMPUS_ZOOM_G);
    _gmMap.setTilt(0);
  }

  function _gmAddTiltControls() {
    if (!_gmMap) return;
    const panel = document.createElement('div');
    panel.style.cssText = [
      'margin:48px 10px 0 0',
      'display:flex','flex-direction:column','gap:6px',
      'align-items:center','user-select:none'
    ].join(';');

    function _btn(icon, title, onClick) {
      const b = document.createElement('button');
      b.title   = title;
      b.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px;line-height:1">${icon}</span>`;
      b.style.cssText = [
        'width:36px','height:36px','border-radius:8px','border:none',
        'background:rgba(255,255,255,0.95)','color:#004684',
        'box-shadow:0 2px 8px rgba(0,0,0,0.18)','cursor:pointer',
        'display:flex','align-items:center','justify-content:center',
        'transition:background 0.15s'
      ].join(';');
      b.onmouseenter = () => { b.style.background = '#004684'; b.style.color = '#FDB927'; };
      b.onmouseleave = () => { b.style.background = 'rgba(255,255,255,0.95)'; b.style.color = '#004684'; };
      b.onclick = onClick;
      return b;
    }

    const tiltLabel = document.createElement('div');
    tiltLabel.style.cssText = 'font:600 10px/1 Inter,sans-serif;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,0.6);letter-spacing:.5px';
    tiltLabel.textContent = '45°';

    const slider = document.createElement('input');
    slider.type  = 'range'; slider.min = '0'; slider.max = '67'; slider.step = '5'; slider.value = '45';
    slider.style.cssText = ['writing-mode:vertical-lr','direction:rtl','width:32px','height:80px','cursor:pointer','accent-color:#004684'].join(';');
    slider.title = 'Drag to tilt';
    slider.oninput = () => { _gmMap.setTilt(parseInt(slider.value)); tiltLabel.textContent = slider.value + '°'; };
    google.maps.event.addListener(_gmMap, 'tilt_changed', () => {
      slider.value = Math.round(_gmMap.getTilt()); tiltLabel.textContent = slider.value + '°';
    });

    panel.appendChild(_btn('keyboard_arrow_up', 'Tilt up', () => {
      const t = Math.min(67, (_gmMap.getTilt() || 0) + 15);
      _gmMap.setTilt(t); tiltLabel.textContent = t + '°'; slider.value = t;
    }));
    panel.appendChild(slider);
    panel.appendChild(tiltLabel);
    panel.appendChild(_btn('keyboard_arrow_down', 'Tilt down', () => {
      const t = Math.max(0, (_gmMap.getTilt() || 0) - 15);
      _gmMap.setTilt(t); tiltLabel.textContent = t + '°'; slider.value = t;
    }));

    function _sep() {
      const d = document.createElement('div');
      d.style.cssText = 'width:28px;height:1px;background:rgba(255,255,255,0.4)';
      return d;
    }
    panel.appendChild(_sep());
    panel.appendChild(_btn('rotate_left',  'Rotate CCW', () => { _gmMap.setHeading((_gmMap.getHeading() - 15 + 360) % 360); }));
    panel.appendChild(_btn('rotate_right', 'Rotate CW',  () => { _gmMap.setHeading((_gmMap.getHeading() + 15) % 360); }));
    panel.appendChild(_sep());
    panel.appendChild(_btn('explore', 'Reset north', () => {
      _gmMap.setHeading(0); _gmMap.setTilt(0);
      slider.value = '0'; tiltLabel.textContent = '0°';
    }));

    _gmMap.controls[google.maps.ControlPosition.RIGHT_CENTER].push(panel);
  }

  function _fetchElevation(site) {
    if (!_elevSvc) return;
    _elevSvc.getElevationForLocations(
      { locations: [{ lat: site.lat, lng: site.lng }] },
      (results, status) => {
        if (status === 'OK' && results[0]) {
          console.log(`[AVA GEO] ${site.name} elevation: ${results[0].elevation.toFixed(1)} m`);
        }
      }
    );
  }

  function searchNearby(type, callback) {
    if (!_placesSvc || !_gmMap) return;
    _placesSvc.nearbySearch({ location: _gmMap.getCenter(), radius: 800, type }, callback);
  }

  /* ════════════════════════════════════════════════════════
     MODE C — LEAFLET + ESRI  (zero-config fallback)
  ════════════════════════════════════════════════════════ */

  function _initLeaflet() {
    if (typeof L === 'undefined') { console.error('[AVA GEO] Leaflet not loaded'); return; }
    const canvas      = document.getElementById('three-canvas');
    const placeholder = document.getElementById('canvasPlaceholder');
    if (!canvas) return;

    const mapDiv = document.createElement('div');
    mapDiv.id    = 'leaflet-map';
    mapDiv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:1';
    canvas.appendChild(mapDiv);

    const satLayer   = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles © Esri', maxZoom: 20, maxNativeZoom: 19 }
    );
    const labelLayer = L.tileLayer(
      'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Labels © Esri', maxZoom: 20, opacity: 0.9 }
    );

    _lfMap = L.map('leaflet-map', {
      center: [CAMPUS_CENTER.lat, CAMPUS_CENTER.lng],
      zoom:   CAMPUS_ZOOM_L,
      layers: [satLayer, labelLayer]
    });

    _lfStyleControls();
    setTimeout(() => { if (placeholder) placeholder.style.display = 'none'; }, 1200);
    _lfAddMarkers();
  }

  function _lfAddMarkers() {
    if (typeof SITE_CONFIGS === 'undefined') return;
    Object.values(SITE_CONFIGS).forEach(site => {
      if (!site.lat || !site.lng) return;
      const [r, g, b] = site.pinColor || [253, 185, 39];
      const hex = _rgbToHex(r, g, b);

      const icon = L.divIcon({
        className:   '',
        html:        _pinSVG(hex),
        iconSize:    [36, 46],
        iconAnchor:  [18, 46],
        popupAnchor: [0, -50]
      });

      const marker = L.marker([site.lat, site.lng], { icon, title: site.name })
        .addTo(_lfMap)
        .bindPopup(_popupHTML(site), { maxWidth: 260, className: 'ava-map-popup' });

      _lfMarkers[site.id] = marker;
    });
  }

  function _lfFocusSite(siteId) {
    const cfg = typeof SITE_CONFIGS !== 'undefined' ? SITE_CONFIGS[siteId] : null;
    if (!cfg?.lat || !_lfMap) return;
    _lfMap.setView([cfg.lat, cfg.lng], SITE_ZOOM_L, { animate: true, duration: 1.2 });
    setTimeout(() => _lfMarkers[siteId]?.openPopup(), 800);
  }

  function _lfResetView() {
    if (!_lfMap) return;
    _lfMap.closePopup();
    _lfMap.setView([CAMPUS_CENTER.lat, CAMPUS_CENTER.lng], CAMPUS_ZOOM_L, { animate: true });
  }

  function _lfStyleControls() {
    const s = document.createElement('style');
    s.textContent = `
      .leaflet-control-zoom a { background:rgba(0,70,132,.9)!important; color:#fff!important; font-weight:700!important; border-color:rgba(255,255,255,.2)!important; }
      .leaflet-control-zoom a:hover { background:#004684!important; }
      .leaflet-control-attribution { font-size:9px!important; background:rgba(0,0,0,.5)!important; color:rgba(255,255,255,.6)!important; }
      .leaflet-control-attribution a { color:rgba(255,255,255,.7)!important; }
      .ava-map-popup .leaflet-popup-content-wrapper { border-radius:12px!important; box-shadow:0 8px 32px rgba(0,0,0,.18)!important; padding:0!important; overflow:hidden; }
      .ava-map-popup .leaflet-popup-content { margin:14px!important; }
      .ava-map-popup .leaflet-popup-tip-container { display:none; }
    `;
    document.head.appendChild(s);
  }

  /* ════════════════════════════════════════════════════════
     SHARED HELPERS
  ════════════════════════════════════════════════════════ */

  function _popupHTML(site) {
    const [r, g, b] = site.pinColor || [253, 185, 39];
    const accent = _rgbToHex(r, g, b);
    const score  = site.baselineScore || 0;
    const pct    = Math.round((score / 200) * 100);
    return `
      <div style="font-family:'Inter',system-ui,sans-serif;width:220px">
        <img src="${site.baselineImage}" alt="${site.name}"
             style="width:100%;height:110px;object-fit:cover;border-radius:8px;margin-bottom:8px;display:block">
        <div style="font-size:13px;font-weight:800;color:#002B52;margin-bottom:2px">${site.name}</div>
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#777;margin-bottom:8px">${site.college}</div>
        <div style="background:#f5f6fa;border-radius:6px;padding:6px 10px;margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">
            <span style="color:#666">SITES v2 Baseline</span>
            <strong style="color:#004684">${score}/200</strong>
          </div>
          <div style="background:#e0e0e0;border-radius:4px;height:6px;overflow:hidden">
            <div style="background:${accent};width:${pct}%;height:100%;border-radius:4px"></div>
          </div>
        </div>
        <button onclick="openSiteCard('${site.id}')"
                style="width:100%;padding:9px;background:linear-gradient(135deg,#004684,#002B52);color:#fff;
                       border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:13px;
                       font-weight:700;letter-spacing:.3px">
          Design with AVA →
        </button>
      </div>`;
  }

  function _pinSVG(hex) {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="50" viewBox="0 0 40 50">
        <filter id="sh"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity=".3"/></filter>
        <path filter="url(#sh)"
              d="M20 2C11.16 2 4 9.16 4 18c0 12 16 30 16 30S36 30 36 18C36 9.16 28.84 2 20 2z"
              fill="${hex}" stroke="white" stroke-width="2.5"/>
        <circle cx="20" cy="18" r="7" fill="white" opacity=".9"/>
      </svg>`)}`;
  }

  function _rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  /* ── Marker refresh (called after Firestore projects merge) ── */

  function _cemRefreshMarkers() {
    if (!_cemViewer || typeof SITE_CONFIGS === 'undefined') return;
    Object.values(SITE_CONFIGS).forEach(site => {
      if (!site.lat || !site.lng || _cemEntities[site.id]) return;
      const [r, g, b] = site.pinColor || [253, 185, 39];
      const entity = _cemViewer.entities.add({
        id:       site.id,
        name:     site.name,
        position: Cesium.Cartesian3.fromDegrees(site.lng, site.lat, CAMPUS_ALT + 15),
        billboard: {
          image:                    _pinSVG(_rgbToHex(r, g, b)),
          width:                    44,
          height:                   55,
          verticalOrigin:           Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance:          new Cesium.NearFarScalar(200, 1.4, 8000, 0.5)
        }
      });
      _cemEntities[site.id] = entity;
    });
  }

  function _gmRefreshMarkers() {
    if (!_gmMap || typeof SITE_CONFIGS === 'undefined') return;
    Object.values(SITE_CONFIGS).forEach(site => {
      if (!site.lat || !site.lng || _gmMarkers[site.id]) return;
      const [r, g, b] = site.pinColor || [253, 185, 39];
      const marker = new google.maps.Marker({
        position: { lat: site.lat, lng: site.lng },
        map: _gmMap, title: site.name,
        animation: google.maps.Animation.DROP,
        icon: { url: _pinSVG(_rgbToHex(r, g, b)), scaledSize: new google.maps.Size(40, 50), anchor: new google.maps.Point(20, 50) }
      });
      const infoWin = new google.maps.InfoWindow({ content: _popupHTML(site), maxWidth: 260 });
      marker.addListener('click', () => {
        Object.values(_gmInfoWin).forEach(iw => iw.close());
        infoWin.open(_gmMap, marker);
      });
      _gmMarkers[site.id] = marker;
      _gmInfoWin[site.id] = infoWin;
    });
  }

  function _lfRefreshMarkers() {
    if (!_lfMap || typeof SITE_CONFIGS === 'undefined') return;
    Object.values(SITE_CONFIGS).forEach(site => {
      if (!site.lat || !site.lng || _lfMarkers[site.id]) return;
      const [r, g, b] = site.pinColor || [253, 185, 39];
      const icon = L.divIcon({ className: '', html: _pinSVG(_rgbToHex(r, g, b)), iconSize: [36, 46], iconAnchor: [18, 46], popupAnchor: [0, -50] });
      const marker = L.marker([site.lat, site.lng], { icon, title: site.name })
        .addTo(_lfMap)
        .bindPopup(_popupHTML(site), { maxWidth: 260, className: 'ava-map-popup' });
      _lfMarkers[site.id] = marker;
    });
  }

  function refreshMarkers() {
    if (_mode === 'cesium')       _cemRefreshMarkers();
    else if (_mode === 'google')  _gmRefreshMarkers();
    else if (_mode === 'leaflet') _lfRefreshMarkers();
  }

  return {
    init, focusSite, resetView, isReady, searchNearby, refreshMarkers,
    hidePopup: _cemHidePopup,
    get mode() { return _mode; }
  };
})();
