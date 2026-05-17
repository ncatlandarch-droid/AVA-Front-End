/* design-engine.js — SITES v2 scoring, boost prompts, Gemini image generation */

// Penalty keywords that reduce section scores when typed by the user
const SECTION_PENALTY_KEYWORDS = {
  3: [ // Water — impervious / anti-drainage choices
    'parking lot','add parking','more parking','blacktop','asphalt','pave over','seal ground',
    'impervious surface','cover the soil','concrete everywhere','remove drainage','remove water feature',
    'no drainage','fill in','fill the pond','bury the stream','pave the garden','hard surface everywhere'
  ],
  4: [ // Soil + Vegetation — removal / chemical / invasive
    'remove trees','cut down trees','clear cut','fell trees','remove plants','remove all vegetation',
    'clear vegetation','remove garden','remove the garden','tear out','kill plants','deforest',
    'pesticide','herbicide','chemical fertilizer','invasive plant','invasive species',
    'monoculture lawn','grass only','turf only','strip the soil','remove canopy',
    'remove shrubs','rip out','clear the land','bare soil','no plants'
  ],
  5: [ // Materials — unsustainable choices
    'cheap material','non-recycled','virgin plastic','toxic material','single use','disposable'
  ],
  6: [ // Human Health — reducing access/comfort
    'remove seating','remove benches','close the path','block the walkway','remove shade',
    'limit access','no seating','remove chairs','remove tables','close off','fence it off',
    'no gathering','no people','restrict access'
  ],
  9: [ // Education — removing informational elements
    'remove signs','remove signage','remove labels','remove displays','no signs','no signage'
  ],
  10: [ // Innovation — removing tech
    'remove sensors','remove technology','remove solar','no technology','low tech only','remove innovation'
  ]
};

function computePenalties(prompt, config) {
  if (!config) return [];
  const lower = prompt.toLowerCase();
  return config.sections.map(s => {
    const penalties = (s.penaltyKeywords || []).concat(SECTION_PENALTY_KEYWORDS[s.id] || []);
    const hits = penalties.filter(kw => lower.includes(kw.toLowerCase())).length;
    return hits > 0 ? Math.min(hits * 4, Math.floor(s.maxPts * 0.30)) : 0;
  });
}

function getScoringReasons(prompt, config) {
  if (!config) return {};
  const lower = prompt.toLowerCase();
  const reasons = {};
  config.sections.forEach(s => {
    const gained = (s.keywords || []).filter(kw => lower.includes(kw.toLowerCase())).slice(0, 4);
    const lost = (s.penaltyKeywords || []).concat(SECTION_PENALTY_KEYWORDS[s.id] || [])
      .filter(kw => lower.includes(kw.toLowerCase())).slice(0, 3);
    if (gained.length > 0 || lost.length > 0) reasons[s.id] = { gained, lost };
  });
  return reasons;
}

function scoreSITESv2(prompt) {
  const config = SITE_CONFIGS[state.activeSite];
  if (!config) return new Array(10).fill(0);
  const lower = prompt.toLowerCase();
  const iterBonus = Math.min(state.iterationCount, 15);
  return config.sections.map(s => {
    // Pure assumed sections (no keywords) get fixed points only
    if (s.assumed && (!s.keywords || s.keywords.length === 0)) return s.assumedPts || 0;
    // Sections with keywords use assumedPts as FLOOR, can grow via keyword matching
    const floor = (s.assumed && s.assumedPts) ? s.assumedPts : 0;
    let hits = 0;
    (s.keywords || []).forEach(kw => { if (lower.includes(kw.toLowerCase())) hits++; });
    // Progressive scoring: first few hits are high-value so every decision matters
    let kwScore = 0;
    for (let i = 0; i < hits; i++) {
      if (i < 3) kwScore += 4;        // First 3 keywords: 4 pts each (student feels impact)
      else if (i < 6) kwScore += 3;    // Next 3: 3 pts each
      else if (i < 10) kwScore += 2;   // Next 4: 2 pts each
      else kwScore += 1;               // Remaining: 1 pt each (diminishing returns)
    }
    const kwCap = Math.floor(s.maxPts * 0.85);  // Allow up to 85% from keywords alone
    kwScore = Math.min(kwScore, kwCap);
    const iterPts = hits > 0 ? Math.min(iterBonus, Math.floor(s.maxPts * 0.40)) : 0;
    const densityBonus = hits >= 8 ? Math.floor(s.maxPts * 0.15) : hits >= 5 ? Math.floor(s.maxPts * 0.08) : 0;
    const computed = Math.round(kwScore + iterPts + densityBonus);
    return Math.min(Math.max(computed, floor), s.maxPts);
  });
}

