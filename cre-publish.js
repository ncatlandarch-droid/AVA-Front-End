/* =============================================
   AVA — Open Impact CRE Publishing Module
   Bridges AVA → Open Future Coalition CRE Portal
   ============================================= */

// ========== CRE CONFIGURATION ==========
const CRE_CONFIG = {
  portalUrl: 'https://cre.openfuturecoalition.org',
  createProjectUrl: 'https://cre.openfuturecoalition.org/management/create-project',
  branding: {
    name: 'Open Future Coalition',
    color: '#2d2e5b',
    accent: '#e8a838'
  },
  defaults: {
    city: 'Greensboro',
    state: 'North Carolina',
    zipcode: '27411',
    country: 'United States',
    organization: 'NC A&T State University',
    streetAddress: '1601 E Market St'
  }
};

// ========== COLLECT PROJECT DATA ==========
function collectCREProjectData() {
  const config = getSiteConfig();
  const metrics = getSiteMetrics();
  const sections = getSiteSections();
  const scores = state.sectionScores || new Array(4).fill(0);
  const total = state.currentScore || 0;
  const tier = state.currentTier || 'none';
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
  const designDesc = (state.cumulativePrompts || []).join(' → ') || state.currentPrompt || 'Sustainable landscape design';
  const userName = state.user?.displayName || 'Aggie Architect';
  const biome = config.biome || {};

  // GPS: prefer live GPS → site config
  const lat = geoState?.currentPosition?.lat || config.lat;
  const lng = geoState?.currentPosition?.lng || config.lng;

  // Section breakdown for description
  const sectionSummary = sections.map((sec, i) =>
    `${sec.name}: ${scores[i] || 0}/${sec.maxPts}`
  ).join(' · ');

  // Key design elements from prompts
  const allPrompts = (state.cumulativePrompts || []).join(' ').toLowerCase();
  const elements = [];
  if (allPrompts.includes('bioswale') || allPrompts.includes('rain garden')) elements.push('bioswale/rain garden');
  if (allPrompts.includes('native') || allPrompts.includes('canopy')) elements.push('native plantings');
  if (allPrompts.includes('permeable') || allPrompts.includes('porous')) elements.push('permeable paving');
  if (allPrompts.includes('bench') || allPrompts.includes('seating')) elements.push('seating areas');
  if (allPrompts.includes('lighting') || allPrompts.includes('solar') || allPrompts.includes('led')) elements.push('solar lighting');
  if (allPrompts.includes('shade') || allPrompts.includes('shelter') || allPrompts.includes('pavilion')) elements.push('shade structures');
  if (allPrompts.includes('pollinator') || allPrompts.includes('meadow')) elements.push('pollinator habitat');
  if (allPrompts.includes('ada') || allPrompts.includes('accessible')) elements.push('ADA pathways');
  if (allPrompts.includes('zen') || allPrompts.includes('meditation')) elements.push('contemplative spaces');

  // Generate tagline
  const tagline = `Sustainable ${tierLabel !== 'None' ? `SITES ${tierLabel}` : 'SITES-aligned'} landscape redesign — ${config.name} · ${total}/100 pts`;

  // Generate description
  let description = `${config.name} is a ${metrics.totalAreaAcres || '—'}-acre landscape project at ${config.college || 'NC A&T State University'}`;
  description += ` designed through the Aggie Visualization Assistant (AVA) platform using SITES v2 sustainability scoring.`;
  if (total > 0) {
    description += ` The design achieved a ${tierLabel} rating with ${total}/100 SITES points across ${state.iterationCount || 0} AI-assisted design iterations.`;
  }
  if (elements.length > 0) {
    description += ` Key features include ${elements.join(', ')}.`;
  }
  if (biome.ecoregion) {
    description += ` Located in the ${biome.ecoregion} ecoregion (USDA Zone ${biome.hardiness_zone || '7a'}).`;
  }

  // Generate objective HTML (rich project narrative)
  const objectiveHTML = generateObjectiveHTML(config, metrics, sections, scores, total, tier, elements, biome, designDesc);

  // End date: 30 days from now
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 30);

  return {
    // CREATE PROJECT tab
    title: config.name,
    startDate: new Date().toLocaleDateString('en-US'),
    endDate: endDate.toLocaleDateString('en-US'),
    projectManager: userName,

    // ABOUT tab
    name: config.name,
    tagline: tagline,
    description: description,
    hasProfileImage: !!state.generatedImageBase64,
    hasBannerImage: !!(config.baselineImage || config.aerialImage),

    // ADDRESSES tab
    firstName: userName.split(' ')[0] || 'AVA',
    lastName: userName.split(' ').slice(1).join(' ') || 'Designer',
    email: state.user?.email || '',
    organization: CRE_CONFIG.defaults.organization,
    streetAddress: CRE_CONFIG.defaults.streetAddress,
    city: CRE_CONFIG.defaults.city,
    state: CRE_CONFIG.defaults.state,
    zipcode: CRE_CONFIG.defaults.zipcode,
    country: CRE_CONFIG.defaults.country,
    latitude: lat ? lat.toFixed(6) : '',
    longitude: lng ? lng.toFixed(6) : '',
    website: window.location.href,

    // OBJECTIVE tab
    objectiveHTML: objectiveHTML,

    // Raw data for JSON export
    _raw: {
      siteId: config.id,
      siteName: config.name,
      score: total,
      tier: tier,
      sectionScores: scores.slice(),
      iterationCount: state.iterationCount || 0,
      designPrompts: (state.cumulativePrompts || []).slice(),
      designElements: elements,
      lat: lat,
      lng: lng,
      biome: biome,
      metrics: metrics,
      timestamp: new Date().toISOString()
    }
  };
}


