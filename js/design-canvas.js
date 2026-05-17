/* design-canvas.js — SVG vector design layer + interactive drawing tools
   Renders geo-referenced landscape elements on the plan view canvas.
   Drawing tools: point placement, polyline (path/bioswale), polygon (areas).
*/

const DC_STYLES = {
  tree:        { stroke: '#1A5C1A', fill: 'rgba(34,111,34,0.60)',   sw: 1.5, label: 'Tree' },
  shrub:       { stroke: '#3D7A3D', fill: 'rgba(80,145,80,0.50)',   sw: 1,   label: 'Shrub' },
  meadow:      { stroke: '#7A9B3A', fill: 'rgba(155,190,75,0.40)',  sw: 1,   label: 'Meadow / Groundcover' },
  rain_garden: { stroke: '#1255A0', fill: 'rgba(25,95,195,0.30)',   sw: 2,   label: 'Rain Garden' },
  bioswale:    { stroke: '#1976D2', fill: 'none',                   sw: 4,   label: 'Bioswale' },
  plaza:       { stroke: '#9C7A3A', fill: 'rgba(210,185,125,0.50)', sw: 1.5, label: 'Plaza / Gathering' },
  path:        { stroke: '#8D6030', fill: 'rgba(175,135,70,0.65)',  sw: 3,   label: 'Path / Walkway' },
  water:       { stroke: '#0277BD', fill: 'rgba(2,119,189,0.38)',   sw: 1.5, label: 'Water Feature' },
  solar:       { stroke: '#B8940A', fill: 'rgba(253,185,39,0.38)',  sw: 1.5, label: 'Solar Structure' },
  seating:     { stroke: '#5D4037', fill: 'rgba(121,85,72,0.45)',   sw: 1,   label: 'Seating Area' },
  cistern:     { stroke: '#0D47A1', fill: 'rgba(13,71,161,0.42)',   sw: 1.5, label: 'Stormwater Cistern' },
  green_roof:  { stroke: '#2E6B0E', fill: 'rgba(90,170,45,0.48)',   sw: 1,   label: 'Green Roof' },
  amphitheater:{ stroke: '#6D4C1F', fill: 'rgba(160,115,60,0.40)',  sw: 1.5, label: 'Amphitheater' },
  signage:     { stroke: '#37474F', fill: 'rgba(96,125,139,0.50)',  sw: 1,   label: 'Interpretive Signage' },
};

const LAT_FT_PER_DEG = 364000;
const IMG_W = 800;
const IMG_H = 600;

const _POINT_TYPES    = new Set(['tree','shrub','seating','cistern','rain_garden','signage']);
const _POLYLINE_TYPES = new Set(['path','bioswale']);
const _POLYGON_TYPES  = new Set(['meadow','plaza','water','solar','green_roof','amphitheater']);