function getTier(score) {
  const t = SITE_CONFIGS[state.activeSite]?.tierThresholds || { certified:70, silver:85, gold:100, platinum:135 };
  if (score >= t.platinum) return 'platinum';
  if (score >= t.gold) return 'gold';
  if (score >= t.silver) return 'silver';
  if (score >= t.certified) return 'certified';
  return 'none';
}

let _lastBoostedSectionId = -1;

function getBoostPrompt() {
  const scores = state.sectionScores;
  const config = SITE_CONFIGS[state.activeSite];
  if (!config) return 'Add sustainable design elements.';
  const designable = [];
  scores.forEach((s, i) => {
    // Skip sections with no keywords (purely assumed, non-designable)
    if (!config.sections[i].keywords || config.sections[i].keywords.length === 0) return;
    designable.push({ idx: i, id: config.sections[i].id, ratio: s / config.sections[i].maxPts, name: config.sections[i].name });
  });
  designable.sort((a, b) => a.ratio - b.ratio);
  let target = designable[0];
  if (designable.length > 1 && target.id === _lastBoostedSectionId) {
    target = designable[1];
  }
  _lastBoostedSectionId = target.id;
  const boosts = {
    3: [
      'Add bioswales with native sedges, rain gardens with permeable paving, cisterns for water harvest, and stormwater retention basins.',
      'Install infiltration planters at building downspouts, a greywater recycling system, permeable paver walkways, and a constructed wetland for water filtration.',
      'Create a bioretention cell with native rushes, add green infrastructure drainage swales, install a rainwater cistern, and use pervious concrete for gathering areas.'
    ],
    4: [
      'Plant native Piedmont canopy trees (Red Oak, Redbud), pollinator meadow, groundcover, and biodiverse shrub borders with deep root zone topsoil.',
      'Restore soil health with organic compost amendment, plant a native understory of Dogwood and Spicebush, add a fern garden, and create a wildflower meadow.',
      'Install mycorrhizal-inoculated topsoil, plant a habitat corridor of native Beautyberry, Inkberry, and Winterberry shrubs, add Milkweed and Goldenrod for pollinators.'
    ],
    5: [
      'Use reclaimed brick, FSC-certified timber, recycled steel, salvaged stone, and locally-sourced permeable pavers.',
      'Construct seat walls from salvaged stone, install recycled-content steel arbors, use local Piedmont granite for accent walls, and FSC-certified wood for pergola structures.',
      'Add Corten steel sculptural screens, bamboo shade structures, recycled glass aggregate in concrete, and regionally-sourced flagstone pathways.'
    ],
    6: [
      'Add ADA-accessible loop pathways, shaded seating clusters, solar LED lighting, an outdoor classroom amphitheater, and a gathering plaza for wellness.',
      'Install ergonomic benches under tree canopy, a meditation garden with water feature, accessible ramps connecting all levels, and evening-use LED path lighting.',
      'Create a wellness garden with aromatic herbs, add covered study pods with charging ports, install inclusive playground elements, and solar-powered pathway lights.'
    ],
    9: [
      'Add interpretive signage about native ecology, wayfinding totems, QR codes linking to AVA digital twin, educational exhibits, and a demonstration rain garden.',
      'Install a living lab teaching garden, phenology observation stations, tree species identification signs, and a self-guided sustainability tour with QR code markers.',
      'Create an outdoor classroom with interpretive panels about SITES v2 credits, add stormwater education markers showing watershed flow, and educational plant ID labels.'
    ],
    10: [
      'Integrate IoT soil moisture sensors, smart irrigation scheduling, digital twin monitoring kiosk, solar panel shade structures, and innovative green roof systems.',
      'Install acoustic bird monitoring sensors, a micro-weather station, AI-powered irrigation controllers, renewable energy charging stations, and grey water recycling.',
      'Add real-time air quality sensors, smart composting systems, solar-powered landscape lighting with motion detection, and a green wall innovation prototype.'
    ]
  };
  const variants = boosts[target.id] || [`Add design elements for ${target.name} to boost your score.`];
  return variants[Math.floor(Math.random() * variants.length)];
}

