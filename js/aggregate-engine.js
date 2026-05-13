/* aggregate-engine.js — Community Design Aggregate Visualization
 * SITES Radar Chart, Top Elements, Program Summary
 * Exposes: window.AGGREGATE
 */

const AGGREGATE = {
  lastAnalysis: null,

  analyze(designs) {
    if (!designs || !designs.length) { this.lastAnalysis = null; return; }
    const bySite = {};
    designs.forEach(d => { if (!bySite[d.siteId]) bySite[d.siteId] = []; bySite[d.siteId].push(d); });
    const siteAnalyses = {};
    Object.entries(bySite).forEach(([siteId, siteDesigns]) => {
      const config = SITE_CONFIGS[siteId]; if (!config) return;
      const allText = siteDesigns.flatMap(d => d.cumulativePrompts || [d.prompt || '']).join(' ').toLowerCase();
      const sectionData = config.sections.filter(s => !s.assumed).map(s => {
        let hits = 0;
        (s.keywords || []).forEach(kw => { if (allText.includes(kw.toLowerCase())) hits++; });
        return { id: s.id, name: s.name, maxPts: s.maxPts, keywordHits: hits,
          totalKeywords: s.keywords.length, emphasis: s.keywords.length > 0 ? hits / s.keywords.length : 0 };
      });
      const scores = siteDesigns.map(d => d.sitesScore || 0).filter(s => s > 0);
      const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      const topElements = this._extractTopElements(allText);
      siteAnalyses[siteId] = { designCount: siteDesigns.length, sections: sectionData, avgScore, topElements, siteName: config.name };
    });
    this.lastAnalysis = { bySite: siteAnalyses, totalDesigns: designs.length };
    this._renderOverlay();
  },

  _extractTopElements(text) {
    const els = ['bioswale','rain garden','permeable paving','native plants','tree canopy','seating','shade structure','solar panel','garden path','water feature','pollinator habitat','green wall','living wall','outdoor classroom','gathering plaza','interpretive signage','IoT sensor','pergola','cistern','stormwater','meadow','groundcover','amphitheater','heritage walk','meditation space','forest bathing','boardwalk','green roof','parametric canopy'];
    const counts = {};
    els.forEach(el => { const m = text.match(new RegExp(el.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')); if (m) counts[el] = m.length; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([element, count]) => ({ element, count }));
  },

  _renderOverlay() {
    const container = document.getElementById('aggregateContent');
    if (!container || !this.lastAnalysis) return;
    const { bySite, totalDesigns } = this.lastAnalysis;
    const sites = Object.entries(bySite);
    let html = `<div class="aggregate-summary"><div class="aggregate-stat"><strong>${totalDesigns}</strong><span>Total Designs</span></div><div class="aggregate-stat"><strong>${sites.length}</strong><span>Active Sites</span></div></div>`;
    sites.forEach(([siteId, data]) => {
      html += `<div class="aggregate-site-block"><h3>${data.siteName} <span class="aggregate-count">${data.designCount} designs · avg ${data.avgScore}/200</span></h3>
        <div class="aggregate-radar-row"><canvas id="radar-${siteId}" class="aggregate-radar" width="280" height="280"></canvas>
        <div class="aggregate-elements"><div class="aggregate-elements-title">Most Requested Elements</div>
        ${data.topElements.map(e => `<div class="aggregate-element-row"><span class="aggregate-element-name">${e.element}</span><div class="aggregate-element-bar"><div style="width:${Math.min(100, e.count * 10)}%"></div></div><span class="aggregate-element-count">${e.count}</span></div>`).join('')}
        </div></div></div>`;
    });
    container.innerHTML = html;
    requestAnimationFrame(() => { sites.forEach(([siteId, data]) => { this._drawRadar(`radar-${siteId}`, data.sections); }); });
  },

  _drawRadar(canvasId, sections) {
    const canvas = document.getElementById(canvasId); if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height, cx = w/2, cy = h/2, radius = Math.min(cx, cy) - 40;
    const n = sections.length; if (!n) return;
    ctx.clearRect(0, 0, w, h);
    // Rings
    for (let r = 1; r <= 5; r++) {
      ctx.beginPath();
      const rr = (radius / 5) * r;
      for (let i = 0; i <= n; i++) { const a = (Math.PI*2*i)/n - Math.PI/2; const x = cx+rr*Math.cos(a); const y = cy+rr*Math.sin(a); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); }
      ctx.closePath(); ctx.strokeStyle = 'rgba(0,70,132,0.1)'; ctx.lineWidth = 1; ctx.stroke();
    }
    // Axes + labels
    sections.forEach((s, i) => {
      const a = (Math.PI*2*i)/n - Math.PI/2;
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+radius*Math.cos(a), cy+radius*Math.sin(a));
      ctx.strokeStyle = 'rgba(0,70,132,0.15)'; ctx.stroke();
      ctx.fillStyle = '#333'; ctx.font = '10px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s.name, cx+(radius+20)*Math.cos(a), cy+(radius+20)*Math.sin(a));
    });
    // Data polygon
    ctx.beginPath();
    sections.forEach((s, i) => { const a = (Math.PI*2*i)/n - Math.PI/2; const v = Math.min(1, s.emphasis*1.5);
      const x = cx+radius*v*Math.cos(a); const y = cy+radius*v*Math.sin(a); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
    ctx.closePath(); ctx.fillStyle = 'rgba(0,70,132,0.2)'; ctx.fill(); ctx.strokeStyle = '#004684'; ctx.lineWidth = 2; ctx.stroke();
    // Points
    sections.forEach((s, i) => { const a = (Math.PI*2*i)/n - Math.PI/2; const v = Math.min(1, s.emphasis*1.5);
      ctx.beginPath(); ctx.arc(cx+radius*v*Math.cos(a), cy+radius*v*Math.sin(a), 4, 0, Math.PI*2);
      ctx.fillStyle = '#FDB927'; ctx.fill(); ctx.strokeStyle = '#004684'; ctx.lineWidth = 1.5; ctx.stroke(); });
  },

  open() {
    if (!this.lastAnalysis) { if (typeof showToast === 'function') showToast('No designs to analyze yet', 'info'); return; }
    this._renderOverlay();
    if (typeof openModal === 'function') openModal('aggregateModal');
  }
};

window.AGGREGATE = AGGREGATE;
