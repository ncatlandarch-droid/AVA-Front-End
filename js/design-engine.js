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
  return siteSpecific[state.activeSite] || `Design a complete sustainable landscape with bioswales, rain gardens, permeable paving, cisterns, stormwater retention, native canopy trees, pollinator meadow, groundcover, biodiverse shrubs, topsoil, reclaimed brick, FSC timber, recycled steel, salvaged stone, permeable pavers, ADA pathways, shaded seating, solar lighting, outdoor classroom, gathering plaza, interpretive signage, wayfinding, QR codes, digital twin, educational exhibits, IoT sensors, smart irrigation, solar panels, and green roof systems.`;
}

function buildGeminiPrompt(userPrompt) {
  const config = SITE_CONFIGS[state.activeSite];
  const isFirst = state.iterationCount === 0;
  const prev = state.cumulativePrompts.slice(0, -1);
  let ctx = '';
  if (!isFirst && prev.length > 0) {
    // All elements are re-rendered from the ORIGINAL baseline each iteration so
    // camera angle and building geometry stay locked to the source photo.
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
  return `You are AVA (Adaptive Visualization Assistant), an AI landscape architect by Think! Design and Planning, LLC, designing in the style of Bjarke Ingels Group (BIG) — bold, geometric, progressive architecture that is simultaneously ecologically sensitive and sustainable.
CAMERA: MAINTAIN EXACT SAME camera angle, position, perspective, and field of view as the input photo. Do NOT change buildings, sky, background skyline, or surrounding architecture. BUILDINGS MUST REMAIN IDENTICAL. The scene must be INSTANTLY RECOGNIZABLE as the same location. Only modify the GROUND PLANE and VERTICAL SURFACES. NEVER reshape, resize, or reposition any building.
SITE CONTEXT: ${config.siteContext || config.name}
SITE DATA: ${config.name}, ${config.metrics.totalAreaAcres} acres, ${config.metrics.soilType} soil, ${config.metrics.elevationDrop}ft elevation drop.
${goalsBlock}DESIGN PHILOSOPHY: Bjarke Ingels-inspired — hedonistic sustainability. Every design element should be BOTH ecologically functional AND visually spectacular. Only add the specific elements the user requests — do NOT add extra planting, rain gardens, or vegetation beyond what is explicitly asked for.
LANDSCAPE RULES: When the user asks for planting, use companion planting guilds appropriate for USDA Zone 7b Piedmont NC. When planting IS requested, use biodiverse polyculture layers. Do NOT automatically add planting to areas the user did not mention.
STYLE: ULTRA HIGH RESOLUTION 8K, TACK-SHARP professional landscape architecture visualization. Golden-hour sunlight, brilliant blue sky with soft white cumulus clouds, warm dappled light. Rich saturated colors. Think award-winning landscape photography — luminous, inviting, breathtaking.
PEOPLE (MANDATORY — HIGHEST PRIORITY FOR SHARPNESS): Include 3-5 diverse people rendered at MAXIMUM CLARITY. FACES MUST BE CRYSTAL CLEAR — distinct eyes, nose, mouth, jawline with NO smudging, NO blur, NO painterly softness. Render faces at PORTRAIT-QUALITY sharpness with proper lighting on skin. Candid, joyful outdoor life. People are the MOST IMPORTANT element to get right.
VEGETATION: All plants species-accurate for USDA Zone 7b Piedmont NC. Lush, healthy, VIBRANT.
BUILDING WINDOWS (CRITICAL): Preserve the EXACT LOCATION of every window. Vegetation grows ONLY on solid wall surfaces BETWEEN windows.
DESIGN LAYERING: Harmonious layered compositions. Every seating area should have overhead protection.
IMAGE QUALITY: MAXIMUM sharpness across the ENTIRE image, especially FACES and TEXT. NO soft focus, NO gaussian blur, NO muddy areas. Prioritize face clarity over background detail.
${ctx}
NEW ELEMENT TO ADD: ${userPrompt}
${isFirst ? 'Generate a STUNNING photorealistic modification showing ONLY this specific element integrated into the existing site. Include people with clear, sharp faces. Do NOT add extra elements beyond what was requested.' : 'CRITICAL: You are working from the ORIGINAL baseline photo — the camera angle, building positions, geometry, sky, and background are LOCKED to that photo. Render ALL listed design elements as one complete, cohesive design applied to the original scene. Do NOT drift the camera, resize buildings, or shift any architectural element.'}`;
}

async function callGeminiAPI(prompt, imageBase64, referenceImageBase64, refMimeType) {
  const models = [...new Set([state.geminiModel, 'gemini-2.5-flash', 'gemini-2.0-flash-exp', 'gemini-2.0-flash'])];
  const payload = (model) => {
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
            body: JSON.stringify({ model, payload: payload(model) })
          });
        } catch (proxyErr) { resp = null; }
      }
      if (!resp || !resp.ok) {
        if (!state.geminiKey) throw new Error('Enter your Gemini API key in Settings to generate designs.');
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${state.geminiKey}`;
        resp = await fetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload(model))
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
  try {
    const r = await fetch(src); const b = await r.blob();
    return new Promise((res,rej) => { const fr = new FileReader(); fr.onloadend = () => res(fr.result.split(',')[1]); fr.onerror = rej; fr.readAsDataURL(b); });
  } catch (e) {
    return new Promise((res,rej) => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img,0,0); res(c.toDataURL('image/png').split(',')[1]); }; img.onerror = rej; img.src = src; });
  }
}

// ---------------------------------------------------------------------------
// Plan View Capture — listen for overhead parcel screenshot from GEO_LAYERS
// ---------------------------------------------------------------------------
document.addEventListener('ava:planViewCapture', async (evt) => {
  const { imageDataUrl, parcel, soils, area, address, siteId } = evt.detail || {};
  if (!imageDataUrl) return;

  // Build an enriched plan-view prompt using parcel context
  const soilLine = soils ? `Soil: ${soils}.` : '';
  const areaLine = area  ? `Site area: ${area} acres.` : '';
  const addrLine = address ? `Location: ${address}.` : '';
  const prompt = [
    'You are AVA, an expert landscape architect and sustainable site designer.',
    'I am sharing an overhead aerial view of a site captured from a 3D digital twin.',
    addrLine, areaLine, soilLine,
    'Generate a detailed conceptual landscape master plan for this site.',
    'Include: circulation paths, planting zones, stormwater features, gathering spaces,',
    'and any sustainability opportunities evident from the site geometry.',
    'Describe your design decisions and provide a rendered plan view image.'
  ].filter(Boolean).join(' ');

  // Pre-fill the design prompt textarea if it exists and trigger generation
  const textarea = document.getElementById('designPrompt') || document.querySelector('[data-design-prompt]');
  if (textarea) {
    textarea.value = prompt;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Switch to design panel if tab exists
  const designTab = document.querySelector('[data-tab="design"], [data-panel="design"], #tab-design');
  if (designTab) designTab.click();

  // If AVA chat is active, inject the image + prompt as a user message
  if (window.STATE?.siteId || siteId) {
    const imageBase64 = imageDataUrl.split(',')[1];
    const mimeType = imageDataUrl.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';
    try {
      await window.sendDesignMessage?.({ prompt, imageBase64, mimeType });
    } catch (_) {
      // sendDesignMessage may not be exposed; textarea pre-fill is the fallback
    }
  }
});

window.DESIGN_ENGINE={scoreSITESv2,getTier,getBoostPrompt,getAutoDesignPrompt,buildGeminiPrompt,callGeminiAPI,imageToBase64,computePenalties,getScoringReasons};
