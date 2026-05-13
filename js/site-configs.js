/* site-configs.js — Site Configuration Data for AVA V3
 * Extracted from app.js monolith. Exposes: window.SITE_CONFIGS
 */

// ========== SITE CONFIGS ==========
const SITE_CONFIGS = {
  'holland-bowl': {
    id: 'holland-bowl', name: 'Holland Bowl', shortName: 'Holland Bowl',
    college: 'Landscape Architecture', slogan: 'Digital Twin for Holland Bowl',
    baselineImage: 'baselines/holland-bowl.jpg',
    metrics: { totalArea: 65340, totalAreaAcres: 1.5, elevationDrop: 18, soilType: 'Urban Land (Anthropogenic Fill)' }, baselineScore: 110,
    history: { title: 'The Story of Holland Bowl', summary: 'Known as "The Yard," the Holland Bowl is a dramatic 1.5-acre concave landscape between Carver Hall and Sockwell Hall.' },
    projectGoals: {
      focus: 'campus-stormwater-landscape',
      avoid: [],
      prioritize: ['stormwater management', 'native Piedmont canopy', 'campus gathering', 'bold geometric forms', 'institutional pride'],
      character: 'Bold, dramatic, institutional pride — a world-class sustainable campus landscape.'
    },
    sections: [
      { id: 1, name: 'Site Context', maxPts: 14, assumed: true, assumedPts: 14, keywords: [] },
      { id: 2, name: 'Pre-Design', maxPts: 4, assumed: true, assumedPts: 4, keywords: [] },
      { id: 3, name: 'Water', maxPts: 36, assumed: true, assumedPts: 24, keywords: [
        'rain garden','bioswale','stormwater','retention','infiltration','runoff','permeable','cistern','drainage','swale',
        'green infrastructure','greywater','irrigation','watershed','water harvest','water feature','fountain','pond','stream',
        'creek','channel','basin','rain','flood','drain','gutter','downspout','splash pad','wetland','bog','water recycl',
        'catch basin','flow','curb cut','trench','dry well','french drain','water collect','rain barrel','sprinkler',
        'drip irrig','water stor','overflow','detention','rooftop runoff','porous',
        // natural language additions
        'catch rainwater','collect rainwater','collect water','absorb water','soak up rain','reduce flooding',
        'flood prevention','flood control','water conservation','save water','drought resistant','drought tolerant',
        'water-wise','water friendly','water reuse','harvest rainwater','manage water','slow the water',
        'reduce runoff','water management','porous surface','pervious','water capture','water retention pond',
        'rain capture','no more flooding','fix flooding','water infiltration','groundwater recharge'
      ]},
      { id: 4, name: 'Soil + Vegetation', maxPts: 40, assumed: true, assumedPts: 28, keywords: [
        'soil','vegetation','native','plant','tree','canopy','meadow','compost','mulch','pollinator','habitat','biodiversity',
        'redbud','oak','prairie','groundcover','shrub','root zone','topsoil','flower','garden','grass','lawn','turf','hedge',
        'vine','moss','fern','ivy','bush','wildflower','bloom','seed','leaf','branch','forest','grove','orchard','herb',
        'planting bed','raised bed','planter','succulent','bamboo','dogwood','maple','magnolia','azalea','hydrangea',
        'butterfly','bee','bird','rose','lavender','daylil','hosta','ornamental','annual','perennial','landscape',
        'green space','meadow grass','clover','native grass','switchgrass','bluestem','sedge','aster','coneflower',
        'black-eyed susan','milkweed','ecosystem','food forest','fruit tree','shade tree','evergreen','pine','cedar',
        'holly','cherry','crepe myrtle','wisteria','jasmine','ground cover','cover crop','erosion control','root',
        // natural language additions
        'add trees','plant trees','more trees','colorful plants','colorful flowers','beautiful plants','lush planting',
        'lush garden','add flowers','flower bed','flower beds','add plants','more plants','garden bed','planting beds',
        'wildlife','wildlife habitat','animal habitat','attract birds','attract butterflies','attract bees',
        'carbon sequestration','air quality','oxygen','ecological restoration','restore ecology','naturalistic',
        'natural area','native landscape','living landscape','green buffer','add greenery','more green',
        'restore soil','heal the soil','healthy soil','soil health','organic soil','soil amendment',
        'urban forest','urban canopy','shade trees','more shade','lush','vibrant plants','colorful landscape',
        'restore vegetation','restore plants','ecological','nature-based'
      ]},
      { id: 5, name: 'Materials', maxPts: 28, assumed: true, assumedPts: 2, keywords: [
        'reclaimed','brick','FSC','recycled','gravel','local material','salvaged','permeable paver','concrete','timber',
        'steel','stone','sustainabl','wood','lumber','metal','iron','copper','glass','tile','mosaic','granite','marble',
        'slate','flagstone','cobble','paver','boardwalk','railing','fence','gate','wall','retaining','gabion','corten',
        'terracotta','composite','rubber','surface','asphalt','decking','terrace','step','stair','masonry','mortar',
        'aggregate','sandstone','bluestone','limestone','natural stone','rock','boulder','stepping stone','edging',
        'curb','bollard','post','column','arch','trellis','arbor','pergola frame','structure','material',
        // natural language additions
        'eco-friendly material','sustainable material','green material','low carbon material','responsible material',
        'ethical sourcing','upcycled','repurposed material','reused material','recycle material','environmentally friendly',
        'natural material','organic material','zero waste material','local stone','regional material','reuse',
        'recycled content','reclaimed wood','reclaimed brick','salvage','sustainable path','eco path',
        'green paving','responsible building','low impact material','durable material','long lasting'
      ]},
      { id: 6, name: 'Human Health', maxPts: 30, assumed: true, assumedPts: 5, keywords: [
        'health','well-being','accessibility','ADA','seating','shade','trail','path','gathering','plaza','recreation',
        'lighting','bench','wellness','mental health','outdoor classroom','walkway','sidewalk','ramp','handrail','sit',
        'chair','table','picnic','hammock','swing','play','sport','exercise','yoga','rest','relax','meditat','quiet',
        'calm','comfort','canopy cover','umbrella','pergola','gazebo','pavilion','shelter','amphitheater','stage',
        'court','field','lawn area','dog park','accessible','wheelchair','stroller','jogging','running','bike',
        'walk','stroll','social','community','people','inclusive','safe','night','evening','view','overlook',
        'terrace seat','lounge','reading','study','nook','pocket park','open space','fresh air','nature','outdoor',
        'shade structure','sun protection','cooling','mist','water play','splash','kids','children','family',
        'elder','senior','universal design','grab bar','tactile','braille','audio',
        // natural language additions
        'comfortable','welcoming','inviting','cozy','fun space','playful','social space','meeting place','hangout',
        'student hangout','student area','campus life','gather outside','community building','outdoor room',
        'lunch area','eating outside','outdoor dining','study spot','study outside','outdoor study',
        'stress relief','relaxation zone','restorative','biophilic','nature therapy','healing garden','therapeutic',
        'active transportation','pedestrian','pedestrian friendly','walkable','connected paths',
        'bike rack','bike parking','cyclist','bike lane','shade cover','shaded area','cool area',
        'comfortable seating','sitting area','rest area','gathering space','group seating','social seating',
        'people-friendly','human scale','inviting space','safe at night','well lit','lighting at night'
      ]},
      { id: 7, name: 'Construction', maxPts: 8, assumed: true, assumedPts: 8, keywords: [] },
      { id: 8, name: 'Operations', maxPts: 18, assumed: true, assumedPts: 18, keywords: [] },
      { id: 9, name: 'Education', maxPts: 14, assumed: true, assumedPts: 3, keywords: [
        'interpretive','signage','classroom','outdoor learning','educational','wayfinding','QR code','exhibit',
        'demonstration','living lab','sign','label','map','kiosk','display','mural','art','sculpture','monument',
        'memorial','history','heritage','cultural','story','narrative','plaque','marker','information','learn',
        'teach','tour','guide','museum','gallery','installation','interactive','student','campus','identity',
        'botanical label','species','nature trail','discover','explore','workshop','event','program','outreach',
        // natural language additions
        'add signs','informational signs','info signs','educational display','campus pride','aggie pride',
        'school pride','campus history','nature facts','plant information','environmental education',
        'STEM','outdoor STEM','science display','ecology education','biodiversity awareness',
        'sustainability awareness','environmental awareness','green campus','teaching garden',
        'learning station','learning path','discovery trail','campus story','heritage display',
        'explain','awareness','inform people','show students','educate visitors','campus identity'
      ]},
      { id: 10, name: 'Innovation', maxPts: 8, assumed: true, assumedPts: 4, keywords: [
        'IoT','sensor','grey water','smart','digital twin','drone','AI','solar','renewable','green roof','innovation',
        'technology','app','monitor','data','camera','wifi','charging','USB','electric','battery','LED','automated',
        'robot','panel','wind','turbine','geothermal','rain barrel','compost bin','smart irrig','weather station',
        'EV','electric vehicle','charging station','microgrid','net zero','carbon','climate','adaptive','resilient',
        'modular','prefab','3D print','biochar','mycorrhiz','phytoremedi','living wall','vertical garden',
        // natural language additions
        'high tech','smart campus','connected campus','digital campus','real-time monitoring','track data',
        'measure performance','analytics','automation','energy efficient','cutting edge','research pilot',
        'prototype','living laboratory','testbed','innovation hub','green tech','eco tech','smart water',
        'smart grid','zero waste tech','circular','sustainability tech','data collection','data-driven'
      ]}
    ],
    tierThresholds: { certified: 70, silver: 85, gold: 100, platinum: 135 },
    videoOverview: 'baselines/Holland_Bowl_History.mp4',
    downloadPrefix: 'AVA-HollandBowl', lat: 36.074849, lng: -79.774697,
    pinColor: [253, 185, 39], tagClass: 'active', tagLabel: 'Holland Bowl',
    popupDesc: 'The Yard — 1.5-acre concave landscape for SITES v2 design',
    popupStats: [
      { value: '1.5 ac', label: 'Area' },
      { value: '18 ft', label: 'Elev. Drop' },
      { value: 'Urban Fill', label: 'Soil' },
      { value: '110/200', label: 'Baseline' }
    ],
    siteContext: 'The Holland Bowl ("The Yard") is a dramatic 1.5-acre concave intramural/event field between Carver Hall (red brick, north) and Sockwell Hall (red brick, south). The terrain drops 18 feet from rim to basin. SOIL: NRCS Web Soil Survey classifies the substrate as Urban Land (anthropogenic fill) rather than native Piedmont soil — disturbed, compacted conditions that narrow the ecologically appropriate native species palette. WATER (24/36): Concave topography naturally collects stormwater from surrounding impervious surfaces — passive precipitation management. CRITICAL CONSTRAINT: Linear zone of persistent turf dieback along the northern quadrant caused by a subterranean steam vent corridor producing localized soil heating, preventing turf establishment. VEGETATION (28/40): Overwhelmingly managed turfgrass. Zone 1 (bowl center): 50-70% cover rated FAIR-POOR from foot traffic compaction and standing water stress. Lowest-elevation zone: 40-60% cover under stress. Zone 3 (peripheral edges): Significant maintenance deficiencies — foundation shrubs with systemic stress, several Lagerstroemia indica (crape myrtles), one rated CRITICAL for structural failure. MATERIALS (2/28): Primarily turfgrass composition — no significant built infrastructure, material reuse, or sustainable sourcing. HUMAN HEALTH (5/30): Busy pedestrian thoroughfare and Dell Medical School focal point but provides minimal spatial differentiation, social affordance, or restorative quality — no accessible loop paths, study nooks, or inclusive seating. EDUCATION (3/14): Actively used as pedagogical digital twin pilot by LA program but no physical educational elements or interpretive signage. INNOVATION (4/8): SITES v2 as organizing schema for multi-source data architecture (UAV photogrammetry, AI planimetrics, field reconnaissance) bridging LA education and applied campus planning.',
    team: [
      { name: 'Dr. Christopher Hopper', role: 'PI' },
      { name: 'AVA AI', role: 'Designer' },
      { name: 'LA Students', role: 'Studio' }
    ]
  },
  'inspiration-courtyard': {
    id: 'inspiration-courtyard', name: 'Inspiration Courtyard', shortName: 'Inspiration Courtyard',
    college: 'College of Engineering', slogan: 'Digital Twin for Inspiration Courtyard',
    baselineImage: 'baselines/inspiration-courtyard.jpg',
    metrics: { totalArea: 12196, totalAreaAcres: 0.28, elevationDrop: 18, soilType: 'Compacted Piedmont Clay', budget: 140000 }, baselineScore: 63,
    history: {
      title: 'Inspiration Courtyard — Monroe Hall Environs',
      summary: 'An institutional courtyard and pedestrian thoroughfare framed by Monroe Hall, McNair Hall, and Fort IRC Building. Currently in a transitional construction phase with newly poured concrete flatwork, empty angular planter beds, and severely compacted bare soil beneath mature oak canopy. A $140K SITES v2 renovation targets soil remediation, stormwater bioretention, and native Piedmont biodiversity restoration.'
    },
    projectGoals: {
      focus: 'engineering-ecology-showcase',
      avoid: [],
      prioritize: ['Patrick Blanc living walls', 'rain gardens at downspouts', 'parametric overhead structures', 'engineering heritage', 'permaculture guilds', 'parking lot screening'],
      character: 'Patrick Blanc-inspired — engineering meets ecology. The crown jewel where dramatic living walls celebrate the #1 producer of Black engineers.'
    },
    sections: [
      { id: 1, name: 'Site Context', maxPts: 14, assumed: true, assumedPts: 14, keywords: [] },
      { id: 2, name: 'Pre-Design', maxPts: 4, assumed: true, assumedPts: 4, keywords: [] },
      { id: 3, name: 'Water', maxPts: 36, assumed: true, assumedPts: 2, keywords: [
        'rain garden','bioswale','stormwater','retention','infiltration','runoff','permeable','drainage','bioretention',
        'flow-through planter','downspout','roof runoff','porous concrete','permeable paver','groundwater recharge',
        'water harvest','cistern','greywater','green infrastructure','water feature','fountain','pond','stream',
        'basin','rain','flood','drain','gutter','splash pad','wetland','water recycl','catch basin','flow','curb cut',
        'trench','dry well','french drain','rain barrel','sprinkler','drip irrig','water stor','detention','porous',
        'channel','swale','water collect','rooftop runoff','overflow',
        'catch rainwater','collect rainwater','absorb water','soak up rain','reduce flooding','flood prevention',
        'flood control','water conservation','save water','drought resistant','drought tolerant','water-wise',
        'water friendly','water reuse','harvest rainwater','manage water','slow the water','reduce runoff',
        'water management','porous surface','pervious','water capture','rain capture','fix flooding',
        'water infiltration','no more flooding'
      ]},
      { id: 4, name: 'Soil + Vegetation', maxPts: 40, assumed: true, assumedPts: 5, keywords: [
        'soil','vegetation','native','plant','tree','canopy','oak','Willow Oak','compost','mulch','pollinator','habitat',
        'biodiversity','root zone','topsoil','decompaction','AirSpade','Redbud','Dogwood','Carex','sedge','fern',
        'groundcover','Joe-Pye Weed','Swamp Milkweed','Juncus','understory','shrub','meadow','organic amendment',
        'flower','garden','grass','lawn','turf','hedge','vine','moss','ivy','bush','wildflower','bloom','seed',
        'planting bed','raised bed','planter','azalea','hydrangea','butterfly','bee','bird','rose','lavender',
        'perennial','annual','landscape','green space','native grass','coneflower','black-eyed susan','milkweed',
        'ecosystem','shade tree','evergreen','holly','cherry','crepe myrtle','ground cover','cover crop',
        'erosion control','root','living wall','green wall','vertical garden','herb','food','fruit','vegetable',
        'add trees','plant trees','more trees','colorful plants','colorful flowers','beautiful plants','lush planting',
        'add flowers','flower bed','flower beds','add plants','more plants','garden bed','planting beds',
        'wildlife','wildlife habitat','animal habitat','attract birds','attract butterflies','attract bees',
        'carbon sequestration','air quality','ecological restoration','naturalistic','natural area',
        'native landscape','living landscape','green buffer','add greenery','more green','restore soil',
        'healthy soil','soil health','organic soil','urban forest','urban canopy','lush','vibrant plants',
        'colorful landscape','restore vegetation','ecological','nature-based','green facade'
      ]},
      { id: 5, name: 'Materials', maxPts: 28, assumed: true, assumedPts: 6, keywords: [
        'reclaimed','brick','FSC','recycled','gravel','local material','salvaged','permeable paver','concrete','timber',
        'steel','stone','sustainabl','porous concrete','Corten','retaining wall','wood','lumber','metal','iron',
        'copper','glass','tile','mosaic','granite','marble','slate','flagstone','cobble','paver','boardwalk','railing',
        'fence','gate','wall','gabion','terracotta','composite','surface','asphalt','decking','terrace','step',
        'stair','masonry','aggregate','sandstone','bluestone','limestone','natural stone','rock','boulder',
        'stepping stone','edging','curb','bollard','post','column','arch','trellis','arbor','structure','material',
        'eco-friendly material','sustainable material','green material','low carbon material','responsible material',
        'upcycled','repurposed material','reused material','recycle material','environmentally friendly',
        'natural material','zero waste material','local stone','regional material','reuse','recycled content',
        'reclaimed wood','reclaimed brick','salvage','eco path','green paving','responsible building',
        'low impact material','durable material'
      ]},
      { id: 6, name: 'Human Health', maxPts: 30, assumed: true, assumedPts: 4, keywords: [
        'health','well-being','accessibility','ADA','seating','shade','path','gathering','plaza','lighting','LED',
        'solar','bench','meditation','wellness','outdoor classroom','pedestrian','walkway','dappled shade',
        'sit','chair','table','picnic','hammock','swing','play','sport','exercise','yoga','rest','relax',
        'meditat','quiet','calm','comfort','pergola','gazebo','pavilion','shelter','amphitheater','stage',
        'accessible','wheelchair','stroller','walk','stroll','social','community','people','inclusive','safe',
        'night','evening','view','lounge','reading','study','nook','open space','fresh air','nature','outdoor',
        'shade structure','cooling','mist','kids','children','family','elder','senior','universal design',
        'trail','recreation','jogging','bike','running','pocket park',
        'comfortable','welcoming','inviting','cozy','fun space','social space','meeting place','hangout',
        'student hangout','student area','campus life','gather outside','community building','outdoor room',
        'lunch area','eating outside','outdoor dining','study spot','study outside','outdoor study',
        'stress relief','relaxation zone','restorative','biophilic','nature therapy','therapeutic',
        'pedestrian friendly','walkable','connected paths','bike rack','shaded area','cool area',
        'comfortable seating','sitting area','rest area','gathering space','group seating',
        'people-friendly','inviting space','safe at night','well lit','lighting at night'
      ]},
      { id: 7, name: 'Construction', maxPts: 8, assumed: true, assumedPts: 8, keywords: [] },
      { id: 8, name: 'Operations', maxPts: 18, assumed: true, assumedPts: 18, keywords: [] },
      { id: 9, name: 'Education', maxPts: 14, assumed: true, assumedPts: 2, keywords: [
        'interpretive','signage','classroom','outdoor learning','educational','wayfinding','QR code','exhibit',
        'demonstration','living lab','stormwater education','plant ID','sign','label','map','kiosk','display',
        'mural','art','sculpture','monument','memorial','history','heritage','cultural','story','narrative',
        'plaque','marker','information','learn','teach','tour','guide','installation','interactive','student',
        'campus','identity','botanical label','species','nature trail','discover','explore','workshop','event',
        'program','outreach','engineering heritage','STEM',
        'add signs','informational signs','educational display','campus pride','aggie pride','school pride',
        'campus history','nature facts','plant information','environmental education','outdoor STEM',
        'science display','ecology education','biodiversity awareness','sustainability awareness',
        'green campus','teaching garden','learning station','learning path','discovery trail',
        'campus story','heritage display','explain','awareness','inform people','show students','educate visitors'
      ]},
      { id: 10, name: 'Innovation', maxPts: 8, keywords: [
        'IoT','sensor','grey water','smart','digital twin','drone','AI','solar panel','renewable','innovation',
        'flow-through','pneumatic','soil sensor','technology','app','monitor','data','camera','wifi','charging',
        'USB','electric','battery','LED','automated','robot','panel','wind','turbine','geothermal','rain barrel',
        'compost bin','smart irrig','weather station','EV','electric vehicle','charging station','microgrid',
        'net zero','carbon','climate','adaptive','resilient','modular','living wall','vertical garden','green roof',
        'high tech','smart campus','connected campus','digital campus','real-time monitoring','track data',
        'analytics','automation','energy efficient','cutting edge','research pilot','prototype','living laboratory',
        'testbed','innovation hub','green tech','eco tech','smart water','zero waste tech','circular',
        'sustainability tech','data collection','data-driven','AI monitoring'
      ]}
    ],
    tierThresholds: { certified: 70, silver: 85, gold: 100, platinum: 135 },
    videoOverview: 'baselines/IC_Overview.mp4',
    downloadPrefix: 'AVA-InspirationCourtyard', lat: 36.072362, lng: -79.775697,
    pinColor: [0, 70, 132], tagClass: 'active', tagLabel: 'Inspiration Courtyard',
    popupDesc: 'Monroe Hall Courtyard — $140K SITES v2 ecological renovation',
    popupStats: [
      { value: '0.28 ac', label: 'Area' },
      { value: '$140K', label: 'Budget' },
      { value: 'Compacted Clay', label: 'Soil' },
      { value: '63/200', label: 'Baseline' }
    ],
    siteContext: 'The Inspiration Courtyard (Monroe/McNair Plaza) is an institutional courtyard and pedestrian thoroughfare framed by Monroe Hall, McNair Hall, and Fort IRC Building — multi-story red brick buildings with horizontal window banding, classical stone entryway surrounds, enclosed pedestrian bridges, and covered walkways with arched metal roofing (BRIGHT BLUE corrugated metal awning canopies on engineering buildings). MONUMENT: "The Bent" — angular wood/metal engineering sculpture on concrete pedestal — is the central spatial node between buildings, creating a circulation pinch-point with the blue architectural canopy structure and building entrances. CURRENT STATE: Heavily impervious surface relying entirely on gray infrastructure (exposed storm drains) with no passive capture or biological filtration (Water: 2/36). SOIL CRISIS: Severely compacted, exposed, biologically inactive soil within brutalist concrete planters surrounding the monument; mature trees retained but root zones highly stressed by surrounding hardscape (Soil+Veg: 5/40). MATERIALS (6/28): Existing concrete planters are structurally sound — baseline credits assume adaptive reuse rather than demolition for the AggieScape Lab co-design process. HUMAN HEALTH (4/30): Functions merely as a transitional corridor between buildings — no restorative seating, limited shade aside from architectural canopy, inaccessible planter pathways limit equitable use. EDUCATION (2/14): "The Bent" monument exists as pedagogical/cultural anchor but lacks interpretive design to activate it. INNOVATION (0/8): Conventional design. PRIORITY INTERVENTIONS: (1) Pneumatic soil decompaction with AirSpade in critical root zones, (2) Organic compost topdressing and protective mulch rings, (3) Foundation rain gardens at Monroe Hall downspouts as bioretention cells, (4) Convert empty angular planters to flow-through stormwater planters, (5) Permeable pavers along thoroughfare margins, (6) Native Piedmont understory — Eastern Redbud, Flowering Dogwood, (7) Bioretention flora — Joe-Pye Weed, Swamp Milkweed, Soft Rush (Juncus effusus), (8) Resilient native groundcovers — Carex sedges, native ferns replacing bare soil. CAPSTONE OPPORTUNITY: 137-point gap to 200-pt ceiling. Students must resolve the monument-canopy-entrance circulation pinch-point while maximizing Water, Soil+Veg, Materials, and Human Health credits.',
    team: [
      { name: 'Dr. Christopher Hopper', role: 'PI' },
      { name: 'AVA AI', role: 'Designer' },
      { name: 'Engineering', role: 'Client' }
    ]
  },
  'woodland-garden': {
    id: 'woodland-garden', name: 'Woodland Garden', shortName: 'Woodland Garden',
    college: 'Dr. Yang\'s Research Lab', slogan: 'Digital Twin for Woodland Garden',
    baselineImage: 'baselines/woodland-garden.jpg',
    metrics: { totalArea: 21780, totalAreaAcres: 0.5, elevationDrop: 6, soilType: 'Piedmont Forest Loam' }, baselineScore: 110,
    history: {
      title: 'Woodland Garden — Forest Research Site',
      summary: 'A half-acre woodland terracing pilot study within NC A&T\'s mature deciduous forest canopy. Dr. Yang\'s five-layer "rice paddy" terracing system captures precipitation passively — no supplemental irrigation for two years. Tissue-culture ginger, Black Cohosh (est. 2014), and 100% organic compost from Brooks Contractors form the foundation of a living research laboratory.'
    },
    projectGoals: {
      focus: 'ecological-restoration',
      avoid: ['engineering', 'buildings', 'parking', 'concrete', 'brick', 'parametric', 'scaffolding', 'urban', 'plaza'],
      prioritize: ['native woodland plants', 'forest floor restoration', 'spring ephemerals', 'research infrastructure', 'contemplation', 'forest bathing', 'phenology', 'ADA trail upgrades', 'interpretive signage', 'terrace framing', 'immersive education'],
      character: 'A living laboratory — gentle, natural, research-focused. The design hand should be invisible.'
    },
    sections: [
      { id: 1, name: 'Site Context', maxPts: 14, assumed: true, assumedPts: 14, keywords: [] },
      { id: 2, name: 'Pre-Design', maxPts: 4, assumed: true, assumedPts: 4, keywords: [] },
      { id: 3, name: 'Water', maxPts: 36, assumed: true, assumedPts: 24, keywords: [
        'rain garden','bioswale','stormwater','retention','infiltration','runoff','permeable','cistern','drainage','swale',
        'green infrastructure','greywater','irrigation','watershed','water harvest','ephemeral stream','vernal pool',
        'terracing','water feature','fountain','pond','stream','creek','channel','basin','rain','flood','drain',
        'wetland','bog','water recycl','catch basin','flow','french drain','rain barrel','water collect','detention',
        'catch rainwater','collect rainwater','absorb water','soak up rain','reduce flooding','flood prevention',
        'water conservation','save water','drought resistant','drought tolerant','water-wise','water friendly',
        'water reuse','harvest rainwater','manage water','slow the water','reduce runoff','water management',
        'porous surface','pervious','water capture','rain capture','fix flooding','water infiltration'
      ]},
      { id: 4, name: 'Soil + Vegetation', maxPts: 40, assumed: true, assumedPts: 28, keywords: [
        'soil','vegetation','native','plant','tree','canopy','woodland','fern','compost','mulch','pollinator','habitat',
        'biodiversity','oak','hickory','maple','dogwood','groundcover','shrub','root zone','topsoil','mycorrhizal',
        'fungi','understory','wildflower','trillium','bloodroot','hepatica','mayapple','solomon seal','ginger',
        'Black Cohosh','flower','garden','grass','hedge','vine','moss','ivy','bush','bloom','seed','leaf','branch',
        'forest','grove','herb','planting bed','raised bed','planter','butterfly','bee','bird','rose','lavender',
        'perennial','annual','landscape','green space','native grass','sedge','aster','coneflower','milkweed',
        'ecosystem','food forest','fruit tree','shade tree','evergreen','pine','cedar','holly','cherry',
        'ground cover','cover crop','erosion control','root','meadow',
        'add trees','plant trees','more trees','colorful plants','colorful flowers','beautiful plants','lush planting',
        'add flowers','flower bed','add plants','more plants','garden bed','wildlife','wildlife habitat',
        'animal habitat','attract birds','attract butterflies','attract bees','carbon sequestration','air quality',
        'ecological restoration','naturalistic','natural area','native landscape','living landscape',
        'restore soil','healthy soil','soil health','organic soil','urban forest','lush','vibrant plants',
        'restore vegetation','ecological','nature-based','forest floor','woodland floor','spring ephemerals'
      ]},
      { id: 5, name: 'Materials', maxPts: 28, keywords: [
        'reclaimed','wood','FSC','recycled','gravel','local material','salvaged','permeable','natural stone','timber',
        'log','boardwalk','sustainabl','decomposed granite','terrace framing','retaining wall','lumber','metal',
        'stone','flagstone','cobble','railing','fence','gate','wall','step','stair','stepping stone','edging',
        'post','trellis','arbor','bridge','handrail','deck','platform','boulder','rock','bark','chip','surface',
        'aggregate','material','structure','rustic','hand-hewn','split rail','cedar','locust','bamboo material',
        'eco-friendly material','sustainable material','green material','natural material','responsible material',
        'upcycled','repurposed material','reused material','recycle material','environmentally friendly',
        'zero waste material','local stone','regional material','reuse','recycled content','reclaimed wood',
        'salvage','low impact material','durable material','organic material'
      ]},
      { id: 6, name: 'Human Health', maxPts: 30, keywords: [
        'health','well-being','accessibility','ADA','seating','shade','trail','path','gathering','meditation',
        'lighting','bench','wellness','mental health','forest bathing','shinrin-yoku','contemplation','quiet',
        'restorative','walkway','ramp','handrail','sit','chair','hammock','swing','rest','relax','calm',
        'comfort','pergola','gazebo','pavilion','shelter','accessible','wheelchair','stroller','walk','stroll',
        'social','community','people','inclusive','safe','view','overlook','lounge','reading','study','nook',
        'open space','fresh air','nature','outdoor','shade structure','cooling','family','elder','senior',
        'universal design','grab bar','tactile','picnic','table','exercise','yoga','jogging','running','bike',
        'comfortable','welcoming','inviting','cozy','fun space','social space','meeting place','hangout',
        'student area','campus life','stress relief','relaxation zone','biophilic','nature therapy',
        'therapeutic','healing garden','pedestrian friendly','walkable','shaded area','cool area',
        'comfortable seating','sitting area','rest area','gathering space','people-friendly','inviting space',
        'safe at night','well lit','sensory garden','peaceful','tranquil','immersive','mindful'
      ]},
      { id: 7, name: 'Construction', maxPts: 8, assumed: true, assumedPts: 8, keywords: [] },
      { id: 8, name: 'Operations', maxPts: 18, assumed: true, assumedPts: 18, keywords: [] },
      { id: 9, name: 'Education', maxPts: 14, keywords: [
        'interpretive','signage','classroom','outdoor learning','educational','wayfinding','QR code','exhibit',
        'demonstration','living lab','plant ID','ecology','research','phenology','sign','label','map','kiosk',
        'display','mural','art','sculpture','monument','memorial','history','heritage','cultural','story',
        'narrative','plaque','marker','information','learn','teach','tour','guide','installation','interactive',
        'student','botanical label','species','nature trail','discover','explore','workshop','event','program','outreach',
        'add signs','informational signs','educational display','campus pride','nature facts','plant information',
        'environmental education','STEM','outdoor STEM','science display','ecology education',
        'biodiversity awareness','sustainability awareness','teaching garden','learning station','learning path',
        'discovery trail','explain','awareness','inform people','show students','educate visitors',
        'forest education','woodland education','research display','data display','field lab'
      ]},
      { id: 10, name: 'Innovation', maxPts: 8, assumed: true, assumedPts: 4, keywords: [
        'IoT','sensor','smart','digital twin','AI','solar','renewable','innovation','microclimate','monitoring',
        'camera trap','biodiversity index','tissue culture','technology','app','monitor','data','camera','wifi',
        'charging','USB','electric','battery','LED','automated','robot','panel','wind','turbine','geothermal',
        'rain barrel','compost bin','smart irrig','weather station','EV','net zero','carbon','climate','adaptive',
        'resilient','modular','living wall','vertical garden','green roof','biochar','phytoremedi',
        'high tech','smart campus','connected campus','real-time monitoring','track data','analytics',
        'automation','energy efficient','cutting edge','research pilot','prototype','living laboratory',
        'testbed','innovation hub','green tech','eco tech','smart water','zero waste tech','circular',
        'sustainability tech','data collection','data-driven','AI monitoring','biodiversity tracking'
      ]}
    ],
    tierThresholds: { certified: 70, silver: 85, gold: 100, platinum: 135 },
    downloadPrefix: 'AVA-WoodlandGarden', lat: 36.06974645321834, lng: -79.73421003157605,
    pinColor: [34, 139, 34], tagClass: 'active', tagLabel: 'Woodland Garden',
    popupDesc: 'Dr. Yang\'s woodland garden — 110/200 Gold baseline, 90-pt gap for capstone teams',
    popupStats: [
      { value: '0.5 ac', label: 'Area' },
      { value: '6 ft', label: 'Elev. Drop' },
      { value: 'Forest Loam', label: 'Soil' },
      { value: '110/200', label: 'Baseline' }
    ],
    siteContext: 'A half-acre woodland terracing pilot study within NC A&T\'s mature Piedmont hardwood forest. TERRACING SYSTEM: Five-layer "rice paddy" style terraces passively capture and slow precipitation — no supplemental irrigation for 2 years (Water: 24/36 pts). CANOPY: Towering mature Quercus (Red Oak, White Oak), Carya (Hickory), Liriodendron tulipifera (Tulip Poplar), Liquidambar (Sweetgum) — 60-80ft cathedral canopy, dappled filtered light. SOIL + VEG (28/40): Preserved mature canopy; mulched understory in-place to retain biomass; 100% organic compost from Brooks Contractors; tissue-culture ginger plots; Black Cohosh plot (est. 2014); spring ephemerals (Trillium, Bloodroot, Hepatica, Mayapple). MATERIALS (2/28): Minimal built infrastructure — agricultural fencing, farm gates, 50-gal water troughs; mulched biomass kept on-site. HUMAN HEALTH (5/30): Half-mile trail but "very bumpy," requires Gator access; lacks ADA accessibility, restorative seating, designed spatial framing. EDUCATION (3/14): Active LA program partnership + stakeholder education goals, but no physical interpretive signage or wayfinding yet. INNOVATION (4/8): Tissue-culture ginger woodland terracing is regionally innovative — direct pilot study for local stakeholder adaptation. CAPSTONE OPPORTUNITY: 90-point gap to 200-pt ceiling. Students must target Materials (terrace framing), Human Health (trail ADA upgrades, restorative seating), and Education (immersive interpretive signage) to push toward Platinum.',
    team: [
      { name: 'Dr. Yang', role: 'PI' },
      { name: 'Dr. Christopher Hopper', role: 'Co-PI' },
      { name: 'AVA AI', role: 'Designer' }
    ]
  }
};


// Expose globally
window.SITE_CONFIGS = SITE_CONFIGS;