// ========== GENERATE OBJECTIVE HTML ==========
function generateObjectiveHTML(config, metrics, sections, scores, total, tier, elements, biome, designDesc) {
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
  const tierEmoji = { none: '', certified: '✅', silver: '🥈', gold: '🥇', platinum: '🏆' }[tier] || '';

  let html = `<div style="font-family: Inter, Arial, sans-serif; max-width: 700px; line-height: 1.6;">`;

  // Hero header
  html += `
    <div style="background: linear-gradient(135deg, #004684 0%, #002d5a 100%); color: white; padding: 24px 28px; border-radius: 12px; margin-bottom: 20px;">
      <h2 style="margin: 0 0 8px 0; font-size: 22px;">🏗️ ${config.name}</h2>
      <p style="margin: 0; opacity: 0.85; font-size: 14px;">${config.college || 'NC A&T State University'} · AVA Design Assessment</p>
    </div>`;

  // SITES Score Card
  html += `
    <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid #e9ecef;">
      <h3 style="margin: 0 0 12px 0; color: #004684;">🎯 SITES v2 Score: ${total}/100 ${tierEmoji} ${tierLabel}</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <thead>
          <tr style="border-bottom: 2px solid #dee2e6;">
            <th style="text-align: left; padding: 6px 8px;">Focus Area</th>
            <th style="text-align: center; padding: 6px 8px;">Score</th>
            <th style="text-align: left; padding: 6px 8px;">Progress</th>
          </tr>
        </thead>
        <tbody>`;

  sections.forEach((sec, i) => {
    const s = scores[i] || 0;
    const pct = Math.round((s / sec.maxPts) * 100);
    const barColor = pct >= 75 ? '#4ADE80' : pct >= 50 ? '#FDB927' : pct >= 25 ? '#FB923C' : '#94a3b8';
    html += `
          <tr style="border-bottom: 1px solid #f0f0f0;">
            <td style="padding: 8px;">${sec.name}</td>
            <td style="text-align: center; padding: 8px; font-weight: 600;">${s}/${sec.maxPts}</td>
            <td style="padding: 8px;">
              <div style="background: #e9ecef; border-radius: 4px; height: 8px; width: 100%;">
                <div style="background: ${barColor}; border-radius: 4px; height: 8px; width: ${pct}%;"></div>
              </div>
            </td>
          </tr>`;
  });

  html += `
        </tbody>
      </table>
    </div>`;

  // Design Elements
  if (elements.length > 0) {
    html += `
    <div style="margin-bottom: 20px;">
      <h3 style="color: #004684; margin: 0 0 10px 0;">🌿 Key Design Elements</h3>
      <div>`;
    elements.forEach(el => {
      html += `<span style="display: inline-block; padding: 4px 12px; margin: 3px 4px; background: #e8f5e9; color: #2e7d32; border-radius: 16px; font-size: 13px;">${el}</span>`;
    });
    html += `</div></div>`;
  }

  // Ecological Context
  if (biome.ecoregion || biome.hardiness_zone) {
    html += `
    <div style="margin-bottom: 20px;">
      <h3 style="color: #004684; margin: 0 0 10px 0;">🌍 Ecological Context</h3>
      <table style="font-size: 14px; border-collapse: collapse;">`;
    if (biome.ecoregion) html += `<tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Ecoregion</td><td>${biome.ecoregion}</td></tr>`;
    if (biome.hardiness_zone) html += `<tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Hardiness Zone</td><td>${biome.hardiness_zone}</td></tr>`;
    if (biome.climate_zone) html += `<tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Climate</td><td>${biome.climate_zone}</td></tr>`;
    if (biome.soil_order) html += `<tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Soil Order</td><td>${biome.soil_order}</td></tr>`;
    if (biome.annual_precip_inches) html += `<tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Annual Precip</td><td>${biome.annual_precip_inches}"</td></tr>`;
    html += `</table></div>`;
  }

  // Site Metrics
  html += `
    <div style="margin-bottom: 20px;">
      <h3 style="color: #004684; margin: 0 0 10px 0;">📐 Site Metrics</h3>
      <table style="font-size: 14px; border-collapse: collapse;">
        <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Total Area</td><td>${metrics.totalArea?.toLocaleString() || '—'} sq ft (${metrics.totalAreaAcres || '—'} acres)</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Elevation Change</td><td>${metrics.elevationDrop || '—'} ft</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Soil Type</td><td>${metrics.soilType || '—'}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Runoff Potential</td><td>${metrics.runoffPotential || '—'}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Design Iterations</td><td>${state.iterationCount || 0}</td></tr>
      </table>
    </div>`;

  // Design Narrative
  const prompts = state.cumulativePrompts || [];
  if (prompts.length > 0) {
    html += `
    <div style="margin-bottom: 20px;">
      <h3 style="color: #004684; margin: 0 0 10px 0;">🎨 Design Narrative</h3>
      <ol style="padding-left: 20px; font-size: 14px;">`;
    prompts.forEach(p => {
      const truncated = p.length > 150 ? p.substring(0, 150) + '…' : p;
      html += `<li style="margin-bottom: 6px;">${truncated}</li>`;
    });
    html += `</ol></div>`;
  }

  // Footer
  html += `
    <div style="border-top: 2px solid #e9ecef; padding-top: 16px; margin-top: 20px; text-align: center; color: #6c757d; font-size: 12px;">
      <p>Generated by <strong>AVA — Aggie Visualization Assistant</strong><br>
      NC A&T State University · College of Agriculture & Environmental Sciences<br>
      Powered by Gemini AI + SITES v2 Framework</p>
    </div>
  </div>`;

  return html;
}


