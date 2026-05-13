/* AVA V.4 — Core Application (Slim Orchestrator)
 * Site configs:    js/site-configs.js      → window.SITE_CONFIGS
 * Design engine:   js/design-engine.js     → window.DESIGN_ENGINE
 * Gallery panel:   js/gallery-panel.js     → window.GALLERY
 * Aggregate viz:   js/aggregate-engine.js  → window.AGGREGATE
 * Community/Auth:  community.js            → window.COMMUNITY
 * Voice/TTS:       tts.js                  → window.AVA_TTS
 * 3D Canvas:       Three.js / WebGL        → #three-canvas (integration pending)
 */

// ========== STATE ==========
let state = {
  activeSite: null,
  gmapsKey:     localStorage.getItem('ava_gmaps_key')      || '',
  cesiumToken:  localStorage.getItem('ava_cesium_token')   || '',
  geminiKey:  localStorage.getItem('ava_gemini_key') || '',
  geminiModel: localStorage.getItem('ava_gemini_model') || 'gemini-2.5-flash-image',
  firebaseConfig: null,
  currentScore: 0, sectionScores: [0,0,0,0,0,0,0,0,0,0], currentTier: 'none',
  currentPrompt: '', generatedImageBase64: null, generatedImageMimeType: 'image/png',
  workingBaselineBase64: null, originalBaselineBase64: null,
  iterationCount: 0, cumulativePrompts: [],
  referenceImageBase64: null, referenceImageMimeType: null,
  designHistory: [],       // P3: undo history — array of { imageBase64, scores, tier, prompts, score }
  seasonalImages: {}       // P1: cached seasonal images { spring, summer, fall, winter }
};

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  buildSitesList();

  // GALLERY.init() is called by community.js AFTER Firebase auth is confirmed.
  // This prevents the race condition where listenDesigns() fired before Firebase was ready.
  // Fallback: if Firebase never loads (e.g. no config), show empty state gracefully.
  setTimeout(() => {
    if (typeof GALLERY !== 'undefined' && !GALLERY._started) {
      console.warn('[AVA] Firebase took too long — GALLERY starting without live feed');
      GALLERY._started = true;
      // allDesigns stays empty — shows "No designs yet" message
      GALLERY.render();
    }
  }, 8000); // 8s graceful timeout
  COMMUNITY.listenContributions(() => {
    /* Future: render PPGIS contributions on map */
  });

  addChatMessage('ava', "Welcome to <strong>AVA V.4</strong>! I'm your Adaptive Visualization Assistant. Switch to <strong>Projects</strong> to browse project sites or ask me anything about the map.", true);
  initBeforeAfterSlider();
  initThreeCanvas();
  updateScoreboard();
});

// ========== HEADER SCOREBOARD ==========
function updateScoreboard() {
  const countEl = document.getElementById('scoreboardSiteCount');
  const topEl   = document.getElementById('scoreboardTopScore');
  if (!countEl || !topEl || typeof SITE_CONFIGS === 'undefined') return;
  const sites = Object.values(SITE_CONFIGS);
  countEl.textContent = sites.length;
  // Average baseline scores; prefer any session-updated score for the active site
  const siteScores = sites.map(s => {
    const session = sessionStorage.getItem(`ava_score_${s.id}`);
    return session !== null ? parseInt(session, 10) : (s.baselineScore || 0);
  });
  const avgScore = siteScores.length
    ? Math.round(siteScores.reduce((a, b) => a + b, 0) / siteScores.length)
    : 0;
  topEl.textContent = avgScore;
}

// ========== VIEW TOGGLE (3D View ↔ Projects) ==========
function switchView(view) {
  const appWorkspace = document.getElementById('appWorkspace');
  const projectsView = document.getElementById('projectsGalleryView');
  const btnMap = document.getElementById('btnMapView');
  const btnProjects = document.getElementById('btnProjectsView');

  if (window.AVA_TTS) AVA_TTS.stop();

  if (view === 'projects') {
    if (appWorkspace) appWorkspace.style.display = 'none';
    projectsView.style.display = 'flex';
    btnMap.classList.remove('active');
    btnProjects.classList.add('active');
    buildProjectsGallery();
  } else {
    if (appWorkspace) appWorkspace.style.display = 'grid';
    projectsView.style.display = 'none';
    btnMap.classList.add('active');
    btnProjects.classList.remove('active');
  }
}

// ========== CANVAS / MAP INIT ==========
async function initThreeCanvas() {
  if (!window.GEO) return;
  let gmapsKey = '', cesiumToken = '';
  try {
    const [mapsResp, cesiumResp] = await Promise.all([
      fetch('/.netlify/functions/google-maps-config'),
      fetch('/.netlify/functions/cesium-config')
    ]);
    if (mapsResp.ok)   { const d = await mapsResp.json();   gmapsKey    = d.key   || ''; }
    if (cesiumResp.ok) { const d = await cesiumResp.json(); cesiumToken = d.token || ''; }
  } catch (_) { /* Netlify functions not available locally — fine */ }

  if (!gmapsKey)    gmapsKey    = localStorage.getItem('ava_gmaps_key')      || '';
  if (!cesiumToken) cesiumToken = localStorage.getItem('ava_cesium_token')   || '';

  GEO.init(gmapsKey || undefined, cesiumToken || undefined);
}

// ========== UI & INTERACTION ==========
function buildSitesList() { /* legacy — no longer needed */ }

function buildProjectsGallery() {
  const grid = document.getElementById('projectsGalleryGrid');
  if (!grid) return;
  grid.innerHTML = Object.values(SITE_CONFIGS).map(c => `
    <div class="project-card" id="siteItem-${c.id}" onclick="openSiteCard('${c.id}')">
      <div class="project-card-hero">
        <img src="${c.baselineImage}" alt="${c.name}" loading="lazy">
        <div class="project-card-overlay">
          <div class="project-card-score">${c.baselineScore}<span>/200</span></div>
        </div>
      </div>
      <div class="project-card-content">
        <h3 class="project-card-title">${c.name}</h3>
        <div class="project-card-subtitle">${c.college}</div>
        <p class="project-card-desc">${c.history?.summary?.substring(0, 120) || c.popupDesc}…</p>
        <div class="project-card-meta">
          ${(c.popupStats || []).map(s => `<div class="project-card-stat"><strong>${s.value}</strong><span>${s.label}</span></div>`).join('')}
        </div>
        <div class="project-card-team">
          ${(c.team || []).map(t => `<div class="project-card-avatar" title="${t.name} — ${t.role}">${t.name.charAt(0)}</div>`).join('')}
        </div>
        <button class="project-card-btn" onclick="event.stopPropagation(); openDesignSheet('${c.id}'); switchView('map');">
          <span class="material-symbols-outlined">brush</span> Start Design with AVA
        </button>
      </div>
    </div>`).join('');
}

// ========== DESIGN SHEET ==========
function openDesignSheet(siteId) {
  state.activeSite = siteId;
  const config = SITE_CONFIGS[siteId];
  if (!config) return;

  state.currentScore = 0; state.sectionScores = [0,0,0,0,0,0,0,0,0,0]; state.currentTier = 'none';
  state.iterationCount = 0; state.cumulativePrompts = [];
  state.workingBaselineBase64 = null; state.originalBaselineBase64 = null;
  state.generatedImageBase64 = null;
  state.designHistory = []; state.seasonalImages = {};

  document.getElementById('sheetSiteName').textContent = config.shortName;
  document.getElementById('iterationBadge').textContent = 'Iteration 0';
  document.getElementById('baselineImg').src = config.baselineImage;
  document.getElementById('baselineLabel').textContent = 'BASELINE — ' + config.name;
  document.getElementById('baselineView').style.display = 'block';
  document.getElementById('beforeAfterView').style.display = 'none';
  document.getElementById('canvasActions').style.display = 'none';
  const btnUndo = document.getElementById('btnUndo'); if (btnUndo) btnUndo.style.display = 'none';
  const btnSeasonal = document.getElementById('btnSeasonal'); if (btnSeasonal) btnSeasonal.style.display = 'none';
  const timeline = document.getElementById('historyTimeline'); if (timeline) { timeline.style.display = 'none'; timeline.innerHTML = ''; }

  if (window.AVA_TTS) AVA_TTS.stop();

  initScorePanel();
  document.getElementById('designSheet').classList.add('open');
  document.body.classList.add('workspace-active');

  if (window.GEO?.isReady()) GEO.focusSite(siteId);

  const chat = document.getElementById('avaChatMessages');
  chat.innerHTML = '';
  addChatMessage('ava', `Welcome to ${config.name}! ${config.history.summary} Tell me what you'd like to design, or click ✨ Auto-Design.`, true);
}

