/* cost-engine.js — Project Cost Estimation for AVA V3
   Parses cumulative design prompts, matches known materials / plants / finishes,
   estimates quantities from site area, and produces a categorized breakdown. */

const COST_DB = [
  // ── HARDSCAPE ──
  { id:'permeable-pavers', cat:'Hardscape',
    name:'Permeable Pavers',
    keywords:['permeable paver','permeable paving','pervious concrete','porous paving','permeable concrete'],
    unit:'SF', low:18, high:26,
    qty:(sf)=>Math.round(sf*0.12),
    note:'Subbase, installation, edge restraint' },

  { id:'reclaimed-brick', cat:'Hardscape',
    name:'Reclaimed Brick Pathways',
    keywords:['reclaimed brick','reclaimed stone','salvaged stone','salvaged brick','herringbone brick','brick path','brick walkway'],
    unit:'SF', low:22, high:32,
    qty:(sf)=>Math.round(sf*0.08),
    note:'Salvaged brick, sand-set base' },

  { id:'decomposed-granite', cat:'Hardscape',
    name:'Decomposed Granite Paths',
    keywords:['decomposed granite','gravel path','dg path','natural path','wood chip path'],
    unit:'SF', low:4, high:8,
    qty:(sf)=>Math.round(sf*0.06),
    note:'Stabilized DG, 4" compacted depth' },

  { id:'flagstone', cat:'Hardscape',
    name:'Natural Stone Flagstone',
    keywords:['flagstone','natural stone','stepping stone','local stone','piedmont granite','stone stepping'],
    unit:'SF', low:28, high:45,
    qty:(sf)=>Math.round(sf*0.05),
    note:'Locally sourced stone, mortar or sand-set' },

  { id:'timber-boardwalk', cat:'Hardscape',
    name:'Timber Boardwalk',
    keywords:['boardwalk','elevated walkway','timber boardwalk','elevated path','elevated boardwalk'],
    unit:'SF', low:38, high:58,
    qty:(sf)=>Math.round(sf*0.03),
    note:'FSC-certified timber, elevated over root zones' },

  // ── STORMWATER & WATER ──
  { id:'bioswale', cat:'Stormwater & Water',
    name:'Bioswale (Linear)',
    keywords:['bioswale','drainage swale','bio-swale','bioretention swale','green infrastructure drainage'],
    unit:'LF', low:175, high:325,
    qty:(sf)=>Math.max(20, Math.round(Math.sqrt(sf)*1.2)),
    note:'Excavation, native edge plantings, underdrain' },

  { id:'rain-garden', cat:'Stormwater & Water',
    name:'Rain Gardens',
    keywords:['rain garden','rain-garden','stormwater garden','rain gardens'],
    unit:'EA', low:2500, high:5500,
    qty:(sf)=>Math.max(1, Math.round(sf/7000)),
    note:'Amended soil, native plantings, overflow structure' },

  { id:'cistern', cat:'Stormwater & Water',
    name:'Rainwater Cistern / Harvest System',
    keywords:['cistern','rainwater harvest','water harvest','rainwater collection','rainwater cistern'],
    unit:'EA', low:4000, high:9000,
    qty:()=>1,
    note:'Underground cistern with collection piping' },

  { id:'retention-basin', cat:'Stormwater & Water',
    name:'Stormwater Retention Basin',
    keywords:['retention basin','detention basin','stormwater basin','retention pond','stormwater retention'],
    unit:'EA', low:18000, high:45000,
    qty:()=>1,
    note:'Grading, liner, outlet structure, native plantings' },

  { id:'infiltration-planter', cat:'Stormwater & Water',
    name:'Infiltration Planters at Downspouts',
    keywords:['infiltration planter','downspout planter','building downspout','at downspout'],
    unit:'EA', low:2000, high:4000,
    qty:(sf)=>Math.max(2, Math.round(sf/8000)),
    note:'Amended soil, overflow to grade' },

  { id:'water-channel', cat:'Stormwater & Water',
    name:'Decorative Water Channel',
    keywords:['water channel','linear water channel','water flow','decorative channel','water feature'],
    unit:'LF', low:350, high:650,
    qty:(sf)=>Math.max(10, Math.round(Math.sqrt(sf)*0.5)),
    note:'Concrete channel, recirculating pump, edge plantings' },

  { id:'constructed-wetland', cat:'Stormwater & Water',
    name:'Constructed Wetland',
    keywords:['constructed wetland','wetland','ephemeral stream','wetland filter'],
    unit:'EA', low:25000, high:55000,
    qty:()=>1,
    note:'Grading, liner, aquatic plantings, inlet/outlet structure' },

  { id:'bioretention-cell', cat:'Stormwater & Water',
    name:'Bioretention Cell',
    keywords:['bioretention cell','bioretention','bioretention basin'],
    unit:'SF', low:22, high:38,
    qty:(sf)=>Math.round(sf*0.04),
    note:'Engineered media, underdrain, native plantings' },

  // ── PLANTING ──
  { id:'canopy-trees', cat:'Planting',
    name:'Canopy Trees (2–3" caliper)',
    keywords:['canopy tree','red oak','sweetgum','eastern redbud','willow oak','canopy','shade tree','native tree','tree canopy','native canopy'],
    unit:'EA', low:400, high:650,
    qty:(sf)=>Math.max(2, Math.round(sf/2500)),
    note:'B&B, planting pit, mulch ring, 1-yr staking' },

  { id:'understory-trees', cat:'Planting',
    name:'Understory / Small Trees (6–8 ft)',
    keywords:['understory','dogwood','spicebush','serviceberry','witch hazel','flowering dogwood','fringe tree'],
    unit:'EA', low:225, high:375,
    qty:(sf)=>Math.max(1, Math.round(sf/3500)),
    note:'6–8 ft B&B, planting pit, mulch ring' },

  { id:'shrubs', cat:'Planting',
    name:'Native Shrubs (5-gal)',
    keywords:['shrub','beautyberry','inkberry','winterberry','native shrub','viburnum','wax myrtle','holly','hydrangea','sweetspire','mountain laurel','native azalea','oakleaf hydrangea'],
    unit:'EA', low:50, high:80,
    qty:(sf)=>Math.max(5, Math.round(sf/400)),
    note:'5-gal container, 3\' o.c. typical' },

  { id:'ornamental-grasses', cat:'Planting',
    name:'Native Grasses & Sedges',
    keywords:['native grass','ornamental grass','carex','sedge','festuca','panicum','switchgrass','rush','native sedge'],
    unit:'EA', low:14, high:22,
    qty:(sf)=>Math.max(10, Math.round(sf/200)),
    note:'1-gal container, 18–24" o.c.' },

  { id:'groundcover', cat:'Planting',
    name:'Groundcover (flat of 18)',
    keywords:['groundcover','ground cover','wild ginger','pachysandra','partridge berry','foamflower','creeping phlox','virginia creeper'],
    unit:'FLAT', low:75, high:130,
    qty:(sf)=>Math.max(2, Math.round(sf/1200)),
    note:'18-count flat, 12" o.c.' },

  { id:'wildflower-meadow', cat:'Planting',
    name:'Wildflower / Pollinator Meadow',
    keywords:['wildflower','pollinator meadow','pollinator','meadow','native wildflower','black-eyed susan','purple coneflower','goldenrod','milkweed','aster','joe-pye'],
    unit:'SF', low:3, high:5.50,
    qty:(sf)=>Math.round(sf*0.15),
    note:'Seed mix + plugs, site prep, 3-yr establishment' },

  { id:'ferns', cat:'Planting',
    name:'Native Ferns',
    keywords:['fern','christmas fern','maidenhair fern','cinnamon fern','wood fern','fern grove','fern garden'],
    unit:'EA', low:15, high:28,
    qty:(sf)=>Math.max(5, Math.round(sf/800)),
    note:'1-gal container, 18–24" o.c.' },

  { id:'woodland-wildflowers', cat:'Planting',
    name:'Woodland Wildflower Plugs',
    keywords:['trillium','bloodroot','virginia bluebells','hepatica','mayapple','solomon\'s seal','jack-in-the-pulpit','woodland floor','forest floor'],
    unit:'EA', low:8, high:18,
    qty:(sf)=>Math.max(20, Math.round(sf/100)),
    note:'Potted plugs, 6" o.c.' },

  { id:'living-wall', cat:'Planting',
    name:'Living Green Wall System',
    keywords:['living wall','green wall','vertical wall','living wall system','vertical garden','wall vegetation','heuchera','tradescantia','wall planting','vertical living'],
    unit:'SF', low:220, high:400,
    qty:(sf)=>Math.max(50, Math.round(sf*0.02)),
    note:'Modular panels, drip irrigation, growing media, installation' },

  { id:'topsoil', cat:'Planting',
    name:'Topsoil & Soil Amendment',
    keywords:['topsoil','soil amendment','compost','mycorrhizal','organic amendment','deep tilled','soil health','soil remediation','engineered topsoil','organic topsoil','soil restoration'],
    unit:'SF', low:1.75, high:3.25,
    qty:(sf)=>Math.round(sf*0.35),
    note:'4" amended topsoil, compost, mycorrhizal inoculant' },

  { id:'green-roof', cat:'Planting',
    name:'Green Roof System',
    keywords:['green roof','living roof','roof garden','vegetated roof','planted roof'],
    unit:'SF', low:22, high:42,
    qty:(sf)=>Math.max(200, Math.round(sf*0.015)),
    note:'Growing media, drainage, waterproofing, sedum/sedge mix' },

  // ── STRUCTURES & FURNISHINGS ──
  { id:'pergola', cat:'Structures & Furnishings',
    name:'Timber Pergola / Shade Structure',
    keywords:['pergola','shade structure','timber pergola','overhead canopy','overhead shade','shade canopy','covered walkway','overhead cover'],
    unit:'EA', low:28000, high:65000,
    qty:()=>1,
    note:'FSC-certified timber, footings, staining' },

  { id:'arbor', cat:'Structures & Furnishings',
    name:'Recycled Steel Arbor / Trellis',
    keywords:['arbor','trellis','steel arbor','recycled steel arbor','steel trellis','climbing structure','trellis screen','corten steel'],
    unit:'EA', low:7000, high:20000,
    qty:()=>1,
    note:'Structural steel, powder coat, concrete footings' },

  { id:'parametric-canopy', cat:'Structures & Furnishings',
    name:'Parametric Canopy Structure',
    keywords:['parametric canopy','parametric structure','sculptural canopy','dramatic canopy','canopy structure'],
    unit:'EA', low:40000, high:95000,
    qty:()=>1,
    note:'Custom structural frame, CNC fabrication, installation' },

  { id:'seat-wall', cat:'Structures & Furnishings',
    name:'Seat Walls (Stone / Salvaged)',
    keywords:['seat wall','seating wall','stone wall','salvaged stone seat','stone bench','stone seat wall'],
    unit:'LF', low:225, high:425,
    qty:(sf)=>Math.max(10, Math.round(Math.sqrt(sf)*0.6)),
    note:'Salvaged stone, mortar set, cap stone, 18" wide' },

  { id:'amphitheater', cat:'Structures & Furnishings',
    name:'Outdoor Classroom / Amphitheater',
    keywords:['amphitheater','outdoor classroom','tiered seating','tiered amphitheater','presentation wall','outdoor learning','classroom amphitheater'],
    unit:'EA', low:45000, high:110000,
    qty:()=>1,
    note:'Tiered seating 30+, ADA access, shade canopy, presentation surface' },

  { id:'benches', cat:'Structures & Furnishings',
    name:'Benches & Seating',
    keywords:['bench','seating','ergonomic bench','timber bench','log bench','stone bench','natural bench','study pod','shaded seating','seating cluster'],
    unit:'EA', low:1400, high:3800,
    qty:(sf)=>Math.max(2, Math.round(sf/3000)),
    note:'Commercial grade, anchored, ADA compliant' },

  { id:'lighting', cat:'Structures & Furnishings',
    name:'Solar LED Pathway Lighting',
    keywords:['solar led','solar lighting','led lighting','pathway light','pathway lighting','solar light','solar-powered','evening lighting','led path'],
    unit:'EA', low:500, high:950,
    qty:(sf)=>Math.max(4, Math.round(sf/1500)),
    note:'Solar LED bollard, no trenching required' },

  { id:'interpretive-signage', cat:'Structures & Furnishings',
    name:'Interpretive Signage Panels',
    keywords:['interpretive sign','interpretive panel','educational sign','ecology sign','plant sign','signage about','education panel','interpretive signage','living lab','tree species identification','sustainability sign'],
    unit:'EA', low:1800, high:4500,
    qty:(sf)=>Math.max(2, Math.round(sf/5000)),
    note:'Aluminum panel, UV-resistant print, steel post mount' },

  { id:'wayfinding', cat:'Structures & Furnishings',
    name:'Wayfinding Totems',
    keywords:['wayfinding','wayfinding totem','directional sign','totem','navigation marker','wayfinding sign'],
    unit:'EA', low:2500, high:5500,
    qty:()=>2,
    note:'CNC routed or laser-cut steel, post-mounted' },

  { id:'qr-stations', cat:'Structures & Furnishings',
    name:'QR Code Education Stations',
    keywords:['qr code','qr station','qr marker','digital label','interactive sign','qr code station'],
    unit:'EA', low:600, high:1600,
    qty:(sf)=>Math.max(2, Math.round(sf/3000)),
    note:'Weather-resistant display, steel post or panel mount' },

  // ── TECHNOLOGY & INNOVATION ──
  { id:'iot-sensors', cat:'Technology & Innovation',
    name:'IoT Sensor Network (Soil / Env.)',
    keywords:['iot','soil moisture sensor','sensor network','smart monitoring','iot sensor','monitoring sensor','soil sensor'],
    unit:'EA', low:5500, high:13000,
    qty:()=>1,
    note:'Multi-node wireless array, gateway, cloud dashboard' },

  { id:'smart-irrigation', cat:'Technology & Innovation',
    name:'Smart Irrigation System',
    keywords:['smart irrigation','drip irrigation','irrigation controller','smart drip','irrigation scheduling','drip system','micro irrigation'],
    unit:'EA', low:3500, high:9000,
    qty:()=>1,
    note:'Weather-based controller, drip/micro zones' },

  { id:'weather-station', cat:'Technology & Innovation',
    name:'Microclimate Weather Station',
    keywords:['weather station','microclimate','micro-weather','climate station','atmospheric','air quality sensor'],
    unit:'EA', low:4500, high:11000,
    qty:()=>1,
    note:'Research-grade multi-parameter, cellular upload' },

  { id:'digital-twin-kiosk', cat:'Technology & Innovation',
    name:'Digital Twin Kiosk',
    keywords:['digital twin','kiosk','monitoring kiosk','interactive kiosk','display kiosk','digital twin kiosk'],
    unit:'EA', low:16000, high:32000,
    qty:()=>1,
    note:'Weatherproof touchscreen, cellular, AVA integration' },

  { id:'solar-panel-canopy', cat:'Technology & Innovation',
    name:'Solar Panel Canopy',
    keywords:['solar panel','solar canopy','photovoltaic','pv panel','solar shade structure','solar energy','solar panels'],
    unit:'EA', low:35000, high:90000,
    qty:()=>1,
    note:'Structural steel, bifacial PV, grid-tie inverter, permits' },

  { id:'bird-monitoring', cat:'Technology & Innovation',
    name:'Acoustic Wildlife Monitoring',
    keywords:['bird monitoring','acoustic sensor','wildlife camera','acoustic bird','bioacoustic','wildlife monitoring','wildlife sensor'],
    unit:'EA', low:3500, high:9000,
    qty:()=>1,
    note:'Bioacoustic recorders, species-ID software' },

  { id:'ev-charging', cat:'Technology & Innovation',
    name:'Solar-Powered Device / EV Charging',
    keywords:['charging station','ev charging','solar charging','device charging','charging port','usb charging','charging ports'],
    unit:'EA', low:9000, high:22000,
    qty:()=>1,
    note:'Solar-powered pedestal, Level 2 or USB-A/C' },

  { id:'greywater-recycle', cat:'Technology & Innovation',
    name:'Greywater Recycling System',
    keywords:['greywater recycling','grey water recycling','water recycling','water reuse','greywater'],
    unit:'EA', low:8000, high:20000,
    qty:()=>1,
    note:'Collection, treatment, reuse for irrigation — permits required' },

  { id:'smart-compost', cat:'Technology & Innovation',
    name:'Smart Composting System',
    keywords:['smart compost','composting system','compost system','organic waste','composting'],
    unit:'EA', low:2500, high:7000,
    qty:()=>1,
    note:'In-vessel or bin system, aeration, signage' },
];