// ========== OPEN CRE PUBLISH PANEL ==========
function openCREPublishPanel() {
  if (!state.generatedImageBase64) {
    if (typeof showToast === 'function') showToast('Generate a design first, then publish to Open Impact!', 'warn');
    return;
  }

  const data = collectCREProjectData();
  const modal = document.getElementById('crePublishModal');
  const body = document.getElementById('crePublishBody');

  // Build the copy-field UI
  body.innerHTML = buildCREPublishUI(data);

  // Store data globally for copy functions
  window._creProjectData = data;

  if (typeof openModal === 'function') openModal('crePublishModal');
}


// ========== BUILD PUBLISH UI ==========
function buildCREPublishUI(data) {
  const mimeType = state.generatedImageMimeType || 'image/png';
  const imgSrc = state.generatedImageBase64
    ? `data:${mimeType};base64,${state.generatedImageBase64}`
    : '';

  return `
    <!-- Design Preview -->
    <div class="cre-preview-card">
      ${imgSrc ? `<img class="cre-preview-img" src="${imgSrc}" alt="Design preview" />` : ''}
      <div class="cre-preview-meta">
        <span class="cre-preview-site">${escapeHTML(data.name)}</span>
        <span class="cre-preview-score">${data._raw.score}/100 pts · ${data._raw.tier.charAt(0).toUpperCase() + data._raw.tier.slice(1)}</span>
      </div>
    </div>

    <!-- Tab: CREATE PROJECT -->
    <div class="cre-section">
      <div class="cre-section-header">
        <span class="cre-section-icon">1</span>
        <span class="cre-section-title">Create Project</span>
      </div>
      ${creFieldRow('Title', data.title, 'title')}
    </div>

    <!-- Tab: ABOUT -->
    <div class="cre-section">
      <div class="cre-section-header">
        <span class="cre-section-icon">2</span>
        <span class="cre-section-title">About</span>
      </div>
      ${creFieldRow('Name', data.name, 'name')}
      ${creFieldRow('Tagline', data.tagline, 'tagline')}
      ${creFieldRow('Description', data.description, 'description')}
      <div class="cre-field-row cre-field-images">
        <div class="cre-image-action">
          <span class="cre-field-label">Profile Image</span>
          <button class="cre-download-btn" onclick="downloadCREProfileImage()">
            <span class="material-symbols-outlined">download</span>
            Download PNG
          </button>
        </div>
        <div class="cre-image-action">
          <span class="cre-field-label">Banner Picture</span>
          <button class="cre-download-btn" onclick="downloadCREBannerImage()">
            <span class="material-symbols-outlined">download</span>
            Download PNG
          </button>
        </div>
      </div>
    </div>

    <!-- Tab: ADDRESSES -->
    <div class="cre-section">
      <div class="cre-section-header">
        <span class="cre-section-icon">3</span>
        <span class="cre-section-title">Addresses</span>
      </div>
      ${creFieldRow('City', data.city, 'city')}
      ${creFieldRow('State', data.state, 'state')}
      ${creFieldRow('Zipcode', data.zipcode, 'zipcode')}
      ${creFieldRow('Latitude', data.latitude, 'latitude')}
      ${creFieldRow('Longitude', data.longitude, 'longitude')}
    </div>

    <!-- Tab: OBJECTIVE -->
    <div class="cre-section">
      <div class="cre-section-header">
        <span class="cre-section-icon">4</span>
        <span class="cre-section-title">Objective</span>
      </div>
      <div class="cre-field-row">
        <span class="cre-field-label">Rich Project Narrative</span>
        <button class="cre-copy-btn" onclick="copyCREField('objectiveHTML', true)" title="Copy as rich text for paste into editor">
          <span class="material-symbols-outlined">content_paste</span>
          Copy HTML
        </button>
      </div>
      <div class="cre-objective-preview" id="creObjectivePreview">
        ${data.objectiveHTML}
      </div>
    </div>

    <!-- Bulk Actions -->
    <div class="cre-bulk-actions">
      <button class="cre-action-btn cre-action-json" onclick="copyCREAllJSON()">
        <span class="material-symbols-outlined">data_object</span>
        Copy All as JSON
      </button>
      <button class="cre-action-btn cre-action-open" onclick="openCREForm()">
        <span class="material-symbols-outlined">open_in_new</span>
        Open CRE Form
      </button>
    </div>
  `;
}