function closeDesignSheet() {
  if (window.AVA_TTS) AVA_TTS.stop();
  document.getElementById('designSheet').classList.remove('open');
  document.body.classList.remove('workspace-active');
  if (window.GEO?.isReady()) GEO.resetView();
}

// ========== DESIGN PIPELINE ==========
// ── Reference Image Upload Handlers ──
function handleRefImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { alert('Image must be under 10 MB'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    state.referenceImageBase64 = dataUrl.split(',')[1];
    state.referenceImageMimeType = file.type || 'image/png';
    document.getElementById('refImageThumb').src = dataUrl;
    document.getElementById('refImagePreview').style.display = 'flex';
  };
  reader.readAsDataURL(file);
}

function removeRefImage() {
  state.referenceImageBase64 = null;
  state.referenceImageMimeType = null;
  document.getElementById('refImagePreview').style.display = 'none';
  document.getElementById('refImageThumb').src = '';
  document.getElementById('refImageInput').value = '';
}

async function handleDesign(override) {
  const input = document.getElementById('promptInput');
  const prompt = override || input.value.trim();
  if (!prompt) return;
  if (!override) input.value = '';

  addChatMessage('user', escapeHTML(prompt));
  const DE_ref = window.DESIGN_ENGINE || {};
  const finalPrompt = (prompt === 'boost') ? (DE_ref.getBoostPrompt ? DE_ref.getBoostPrompt() : '') : (prompt === 'make something beautiful') ? (DE_ref.getAutoDesignPrompt ? DE_ref.getAutoDesignPrompt() : '') : prompt;
  state.currentPrompt = finalPrompt;
  state.cumulativePrompts.push(finalPrompt);

  // Score updates only after the scene renders — not on input
  const DE = window.DESIGN_ENGINE || {};

  const typingEl = addTypingIndicator();
  const btn = document.getElementById('btnVisualize');
  btn.disabled = true; btn.classList.add('loading');

  try {
    const config = SITE_CONFIGS[state.activeSite];
    // Always anchor to the original baseline photo so camera angle and building
    // geometry never drift across iterations (each call regenerates from scratch).
    if (!state.originalBaselineBase64) {
      state.originalBaselineBase64 = await imageToBase64(config.baselineImage);
    }
    const baselineBase64 = state.originalBaselineBase64;
    const systemPrompt = (DE.buildGeminiPrompt ? DE.buildGeminiPrompt(finalPrompt) : buildGeminiPrompt(finalPrompt));
    const refImg = state.referenceImageBase64 || null;
    const refMime = state.referenceImageMimeType || 'image/png';
    const result = await (DE.callGeminiAPI ? DE.callGeminiAPI(systemPrompt, baselineBase64, refImg, refMime) : callGeminiAPI(systemPrompt, baselineBase64, refImg, refMime));
    // Clear reference image after use (one-shot)
    if (refImg) removeRefImage();
    typingEl.remove();

    if (result?.imageBase64) {
      state.iterationCount++;
      document.getElementById('iterationBadge').textContent = `Iteration ${state.iterationCount}`;

      const beforeImg = document.getElementById('beforeImg');
      beforeImg.src = state.originalBaselineBase64.startsWith('data:') ? state.originalBaselineBase64 : `data:image/png;base64,${state.originalBaselineBase64}`;

      state.workingBaselineBase64 = result.imageBase64;
      state.generatedImageBase64 = result.imageBase64;
      state.generatedImageMimeType = result.mimeType || 'image/png';
      displayGeneratedImage(result.imageBase64);

      addChatMessage('ava', `✅ Design updated! I added: <em>${escapeHTML(finalPrompt)}</em>`);

      const isAutoDesign = (prompt === 'make something beautiful');
      if (isAutoDesign) {
        const narration = `I've created a comprehensive platinum-level sustainable design for ${config.name}. This design achieves SITES v2 Platinum certification at 200 out of 200 points!`;
        addChatMessage('ava', narration);
        if (window.AVA_TTS) AVA_TTS.speak(narration);
      }

      const fullPrompt = state.cumulativePrompts.join('. ');
      let scores = (DE.scoreSITESv2 ? DE.scoreSITESv2(fullPrompt) : scoreSITESv2(fullPrompt));

      // Auto-Design platinum override: AVA's comprehensive design earns max on all sections
      if (isAutoDesign) {
        scores = config.sections.map(s => s.maxPts);
      }

      const oldTier = state.currentTier;
      const oldScores = [...(state.sectionScores || new Array(scores.length).fill(0))];
      // Keep positive cumulative gains
      scores = scores.map((newS, i) => Math.max(newS, oldScores[i] || 0));
      // Apply penalties from the current prompt (allows bad choices to reduce score)
      if (!isAutoDesign) {
        const penaltyDeltas = DE.computePenalties ? DE.computePenalties(finalPrompt, config) : new Array(scores.length).fill(0);
        scores = scores.map((s, i) => Math.max(0, s - penaltyDeltas[i]));
      }
      const totalScore = scores.reduce((a,b) => a+b, 0);
      state.sectionScores = scores; state.currentScore = totalScore;
      // Persist session score for this site so the header scoreboard reflects it
      sessionStorage.setItem(`ava_score_${state.activeSite}`, totalScore);
      updateScoreboard();
      const newTier = DE.getTier(totalScore);
      state.currentTier = newTier;
      updateScoreDisplay(totalScore, scores);
      generateMission(scores, totalScore);

      // Score-change feedback — populates both chat and right panel
      generateScoreFeedback(oldScores, scores, totalScore, finalPrompt);

      // P3: Push to history stack and show undo/seasonal buttons
      pushHistory();
      const seasonBtn = document.getElementById('btnSeasonal');
      if (seasonBtn) seasonBtn.style.display = '';

      // Tier celebration with confetti
      if (newTier !== oldTier && newTier !== 'none') {
        celebrateTier(newTier);
      }
    } else {
      typingEl.remove();
      addChatMessage('ava', '⚠️ No image returned. Try rephrasing your design element.');
    }
  } catch (error) {
    typingEl.remove();
    addChatMessage('ava', `⚠️ <strong>Error:</strong> ${escapeHTML(error.message)}`);
  }
  btn.disabled = false; btn.classList.remove('loading');
}

// Design pipeline functions delegated to DESIGN_ENGINE module (js/design-engine.js)
// Legacy aliases for backward compatibility
function buildGeminiPrompt(p) { return DESIGN_ENGINE.buildGeminiPrompt(p); }
function callGeminiAPI(p, i, r, rm) { return DESIGN_ENGINE.callGeminiAPI(p, i, r, rm); }
function scoreSITESv2(p) { return DESIGN_ENGINE.scoreSITESv2(p); }
function getTier(s) { return DESIGN_ENGINE.getTier(s); }
function getBoostPrompt() { return DESIGN_ENGINE.getBoostPrompt(); }
function getAutoDesignPrompt() { return DESIGN_ENGINE.getAutoDesignPrompt(); }
function imageToBase64(s) { return DESIGN_ENGINE.imageToBase64(s); }


