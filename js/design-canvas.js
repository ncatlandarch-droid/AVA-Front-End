/* design-canvas.js — SVG vector design layer for the AVA Geoscope workspace
   Renders landscape architecture design elements as accurate geo-referenced SVG
   on top of the design viewport. Works alongside or independently of Gemini image generation.
*/

const DC_STYLES = {
  tree:        { stroke: '#1A5C1A', fill: 'rgba(34,111,34,0.60)',  sw: 1.5, label: 'Tree' },
  shrub:       { stroke: '#3D7A3D', fill: 'rgba(80,145,80,0.50)',  sw: 1,   label: 'Shrub' },
  meadow:      { stroke: '#7A9B3A', fill: 'rgba(155,190,75,0.40)', sw: 1,   label: 'Meadow / Groundcover' },
  rain_garden: { stroke: '#1255A0', fill: 'rgba(25,95,195,0.30)',  sw: 2,   label: 'Rain Garden' },
  bioswale:    { stroke: '#1976D2', fill: 'none',                  sw: 4,   label: 'Bioswale' },
  plaza:       { stroke: '#9C7A3A', fill: 'rgba(210,185,125,0.50)',sw: 1.5, label: 'Plaza / Gathering' },
  path:        { stroke: '#8D6030', fill: 'rgba(175,135,70,0.65)', sw: 3,   label: 'Path / Walkway' },
  water:       { stroke: '#0277BD', fill: 'rgba(2,119,189,0.38)',  sw: 1.5, label: 'Water Feature' },
  solar:       { stroke: '#B8940A', fill: 'rgba(253,185,39,0.38)', sw: 1.5, label: 'Solar Structure' },
  seating:     { stroke: '#5D4037', fill: 'rgba(121,85,72,0.45)',  sw: 1,   label: 'Seating Area' },
  cistern:     { stroke: '#0D47A1', fill: 'rgba(13,71,161,0.42)',  sw: 1.5, label: 'Stormwater Cistern' },
  green_roof:  { stroke: '#2E6B0E', fill: 'rgba(90,170,45,0.48)', sw: 1,   label: 'Green Roof' },
  amphitheater:{ stroke: '#6D4C1F', fill: 'rgba(160,115,60,0.40)',sw: 1.5, label: 'Amphitheater' },
  signage:     { stroke: '#37474F', fill: 'rgba(96,125,139,0.50)', sw: 1,   label: 'Interpretive Signage' },
};

// 1 degree of latitude ≈ 364,000 ft; longitude scales by cos(lat)
const LAT_FT_PER_DEG = 364000;
const IMG_W = 800;
const IMG_H = 600;