// ========== FIELD ROW HELPER ==========
function creFieldRow(label, value, fieldKey) {
  const displayValue = (value || '').toString();
  const truncated = displayValue.length > 120 ? displayValue.substring(0, 120) + '…' : displayValue;
  return `
    <div class="cre-field-row">
      <div class="cre-field-info">
        <span class="cre-field-label">${label}</span>
        <span class="cre-field-value" title="${escapeHTML(displayValue)}">${escapeHTML(truncated)}</span>
      </div>
      <button class="cre-copy-btn" onclick="copyCREField('${fieldKey}')" title="Copy to clipboard">
        <span class="material-symbols-outlined">content_copy</span>
      </button>
    </div>
  `;
}


// ========== COPY FUNCTIONS ==========
async function copyCREField(fieldKey, isHTML) {
  const data = window._creProjectData;
  if (!data) return;

  const value = data[fieldKey] || '';

  try {
    if (isHTML) {
      // Copy as rich text (HTML) for paste into rich text editors
      const blob = new Blob([value], { type: 'text/html' });
      const plainBlob = new Blob([value.replace(/<[^>]*>/g, '')], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': blob,
          'text/plain': plainBlob
        })
      ]);
    } else {
      await navigator.clipboard.writeText(value.toString());
    }

    // Visual feedback — flash green on the button
    event.currentTarget.classList.add('cre-copied');
    const icon = event.currentTarget.querySelector('.material-symbols-outlined');
    const originalIcon = icon.textContent;
    icon.textContent = 'check';
    setTimeout(() => {
      event.currentTarget.classList.remove('cre-copied');
      icon.textContent = originalIcon;
    }, 1500);

    if (typeof showToast === 'function') showToast(`📋 ${fieldKey} copied!`, 'success');
  } catch (e) {
    console.warn('[CRE] Clipboard write failed:', e);
    // Fallback: select text
    const ta = document.createElement('textarea');
    ta.value = isHTML ? value.replace(/<[^>]*>/g, '') : value.toString();
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    if (typeof showToast === 'function') showToast(`📋 ${fieldKey} copied (fallback)!`, 'success');
  }
}