// ========== UI HELPERS ==========
function initScorePanel() {
  const config = SITE_CONFIGS[state.activeSite];
  if (!config) return;
  // Clear feedback from previous session
  const feedbackEl = document.getElementById('scoreFeedback');
  if (feedbackEl) { feedbackEl.innerHTML = ''; feedbackEl.style.display = 'none'; }
  // Pre-fill assumed section scores, zeros for design sections
  state.sectionScores = config.sections.map(s => s.assumed ? (s.assumedPts || 0) : 0);
  const assumedTotal = state.sectionScores.reduce((a, b) => a + b, 0);
  const baselineScore = Math.max(config.baselineScore || 0, assumedTotal);
  state.currentScore = baselineScore;
  document.getElementById('scoreValue').textContent = baselineScore.toString();
  const maxTotal = config.sections.reduce((sum, s) => sum + s.maxPts, 0);
  const offset = 326.73 - (baselineScore / maxTotal) * 326.73;
  document.getElementById('scoreRingProgress').style.strokeDashoffset = offset.toString();
  const tier = DESIGN_ENGINE.getTier(baselineScore);
  document.getElementById('tierBadge').textContent = tier === 'none' ? 'Pre-Certification' : tier.charAt(0).toUpperCase() + tier.slice(1);
  document.getElementById('tierBadge').className = `tier-badge ${tier}`;
  updateTierMedal(tier);
  const container = document.getElementById('sectionScores');
  container.innerHTML = config.sections.map((s, i) => {
    const pts = state.sectionScores[i];
    const pct = (pts / s.maxPts) * 100;
    const assumed = s.assumed ? ' assumed' : '';
    return `<div class="section-score-row${assumed}">
      <span class="section-score-name">${s.name}${s.assumed ? ' \u2713' : ''}</span>
      <div class="section-score-bar"><div class="section-score-fill${assumed}" id="fill-${s.id}" style="width:${pct}%"></div></div>
      <span class="section-score-pts" id="pts-${s.id}">${pts}/${s.maxPts}</span>
    </div>`;
  }).join('');
}

const TIER_MEDAL_MAP = {
  certified: 'baselines/medals/certified.png',
  silver:    'baselines/medals/silver.png',
  gold:      'baselines/medals/gold.png',
  platinum:  'baselines/medals/platinum.png'
};

function updateTierMedal(tier) {
  const container = document.getElementById('tierMedalContainer');
  if (!container) return;
  if (tier === 'none' || !TIER_MEDAL_MAP[tier]) {
    container.innerHTML = '';
    return;
  }
  const currentImg = container.querySelector('.tier-medal');
  const currentSrc = currentImg?.getAttribute('data-tier');
  if (currentSrc === tier) return; // Already showing correct medal
  container.innerHTML = `<img class="tier-medal" src="${TIER_MEDAL_MAP[tier]}" alt="SITES ${tier} medal" data-tier="${tier}">`;
}

function updateScoreDisplay(total, scores) {
  const config = SITE_CONFIGS[state.activeSite];
  if (!config) return;
  const maxTotal = config.sections.reduce((sum, s) => sum + s.maxPts, 0);
  document.getElementById('scoreValue').textContent = total;
  const circumference = 326.73;
  document.getElementById('scoreRingProgress').style.strokeDashoffset = circumference - (circumference * total / maxTotal);
  const tier = DESIGN_ENGINE.getTier(total);
  const badge = document.getElementById('tierBadge');
  badge.textContent = tier === 'none' ? 'Pre-Certification' : tier.charAt(0).toUpperCase() + tier.slice(1);
  badge.className = `tier-badge ${tier}`;
  updateTierMedal(tier);
  scores.forEach((s, i) => {
    const sec = config.sections[i];
    if (!sec) return;
    const fill = document.getElementById(`fill-${sec.id}`);
    const pts = document.getElementById(`pts-${sec.id}`);
    if (fill) fill.style.width = `${(s / sec.maxPts) * 100}%`;
    if (pts) pts.textContent = `${s}/${sec.maxPts}`;
  });
}

function generateMission(scores, totalScore) {
  const config = SITE_CONFIGS[state.activeSite];
  const card = document.getElementById('missionCard');
  const text = document.getElementById('missionText');
  if (!card || !config) return;

  // Build sorted list of designable sections by weakness ratio
  const designable = [];
  scores.forEach((s, i) => {
    if (!config.sections[i].keywords || config.sections[i].keywords.length === 0) return;
    designable.push({ idx: i, ratio: s / config.sections[i].maxPts, section: config.sections[i], score: s });
  });
  designable.sort((a, b) => a.ratio - b.ratio);
  if (!designable.length) return;

  // Use the boost prompt from the cycling engine (rotates sections)
  const hint = DESIGN_ENGINE.getBoostPrompt();
  const target = designable[0];
  const nextTier = getNextTierInfo(totalScore || state.currentScore);

  card.style.display = 'block';
  text.innerHTML = `<strong>🎯 AVA's Suggestion</strong><br><span style="font-size:11px;color:var(--aggie-blue)">@ ${target.section.name} (${target.score}/${target.section.maxPts} pts)</span><br>${hint}${nextTier ? `<br><br><em>${nextTier.pts} pts to ${nextTier.name}!</em>` : ''}`;
  state.missionPrompt = hint;
  document.getElementById('missionBtn').onclick = () => {
    document.getElementById('promptInput').value = hint;
    document.getElementById('promptInput').focus();
  };
}

function getNextTierInfo(score) {
  const t = SITE_CONFIGS[state.activeSite]?.tierThresholds || { certified:70, silver:85, gold:100, platinum:135 };
  if (score < t.certified) return { name: 'Certified', pts: t.certified - score };
  if (score < t.silver) return { name: 'Silver', pts: t.silver - score };
  if (score < t.gold) return { name: 'Gold', pts: t.gold - score };
  if (score < t.platinum) return { name: 'Platinum', pts: t.platinum - score };
  return null;
}

// ========== CONFETTI CELEBRATIONS ==========
function celebrateTier(tier) {
  const tierNames = { certified: 'Certified', silver: 'Silver', gold: 'Gold', platinum: 'Platinum' };
  showToast(`🏆 ${tierNames[tier]} Tier Achieved!`, 'success');
  addChatMessage('ava', `🏆 <strong>${tierNames[tier]} Tier Achieved!</strong> ${tier === 'platinum' ? 'You\'ve mastered all ten SITES v2 credit areas — your design qualifies for the Sustainable SITES Initiative\u2019s highest recognition!' : 'Keep going — add more design elements to reach the next tier!'}`);

  if (typeof confetti !== 'function') return;
  const colors = ['#004684', '#FDB927', '#FFFFFF'];
  const defaults = { colors, spread: 70, ticks: 100, gravity: 1.2, decay: 0.94, startVelocity: 30 };
  confetti({ ...defaults, particleCount: 50, origin: { x: 0.3, y: 0.6 } });
  confetti({ ...defaults, particleCount: 50, origin: { x: 0.7, y: 0.6 } });
  setTimeout(() => confetti({ ...defaults, particleCount: 80, origin: { x: 0.5, y: 0.4 }, spread: 100 }), 250);
  if (tier === 'platinum') {
    setTimeout(() => {
      confetti({ ...defaults, particleCount: 120, origin: { x: 0.2, y: 0.5 }, spread: 120 });
      confetti({ ...defaults, particleCount: 120, origin: { x: 0.8, y: 0.5 }, spread: 120 });
    }, 600);
    setTimeout(() => confetti({ ...defaults, particleCount: 200, origin: { x: 0.5, y: 0.3 }, spread: 160, startVelocity: 45 }), 1000);
  }
}