// 20% soft-cost add-on: design fees, engineering, contingency
const SOFT_COST_RATE = 0.20;

// ── Smart quantity estimation ─────────────────────────────────────────────────
// Reads the actual prompt text rather than returning a fixed % of site area.
// Priority order: explicit digit/word number > scale modifier > hit-count boost > base area heuristic.

const WORD_NUMBERS = { one:1, two:2, three:3, four:4, five:5, six:6,
                       seven:7, eight:8, nine:9, ten:10, dozen:12 };

const SCALE_UP   = /\b(large|extensive|throughout|many|multiple|several|full|major|significant|complete|comprehensive|dramatic|sprawling|entire|whole|big|wide|long|deep|dense|rich|lush|abundant|maximize|maximum|lot of|lots of)\b/;
const SCALE_DOWN = /\b(small|minor|simple|minimal|few|little|modest|compact|basic|limited|narrow|short|thin|sparse|one|single|just a|a small)\b/;
const SCALE_MED  = /\b(medium|moderate|some|additional|a few|couple|standard|typical|normal|average)\b/;

function _smartQty(item, areaSF, fullText) {
  // 1. Collect all context windows around each keyword hit
  const windows = [];
  let totalHits = 0;
  item.keywords.forEach(kw => {
    let idx = 0;
    while ((idx = fullText.indexOf(kw, idx)) !== -1) {
      totalHits++;
      windows.push(fullText.slice(Math.max(0, idx - 40), idx + kw.length + 40));
      idx += kw.length;
    }
  });
  if (!totalHits) return null; // item not present

  // 2. Try to find an explicit digit or word-number in any context window
  let explicit = null;
  for (const win of windows) {
    // digit before keyword: "3 rain gardens", "two benches"
    let m = win.match(/\b(\d{1,3})\s+(?:\w+\s+){0,3}(?:of\s+)?(?:the\s+)?/);
    if (m) { explicit = Math.min(parseInt(m[1]), 50); break; }
    // word number: "three bioswales"
    for (const [word, num] of Object.entries(WORD_NUMBERS)) {
      if (win.includes(word + ' ') || win.includes(' ' + word)) {
        explicit = num; break;
      }
    }
    if (explicit !== null) break;
  }

  // For counted items (EA) an explicit number is authoritative
  if (explicit !== null && item.unit === 'EA') return explicit;

  // 3. Determine scale modifier from combined context
  const combinedCtx = windows.join(' ');
  let scale = 1.0;
  if (SCALE_UP.test(combinedCtx))   scale = 1.8;
  else if (SCALE_MED.test(combinedCtx)) scale = 1.2;
  else if (SCALE_DOWN.test(combinedCtx)) scale = 0.45;

  // 4. Hit-count bonus — more mentions means the item plays a larger role
  if (totalHits >= 4)      scale *= 1.6;
  else if (totalHits >= 2) scale *= 1.25;

  // 5. Apply to base heuristic (site-area-derived)
  const base = item.qty(areaSF);
  return Math.max(1, Math.round(base * scale));
}
// ─────────────────────────────────────────────────────────────────────────────