window.DESIGN_CANVAS = (() => {
  let _elements    = [];
  let _bounds      = null;
  let _svg         = null;
  let _viewportId  = null;

  // ── Drawing state ────────────────────────────────────────────────
  let _drawMode    = 'select';  // 'select' | 'place' | 'polyline' | 'polygon'
  let _drawType    = 'tree';
  let _inProgress  = null;      // { points: [[lat,lng],...] } during line/polygon
  let _selectedIdx = -1;
  let _ghostGroup  = null;

  // ── Coordinate helpers ───────────────────────────────────────────
  function _lngFtPerDeg() {
    if (!_bounds) return LAT_FT_PER_DEG;
    return LAT_FT_PER_DEG * Math.cos(((_bounds.n + _bounds.s) / 2) * Math.PI / 180);
  }
  function _toXY(lat, lng) {
    if (!_bounds) return { x: 0, y: 0 };
    return {
      x: ((lng - _bounds.w) / (_bounds.e - _bounds.w)) * IMG_W,
      y: ((_bounds.n - lat) / (_bounds.n - _bounds.s)) * IMG_H,
    };
  }
  function _fromXY(svgX, svgY) {
    if (!_bounds) return { lat: 0, lng: 0 };
    return {
      lat: _bounds.n - (svgY / IMG_H) * (_bounds.n - _bounds.s),
      lng: _bounds.w + (svgX / IMG_W) * (_bounds.e - _bounds.w),
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
  function _getSVGPoint(evt) {
    const pt = _svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(_svg.getScreenCTM().inverse());
  }
  function _defaultRadius(type) {
    return { tree:18, shrub:8, seating:10, cistern:12, rain_garden:20, signage:5 }[type] || 15;
  }

  // ── Hit testing ──────────────────────────────────────────────────
  function _hitTest(svgX, svgY) {
    for (let i = _elements.length - 1; i >= 0; i--) {
      const el = _elements[i];
      if (el.lat != null) {
        const { x, y } = _toXY(el.lat, el.lng);
        const r = Math.max(_ftToPixH(el.radiusFt || 18), 5);
        if (Math.hypot(svgX - x, svgY - y) <= r + 6) return i;
      }
      const pts = el.points || el.polygon;
      if (pts?.length) {
        const mapped = pts.map(([la, ln]) => _toXY(la, ln));
        const minX = Math.min(...mapped.map(p => p.x)) - 8;
        const maxX = Math.max(...mapped.map(p => p.x)) + 8;
        const minY = Math.min(...mapped.map(p => p.y)) - 8;
        const maxY = Math.max(...mapped.map(p => p.y)) + 8;
        if (svgX >= minX && svgX <= maxX && svgY >= minY && svgY <= maxY) return i;
      }
    }
    return -1;
  }

  // ── SVG event handlers ───────────────────────────────────────────
  function _onSVGClick(evt) {
    if (!_svg || evt.detail >= 2) return;
    const sp = _getSVGPoint(evt);
    const { lat, lng } = _fromXY(sp.x, sp.y);

    if (_drawMode === 'select') {
      _selectedIdx = _hitTest(sp.x, sp.y);
      _render();
      const deleteBtn = document.getElementById('btnDrawDelete');
      if (deleteBtn) deleteBtn.style.opacity = _selectedIdx >= 0 ? '1' : '0.4';
      return;
    }
    if (_drawMode === 'place') {
      _elements.push({
        type: _drawType, lat, lng,
        radiusFt: _defaultRadius(_drawType),
        label: DC_STYLES[_drawType]?.label || _drawType,
      });
      _render();
      _notifyChange();
      return;
    }
    // polyline / polygon: accumulate vertices
    if (!_inProgress) _inProgress = { points: [] };
    _inProgress.points.push([lat, lng]);
    _refreshGhost();
  }

  function _onSVGDblClick(evt) {
    if (!_svg || (_drawMode !== 'polyline' && _drawMode !== 'polygon')) return;
    const pts = _inProgress?.points || [];
    const minPts = _drawMode === 'polygon' ? 3 : 2;
    if (pts.length < minPts) { _inProgress = null; _refreshGhost(); return; }

    const newEl = { type: _drawType, label: DC_STYLES[_drawType]?.label || _drawType };
    if (_drawMode === 'polyline') {
      newEl.points = pts.slice();
      newEl.widthFt = _drawType === 'path' ? 10 : 8;
    } else {
      newEl.polygon = pts.slice();
    }
    _inProgress = null;
    _refreshGhost();
    _elements.push(newEl);
    _render();
    _notifyChange();
  }

  function _onSVGMouseMove(evt) {
    if (!_inProgress?.points?.length || !_svg) return;
    _refreshGhost(_getSVGPoint(evt));
  }

  function _refreshGhost(mousePos) {
    if (_ghostGroup) { _ghostGroup.remove(); _ghostGroup = null; }
    if (!_svg || !_inProgress?.points?.length) return;

    _ghostGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    _ghostGroup.setAttribute('pointer-events', 'none');

    const allPts = [..._inProgress.points];
    if (mousePos) {
      const { lat, lng } = _fromXY(mousePos.x, mousePos.y);
      allPts.push([lat, lng]);
    }
    const ptsStr = allPts.map(([la, ln]) => {
      const { x, y } = _toXY(la, ln);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    const st = DC_STYLES[_drawType] || DC_STYLES.tree;
    const tag = _drawMode === 'polygon' ? 'polygon' : 'polyline';
    const ghostShape = document.createElementNS('http://www.w3.org/2000/svg', tag);
    ghostShape.setAttribute('points', ptsStr);
    ghostShape.setAttribute('fill', _drawMode === 'polygon' ? st.fill : 'none');
    ghostShape.setAttribute('stroke', st.stroke);
    ghostShape.setAttribute('stroke-width', '1.5');
    ghostShape.setAttribute('stroke-dasharray', '5,3');
    ghostShape.setAttribute('opacity', '0.7');
    _ghostGroup.appendChild(ghostShape);

    _inProgress.points.forEach(([la, ln]) => {
      const { x, y } = _toXY(la, ln);
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', x.toFixed(1)); dot.setAttribute('cy', y.toFixed(1));
      dot.setAttribute('r', '3'); dot.setAttribute('fill', '#fff');
      dot.setAttribute('stroke', st.stroke); dot.setAttribute('stroke-width', '1.5');
      _ghostGroup.appendChild(dot);
    });
    _svg.appendChild(_ghostGroup);
  }

  function _drawSelectionHighlight(el) {
    let node = null;
    if (el.lat != null) {
      const { x, y } = _toXY(el.lat, el.lng);
      const rH = Math.max(_ftToPixH(el.radiusFt || 18), 3) + 5;
      const rW = Math.max(_ftToPixW(el.radiusFt || 18), 3) + 5;
      node = _el('ellipse', { cx: x.toFixed(1), cy: y.toFixed(1), rx: rW.toFixed(1), ry: rH.toFixed(1), fill: 'none', stroke: '#FFD700', 'stroke-width': '2', 'stroke-dasharray': '4,2' });
    } else {
      const pts = el.points || el.polygon;
      if (pts?.length) {
        const ptsStr = pts.map(([la, ln]) => { const {x,y} = _toXY(la,ln); return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ');
        node = _el(el.polygon ? 'polygon' : 'polyline', { points: ptsStr, fill: 'none', stroke: '#FFD700', 'stroke-width': '2.5', 'stroke-dasharray': '5,3' });
      }
    }
    if (node) { node.setAttribute('pointer-events', 'none'); _svg.appendChild(node); }
  }

  function _notifyChange() {
    if (typeof window._onCanvasElementAdded === 'function') window._onCanvasElementAdded();
  }

  // ── Public drawing API ───────────────────────────────────────────
  function setDrawMode(type) {
    _drawMode    = type === 'select' ? 'select' : _POINT_TYPES.has(type) ? 'place' : _POLYLINE_TYPES.has(type) ? 'polyline' : 'polygon';
    _drawType    = type;
    _inProgress  = null;
    _selectedIdx = -1;
    _refreshGhost();
    if (_svg) _svg.style.cursor = type === 'select' ? 'default' : 'crosshair';
    document.querySelectorAll('.draw-tool-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
    const deleteBtn = document.getElementById('btnDrawDelete');
    if (deleteBtn) deleteBtn.style.opacity = '0.4';
    _render();
  }

  function deleteSelected() {
    if (_selectedIdx < 0 || _selectedIdx >= _elements.length) return;
    _elements.splice(_selectedIdx, 1);
    _selectedIdx = -1;
    _render();
    _notifyChange();
    const deleteBtn = document.getElementById('btnDrawDelete');
    if (deleteBtn) deleteBtn.style.opacity = '0.4';
  }

  function cancelDraw() {
    _inProgress = null;
    _refreshGhost();
  }

  // ── Init / Mount ─────────────────────────────────────────────────
  function init(viewportId, bounds) {
    _viewportId = viewportId;
    _bounds     = bounds;
    _elements   = [];
    _drawMode   = 'select';
    _inProgress = null;
    _selectedIdx = -1;
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
    _svg.style.cursor = 'default';
    _buildDefs();

    _svg.addEventListener('click',     _onSVGClick);
    _svg.addEventListener('dblclick',  _onSVGDblClick);
    _svg.addEventListener('mousemove', _onSVGMouseMove);
    document.addEventListener('keydown', evt => {
      if (!_svg?.isConnected) return;
      if (evt.key === 'Escape') cancelDraw();
      if ((evt.key === 'Delete' || evt.key === 'Backspace') && _selectedIdx >= 0) {
        evt.preventDefault();
        deleteSelected();
      }
    });
    viewport.appendChild(_svg);
  }

  function _buildDefs() {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
    grad.id = 'dc-tree-grad';
    [['0%','#7DC87D'], ['60%','#2E882E'], ['100%','#1A5C1A']].forEach(([off, col]) => {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      s.setAttribute('offset', off); s.setAttribute('stop-color', col);
      grad.appendChild(s);
    });
    defs.appendChild(grad);
    const hatch = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    hatch.id = 'dc-water-hatch'; hatch.setAttribute('patternUnits', 'userSpaceOnUse');
    hatch.setAttribute('width', '6'); hatch.setAttribute('height', '6');
    hatch.setAttribute('patternTransform', 'rotate(45)');
    const hLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    hLine.setAttribute('x1','0'); hLine.setAttribute('y1','0');
    hLine.setAttribute('x2','0'); hLine.setAttribute('y2','6');
    hLine.setAttribute('stroke','#1976D2'); hLine.setAttribute('stroke-width','1');
    hatch.appendChild(hLine);
    defs.appendChild(hatch);
    _svg.appendChild(defs);
  }

  // ── Element management ───────────────────────────────────────────
  function _clampToBounds(elements) {
    if (!_bounds) return elements;
    const { s, w, n, e } = _bounds;
    return elements.map(el => {
      const out = { ...el };
      if (out.lat  != null) { out.lat = Math.max(s, Math.min(n, out.lat)); out.lng = Math.max(w, Math.min(e, out.lng)); }
      if (out.points)  out.points  = out.points.map(([la,ln])  => [Math.max(s,Math.min(n,la)), Math.max(w,Math.min(e,ln))]);
      if (out.polygon) out.polygon = out.polygon.map(([la,ln]) => [Math.max(s,Math.min(n,la)), Math.max(w,Math.min(e,ln))]);
      return out;
    });
  }

  function addElements(newElements) {
    if (!Array.isArray(newElements) || !newElements.length) return;
    _elements.push(..._clampToBounds(newElements));
    _render();
    if (_svg && !_svg.isConnected) _mountSVG();
  }

  function clear() {
    _elements = []; _selectedIdx = -1; _inProgress = null;
    if (_svg) { _svg.innerHTML = ''; _buildDefs(); }
  }

  function show(viewportId) {
    if (viewportId && viewportId !== _viewportId) { _viewportId = viewportId; _mountSVG(); _render(); }
    if (_svg) _svg.style.display = '';
    const tb = document.getElementById('drawToolbar');
    if (tb) tb.style.display = 'flex';
  }

  function hide() {
    if (_svg) _svg.style.display = 'none';
    const tb = document.getElementById('drawToolbar');
    if (tb) tb.style.display = 'none';
  }

  // ── Rendering ────────────────────────────────────────────────────
  function _render() {
    if (!_svg) return;
    Array.from(_svg.children).forEach(c => { if (c.tagName !== 'defs') c.remove(); });
    const order = ['path','bioswale','plaza','meadow','water','rain_garden','cistern','seating','amphitheater','green_roof','solar','signage','shrub','tree'];
    [..._elements].sort((a,b) => order.indexOf(a.type) - order.indexOf(b.type)).forEach(_drawElement);
    if (_selectedIdx >= 0 && _selectedIdx < _elements.length) _drawSelectionHighlight(_elements[_selectedIdx]);
    if (_ghostGroup) _svg.appendChild(_ghostGroup);
  }

  function _drawElement(el) {
    const st = DC_STYLES[el.type] || DC_STYLES.tree;
    let node = null;

    if (el.type === 'bioswale' || el.type === 'path') {
      if (!el.points?.length) return;
      const pts = el.points.map(([lat,lng]) => { const {x,y} = _toXY(lat,lng); return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ');
      node = _el('polyline', { points: pts, fill: 'none', stroke: st.stroke, 'stroke-width': _ftToPixW(el.widthFt || (el.type==='path'?10:8)).toFixed(1), 'stroke-linecap':'round','stroke-linejoin':'round', opacity:'0.88' });
    } else if (el.polygon?.length) {
      const pts = el.polygon.map(([lat,lng]) => { const {x,y} = _toXY(lat,lng); return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ');
      node = _el('polygon', { points: pts, fill: st.fill, stroke: st.stroke, 'stroke-width': st.sw, 'stroke-linejoin':'round', opacity:'0.85' });
    } else if (el.lat != null && el.lng != null) {
      const {x,y} = _toXY(el.lat, el.lng);
      const rH = Math.max(_ftToPixH(el.radiusFt || 18), 3);
      const rW = Math.max(_ftToPixW(el.radiusFt || 18), 3);
      if (el.type === 'tree') {
        node = _el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: rH.toFixed(1), fill: 'url(#dc-tree-grad)', stroke: st.stroke, 'stroke-width':'1', opacity:'0.88' });
        _svg.appendChild(_el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: Math.max(rH*0.12,1).toFixed(1), fill:'#5C3A1A' }));
      } else if (el.type === 'rain_garden' || el.type === 'cistern') {
        node = _el('ellipse', { cx: x.toFixed(1), cy: y.toFixed(1), rx: rW.toFixed(1), ry: rH.toFixed(1), fill:'url(#dc-water-hatch)', stroke: st.stroke, 'stroke-width': st.sw, 'stroke-dasharray':'4,2', opacity:'0.85' });
      } else {
        node = _el('ellipse', { cx: x.toFixed(1), cy: y.toFixed(1), rx: rW.toFixed(1), ry: rH.toFixed(1), fill: st.fill, stroke: st.stroke, 'stroke-width': st.sw, opacity:'0.85' });
      }
      if (el.label && el.type !== 'tree' && el.type !== 'shrub') {
        const txt = _el('text', { x: x.toFixed(1), y: (y-rH-2).toFixed(1), 'text-anchor':'middle', 'font-size':'7', 'font-family':'sans-serif', fill: st.stroke, 'font-weight':'700', opacity:'0.95' });
        txt.textContent = el.label;
        _svg.appendChild(txt);
      }
    }
    if (node) {
      const title = document.createElementNS('http://www.w3.org/2000/svg','title');
      title.textContent = el.label || st.label;
      node.appendChild(title);
      _svg.appendChild(node);
    }
  }

  function _el(tag, attrs) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k,v]) => n.setAttribute(k,v));
    return n;
  }

  // ── Utilities ────────────────────────────────────────────────────
  function parseFromText(text) {
    const match = text?.match(/DESIGN_ELEMENTS:\s*(\[[\s\S]*?\])/);
    if (!match) return [];
    try { return JSON.parse(match[1]); } catch { return []; }
  }

  function getSummary() {
    if (!_elements.length) return 'No design elements yet.';
    const counts = {};
    _elements.forEach(el => { counts[el.type] = (counts[el.type]||0) + 1; });
    return Object.entries(counts).map(([t,c]) => `${c}× ${DC_STYLES[t]?.label||t}`).join(', ');
  }

  function toSVGString() { return _svg ? _svg.outerHTML : ''; }

  return {
    init, addElements, clear, show, hide,
    setDrawMode, deleteSelected, cancelDraw,
    parseFromText, getSummary, toSVGString,
    get elements() { return [..._elements]; },
    get selectedIndex() { return _selectedIdx; },
  };
})();