// ========== SITE INFO CARD (map click entry point) ==========
function openSiteCard(siteId) {
  const config = SITE_CONFIGS[siteId];
  if (!config) return;
  const modal = document.getElementById('siteCardModal');
  if (!modal) { openDesignSheet(siteId); return; }
  document.getElementById('siteCardName').textContent = config.name;
  document.getElementById('siteCardCollege').textContent = config.college;
  document.getElementById('siteCardDesc').textContent = config.history?.summary || config.popupDesc || '';
  document.getElementById('siteCardImg').src = config.baselineImage;
  const statsEl = document.getElementById('siteCardStats');
  statsEl.innerHTML = (config.popupStats || []).map(s => `<div class="site-card-stat"><strong>${s.value}</strong><span>${s.label}</span></div>`).join('');
  // Video Overview
  const videoEl = document.getElementById('siteCardVideo');
  const videoPlayer = document.getElementById('siteCardVideoPlayer');
  if (config.videoOverview) {
    videoPlayer.src = config.videoOverview;
    videoEl.style.display = 'block';
  } else {
    videoEl.style.display = 'none';
    videoPlayer.src = '';
  }
  // Team / Stakeholders
  const teamEl = document.getElementById('siteCardTeam');
  const teamList = document.getElementById('siteCardTeamList');
  if (config.team && config.team.length > 0) {
    teamList.innerHTML = config.team.map(t => `<div class="site-card-team-member"><div class="site-card-team-avatar">${t.name.charAt(0)}</div><div class="site-card-team-info"><div class="site-card-team-name">${t.name}</div><div class="site-card-team-role">${t.role}</div></div></div>`).join('');
    teamEl.style.display = 'block';
  } else {
    teamEl.style.display = 'none';
  }
  document.getElementById('siteCardDesignBtn').onclick = () => { closeModal('siteCardModal'); openDesignSheet(siteId); };
  openModal('siteCardModal');
}
window.openSiteCard = openSiteCard;

// ========== SCORE-CHANGE FEEDBACK ==========
function generateScoreFeedback(oldScores, newScores, totalScore, currentPrompt) {
  const config = SITE_CONFIGS[state.activeSite];
  if (!config) return;
  const DE = window.DESIGN_ENGINE || {};
  const reasons = (DE.getScoringReasons && currentPrompt) ? DE.getScoringReasons(currentPrompt, config) : {};

  let feedback = [];
  let hasLoss = false;
  config.sections.forEach((s, i) => {
    const diff = newScores[i] - (oldScores[i] || 0);
    if (diff === 0) return;
    const r = reasons[s.id] || {};
    const gainStr = (r.gained || []).slice(0, 3).join(', ');
    const lossStr = (r.lost || []).slice(0, 2).join(', ');
    if (diff > 0) {
      const why = gainStr ? ` — <em style="opacity:.75">${gainStr}</em>` : '';
      feedback.push({ type: 'gain', html: `📈 <strong>${s.name}</strong> +${diff} pts${why}` });
    } else {
      hasLoss = true;
      const why = lossStr ? ` — <em style="opacity:.75">penalized: ${lossStr}</em>` : ' — poor sustainability choice';
      feedback.push({ type: 'loss', html: `📉 <strong>${s.name}</strong> ${diff} pts${why}` });
    }
  });

  if (feedback.length === 0) return;

  const nextTier = getNextTierInfo(totalScore);

  // ── Right panel feedback ──
  const feedbackEl = document.getElementById('scoreFeedback');
  if (feedbackEl) {
    feedbackEl.style.display = 'block';
    feedbackEl.innerHTML = '<div class="score-feedback-title">Why points changed:</div>'
      + feedback.map(f => `<div class="score-feedback-item ${f.type}">${f.html}</div>`).join('')
      + (nextTier ? `<div class="score-feedback-next">🎯 ${nextTier.pts} pts to ${nextTier.name}!</div>` : '');
  }

  // ── Chat message ──
  const maxTotal = config.sections.reduce((sum, s) => sum + s.maxPts, 0);
  let msg = `<div style="font-size:13px;line-height:1.6">📊 <strong>Score Update:</strong> ${totalScore}/${maxTotal}<br>${feedback.map(f => f.html).join('<br>')}`;
  if (nextTier) msg += `<br><br>🎯 <em>${nextTier.pts} pts to ${nextTier.name}!</em>`;
  if (hasLoss) msg += `<br><br>💡 <em>Tip: Avoid unsustainable elements to protect your score.</em>`;
  msg += '</div>';
  addChatMessage('ava', msg);
}

function displayGeneratedImage(base64) {
  document.getElementById('afterImg').src = `data:image/png;base64,${base64}`;
  document.getElementById('baselineView').style.display = 'none';
  document.getElementById('beforeAfterView').style.display = 'block';
  document.getElementById('canvasActions').style.display = 'flex';
  document.getElementById('generatedOverlay').style.clipPath = 'inset(0 0 0 50%)';
  document.getElementById('sliderHandle').style.left = '50%';
  _updateCostEstimate();
}

function _updateCostEstimate() {
  if (typeof COST_ENGINE === 'undefined') return;
  const est = COST_ENGINE.estimate(state.activeSite, state.cumulativePrompts);
  state.currentCostEstimate = est;

  const badge     = document.getElementById('costBadge');
  const badgeTotal = document.getElementById('costBadgeTotal');
  const costBtn   = document.getElementById('btnCostEstimate');

  if (est) {
    badgeTotal.textContent = COST_ENGINE.formatCurrency(est.grandTotal);
    badge.style.display = 'flex';
    if (costBtn) costBtn.style.display = '';
  } else {
    badge.style.display = 'none';
    if (costBtn) costBtn.style.display = 'none';
  }
}

const CATEGORY_ICONS = {
  'Hardscape':              'grid_on',
  'Stormwater & Water':     'water_drop',
  'Planting':               'forest',
  'Structures & Furnishings':'chair',
  'Technology & Innovation':'sensors',
};