function getAutoDesignPrompt() {
  const config = SITE_CONFIGS[state.activeSite];
  if (!config) return 'Design a complete sustainable landscape transformation.';
  const siteSpecific = {
    'holland-bowl': `Transform the Holland Bowl into a world-class sustainable campus landscape:
WATER: Install a large bioswale running through the basin with native sedges, three rain gardens along walkways with permeable paving stones, an underground cistern for rainwater harvest, and a stormwater retention basin at the lowest point of the bowl.
SOIL & VEGETATION: Remediate the compacted Piedmont clay with deep-tilled organic topsoil amendment. Plant a native Piedmont canopy of Red Oak, Sweetgum, and Eastern Redbud trees. Create a pollinator meadow of Black-eyed Susan, Purple Coneflower, and native wildflowers. Add biodiverse shrub borders of Beautyberry and Inkberry with native groundcover of Wild Ginger.
MATERIALS: Construct pathways using reclaimed brick, FSC-certified timber benches, recycled steel arbors, salvaged stone seat walls, and locally-sourced permeable pavers.
WELLNESS: Build ADA-accessible pathways with gentle grades, shaded seating clusters under tree canopy, solar-powered LED pathway lighting, an outdoor classroom amphitheater, and a central gathering plaza with a water feature.
EDUCATION: Install interpretive signage about native ecology, wayfinding totems, QR code stations linking to AVA digital twin, educational exhibits about SITES sustainability, and a demonstration rain garden with visible cross-section.
INNOVATION: Integrate IoT soil moisture sensors, smart drip irrigation, a digital twin monitoring kiosk, solar panel shade structures, and a green roof on the adjacent covered walkway.`,

    'inspiration-courtyard': `Transform the Monroe Hall Engineering Courtyard into a spectacular Patrick Blanc-inspired sustainable living showcase:
LIVING GREEN WALLS: Install dramatic vertical living wall systems on portions of Monroe Hall and McNair Hall brick facades. Vegetation must grow ONLY in the solid brick areas BETWEEN windows. Each window must remain as a CLEAR RECTANGULAR OPENING. The walls must display RICH, SATURATED COLOR TAPESTRIES with undulating flowing patterns: deep burgundy Heuchera, royal purple Tradescantia, bright chartreuse Lysimachia, coral-red Coral Bells, silver-blue Festuca, rust-orange Carex, hot pink Dianthus, golden-yellow Rudbeckia, snowy white native Phlox, and deep indigo Ajuga.
WATER & RAIN GARDENS: Install rain gardens at the base of EVERY visible building downspout. Add bioswales along the courtyard perimeter, permeable paving throughout all walkways, a decorative sculptural cistern for rainwater harvest, infiltration planters, and a linear water channel flowing through the courtyard.
PARKING LOT SCREENING: Along the courtyard edge facing the parking lot, install a dense multi-layered LANDSCAPE screen — Southern Magnolia, Eastern Red Cedar, Holly, Wax Myrtle, Hydrangea, Sweetspire, Viburnum.
SOIL & VEGETATION: Remediate compacted subgrade with engineered topsoil, compost, and mycorrhizal inoculant. Plant in PERMACULTURE GUILDS — Willow Oak, Flowering Dogwood, Eastern Redbud, Spicebush, Winterberry, Beautyberry, Inkberry, Milkweed, Aster, Goldenrod, Joe-Pye Weed, Creeping Phlox, Wild Ginger, Carex pensylvanica, Virginia Creeper.
MATERIALS: Reclaimed brick in herringbone patterns, permeable pavers, FSC-certified timber pergolas, recycled steel trellis screens, salvaged stone accent walls.
OVERHEAD ELEMENTS: Dramatic parametric canopy structures with climbing vines, solar panels integrated into the framework, LED strip lighting.
SEATING: Ergonomic timber benches under tree canopy, individual study pods with charging ports, circular gathering benches, shaded hammock zones, standing-height collaboration tables. EVERY seat under overhead cover.
OUTDOOR CLASSROOM: Tiered amphitheater-style seating accommodating 30+ students with presentation wall and shade canopy.
EDUCATION: Interpretive panels about ecological transformation, wayfinding, QR code markers for AVA digital twin, living lab demonstration area.
INNOVATION: IoT sensors monitoring microclimate, smart irrigation, digital twin display kiosk, solar panel canopy, modular green wall panels, grey water recycling.`,

    'woodland-garden': `Transform this cleared woodland opening into a spectacular research-grade Woodland Garden:
PRESERVE EXISTING TREES: KEEP every existing mature tree trunk, canopy, and root zone EXACTLY as shown.
WOODLAND FLOOR RESTORATION: Plant in naturalistic drifts — Trillium, Bloodroot, Virginia Bluebells, Hepatica, Mayapple, Solomon's Seal, Jack-in-the-Pulpit, Wild Ginger. Fern groves — Christmas Fern, Maidenhair Fern, Cinnamon Fern. Shade groundcovers — Pachysandra procumbens, Partridge Berry, Foamflower. Shrub layer — native Azalea, Mountain Laurel, Oakleaf Hydrangea, Witch Hazel, Spicebush.
WATER: Naturalistic ephemeral stream channel with native stone boulders and rain gardens. Bioswale channels directing runoff through planted filtration zones. Rain garden basins with native rushes, sedges, and Joe-Pye Weed.
PATHWAYS: Natural stone stepping-stone paths and decomposed granite trails. Elevated timber boardwalks over sensitive root zones. Forest bathing contemplation trail.
SEATING: Natural stone benches, log benches from fallen timber, meditation platforms under tree canopy.
MATERIALS: Natural stone, FSC-certified timber, decomposed granite, reclaimed logs, natural wood chip paths.
EDUCATION: Interpretive signage about forest ecology, tree species identification, QR codes linking to AVA digital twin research data.
INNOVATION: IoT soil moisture and temperature sensors, wildlife camera traps, microclimate weather station, digital twin data collection kiosk, acoustic bird monitoring.`
  };
  if (siteSpecific[state.activeSite]) return siteSpecific[state.activeSite];

  // Parcel-mode: generate a site-specific auto-design using actual parcel data
  const m = config.metrics || {};
  const acres = m.totalAreaAcres || '?';
  const soil  = m.soilType || 'Piedmont clay';
  const use   = m.landUse  ? `, currently ${m.landUse}` : '';
  const zone  = m.zone     ? `, zoned ${m.zone}` : '';
  return `Design a complete SITES v2 Platinum-targeting sustainable landscape master plan for ${config.name} (${acres} acres, ${soil} soil${use}${zone}). Target ≥135/200 points.

WATER (§3 — 40 pts): Install bioswales along all paved edges with native sedges. Rain gardens at every building downspout and impervious edge. Permeable paving for ≥50% of all hardscape areas. Underground cistern for rainwater harvest. Stormwater retention basin at lowest topographic point. Aim to capture the 1% ARI storm event on-site.

SOIL & VEGETATION (§4 — 45 pts): Remediate compacted soils with deep-tilled organic topsoil and mycorrhizal inoculant. Plant native Piedmont canopy trees — Willow Oak, Sweetgum, Eastern Redbud, Flowering Dogwood — targeting ≥25% canopy at maturity. Pollinator meadow of Black-eyed Susan, Purple Coneflower, Goldenrod, Milkweed, and native asters. Multi-layered shrub borders of Beautyberry, Inkberry, Winterberry, Spicebush. Groundcover of Wild Ginger, Carex pensylvanica, and Creeping Phlox.

MATERIALS (§5 — 20 pts): Reclaimed brick pathways in herringbone pattern. FSC-certified timber for benches, pergolas, and shade structures. Recycled steel for arbors and trellis screens. Locally-sourced Piedmont granite and fieldstone for seat walls. Permeable concrete pavers for plazas.

HUMAN HEALTH (§6 — 30 pts): ADA-accessible loop pathway connecting all zones. Shaded seating cluster every 200 feet. Solar-powered LED pathway lighting for evening use. Outdoor classroom / amphitheater seating 30+ people. Central gathering plaza with sculptural water feature. Ergonomic timber benches under tree canopy. Individual study pods with charging ports.

EDUCATION (§9 — 20 pts): Interpretive signage about native Piedmont ecology and SITES v2 credits. Wayfinding totems with site map. QR code stations linking to AVA digital twin. Demonstration rain garden with visible cross-section exhibit. Tree species identification labels.

INNOVATION (§10 — 20 pts): IoT soil moisture and temperature sensors. Smart drip irrigation with weather-responsive scheduling. Solar panel shade structure integrated into gathering area. Real-time monitoring kiosk connected to digital twin. Acoustic bird monitoring. Green roof element on any covered structure.`;
}

