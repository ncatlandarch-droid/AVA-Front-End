/* gallery-panel.js — Community Gallery UI for AVA V3
 * Renders browsable gallery of community designs with filtering, sorting, voting
 * Requires: window.COMMUNITY, window.SITE_CONFIGS, window.escapeHTML
 * Exposes: window.GALLERY
 */

const GALLERY = {
  currentFilter: 'all',
  currentSort: 'newest',
  allDesigns: [],

  init() {
    COMMUNITY.listenDesigns(designs => {
      this.allDesigns = designs;
      this.render();
    });
  },

  getFilteredDesigns() {
    let designs = [...this.allDesigns];
    if (this.currentFilter !== 'all') {
      designs = designs.filter(d => d.siteId === this.currentFilter);
    }
    switch (this.currentSort) {
      case 'votes': designs.sort((a, b) => (b.votes || 0) - (a.votes || 0)); break;
      case 'score': designs.sort((a, b) => (b.sitesScore || 0) - (a.sitesScore || 0)); break;
      default: break;
    }
    return designs;
  },

  setFilter(siteId) {
    this.currentFilter = siteId;
    document.querySelectorAll('.gallery-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.site === siteId);
    });
    this.render();
  },

  setSort(sortBy) {
    this.currentSort = sortBy;
    document.querySelectorAll('.gallery-sort-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.sort === sortBy);
    });
    this.render();
  },

  async vote(designId) {
    const voted = JSON.parse(localStorage.getItem('ava_voted') || '[]');
    if (voted.includes(designId)) {
      // Un-vote: decrement and remove from local storage
      await COMMUNITY.unvote('designs', designId);
      const updated = voted.filter(id => id !== designId);
      localStorage.setItem('ava_voted', JSON.stringify(updated));
      if (typeof showToast === 'function') showToast('Vote removed', 'info');
    } else {
      // Vote: increment and track locally
      await COMMUNITY.vote('designs', designId);
      voted.push(designId);
      localStorage.setItem('ava_voted', JSON.stringify(voted));
    }
  },

  openImageLightbox(imageUrl, title) {
    // Create full-screen lightbox overlay for image viewing & download
    const existing = document.getElementById('imageLightbox');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'imageLightbox';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:zoom-out;';
    overlay.onclick = () => overlay.remove();
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = title || 'Community Design';
    img.style.cssText = 'max-width:90vw;max-height:80vh;object-fit:contain;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,0.5);';
    img.onclick = (e) => e.stopPropagation();
    const dlBtn = document.createElement('a');
    dlBtn.href = imageUrl;
    dlBtn.download = (title || 'AVA-Design').replace(/\s+/g, '-') + '.png';
    dlBtn.target = '_blank';
    dlBtn.textContent = '⬇ Download Image';
    dlBtn.style.cssText = 'margin-top:16px;padding:10px 24px;background:var(--aggie-gold,#FDB927);color:#002244;font-weight:700;font-size:14px;border-radius:99px;text-decoration:none;cursor:pointer;transition:transform 0.2s;';
    dlBtn.onclick = (e) => e.stopPropagation();
    overlay.appendChild(img);
    overlay.appendChild(dlBtn);
    document.body.appendChild(overlay);
  },

  renderFilterBar() {
    const sites = Object.values(SITE_CONFIGS);
    return `<div class="gallery-toolbar">
      <div class="gallery-filters">
        <button class="gallery-filter-btn active" data-site="all" onclick="GALLERY.setFilter('all')">All Sites</button>
        ${sites.map(s => `<button class="gallery-filter-btn" data-site="${s.id}" onclick="GALLERY.setFilter('${s.id}')">${s.shortName}</button>`).join('')}
      </div>
      <div class="gallery-sorts">
        <button class="gallery-sort-btn active" data-sort="newest" onclick="GALLERY.setSort('newest')">Newest</button>
        <button class="gallery-sort-btn" data-sort="votes" onclick="GALLERY.setSort('votes')">Most Voted</button>
        <button class="gallery-sort-btn" data-sort="score" onclick="GALLERY.setSort('score')">Highest Score</button>
      </div>
    </div>`;
  },

  render() {
    const grid = document.getElementById('communityGrid');
    if (!grid) return;
    const designs = this.getFilteredDesigns();
    const voted = JSON.parse(localStorage.getItem('ava_voted') || '[]');

    const toolbar = document.getElementById('galleryToolbar');
    if (toolbar && !toolbar.dataset.initialized) {
      toolbar.innerHTML = this.renderFilterBar();
      toolbar.dataset.initialized = 'true';
    }

    if (!designs.length) {
      grid.innerHTML = `<div class="community-empty">
        <span class="material-symbols-outlined" style="font-size:48px;opacity:0.3">landscape</span>
        <p>No designs yet. Be the first!</p>
      </div>`;
      return;
    }

    const isAdmin = typeof COMMUNITY !== 'undefined' && COMMUNITY.isAdmin();

    grid.innerHTML = designs.map(d => {
      const siteName = SITE_CONFIGS[d.siteId]?.shortName || d.siteId;
      const prompts = d.cumulativePrompts || [];
      const promptList = prompts.length > 0
        ? prompts.map(p => `<li>${escapeHTML(p)}</li>`).join('')
        : `<li>${escapeHTML(d.prompt || '')}</li>`;
      const tierMap = { platinum: '\u{1F3C6}', gold: '\u{1F947}', silver: '\u{1F948}', certified: '\u2705' };
      const hasVoted = voted.includes(d.id);
      const deleteBtn = isAdmin
        ? `<button class="admin-delete-btn" onclick="event.stopPropagation();COMMUNITY.deleteDesign('${d.id}')" title="Delete design (Admin)"><span class="material-symbols-outlined">delete</span></button>`
        : '';
      return `<div class="community-card">
        ${deleteBtn}
        <div class="community-card-img" onclick="GALLERY.openImageLightbox('${d.imageUrl}','${escapeHTML(siteName)} Design')" style="cursor:zoom-in;" title="Click to enlarge">
          <img src="${d.imageUrl}" alt="Design" loading="lazy" onerror="this.style.display='none'">
          <div class="community-card-tier-badge ${d.tier || ''}">${tierMap[d.tier] || ''} ${(d.tier || 'none')}</div>
        </div>
        <div class="community-card-info">
          <div class="community-card-header">
            <span class="community-card-author">${escapeHTML(d.authorName || 'Designer')}</span>
            <span class="community-card-site">${escapeHTML(siteName)}</span>
          </div>
          <div class="community-card-score">${d.sitesScore || 0}/200 pts</div>
          <div class="community-card-prompts"><div class="prompts-label">Design Elements:</div><ul>${promptList}</ul></div>
          <div class="community-card-actions">
            <button class="community-vote-btn ${hasVoted ? 'voted' : ''}" onclick="event.stopPropagation();GALLERY.vote('${d.id}').then(()=>GALLERY.render())" title="${hasVoted ? 'Click to remove vote' : 'Click to vote'}">
              ${hasVoted ? '\u2764\uFE0F' : '\u{1F90D}'} ${d.votes || 0}
            </button>
            <span class="community-card-date">${d.createdAt?.toDate ? d.createdAt.toDate().toLocaleDateString() : ''}</span>
          </div>
        </div>
      </div>`;
    }).join('');

    if (typeof AGGREGATE !== 'undefined') AGGREGATE.analyze(designs);
    this._buildHotTopics(designs);
  },

  _buildHotTopics(designs) {
    const topicsEl = document.getElementById('hotTopics');
    const cloudEl = document.getElementById('hotTopicsCloud');
    if (!topicsEl || !cloudEl) return;
    const allText = designs.flatMap(d => d.cumulativePrompts || [d.prompt || '']).join(' ').toLowerCase();
    const kws = ['bioswale','rain garden','permeable','native','tree','bench','seating','shade','lighting','solar','garden','path','water','pollinator','meadow','green wall','living wall','sculpture','gathering','plaza','amphitheater','classroom','signage','habitat','stormwater','cistern','IoT','sensor','pergola','canopy','groundcover','fern','wellness','meditation'];
    const counts = {};
    kws.forEach(kw => {
      const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const m = allText.match(re);
      if (m && m.length > 0) counts[kw] = m.length;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15);
    if (!sorted.length) { topicsEl.style.display = 'none'; return; }
    const max = sorted[0][1];
    cloudEl.innerHTML = sorted.map(([w, c]) => {
      const sz = Math.max(12, Math.min(28, 12 + (c / max) * 16));
      return `<span class="hot-topic-tag" style="font-size:${sz}px;opacity:${Math.max(0.6, c / max)}" title="${c} mentions">${w} <sup>${c}</sup></span>`;
    }).join('');
    topicsEl.style.display = 'block';
  }
};

window.GALLERY = GALLERY;