function openCostModal() {
  const est = state.currentCostEstimate;
  const body = document.getElementById('costModalBody');
  if (!body) return;

  if (!est) {
    body.innerHTML = `<div class="cost-empty-state">
      <span class="material-symbols-outlined">request_quote</span>
      <p>Generate a design first — AVA will estimate costs based on the materials, plants, and features you add.</p>
    </div>`;
    openModal('costModal');
    return;
  }

  const config = SITE_CONFIGS[est.siteId];
  let html = `<div class="cost-summary-bar">
    <div>
      <div style="font-size:16px;font-weight:800">${config?.name || est.siteId}</div>
      <div class="cost-summary-site">${Math.round(est.areaSF).toLocaleString()} SF · ${Object.keys(est.byCategory).length} categories · ${est.items.length} line items</div>
    </div>
    <div class="cost-summary-total">
      <div class="cost-summary-total-label">Total Project Estimate</div>
      <div class="cost-summary-total-value">${COST_ENGINE.formatCurrency(est.grandTotal)}</div>
    </div>
  </div>`;

  Object.entries(est.byCategory).forEach(([cat, items]) => {
    const icon = CATEGORY_ICONS[cat] || 'category';
    const catTotal = items.reduce((s, i) => s + i.total, 0);
    html += `<div class="cost-category-section">
      <div class="cost-category-header">
        <span class="material-symbols-outlined">${icon}</span>
        ${cat}
        <span style="margin-left:auto;font-weight:800;font-size:12px">${COST_ENGINE.formatCurrency(catTotal)}</span>
      </div>
      <table class="cost-table">
        <thead><tr>
          <th>Item</th>
          <th class="num">Qty</th>
          <th>Unit</th>
          <th class="num">Unit Cost</th>
          <th class="num">Total</th>
        </tr></thead>
        <tbody>`;
    items.forEach(item => {
      const unitLabel = item.unit === 'SF' ? '/SF' : item.unit === 'LF' ? '/LF' : ' ea';
      html += `<tr>
        <td>
          <div class="cost-item-name">${item.name}</div>
          <div class="cost-item-note">${item.note}</div>
        </td>
        <td class="num">${item.qty.toLocaleString()}</td>
        <td>${item.unit}</td>
        <td class="num">${COST_ENGINE.formatCurrency(item.unitCost)}<span style="font-size:9px;opacity:.6">${unitLabel}</span></td>
        <td class="num cost-total-value">${COST_ENGINE.formatCurrency(item.total)}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  });

  html += `<div class="cost-totals-section">
    <div class="cost-totals-row">
      <span class="cost-totals-label">Construction Subtotal</span>
      <span class="cost-total-value">${COST_ENGINE.formatCurrency(est.constructionTotal)}</span>
    </div>
    <div class="cost-totals-row soft">
      <span class="cost-totals-label">Design, Engineering &amp; Contingency (20%)</span>
      <span>${COST_ENGINE.formatCurrency(est.softCosts)}</span>
    </div>
    <div class="cost-totals-row grand">
      <span class="cost-totals-label" style="font-size:15px;font-weight:800">TOTAL PROJECT ESTIMATE</span>
      <span class="cost-total-value">${COST_ENGINE.formatCurrency(est.grandTotal)}</span>
    </div>
  </div>`;

  body.innerHTML = html;
  openModal('costModal');
}

function downloadCostCSV() {
  const est = state.currentCostEstimate;
  if (!est) { showToast('No cost estimate available yet', 'warn'); return; }
  const csv  = COST_ENGINE.toCSV(est);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const config = SITE_CONFIGS[est.siteId];
  a.href     = url;
  a.download = `AVA_CostEstimate_${(config?.name || est.siteId).replace(/\s+/g,'-')}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Cost estimate CSV downloaded', 'success');
}

function addChatMessage(role, html, _isWelcome) {
  const container = document.getElementById('avaChatMessages');
  if (!container) return;
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.innerHTML = html;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  // AVA auto-speaks her messages
  if (role === 'ava') {
    const plainText = html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
    if (plainText.length > 10) speakAVA(plainText);
  }
}

function addTypingIndicator() {
  const container = document.getElementById('avaChatMessages');
  const div = document.createElement('div');
  div.className = 'chat-msg ava';
  div.innerHTML = 'â³ Generating design...';
  div.id = 'typingIndicator';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function escapeHTML(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function openModal(id) { document.getElementById(id)?.classList.add('active'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('active'); }

// ========== SETTINGS ==========
function loadSettings() {
  state.gmapsKey    = localStorage.getItem('ava_gmaps_key')      || '';
  state.cesiumToken = localStorage.getItem('ava_cesium_token')   || '';
  state.geminiKey = localStorage.getItem('ava_gemini_key') || '';
  let cachedModel = localStorage.getItem('ava_gemini_model');
  if (cachedModel && cachedModel.includes('preview-image-generation')) cachedModel = 'gemini-2.5-flash-image';
  state.geminiModel = cachedModel || 'gemini-2.5-flash-image';

  // Use a user-saved override first; otherwise fetch config from the server
  // (which reads FIREBASE_* env vars — keeping secrets out of source control).
  const fbConfig = localStorage.getItem('ava_firebase_config');
  if (fbConfig) {
    try {
      const config = JSON.parse(fbConfig);
      if (typeof COMMUNITY !== 'undefined') {
        COMMUNITY.init(config);
        if (typeof ADMIN !== 'undefined') ADMIN.init();
      }
    } catch (e) {
      console.warn('[AVA] Cached Firebase config invalid, refetching');
      _fetchFirebaseConfig();
    }
  } else {
    _fetchFirebaseConfig();
  }
}

async function _fetchFirebaseConfig() {
  try {
    const resp = await fetch('/.netlify/functions/firebase-config');
    if (!resp.ok) return;
    const config = await resp.json();
    if (config.apiKey && typeof COMMUNITY !== 'undefined') {
      COMMUNITY.init(config);
      if (typeof ADMIN !== 'undefined') ADMIN.init();
    }
  } catch (e) {
    console.warn('[AVA] Could not load Firebase config from server:', e.message);
  }
}

function saveSettings() {
  const gmk   = document.getElementById('settingGmapsKey')?.value.trim()    || '';
  const ctk   = document.getElementById('settingCesiumToken')?.value.trim() || '';
  const gk    = document.getElementById('settingGeminiKey').value.trim();
  const fb    = document.getElementById('settingFirebaseConfig').value.trim();
  const model = document.getElementById('settingGeminiModel').value;

  if (gmk !== state.gmapsKey) {
    state.gmapsKey = gmk;
    localStorage.setItem('ava_gmaps_key', gmk);
  }
  if (ctk !== state.cesiumToken) {
    state.cesiumToken = ctk;
    localStorage.setItem('ava_cesium_token', ctk);
  }
  if ((ctk || gmk) && window.GEO) {
    if (!GEO.isReady()) GEO.init(gmk || undefined, ctk || undefined);
    else showToast('Reload the page to activate the new map settings', 'info');
  }
  if (gk) { state.geminiKey = gk; localStorage.setItem('ava_gemini_key', gk); }
  if (fb) { try { const cfg = JSON.parse(fb); localStorage.setItem('ava_firebase_config', fb); COMMUNITY.init(cfg); } catch(e) { showToast('Invalid Firebase JSON', 'error'); } }
  state.geminiModel = model; localStorage.setItem('ava_gemini_model', model);

  showToast('Settings saved!', 'success');
  closeModal('settingsModal');
}

// Populate settings fields on open
document.addEventListener('DOMContentLoaded', () => {
  const gm = document.getElementById('settingGmapsKey');
  if (gm && state.gmapsKey) gm.value = state.gmapsKey;
  const ct = document.getElementById('settingCesiumToken');
  if (ct && state.cesiumToken) ct.value = state.cesiumToken;
  const sk = document.getElementById('settingGeminiKey');
  if (sk && state.geminiKey) sk.value = state.geminiKey;
  const fb = localStorage.getItem('ava_firebase_config');
  if (fb) { const el = document.getElementById('settingFirebaseConfig'); if (el) el.value = fb; }
});

// ========== AUTH ==========
function handleAuth() {
  // Only sign out if user is a real (non-anonymous) Google account
  // Anonymous users should go straight to Google sign-in on click
  if (COMMUNITY.user && !COMMUNITY.user.isAnonymous) {
    COMMUNITY.signOut();
  } else {
    COMMUNITY.signIn();
  }
}

// ========== VOICE (delegates to tts.js module) ==========
function toggleVoice() { if (window.AVA_TTS) AVA_TTS.toggleMute(); }
function speakAVA(text) { if (window.AVA_TTS) AVA_TTS.speak(text); }
// ========== VOICE INPUT (P4 — Web Speech API) ==========
let _speechRecognition = null;
function toggleMic() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { showToast('Voice input not supported in this browser', 'warn'); return; }
  const btn = document.getElementById('btnMic');
  if (_speechRecognition) {
    _speechRecognition.stop();
    _speechRecognition = null;
    btn?.classList.remove('mic-recording');
    return;
  }
  _speechRecognition = new SpeechRecognition();
  _speechRecognition.lang = 'en-US';
  _speechRecognition.interimResults = false;
  _speechRecognition.maxAlternatives = 1;
  btn?.classList.add('mic-recording');
  showToast('🎤 Listening...', 'info');
  _speechRecognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    // Route to the correct input based on active view
    const isDesigning = document.querySelector('.bottom-sheet.open');
    if (isDesigning) {
      const input = document.getElementById('promptInput');
      if (input) { input.value = transcript; handleDesign(); }
    } else {
      const input = document.getElementById('avaMapChatInput');
      if (input) { input.value = transcript; handleMapChat(); }
    }
  };
  _speechRecognition.onerror = (e) => { showToast(`Mic error: ${e.error}`, 'error'); };
  _speechRecognition.onend = () => {
    _speechRecognition = null;
    btn?.classList.remove('mic-recording');
  };
  _speechRecognition.start();
}

/** Click AVA's avatar — speak/stop toggle */
function handleAvaClick() {
  if (!window.AVA_TTS) return;
  
  // If she's speaking, stop her
  if (document.querySelector('.ava-avatar-wrapper.speaking')) {
    AVA_TTS.stop();
    return;
  }
  
  // Unmute if muted
  if (AVA_TTS.isMuted()) AVA_TTS.toggleMute();
  
  // Speak contextual greeting
  const designSheet = document.getElementById('designSheet');
  const isDesigning = designSheet && designSheet.classList.contains('open');
  
  if (isDesigning && state.activeSite) {
    const site = SITE_CONFIGS[state.activeSite];
    const tierMsg = state.currentTier !== 'none' 
      ? ` Your current SITES score is ${state.currentScore} points, ${state.currentTier} tier.` 
      : ` Your current SITES score is ${state.currentScore} points.`;
    speakAVA(`I'm working on ${site.name} with you.${tierMsg} Describe a design element to add, or let me auto-design something beautiful!`);
  } else {
    speakAVA("Hi! I'm AVA, your Adaptive Visualization Assistant. I can help you explore sites, analyze GIS data, and design sustainable landscapes. Tap a project pin on the map, or switch to Projects to get started!");
  }
}

// ========== MAP CHAT (P2 — Real Gemini AI) ==========
async function handleMapChat() {
  const input = document.getElementById('avaMapChatInput');
  if (!input || !input.value.trim()) return;
  const question = input.value.trim();
  input.value = '';
  const container = document.getElementById('avaMapMessages');
  if (!container) return;
  
  // Show user message
  const userMsg = document.createElement('div');
  userMsg.className = 'chat-msg user';
  userMsg.textContent = question;
  container.appendChild(userMsg);
  
  // Typing indicator
  const typingMsg = document.createElement('div');
  typingMsg.className = 'chat-msg ava';
  typingMsg.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
  container.appendChild(typingMsg);
  container.scrollTop = container.scrollHeight;

  // Build rich site context for Gemini
  const sites = Object.values(SITE_CONFIGS);
  const siteContext = sites.map(s => 
    `${s.name} (${s.college}): ${s.history?.summary || ''} Area: ${s.metrics?.area || 'N/A'}. ` +
    `Baseline score: ${s.baselineScore}/200. Sections: ${(s.sections||[]).map(sec => sec.name).join(', ')}.`
  ).join('\n');

  const systemPrompt = `You are AVA (Adaptive Visualization Assistant), an AI landscape architecture and GIS assistant built by Think! Design and Planning, LLC. You help users explore sites, analyze spatial data (parcels, soils, zoning, contours), and design sustainable landscapes using the SITES v2 rating system. You manage these project sites:\n${siteContext}\n\nMAP COMMANDS — embed these tokens in your response when the user's request involves map actions:\n- Toggle a GIS layer on/off: [CMD:toggle_layer:parcels] [CMD:toggle_layer:soils] [CMD:toggle_layer:zoning] [CMD:toggle_layer:contours] [CMD:toggle_layer:roads]\n- Navigate to an address: [CMD:fly_to:123 Main St, Greensboro NC]\n- Focus a project site: [CMD:focus_site:site-id]\n- Reset to overview: [CMD:reset_view]\n- Zoom in/out: [CMD:zoom_in] [CMD:zoom_out]\nEmbed the command token naturally in your sentence and it will be executed automatically.\n\nIMPORTANT RULES:\n- Be warm, concise, and professional\n- Reference specific site data when relevant\n- Keep responses to 2-3 sentences\n- If asked to show a layer, include the appropriate [CMD:toggle_layer:X] token\n- If asked to go somewhere, include [CMD:fly_to:address] with the full address\n- If asked about SITES v2, explain the sustainability scoring system briefly`;

  try {
    // Use the user's configured model for text chat, with fallback chain
    const models = [state.geminiModel || 'gemini-2.5-flash', 'gemini-2.0-flash-exp'];
    let response = null;
    for (const model of models) {
      try {
        const res = await fetch('/.netlify/functions/gemini-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model,
            payload: {
              system_instruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: 'user', parts: [{ text: question }] }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 256 }
            }
          })
        });
        if (!res.ok) continue;
        const data = await res.json();
        response = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (response) break;
      } catch (e) { continue; }
    }
    if (!response) response = 'I couldn\'t process that — try rephrasing your question!';
    const clean = window.AVA_COMMANDS ? AVA_COMMANDS.execute(response) : response;
    typingMsg.innerHTML = clean;
    speakAVA(clean);
  } catch (err) {
    // Fallback to smart static response
    const siteNames = sites.map(s => s.name).join(', ');
    const fallback = `Great question! I manage ${sites.length} sites: ${siteNames}. Switch to Projects to explore each one and start designing with SITES v2 sustainability scoring.`;
    typingMsg.innerHTML = fallback;
    speakAVA(fallback);
  }
  container.scrollTop = container.scrollHeight;
}