function copyCREAllJSON() {
  const data = window._creProjectData;
  if (!data) return;

  // Build a clean export object (no HTML, no internal fields)
  const exportData = {
    title: data.title,
    name: data.name,
    tagline: data.tagline,
    description: data.description,
    startDate: data.startDate,
    endDate: data.endDate,
    address: {
      street: data.streetAddress,
      city: data.city,
      state: data.state,
      zipcode: data.zipcode,
      country: data.country
    },
    coordinates: {
      latitude: parseFloat(data.latitude) || null,
      longitude: parseFloat(data.longitude) || null
    },
    sitesScore: data._raw.score,
    tier: data._raw.tier,
    sectionScores: data._raw.sectionScores,
    designElements: data._raw.designElements,
    iterationCount: data._raw.iterationCount,
    biome: data._raw.biome,
    designPrompts: data._raw.designPrompts,
    timestamp: data._raw.timestamp
  };

  navigator.clipboard.writeText(JSON.stringify(exportData, null, 2))
    .then(() => {
      if (typeof showToast === 'function') showToast('📋 Full project JSON copied!', 'success');
    })
    .catch(() => {
      const ta = document.createElement('textarea');
      ta.value = JSON.stringify(exportData, null, 2);
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      if (typeof showToast === 'function') showToast('📋 JSON copied (fallback)!', 'success');
    });
}


// ========== IMAGE DOWNLOADS ==========
function downloadCREProfileImage() {
  if (!state.generatedImageBase64) {
    if (typeof showToast === 'function') showToast('No design image available!', 'warn');
    return;
  }

  const mimeType = state.generatedImageMimeType || 'image/png';
  const ext = mimeType.includes('png') ? 'png' : 'jpg';
  const config = getSiteConfig();

  const link = document.createElement('a');
  link.download = `${config.shortName || config.id}-Profile-${Date.now()}.${ext}`;
  link.href = `data:${mimeType};base64,${state.generatedImageBase64}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  if (typeof showToast === 'function') showToast('📸 Profile image downloaded — upload to CRE!', 'success');
}


function downloadCREBannerImage() {
  const config = getSiteConfig();
  const src = config.aerialImage || config.baselineImage;

  if (!src) {
    if (typeof showToast === 'function') showToast('No banner image available!', 'warn');
    return;
  }

  // If it's a base64 data URI (ad-hoc site), download directly
  if (src.startsWith('data:')) {
    const link = document.createElement('a');
    link.download = `${config.shortName || config.id}-Banner-${Date.now()}.jpg`;
    link.href = src;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else {
    // It's a file path — create canvas to export
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const cvs = document.createElement('canvas');
      cvs.width = img.naturalWidth;
      cvs.height = img.naturalHeight;
      cvs.getContext('2d').drawImage(img, 0, 0);
      const link = document.createElement('a');
      link.download = `${config.shortName || config.id}-Banner-${Date.now()}.jpg`;
      link.href = cvs.toDataURL('image/jpeg', 0.92);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };
    img.onerror = () => {
      // Fallback: just open the image in new tab
      window.open(src, '_blank');
    };
    img.src = src;
  }

  if (typeof showToast === 'function') showToast('🖼️ Banner image downloaded — upload to CRE!', 'success');
}


// ========== OPEN CRE FORM ==========
function openCREForm() {
  window.open(CRE_CONFIG.createProjectUrl, '_blank');
  if (typeof showToast === 'function') showToast('🌐 CRE form opened — paste your copied fields!', 'info');
}


console.log('[AVA] 🌐 Open Impact CRE Publishing module loaded');