// SITES v2 credit reference injected into every parcel-mode prompt
const SITES_CREDIT_BRIEF = `
SITES v2 SUSTAINABILITY TARGETS (200 pts total — aim for Platinum ≥135):
§3 Water (40 pts): Bioswales, rain gardens, permeable paving ≥50% hardscape, cisterns, constructed wetlands. Target: capture 1% ARI storm event on-site.
§4 Soil & Vegetation (45 pts): Native Piedmont species (USDA Zone 7b), ≥25% canopy at maturity, pollinator habitat, soil health restoration, no invasives.
§5 Materials (20 pts): Reclaimed, FSC-certified timber, recycled-content, locally-sourced ≤500 miles, avoid virgin plastic/PVC.
§6 Human Health & Wellbeing (30 pts): ADA-accessible loop, shade ≥40% of seating, node every 200 ft, biophilic elements, universal design.
§9 Education & Performance (20 pts): Interpretive signage, QR/digital-twin markers, demonstration features, community stewardship.
§10 Innovation (20 pts): IoT sensors, smart irrigation, renewable energy, living systems, digital twin integration.

CAMPUS / URBAN DESIGN PRINCIPLES: Olmsted-inspired connected green network · pedestrian-priority circulation · 15-min walkability · biophilic ratio ≥15% living surface · defensible-without-fortress edges · activity-generating borders · wayfinding legibility.`;