window.COST_ENGINE = {
  COST_DB,

  estimate(siteId, prompts) {
    const config = SITE_CONFIGS[siteId];
    if (!config || !prompts.length) return null;

    const areaSF   = (config.metrics?.totalAreaAcres || 1) * 43560;
    const fullText = prompts.join(' ').toLowerCase();
    const items    = [];

    COST_DB.forEach(item => {
      const qty = _smartQty(item, areaSF, fullText);
      if (qty === null) return; // keyword not found
      const unitCost = Math.round((item.low + item.high) / 2);
      items.push({
        category: item.cat,
        name:     item.name,
        qty,
        unit:     item.unit,
        unitCost,
        total:    qty * unitCost,
        note:     item.note
      });
    });

    if (!items.length) return null;

    const byCategory = {};
    items.forEach(i => {
      if (!byCategory[i.category]) byCategory[i.category] = [];
      byCategory[i.category].push(i);
    });

    const constructionTotal = items.reduce((s, i) => s + i.total, 0);
    const softCosts         = Math.round(constructionTotal * SOFT_COST_RATE);
    const grandTotal        = constructionTotal + softCosts;

    return { items, byCategory, constructionTotal, softCosts, grandTotal, areaSF, siteId };
  },

  formatCurrency(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  },

  toCSV(est) {
    if (!est) return '';
    const config   = SITE_CONFIGS[est.siteId];
    const siteName = config?.name || est.siteId;
    const date     = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

    const rows = [
      ['AVA — Project Cost Estimate'],
      [`Site:, ${siteName}`],
      [`Date:, ${date}`],
      [`Estimated Site Area:, ${Math.round(est.areaSF).toLocaleString()} SF`],
      [],
      ['Category', 'Line Item', 'Qty', 'Unit', 'Unit Cost', 'Line Total', 'Notes'],
    ];

    Object.entries(est.byCategory).forEach(([cat, items]) => {
      items.forEach(item => {
        rows.push([
          cat,
          item.name,
          item.qty,
          item.unit,
          this.formatCurrency(item.unitCost),
          this.formatCurrency(item.total),
          item.note
        ]);
      });
    });

    rows.push([]);
    rows.push(['', '', '', '', 'Construction Subtotal', this.formatCurrency(est.constructionTotal), '']);
    rows.push(['', '', '', '', 'Design / Engineering / Contingency (20%)', this.formatCurrency(est.softCosts), '']);
    rows.push(['', '', '', '', 'TOTAL PROJECT ESTIMATE', this.formatCurrency(est.grandTotal), '']);
    rows.push([]);
    rows.push(['Disclaimer: Estimates based on 2024 Mid-Atlantic/SE US unit costs. Quantities are algorithmically derived from site area and design keywords. Actual costs vary by contractor, market conditions, and site-specific factors. A licensed landscape architect should prepare a final detailed estimate for project budgeting.']);

    return rows.map(r =>
      r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
    ).join('\n');
  }
};