window.DESIGN_CANVAS = (() => {
  let _elements = [];
  let _bounds = null;   // { s, w, n, e } — padded image bounds
  let _svg = null;
  let _viewportId = null;

  function _lngFtPerDeg() {
    if (!_bounds) return LAT_FT_PER_DEG;
    const midLat = (_bounds.n + _bounds.s) / 2;
    return LAT_FT_PER_DEG * Math.cos(midLat * Math.PI / 180);
  }

  function _toXY(lat, lng) {
    if (!_bounds) return { x: 0, y: 0 };
    return {
      x: ((lng - _bounds.w) / (_bounds.e - _bounds.w)) * IMG_W,
      y: ((_bounds.n - lat) / (_bounds.n - _bounds.s)) * IMG_H,
    };
  }

  function _ftToPixH(ft) {
    if (!_bounds) return 4;
    return (ft / ((_bounds.n - _bounds.s) * LAT_FT_PER_DEG)) * IMG_H;
  }

  function _ftToPixW(ft) {
    if (!_bounds) return 4;
    return (ft / ((_bounds.e - _bounds.w) * _lngFtPerDeg())) * IMG_W;
  }

  function init(viewportId, bounds) {
    _viewportId = viewportId;
    _bounds = bounds;
    _elements = [];
    _mountSVG();
  }

  function _mountSVG() {
    const viewport = document.getElementById(_viewportId);
    if (!viewport) return;
    _svg?.remove();
    _svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    _svg.classList.add('design-canvas-svg');
    _svg.setAttribute('viewBox', `0 0 ${IMG_W} ${IMG_H}`);
    _svg.setAttribute('preserveAspectRatio', 'none');
    _buildDefs();
    viewport.appendChild(_svg);
  }

  function _buildDefs() {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

    // Radial gradient for trees (lighter center = natural canopy look)
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
    grad.id = 'dc-tree-grad';
    [['0%','#7DC87D'], ['60%','#2E882E'], ['100%','#1A5C1A']].forEach(([off, col]) => {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      s.setAttribute('offset', off); s.setAttribute('stop-color', col);
      grad.appendChild(s);
    });
    defs.appendChild(grad);

    // Hatch pattern for bioswale / rain garden
    const hatch = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    hatch.id = 'dc-water-hatch'; hatch.setAttribute('patternUnits', 'userSpaceOnUse');
    hatch.setAttribute('width', '6'); hatch.setAttribute('height', '6');
    hatch.setAttribute('patternTransform', 'rotate(45)');
    const hLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    hLine.setAttribute('x1', '0'); hLine.setAttribute('y1', '0');
    hLine.setAttribute('x2', '0'); hLine.setAttribute('y2', '6');
    hLine.setAttribute('stroke', '#1976D2'); hLine.setAttribute('stroke-width', '1');
    hatch.appendChild(hLine);
    defs.appendChild(hatch);

    _svg.appendChild(defs);
  }

  function _clampToBounds(elements) {
    if (!_bounds) return elements;
    const { s, w, n, e } = _bounds;
    const clampLat = lat => Math.max(s, Math.min(n, lat));
    const clampLng = lng => Math.max(w, Math.min(e, lng));
    return elements.map(el => {
      const out = { ...el };
      if (out.lat != null) { out.lat = clampLat(out.lat); out.lng = clampLng(out.lng); }
      if (out.points)  out.points  = out.points.map(([lat, lng]) => [clampLat(lat), clampLng(lng)]);
      if (out.polygon) out.polygon = out.polygon.map(([lat, lng]) => [clampLat(lat), clampLng(lng)]);
      return out;
    });
  }

  function addElements(newElements) {
    if (!Array.isArray(newElements) || !newElements.length) return;
    _elements.push(..._clampToBounds(newElements));
    _render();
    // Ensure SVG is mounted on the correct viewport (designed view may not exist at init time)
    if (_svg && !_svg.isConnected) _mountSVG();
  }

  function clear() {
    _elements = [];
    if (_svg) { _svg.innerHTML = ''; _buildDefs(); }
  }

  function show(viewportId) {
    if (viewportId && viewportId !== _viewportId) {
      _viewportId = viewportId;
      _mountSVG();
      _render();
    }
    if (_svg) _svg.style.display = '';
  }

  function hide() { if (_svg) _svg.style.display = 'none'; }

  function _render() {
    if (!_svg) return;
    // Remove all children except defs
    Array.from(_svg.children).forEach(c => { if (c.tagName !== 'defs') c.remove(); });
    // Draw paths first (roads / bioswales) then fills then trees on top
    const order = ['path','bioswale','plaza','meadow','water','rain_garden','cistern','seating','amphitheater','green_roof','solar','signage','shrub','tree'];
    const sorted = [..._elements].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
    sorted.forEach(el => _drawElement(el));
  }

  function _drawElement(el) {
    const st = DC_STYLES[el.type] || DC_STYLES.tree;
    let node = null;

    if (el.type === 'bioswale' || el.type === 'path') {
      if (!el.points?.length) return;
      const pts = el.points.map(([lat, lng]) => {
        const { x, y } = _toXY(lat, lng);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      node = _el('polyline', {
        points: pts, fill: 'none',
        stroke: st.stroke, 'stroke-width': _ftToPixW(el.widthFt || (el.type === 'path' ? 10 : 8)).toFixed(1),
        'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: '0.88'
      });
    } else if (el.polygon?.length) {
      const pts = el.polygon.map(([lat, lng]) => {
        const { x, y } = _toXY(lat, lng);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      node = _el('polygon', {
        points: pts, fill: st.fill,
        stroke: st.stroke, 'stroke-width': st.sw, 'stroke-linejoin': 'round', opacity: '0.85'
      });
    } else if (el.lat != null && el.lng != null) {
      const { x, y } = _toXY(el.lat, el.lng);
      const rH = Math.max(_ftToPixH(el.radiusFt || 18), 3);
      const rW = Math.max(_ftToPixW(el.radiusFt || 18), 3);

      if (el.type === 'tree') {
        node = _el('circle', {
          cx: x.toFixed(1), cy: y.toFixed(1), r: rH.toFixed(1),
          fill: 'url(#dc-tree-grad)', stroke: st.stroke, 'stroke-width': '1', opacity: '0.88'
        });
        // Tree trunk dot
        const trunk = _el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: Math.max(rH * 0.12, 1).toFixed(1), fill: '#5C3A1A' });
        _svg.appendChild(trunk);
      } else if (el.type === 'rain_garden' || el.type === 'cistern') {
        node = _el('ellipse', {
          cx: x.toFixed(1), cy: y.toFixed(1), rx: rW.toFixed(1), ry: rH.toFixed(1),
          fill: 'url(#dc-water-hatch)', stroke: st.stroke, 'stroke-width': st.sw, 'stroke-dasharray': '4,2', opacity: '0.85'
        });
      } else {
        node = _el('ellipse', {
          cx: x.toFixed(1), cy: y.toFixed(1), rx: rW.toFixed(1), ry: rH.toFixed(1),
          fill: st.fill, stroke: st.stroke, 'stroke-width': st.sw, opacity: '0.85'
        });
      }

      // Label for named non-tree elements
      if (el.label && el.type !== 'tree' && el.type !== 'shrub') {
        const txt = _el('text', {
          x: x.toFixed(1), y: (y - rH - 2).toFixed(1),
          'text-anchor': 'middle', 'font-size': '7', 'font-family': 'sans-serif',
          fill: st.stroke, 'font-weight': '700', opacity: '0.95'
        });
        txt.textContent = el.label;
        _svg.appendChild(txt);
      }
    }

    if (node) {
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = el.label || st.label;
      node.appendChild(title);
      _svg.appendChild(node);
    }
  }

  function _el(tag, attrs) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    return n;
  }

  // Parse AVA response text for a DESIGN_ELEMENTS JSON block
  function parseFromText(text) {
    const match = text?.match(/DESIGN_ELEMENTS:\s*(\[[\s\S]*?\])/);
    if (!match) return [];
    try { return JSON.parse(match[1]); } catch { return []; }
  }

  // Text description of current elements for the Render Plan prompt
  function getSummary() {
    if (!_elements.length) return 'No design elements yet.';
    const counts = {};
    _elements.forEach(el => { counts[el.type] = (counts[el.type] || 0) + 1; });
    return Object.entries(counts)
      .map(([t, c]) => `${c}× ${DC_STYLES[t]?.label || t}`)
      .join(', ');
  }

  function toSVGString() {
    return _svg ? _svg.outerHTML : '';
  }

  return { init, addElements, clear, show, hide, parseFromText, getSummary, toSVGString, get elements() { return [..._elements]; } };
})();