function buildGeminiPrompt(userPrompt) {
  const config = SITE_CONFIGS[state.activeSite];
  const isFirst = state.iterationCount === 0;
  const prev = state.cumulativePrompts.slice(0, -1);
  let ctx = '';
  if (!isFirst && prev.length > 0) {
    ctx = `\nALL DESIGN ELEMENTS TO RENDER (apply every item below simultaneously to the ORIGINAL baseline photo — do NOT compound from a previously generated image):\n${prev.map((p,i) => `  ${i+1}. ${p}`).join('\n')}\nThe NEW ELEMENT listed below is the latest addition — include it alongside ALL items above.\n`;
  }
  let goalsBlock = '';
  if (config.projectGoals) {
    const pg = config.projectGoals;
    goalsBlock = '\nPROJECT GOALS FOR THIS SITE:\n'
      + '  Theme: ' + (pg.theme || 'sustainable landscape design') + '\n'
      + '  PRIORITIZE: ' + (pg.prioritize || []).join(', ') + '\n'
      + (pg.avoid ? '  AVOID (inappropriate for this site): ' + pg.avoid.join(', ') + '\n' : '')
      + '  Align every design decision with these site-specific goals.\n';
  }
  const isParcel = config.id?.startsWith('parcel_');
  const sitesBlock = isParcel ? SITES_CREDIT_BRIEF : '';
  const siteData = isParcel
    ? `${config.name}, ${config.metrics.totalAreaAcres} acres, ${config.metrics.soilType} soil${config.metrics.landUse ? `, current use: ${config.metrics.landUse}` : ''}${config.metrics.zone ? `, zoned ${config.metrics.zone}` : ''}.`
    : `${config.name}, ${config.metrics.totalAreaAcres} acres, ${config.metrics.soilType} soil, ${config.metrics.elevationDrop}ft elevation drop.`;

  // For parcel sites, request structured JSON elements for the SVG design canvas
  const boundsBlock = isParcel && config.imageBounds
    ? `\nPARCEL COORDINATE BOUNDS (use for DESIGN_ELEMENTS): N=${config.imageBounds.n.toFixed(5)}, S=${config.imageBounds.s.toFixed(5)}, E=${config.imageBounds.e.toFixed(5)}, W=${config.imageBounds.w.toFixed(5)}. Center: ${config.lat?.toFixed(5)},${config.lng?.toFixed(5)}.`
    : '';
  const jsonBlock = isParcel ? `

After your design description, output a DESIGN_ELEMENTS JSON block for SVG rendering. Use ONLY coordinates within the parcel bounds above. Format (all on one line after "DESIGN_ELEMENTS: "):
DESIGN_ELEMENTS: [{"type":"tree","lat":36.07,"lng":-79.79,"radiusFt":20,"label":"Red Oak"},{"type":"rain_garden","lat":36.071,"lng":-79.791,"radiusFt":25,"label":"North Rain Garden"},{"type":"path","points":[[36.07,-79.79],[36.072,-79.792]],"widthFt":10,"label":"Main Walk"},{"type":"plaza","polygon":[[36.07,-79.79],[36.071,-79.79],[36.071,-79.791],[36.07,-79.791]],"label":"Central Plaza"}]
Types: tree, shrub, meadow, rain_garden, bioswale, plaza, path, water, solar, seating, cistern, green_roof, amphitheater
Include 15-25 elements covering the full parcel. Use real lat/lng within the bounds above.` : '';

  return `You are AVA (Adaptive Visualization Assistant), an expert AI landscape architect by Think! Design and Planning, LLC. Design in the style of Bjarke Ingels Group (BIG) — bold, geometric, ecologically sensitive, and deeply sustainable. Every design decision must simultaneously serve human health, ecological function, and visual spectacle.
CAMERA: MAINTAIN EXACT SAME camera angle, position, perspective, and field of view as the input photo. BUILDINGS MUST REMAIN IDENTICAL. Only modify GROUND PLANE and VERTICAL SURFACES. Do NOT reshape, resize, or reposition any building.
SITE CONTEXT: ${config.siteContext || config.name}
SITE DATA: ${siteData}${boundsBlock}
${goalsBlock}${sitesBlock}
DESIGN PHILOSOPHY: Hedonistic sustainability — beautiful AND functional. Every element earns SITES v2 points. Design for PLATINUM certification. Each design decision should maximize ecological performance, human wellbeing, AND visual impact simultaneously.
LANDSCAPE RULES: Use companion planting guilds for USDA Zone 7b Piedmont NC. Layer canopy → understory → shrub → groundcover. Prioritize native species. Use biodiverse polyculture. Only add elements the user requests — do NOT add extras beyond what is asked.
STYLE: ULTRA HIGH RESOLUTION 8K, TACK-SHARP professional landscape architecture visualization. Golden-hour sunlight, brilliant blue sky, warm dappled light. Rich saturated colors. Award-winning landscape photography — luminous, inviting, breathtaking.
PEOPLE (MANDATORY): Include 3-5 diverse people at MAXIMUM CLARITY. FACES MUST BE CRYSTAL CLEAR — portrait-quality sharpness. Candid, joyful outdoor life.
VEGETATION: Species-accurate for USDA Zone 7b Piedmont NC. Lush, healthy, VIBRANT.
BUILDING WINDOWS (CRITICAL): Vegetation grows ONLY on solid wall surfaces BETWEEN windows.
IMAGE QUALITY: MAXIMUM sharpness across entire image, especially faces. NO soft focus, NO blur.
${ctx}
NEW ELEMENT TO ADD: ${userPrompt}
${isFirst ? 'Generate a STUNNING photorealistic modification showing ONLY this specific element integrated into the existing site. Include people with clear, sharp faces.' : 'CRITICAL: Working from ORIGINAL baseline photo — camera angle, building positions, sky are LOCKED. Render ALL listed design elements as one cohesive design applied to the original scene.'}${jsonBlock}`;
}