// ========== PPGIS ==========
function togglePPGISMode() { console.log("[AVA V.4] PPGIS mode — location pinning will attach to 3D canvas clicks."); }
function togglePPGISTag(el) { el.classList.toggle('active'); }
function submitPPGIS() {
  const type = document.getElementById('ppgisType').value;
  const content = document.getElementById('ppgisContent').value.trim();
  const photoFile = document.getElementById('ppgisPhoto').files[0];
  const tags = [...document.querySelectorAll('.ppgis-tag.active')].map(t => t.dataset.tag);
  const gps = null;
  if (!gps) { showToast('Click a location on the map first', 'warn'); return; }
  if (!content) { showToast('Add a description', 'warn'); return; }
  COMMUNITY.saveContribution(type, gps, content, tags, photoFile);
  closeModal('ppgisModal');
  /* EARTH.ppgisMode = false; */
  document.getElementById('btnPPGIS')?.classList.remove('active');
}

// ========== SAVE TO CLOUD ==========
function saveToCloud() {
  if (!state.generatedImageBase64) { showToast('Generate a design first', 'warn'); return; }
  COMMUNITY.saveDesign(state.activeSite, state.generatedImageBase64, {
    prompt: state.cumulativePrompts.join('; '),
    score: state.currentScore, tier: state.currentTier,
    sectionScores: state.sectionScores, iterationCount: state.iterationCount,
    cumulativePrompts: state.cumulativePrompts
  });
}

// ========== COMMUNITY GALLERY (delegated to gallery-panel.js) ==========
function renderCommunityGallery(designs) { if (window.GALLERY) GALLERY.render(designs); }
function buildHotTopics() {} // Legacy stub — replaced by aggregate-engine.js