async function callGeminiAPI(prompt, imageBase64, referenceImageBase64, refMimeType) {
  const models = [...new Set([state.geminiModel, 'gemini-2.5-flash', 'gemini-2.0-flash-exp', 'gemini-2.0-flash'])];
  const payload = () => {
    const parts = [
      { text: prompt },
      { inlineData: { mimeType: 'image/png', data: imageBase64 } }
    ];
    // If user attached a reference/inspiration image, include it
    if (referenceImageBase64) {
      parts.push({ text: '\nREFERENCE IMAGE (use as DESIGN INSPIRATION — incorporate the style, materials, forms, and character shown in this image into your design while maintaining the site photo as the base):' });
      parts.push({ inlineData: { mimeType: refMimeType || 'image/png', data: referenceImageBase64 } });
    }
    return {
      contents: [{ parts }],
      generationConfig: { responseModalities: ['TEXT','IMAGE'] }
    };
  };

  const isLocal = location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  let lastError = null;
  for (const model of models) {
    try {
      let resp;
      if (!isLocal) {
        try {
          resp = await fetch('/.netlify/functions/gemini-proxy', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, payload: payload() })
          });
        } catch (proxyErr) { resp = null; }
      }
      if (!resp || !resp.ok) {
        if (!state.geminiKey) throw new Error('Enter your Gemini API key in Settings to generate designs.');
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${state.geminiKey}`;
        resp = await fetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload())
        });
      }
      if (!resp.ok) { const e = await resp.json().catch(()=>({})); lastError = new Error(e?.error?.message || `${resp.status}`); if (resp.status===404) continue; throw lastError; }
      const data = await resp.json();
      let img = null, mime = 'image/png', txt = '';
      if (data.candidates?.[0]?.content?.parts) {
        for (const p of data.candidates[0].content.parts) {
          if (p.inlineData) { img = p.inlineData.data; mime = p.inlineData.mimeType || 'image/png'; }
          if (p.text) txt = p.text;
        }
      }
      if (model !== state.geminiModel) { state.geminiModel = model; localStorage.setItem('ava_gemini_model', model); }
      return { imageBase64: img, mimeType: mime, text: txt };
    } catch (e) { lastError = e; if (!e.message?.includes('not found') && !e.message?.includes('not supported')) throw e; }
  }
  throw lastError || new Error('All models failed');
}

async function imageToBase64(src) {
  // Google Static Maps images need server-side proxy to bypass CORS
  if (src?.includes('maps.googleapis.com/maps/api/staticmap')) {
    const isLocal = location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isLocal) {
      try {
        const r = await fetch(`/.netlify/functions/image-proxy?url=${encodeURIComponent(src)}`);
        if (r.ok) {
          const { base64 } = await r.json();
          if (base64) return base64;
        }
      } catch (_) {}
    }
  }
  // Default: direct fetch (works for same-origin or CORS-enabled images)
  try {
    const r = await fetch(src); const b = await r.blob();
    return new Promise((res,rej) => { const fr = new FileReader(); fr.onloadend = () => res(fr.result.split(',')[1]); fr.onerror = rej; fr.readAsDataURL(b); });
  } catch (_) {
    return new Promise((res,rej) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img,0,0); res(c.toDataURL('image/png').split(',')[1]); }; img.onerror = rej; img.src = src; });
  }
}

// ---------------------------------------------------------------------------
// Aerial Vision Analysis — Gemini reads the satellite image for site baseline
// ---------------------------------------------------------------------------
async function analyzeParcelAerial(config) {
  if (!config.baselineImage) return null;
  try {
    const imageBase64 = await imageToBase64(config.baselineImage);
    const acres = config.metrics?.totalAreaAcres || '?';
    const soil  = config.metrics?.soilType || 'unknown';
    const use   = config.metrics?.landUse ? `, current use: ${config.metrics.landUse}` : '';
    const zone  = config.metrics?.zone    ? `, zoned ${config.metrics.zone}` : '';

    const prompt = `You are an expert landscape architect and sustainability consultant performing an existing conditions analysis.

Analyze this satellite aerial image of ${config.name} (${acres} acres, ${soil} soil${use}${zone}).

Provide a professional site analysis in this exact structure:

**Existing Conditions Analysis**
• **Impervious surface:** estimate % of site that is pavement, rooftop, or hardscape
• **Tree canopy:** estimate % canopy coverage visible
• **Open / green space:** brief character and condition description
• **Key observations:** 2-3 site-specific notes about drainage, topography, adjacencies, or existing infrastructure

**Top 3 Sustainable Design Opportunities**
1. [Most impactful opportunity given existing conditions]
2. [Second opportunity]
3. [Third opportunity]

Keep analysis to ~150 words. Use landscape architecture terminology.

Then end your response with EXACTLY these 4 lines (integers only, no ranges):
SITES_V2_BASELINE: [0-200]
LEED_ND_BASELINE: [0-110]
LBC_BASELINE: [0-7]
CARBON_BASELINE: [0-100]`;

    const payload = {
      contents: [{ parts: [
        { text: prompt },
        { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }
      ]}],
      generationConfig: { responseModalities: ['TEXT'] }
    };

    const isLocal = location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash-exp', 'gemini-2.0-flash']) {
      try {
        let resp;
        if (!isLocal) {
          try {
            resp = await fetch('/.netlify/functions/gemini-proxy', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model, payload })
            });
          } catch (_) { resp = null; }
        }
        if (!resp?.ok && state.geminiKey) {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${state.geminiKey}`;
          resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        }
        if (!resp?.ok) continue;
        const data = await resp.json();
        const raw = data.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
        if (!raw) continue;
        // Parse structured baseline scores
        const parse = (key, max) => {
          const m = raw.match(new RegExp(`${key}:\\s*(\\d+)`));
          const v = m ? parseInt(m[1]) : 0;
          return Math.min(v, max);
        };
        const baselines = {
          sites:  parse('SITES_V2_BASELINE',  200),
          leed:   parse('LEED_ND_BASELINE',   110),
          lbc:    parse('LBC_BASELINE',         7),
          carbon: parse('CARBON_BASELINE',     100),
        };
        // Strip the structured lines from the display text
        const displayText = raw.replace(/\n?[A-Z_]+_BASELINE:.*$/gm, '').trim();
        return { text: displayText, baselines };
      } catch (_) { continue; }
    }
  } catch (_) {}
  return null;
}