function _legacyRenderCommunityGallery(designs) {
  const grid = document.getElementById('communityGrid');
  if (!grid) return;
  if (!designs.length) {
    grid.innerHTML = `<div class="community-empty">
      <span class="material-symbols-outlined" style="font-size:48px;opacity:0.3">landscape</span>
      <p>No community designs yet. Be the first — design a space and click "Share to Gallery"!</p>
    </div>`;
    return;
  }

  // Render design cards with prompts visible
  grid.innerHTML = designs.map(d => {
    const siteName = SITE_CONFIGS[d.siteId]?.name || d.siteId;
    const prompts = d.cumulativePrompts || [];
    const promptList = prompts.length > 0
      ? prompts.map(p => `<li>${escapeHTML(p.substring(0, 120))}</li>`).join('')
      : `<li>${escapeHTML((d.prompt || 'No prompt recorded').substring(0, 200))}</li>`;
    const tierEmoji = { platinum: '🏆', gold: '🥇', silver: '🥈', certified: 'âœ…' }[d.tier] || '';
    return `
    <div class="community-card">
      <img src="${d.imageUrl}" alt="Design" loading="lazy" onerror="this.style.display='none'">
      <div class="community-card-info">
        <div class="community-card-header">
          <span class="community-card-author">${escapeHTML(d.authorName || 'AVA Designer')}</span>
          <span class="community-card-site">${escapeHTML(siteName)}</span>
        </div>
        <div class="community-card-score">${tierEmoji} ${d.tier || ''} Â· ${d.sitesScore || 0}/200 pts</div>
        <div class="community-card-prompts">
          <div class="prompts-label">Design Elements:</div>
          <ul>${promptList}</ul>
        </div>
        <div class="community-card-actions">
          <button class="community-vote-btn" onclick="event.stopPropagation();COMMUNITY.vote('designs','${d.id}');this.textContent='â¤️ '+(${(d.votes||0)}+1)">
            â¤️ ${d.votes || 0}
          </button>
          <span class="community-card-date">${d.createdAt?.toDate ? d.createdAt.toDate().toLocaleDateString() : ''}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  // Hot Topics analysis — mine all prompts for recurring themes
  buildHotTopics(designs);
}

function buildHotTopics(designs) {
  const topicsEl = document.getElementById('hotTopics');
  const cloudEl = document.getElementById('hotTopicsCloud');
  if (!topicsEl || !cloudEl) return;

  // Gather all prompts
  const allText = designs.flatMap(d => d.cumulativePrompts || [d.prompt || '']).join(' ').toLowerCase();
  
  // Keywords to track (design elements people care about)
  const trackKeywords = [
    'bioswale', 'rain garden', 'permeable', 'native', 'tree', 'bench', 'seating',
    'shade', 'lighting', 'solar', 'garden', 'path', 'walkway', 'water', 'fountain',
    'pollinator', 'meadow', 'green wall', 'living wall', 'mural', 'art', 'sculpture',
    'playground', 'gathering', 'plaza', 'stage', 'amphitheater', 'classroom',
    'accessibility', 'ADA', 'bike', 'signage', 'habitat', 'bird', 'butterfly',
    'stormwater', 'cistern', 'green roof', 'IoT', 'sensor', 'innovation',
    'pergola', 'canopy', 'flower', 'shrub', 'groundcover', 'fern', 'vine',
    'wellness', 'meditation', 'study', 'recreation', 'food', 'herb'
  ];

  const counts = {};
  trackKeywords.forEach(kw => {
    const regex = new RegExp(kw.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'), 'gi');
    const matches = allText.match(regex);
    if (matches && matches.length > 0) counts[kw] = matches.length;
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (sorted.length === 0) { topicsEl.style.display = 'none'; return; }

  const maxCount = sorted[0][1];
  cloudEl.innerHTML = sorted.map(([word, count]) => {
    const size = Math.max(12, Math.min(28, 12 + (count / maxCount) * 16));
    const opacity = Math.max(0.6, count / maxCount);
    return `<span class="hot-topic-tag" style="font-size:${size}px;opacity:${opacity}" title="Mentioned ${count} times">${word} <sup>${count}</sup></span>`;
  }).join('');
  topicsEl.style.display = 'block';
}

// ========== DOWNLOAD ==========
function downloadPNG() {
  if (!state.generatedImageBase64) { showToast('No design to download', 'warn'); return; }
  const a = document.createElement('a');
  a.href = `data:image/png;base64,${state.generatedImageBase64}`;
  a.download = `${SITE_CONFIGS[state.activeSite]?.downloadPrefix || 'AVA'}-Iter${state.iterationCount}-${new Date().toISOString().slice(0,10)}.png`;
  a.click();
}

function resetDesign() { if (state.activeSite) openDesignSheet(state.activeSite); }
function publishToCRE() { showToast('CRE publishing coming soon', 'info'); }

// ========== HELPER FUNCTIONS ==========
function getSiteConfig() { return SITE_CONFIGS[state.activeSite] || {}; }
function getSiteMetrics() { return getSiteConfig().metrics || {}; }
function getSiteSections() { return getSiteConfig().sections || []; }
function getSiteTiers() { return getSiteConfig().tierThresholds || { certified: 70, silver: 85, gold: 100, platinum: 135 }; }
function selectSite(siteId) { openDesignSheet(siteId); }

// Expose openDesignSheet globally (used by project cards and 3D canvas click events)
window.openDesignSheet = openDesignSheet;

// ========== BEFORE/AFTER SLIDER (P0 — touch + mouse + keyboard + snap) ==========
function initBeforeAfterSlider() {
  let dragging = false;
  const getView = () => document.getElementById('beforeAfterView');
  const getOverlay = () => document.getElementById('generatedOverlay');
  const getHandle = () => document.getElementById('sliderHandle');

  function updateSlider(clientX) {
    const view = getView();
    if (!view || view.style.display === 'none') return;
    const rect = view.getBoundingClientRect();
    let pct = ((clientX - rect.left) / rect.width) * 100;
    pct = Math.max(2, Math.min(98, pct));
    const overlay = getOverlay();
    const handle = getHandle();
    if (overlay) overlay.style.clipPath = `inset(0 0 0 ${pct}%)`;
    if (handle) handle.style.left = `${pct}%`;
  }

  // Mouse events
  document.addEventListener('mousedown', e => {
    if (e.target.closest('#sliderHandle') || e.target.closest('.ba-handle-knob')) { dragging = true; e.preventDefault(); }
  });
  document.addEventListener('mouseup', () => dragging = false);
  document.addEventListener('mousemove', e => { if (dragging) updateSlider(e.clientX); });

  // Touch events — critical for mobile
  document.addEventListener('touchstart', e => {
    if (e.target.closest('#sliderHandle') || e.target.closest('.ba-handle-knob')) { dragging = true; e.preventDefault(); }
  }, { passive: false });
  document.addEventListener('touchend', () => dragging = false);
  document.addEventListener('touchmove', e => {
    if (!dragging) return;
    e.preventDefault();
    updateSlider(e.touches[0].clientX);
  }, { passive: false });

  // Double-click snap: toggle 0% ↔ 100%
  document.addEventListener('dblclick', e => {
    if (!e.target.closest('#beforeAfterView')) return;
    const view = getView();
    const overlay = getOverlay();
    const handle = getHandle();
    if (!view || !overlay || !handle) return;
    const currentPct = parseFloat(handle.style.left) || 50;
    const snapTo = currentPct < 50 ? 98 : 2;
    overlay.style.clipPath = `inset(0 0 0 ${snapTo}%)`;
    handle.style.left = `${snapTo}%`;
  });

  // Keyboard arrows when slider is focused
  document.addEventListener('keydown', e => {
    const view = getView();
    if (!view || view.style.display === 'none') return;
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
    const handle = getHandle();
    const overlay = getOverlay();
    if (!handle || !overlay) return;
    let pct = parseFloat(handle.style.left) || 50;
    if (e.key === 'ArrowLeft')  pct = Math.max(2, pct - 2);
    else if (e.key === 'ArrowRight') pct = Math.min(98, pct + 2);
    else return;
    e.preventDefault();
    overlay.style.clipPath = `inset(0 0 0 ${pct}%)`;
    handle.style.left = `${pct}%`;
  });
}

// ========== DESIGN HISTORY / UNDO (P3) ==========
function pushHistory() {
  if (!state.generatedImageBase64) return;
  state.designHistory.push({
    imageBase64: state.generatedImageBase64,
    scores: [...state.sectionScores],
    tier: state.currentTier,
    score: state.currentScore,
    prompts: [...state.cumulativePrompts],
    iteration: state.iterationCount
  });
  updateHistoryTimeline();
  const undoBtn = document.getElementById('btnUndo');
  if (undoBtn && state.designHistory.length > 1) undoBtn.style.display = '';
}

function undoDesign() {
  if (state.designHistory.length < 2) { showToast('Nothing to undo', 'info'); return; }
  // Pop current, restore previous
  state.designHistory.pop();
  const prev = state.designHistory[state.designHistory.length - 1];
  state.generatedImageBase64 = prev.imageBase64;
  state.workingBaselineBase64 = prev.imageBase64;
  state.sectionScores = [...prev.scores];
  state.currentScore = prev.score;
  state.currentTier = prev.tier;
  state.cumulativePrompts = [...prev.prompts];
  state.iterationCount = prev.iteration;
  displayGeneratedImage(prev.imageBase64);
  updateScoreDisplay(prev.score, prev.scores);
  document.getElementById('iterationBadge').textContent = `Iteration ${prev.iteration}`;
  addChatMessage('ava', '↩️ Reverted to previous iteration.');
  if (state.designHistory.length < 2) document.getElementById('btnUndo').style.display = 'none';
  updateHistoryTimeline();
  showToast('Design undone', 'success');
}

function updateHistoryTimeline() {
  const timeline = document.getElementById('historyTimeline');
  if (!timeline) return;
  if (state.designHistory.length < 1) { timeline.style.display = 'none'; return; }
  timeline.style.display = 'flex';
  timeline.innerHTML = state.designHistory.map((h, i) => {
    const isActive = i === state.designHistory.length - 1;
    const src = h.imageBase64.startsWith('data:') ? h.imageBase64 : `data:image/png;base64,${h.imageBase64}`;
    return `<div class="history-thumb ${isActive ? 'active' : ''}" onclick="restoreHistory(${i})" title="Iteration ${h.iteration} — ${h.score} pts">
      <img src="${src}" alt="Iter ${h.iteration}">
      <span class="history-thumb-label">#${h.iteration}</span>
    </div>`;
  }).join('');
  timeline.scrollLeft = timeline.scrollWidth;
}

function restoreHistory(index) {
  if (index < 0 || index >= state.designHistory.length) return;
  // Trim history to selected point
  state.designHistory = state.designHistory.slice(0, index + 1);
  const entry = state.designHistory[index];
  state.generatedImageBase64 = entry.imageBase64;
  state.workingBaselineBase64 = entry.imageBase64;
  state.sectionScores = [...entry.scores];
  state.currentScore = entry.score;
  state.currentTier = entry.tier;
  state.cumulativePrompts = [...entry.prompts];
  state.iterationCount = entry.iteration;
  displayGeneratedImage(entry.imageBase64);
  updateScoreDisplay(entry.score, entry.scores);
  document.getElementById('iterationBadge').textContent = `Iteration ${entry.iteration}`;
  addChatMessage('ava', `↩️ Restored to iteration ${entry.iteration}.`);
  updateHistoryTimeline();
  if (state.designHistory.length < 2) document.getElementById('btnUndo').style.display = 'none';
}

// ========== SEASONAL VIEWS (P1) ==========
const SEASONAL_PROMPTS = {
  spring: 'Transform this exact landscape scene to show early spring: fresh bright green leaves emerging, cherry blossoms and dogwoods in bloom, flowering groundcovers, light rain puddles, soft overcast sky with warm undertones, students in light jackets walking the paths.',
  summer: 'Transform this exact landscape scene to show peak summer: full lush dark green tree canopy providing dense shade, vibrant flowers at maximum bloom, golden hour afternoon sunlight with long warm shadows, students in summer clothes enjoying the space, deep blue sky.',
  fall: 'Transform this exact landscape scene to show autumn/fall: brilliant fall foliage with red maples, golden oaks, orange and burgundy deciduous leaves, some leaves on ground, warm golden afternoon light, students in sweaters and jackets, crisp clear sky.',
  winter: 'Transform this exact landscape scene to show winter: bare deciduous tree branches revealing structure, evergreen trees and conifers prominent, frost on ground and benches, dormant brown perennials, overcast sky, students in winter coats and scarves, gentle ambient light.'
};

async function openSeasonalViews() {
  if (!state.generatedImageBase64) { showToast('Generate a design first', 'warn'); return; }
  state.seasonalImages = {};
  openModal('seasonalModal');
  
  // Reset all cards to loading state
  ['spring', 'summer', 'fall', 'winter'].forEach(season => {
    const card = document.getElementById('season' + season.charAt(0).toUpperCase() + season.slice(1));
    if (!card) return;
    const existingImg = card.querySelector('img.seasonal-result');
    if (existingImg) existingImg.remove();
    const loading = card.querySelector('.seasonal-loading');
    if (loading) loading.style.display = 'flex';
  });

  // Fire all 4 in parallel
  const seasons = Object.entries(SEASONAL_PROMPTS);
  const promises = seasons.map(([season, prompt]) => generateSeasonalImage(season, prompt));
  await Promise.allSettled(promises);
  addChatMessage('ava', '🍂 Seasonal views are ready! Check the modal to see your design across all four seasons.');
}

async function generateSeasonalImage(season, prompt) {
  const DE = window.DESIGN_ENGINE;
  if (!DE?.callGeminiAPI) { showToast('Design engine not loaded', 'error'); return; }
  
  try {
    const result = await DE.callGeminiAPI(prompt, state.generatedImageBase64, null, null);
    if (result?.imageBase64) {
      state.seasonalImages[season] = result.imageBase64;
      const cardId = 'season' + season.charAt(0).toUpperCase() + season.slice(1);
      const card = document.getElementById(cardId);
      if (card) {
        const loading = card.querySelector('.seasonal-loading');
        if (loading) loading.style.display = 'none';
        const img = document.createElement('img');
        img.className = 'seasonal-result';
        img.src = `data:image/png;base64,${result.imageBase64}`;
        img.alt = `${season} view`;
        card.insertBefore(img, card.firstChild);
      }
    }
  } catch (err) {
    console.warn(`Seasonal ${season} failed:`, err);
    const cardId = 'season' + season.charAt(0).toUpperCase() + season.slice(1);
    const card = document.getElementById(cardId);
    if (card) {
      const loading = card.querySelector('.seasonal-loading');
      if (loading) loading.innerHTML = `<span class="material-symbols-outlined" style="font-size:24px;opacity:0.3">error</span>Failed — try again`;
    }
  }
}

function downloadSeasonImg(season) {
  const base64 = state.seasonalImages[season];
  if (!base64) { showToast('Image not generated yet', 'warn'); return; }
  const a = document.createElement('a');
  a.href = `data:image/png;base64,${base64}`;
  const siteName = SITE_CONFIGS[state.activeSite]?.downloadPrefix || 'AVA';
  a.download = `${siteName}-${season}-${new Date().toISOString().slice(0,10)}.png`;
  a.click();
}

async function downloadSeasonalComposite() {
  const seasons = ['spring', 'summer', 'fall', 'winter'];
  const loaded = seasons.filter(s => state.seasonalImages[s]);
  if (loaded.length < 4) { showToast(`Only ${loaded.length}/4 seasons ready`, 'warn'); return; }
  
  showToast('Building 2×2 composite...', 'info');
  const canvas = document.createElement('canvas');
  const size = 512;
  canvas.width = size * 2;
  canvas.height = size * 2;
  const ctx = canvas.getContext('2d');
  
  const labels = { spring: '🌸 SPRING', summer: '☀️ SUMMER', fall: '🍂 FALL', winter: '❄️ WINTER' };
  
  for (let i = 0; i < 4; i++) {
    const season = seasons[i];
    const img = new Image();
    img.src = `data:image/png;base64,${state.seasonalImages[season]}`;
    await new Promise(r => { img.onload = r; img.onerror = r; });
    const x = (i % 2) * size;
    const y = Math.floor(i / 2) * size;
    ctx.drawImage(img, x, y, size, size);
    // Label overlay
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x, y + size - 32, size, 32);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(labels[season], x + size / 2, y + size - 10);
  }
  
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  const siteName = SITE_CONFIGS[state.activeSite]?.downloadPrefix || 'AVA';
  a.download = `${siteName}-Seasonal-Composite-${new Date().toISOString().slice(0,10)}.png`;
  a.click();
  showToast('Composite downloaded!', 'success');
}