// ---------------------------------------------------------------------------
// Plan View Capture — listen for overhead parcel screenshot from GEO_LAYERS
// ---------------------------------------------------------------------------
document.addEventListener('ava:planViewCapture', async (evt) => {
  const { imageDataUrl, soils, area, address, siteId } = evt.detail || {};

  // Build enriched prompt from parcel context (works with or without a screenshot)
  const soilLine = soils   ? `Soil: ${soils}.` : '';
  const areaLine = area    ? `Site area: ${area} acres.` : '';
  const addrLine = address ? `Location: ${address}.` : '';
  const hasImage = !!imageDataUrl;
  const prompt = [
    'You are AVA, an expert landscape architect and sustainable site designer.',
    hasImage
      ? 'I am sharing an overhead aerial view of a site captured from a 3D digital twin.'
      : 'I am sharing parcel data for a site selected in the Geoscope.',
    addrLine, areaLine, soilLine,
    'Generate a detailed conceptual landscape master plan for this site.',
    'Include: circulation paths, planting zones, stormwater features, gathering spaces,',
    'and any sustainability opportunities evident from the site geometry.',
    'Describe your design decisions and provide a rendered plan view image.'
  ].filter(Boolean).join(' ');

  // Pre-fill the design prompt textarea if it exists
  const textarea = document.getElementById('designPrompt') || document.querySelector('[data-design-prompt]');
  if (textarea) {
    textarea.value = prompt;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Switch to design panel if tab exists
  const designTab = document.querySelector('[data-tab="design"], [data-panel="design"], #tab-design');
  if (designTab) designTab.click();

  if (hasImage && (window.STATE?.siteId || siteId)) {
    // Cesium path: send aerial screenshot + prompt to design AI
    const imageBase64 = imageDataUrl.split(',')[1];
    const mimeType = imageDataUrl.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';
    try {
      await window.sendDesignMessage?.({ prompt, imageBase64, mimeType });
    } catch (_) {}
  } else {
    // GM / text-only path: inject design brief into the map sidebar AVA chat
    const chatBox = document.getElementById('avaMapMessages');
    const chatInput = document.getElementById('avaMapInput') || document.querySelector('.ava-input-row input, .ava-chat-input input');
    if (chatBox) {
      const msg = document.createElement('div');
      msg.className = 'chat-msg ava';
      const label = address ? `<strong>${address}</strong>` : 'the selected parcel';
      const meta = [areaLine, soilLine].filter(Boolean).join(' ');
      msg.innerHTML = `I've set the design context to ${label}. ${meta} What would you like to design here? I can suggest a landscape concept, SITES v2 strategies, or a planting plan.`;
      chatBox.appendChild(msg);
      chatBox.scrollTop = chatBox.scrollHeight;
    }
    if (chatInput) chatInput.focus();
  }
});

window.DESIGN_ENGINE={scoreSITESv2,getTier,getBoostPrompt,getAutoDesignPrompt,buildGeminiPrompt,callGeminiAPI,imageToBase64,computePenalties,getScoringReasons,analyzeParcelAerial};
