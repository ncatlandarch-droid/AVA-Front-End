/* admin-panel.js — Admin Project Manager for AVA V3
 * Provides a standardized form for creating/editing campus design projects.
 * Admin-only (ncatlandarch). Projects stored in Firestore, merged with site-configs.js.
 * Requires: window.COMMUNITY, window.SITE_CONFIGS, window.showToast, window.escapeHTML
 * Exposes: window.ADMIN
 */

const ADMIN = {
  editingProjectId: null,

  /* ═══════ INIT ═══════ */

  init() {
    // Show/hide admin button based on role
    this._updateAdminVisibility();
    // Listen for Firestore projects and merge into SITE_CONFIGS
    if (typeof COMMUNITY !== 'undefined' && COMMUNITY.initialized) {
      COMMUNITY.listenProjects(projects => {
        this._mergeProjects(projects);
      });
    }
  },

  _updateAdminVisibility() {
    const btn = document.getElementById('btnAdminProjects');
    if (!btn) return;
    const show = typeof COMMUNITY !== 'undefined' && COMMUNITY.isAdmin();
    btn.style.display = show ? '' : 'none';
  },

  /* ═══════ MERGE FIRESTORE PROJECTS INTO SITE_CONFIGS ═══════ */

  _mergeProjects(firestoreProjects) {
    firestoreProjects.forEach(fp => {
      const existing = SITE_CONFIGS[fp.id];
      if (existing && !existing._fromFirestore) {
        // Built-in project exists — merge Firestore fields ON TOP of existing,
        // only overriding fields that Firestore explicitly provides
        if (fp.baselineImageUrl) existing.baselineImage = fp.baselineImageUrl;
        if (fp.videoOverviewUrl) existing.videoOverview = fp.videoOverviewUrl;
        if (fp.siteContext) existing.siteContext = fp.siteContext;
        if (fp.goalsFocus) existing.projectGoals.focus = fp.goalsFocus;
        if (fp.goalsCharacter) existing.projectGoals.character = fp.goalsCharacter;
        if (fp.goalsPrioritize?.length) existing.projectGoals.prioritize = fp.goalsPrioritize;
        if (fp.goalsAvoid?.length) existing.projectGoals.avoid = fp.goalsAvoid;
        if (fp.historySummary) existing.history.summary = fp.historySummary;
        if (fp.historyTitle) existing.history.title = fp.historyTitle;
        if (fp.team?.length) existing.team = fp.team;
        if (fp.popupDesc) existing.popupDesc = fp.popupDesc;
        console.log('[AVA] Supplemented built-in project:', fp.id);
      } else {
        // New cloud-only project — create full config from Firestore data
        const config = this._firestoreToConfig(fp);
        if (config) SITE_CONFIGS[fp.id] = config;
      }
    });
    // Re-render project lists, scoreboard, and map pins
    if (typeof buildProjectsGallery === 'function') buildProjectsGallery();
    if (typeof updateScoreboard === 'function') updateScoreboard();
    if (window.GEO?.refreshMarkers) GEO.refreshMarkers();
    console.log('[AVA] Merged', firestoreProjects.length, 'Firestore projects into SITE_CONFIGS');
  },

  _firestoreToConfig(fp) {
    // Default SITES v2 scoring sections
    const defaultSections = [
      { id: 1, name: 'Site Context', maxPts: 14, assumed: true, assumedPts: 14, keywords: [] },
      { id: 2, name: 'Pre-Design', maxPts: 4, assumed: true, assumedPts: 4, keywords: [] },
      { id: 3, name: 'Water', maxPts: 36, keywords: ['rain garden','bioswale','stormwater','retention','infiltration','runoff','permeable','cistern','drainage','swale','green infrastructure','water harvest'] },
      { id: 4, name: 'Soil + Vegetation', maxPts: 40, keywords: ['soil','vegetation','native','plant','tree','canopy','meadow','compost','mulch','pollinator','habitat','biodiversity','groundcover','shrub'] },
      { id: 5, name: 'Materials', maxPts: 28, keywords: ['reclaimed','brick','FSC','recycled','gravel','local material','salvaged','permeable paver','concrete','timber','stone','sustainable'] },
      { id: 6, name: 'Human Health', maxPts: 30, keywords: ['health','well-being','accessibility','ADA','seating','shade','trail','path','gathering','plaza','recreation','lighting','bench','wellness','outdoor classroom'] },
      { id: 7, name: 'Construction', maxPts: 8, assumed: true, assumedPts: 8, keywords: [] },
      { id: 8, name: 'Operations', maxPts: 18, assumed: true, assumedPts: 18, keywords: [] },
      { id: 9, name: 'Education', maxPts: 14, keywords: ['interpretive','signage','classroom','outdoor learning','educational','wayfinding','QR code','exhibit','demonstration','living lab'] },
      { id: 10, name: 'Innovation', maxPts: 8, keywords: ['IoT','sensor','smart','digital twin','AI','solar','renewable','innovation'] }
    ];

    return {
      id: fp.id,
      name: fp.name || 'Unnamed Project',
      shortName: fp.shortName || fp.name || 'Unnamed',
      college: fp.college || '',
      slogan: fp.slogan || `Digital Twin for ${fp.name || 'this site'}`,
      baselineImage: fp.baselineImageUrl || 'baselines/default.jpg',
      metrics: {
        totalArea: fp.totalArea || 0,
        totalAreaAcres: fp.totalAreaAcres || 0,
        elevationDrop: fp.elevationDrop || 0,
        soilType: fp.soilType || 'Unknown',
        budget: fp.budget || 0
      },
      baselineScore: fp.baselineScore || 0,
      history: {
        title: fp.historyTitle || `The Story of ${fp.name || 'this site'}`,
        summary: fp.historySummary || ''
      },
      projectGoals: {
        focus: fp.goalsFocus || 'sustainable-landscape',
        avoid: fp.goalsAvoid || [],
        prioritize: fp.goalsPrioritize || [],
        character: fp.goalsCharacter || ''
      },
      sections: fp.sections || defaultSections,
      tierThresholds: { certified: 70, silver: 85, gold: 100, platinum: 135 },
      videoOverview: fp.videoOverviewUrl || '',
      downloadPrefix: `AVA-${(fp.shortName || fp.name || 'Project').replace(/\s+/g, '')}`,
      lat: fp.lat || 36.0726,
      lng: fp.lng || -79.7749,
      pinColor: fp.pinColor || [100, 100, 100],
      tagClass: 'active',
      tagLabel: fp.shortName || fp.name || 'Project',
      popupDesc: fp.popupDesc || fp.historySummary || '',
      popupStats: [
        { value: `${fp.totalAreaAcres || '?'} ac`, label: 'Area' },
        { value: `${fp.elevationDrop || '?'} ft`, label: 'Elev. Drop' },
        { value: fp.soilType || '?', label: 'Soil' },
        { value: `${fp.baselineScore || 0}/200`, label: 'Baseline' }
      ],
      siteContext: fp.siteContext || '',
      team: fp.team || [],
      _fromFirestore: true
    };
  },

  /* ═══════ FORM OPEN / CLOSE ═══════ */

  openProjectForm(projectId) {
    if (!COMMUNITY.isAdmin()) { showToast('Admin access required', 'warn'); return; }
    this.editingProjectId = projectId || null;
    const modal = document.getElementById('adminProjectModal');
    if (!modal) return;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    if (projectId && SITE_CONFIGS[projectId]) {
      this._populateForm(SITE_CONFIGS[projectId]);
    } else {
      this._resetForm();
    }
  },

  closeProjectForm() {
    const modal = document.getElementById('adminProjectModal');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
    this.editingProjectId = null;
  },

  /* ═══════ FORM POPULATION ═══════ */

  _resetForm() {
    const form = document.getElementById('adminProjectForm');
    if (form) form.reset();
    // Clear tag chips
    document.querySelectorAll('.admin-tag-list').forEach(el => el.innerHTML = '');
    // Clear team rows
    const teamList = document.getElementById('adminTeamList');
    if (teamList) teamList.innerHTML = '';
    this._addTeamRow(); // Start with one empty row
    // Clear image previews
    document.querySelectorAll('.admin-upload-preview').forEach(el => el.src = '');
    // Set default pin color
    const pinR = document.getElementById('adminPinR');
    const pinG = document.getElementById('adminPinG');
    const pinB = document.getElementById('adminPinB');
    if (pinR) pinR.value = 100;
    if (pinG) pinG.value = 100;
    if (pinB) pinB.value = 100;
  },

  _populateForm(config) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('adminProjectId', config.id);
    set('adminProjectName', config.name);
    set('adminProjectShortName', config.shortName);
    set('adminProjectCollege', config.college);
    set('adminProjectSlogan', config.slogan);
    set('adminProjectLat', config.lat);
    set('adminProjectLng', config.lng);
    set('adminPinR', config.pinColor?.[0] || 100);
    set('adminPinG', config.pinColor?.[1] || 100);
    set('adminPinB', config.pinColor?.[2] || 100);
    set('adminProjectArea', config.metrics?.totalAreaAcres);
    set('adminProjectElevation', config.metrics?.elevationDrop);
    set('adminProjectSoil', config.metrics?.soilType);
    set('adminProjectBudget', config.metrics?.budget);
    set('adminProjectBaseline', config.baselineScore);
    set('adminHistoryTitle', config.history?.title);
    set('adminHistorySummary', config.history?.summary);
    set('adminSiteContext', config.siteContext);
    set('adminGoalsFocus', config.projectGoals?.focus);
    set('adminGoalsCharacter', config.projectGoals?.character);
    set('adminPopupDesc', config.popupDesc);

    // Tag chips
    this._setTagChips('adminPrioritizeList', config.projectGoals?.prioritize || []);
    this._setTagChips('adminAvoidList', config.projectGoals?.avoid || []);

    // Team
    const teamList = document.getElementById('adminTeamList');
    if (teamList) {
      teamList.innerHTML = '';
      (config.team || []).forEach(t => this._addTeamRow(t.name, t.role));
      if (!config.team?.length) this._addTeamRow();
    }

    // Image preview
    const preview = document.getElementById('adminBaselinePreview');
    if (preview && config.baselineImage) {
      preview.src = config.baselineImage;
      preview.style.display = 'block';
    }
  },

  /* ═══════ TAG CHIP INPUT ═══════ */

  _setTagChips(listId, tags) {
    const list = document.getElementById(listId);
    if (!list) return;
    list.innerHTML = tags.map(t =>
      `<span class="admin-tag-chip">${escapeHTML(t)}<button onclick="ADMIN.removeTag(this)">&times;</button></span>`
    ).join('');
  },

  addTag(inputId, listId) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if (!input || !list) return;
    const val = input.value.trim();
    if (!val) return;
    const chip = document.createElement('span');
    chip.className = 'admin-tag-chip';
    chip.innerHTML = `${escapeHTML(val)}<button onclick="ADMIN.removeTag(this)">&times;</button>`;
    list.appendChild(chip);
    input.value = '';
    input.focus();
  },

  removeTag(btn) {
    btn.parentElement.remove();
  },

  _getTagValues(listId) {
    const list = document.getElementById(listId);
    if (!list) return [];
    return Array.from(list.querySelectorAll('.admin-tag-chip')).map(chip => {
      return chip.textContent.replace('\u00d7', '').trim();
    });
  },

  /* ═══════ TEAM ROWS ═══════ */

  _addTeamRow(name, role) {
    const list = document.getElementById('adminTeamList');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'admin-team-row';
    row.innerHTML = `
      <input type="text" placeholder="Name" value="${escapeHTML(name || '')}" class="admin-team-name">
      <input type="text" placeholder="Role (PI, Designer, Client...)" value="${escapeHTML(role || '')}" class="admin-team-role">
      <button type="button" class="admin-team-remove" onclick="this.parentElement.remove()"><span class="material-symbols-outlined">close</span></button>
    `;
    list.appendChild(row);
  },

  addTeamRow() {
    this._addTeamRow();
  },

  _getTeamValues() {
    const rows = document.querySelectorAll('.admin-team-row');
    return Array.from(rows).map(row => ({
      name: row.querySelector('.admin-team-name')?.value?.trim() || '',
      role: row.querySelector('.admin-team-role')?.value?.trim() || ''
    })).filter(t => t.name);
  },

  /* ═══════ IMAGE UPLOAD ═══════ */

  handleBaselineUpload(input) {
    const file = input.files?.[0];
    if (!file) return;
    const preview = document.getElementById('adminBaselinePreview');
    if (preview) {
      preview.src = URL.createObjectURL(file);
      preview.style.display = 'block';
    }
  },

  /* ═══════ SAVE PROJECT ═══════ */

  async saveProject() {
    const get = id => document.getElementById(id)?.value?.trim() || '';

    // Validate required fields
    const id = get('adminProjectId');
    const name = get('adminProjectName');
    if (!id) { showToast('Project ID is required (e.g., "east-quad")', 'warn'); return; }
    if (!name) { showToast('Project name is required', 'warn'); return; }

    // Sanitize ID
    const cleanId = id.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

    // Build project data
    const projectData = {
      id: cleanId,
      name,
      shortName: get('adminProjectShortName') || name,
      college: get('adminProjectCollege'),
      slogan: get('adminProjectSlogan') || `Digital Twin for ${name}`,
      lat: parseFloat(get('adminProjectLat')) || 36.0726,
      lng: parseFloat(get('adminProjectLng')) || -79.7749,
      pinColor: [
        parseInt(document.getElementById('adminPinR')?.value) || 100,
        parseInt(document.getElementById('adminPinG')?.value) || 100,
        parseInt(document.getElementById('adminPinB')?.value) || 100
      ],
      totalArea: 0,
      totalAreaAcres: parseFloat(get('adminProjectArea')) || 0,
      elevationDrop: parseFloat(get('adminProjectElevation')) || 0,
      soilType: get('adminProjectSoil') || 'Unknown',
      budget: parseFloat(get('adminProjectBudget')) || 0,
      baselineScore: parseInt(get('adminProjectBaseline')) || 0,
      historyTitle: get('adminHistoryTitle'),
      historySummary: get('adminHistorySummary'),
      siteContext: get('adminSiteContext'),
      goalsFocus: get('adminGoalsFocus'),
      goalsCharacter: get('adminGoalsCharacter'),
      goalsPrioritize: this._getTagValues('adminPrioritizeList'),
      goalsAvoid: this._getTagValues('adminAvoidList'),
      popupDesc: get('adminPopupDesc'),
      team: this._getTeamValues()
    };

    // Upload baseline image if one was selected
    const fileInput = document.getElementById('adminBaselineFile');
    if (fileInput?.files?.[0]) {
      showToast('Uploading baseline image...', 'info');
      const url = await COMMUNITY.uploadProjectFile(fileInput.files[0], cleanId, 'baseline');
      if (url) projectData.baselineImageUrl = url;
    }

    // Upload video if one was selected
    const videoInput = document.getElementById('adminVideoFile');
    if (videoInput?.files?.[0]) {
      showToast('Uploading video...', 'info');
      const url = await COMMUNITY.uploadProjectFile(videoInput.files[0], cleanId, 'video');
      if (url) projectData.videoOverviewUrl = url;
    } else {
      const videoUrl = get('adminVideoUrl');
      if (videoUrl) projectData.videoOverviewUrl = videoUrl;
    }

    // Save to Firestore
    const result = await COMMUNITY.saveProject(projectData);
    if (result) {
      this.closeProjectForm();
    }
  },

  /* ═══════ DELETE PROJECT ═══════ */

  async deleteProject(projectId) {
    await COMMUNITY.deleteProject(projectId);
    // Remove from local SITE_CONFIGS if it was Firestore-sourced
    if (SITE_CONFIGS[projectId]?._fromFirestore) {
      delete SITE_CONFIGS[projectId];
      if (typeof buildSitesList === 'function') buildSitesList();
    }
  },

  /* ═══════ PROJECT LIST (inside admin modal) ═══════ */

  renderProjectList() {
    const list = document.getElementById('adminProjectList');
    if (!list) return;
    const projects = Object.values(SITE_CONFIGS);
    if (!projects.length) {
      list.innerHTML = '<p style="opacity:0.5;text-align:center">No projects yet</p>';
      return;
    }
    list.innerHTML = projects.map(p => `
      <div class="admin-project-item">
        <div class="admin-project-item-info">
          <strong>${escapeHTML(p.name)}</strong>
          <span class="admin-project-item-meta">${escapeHTML(p.college || '')} | ${p.metrics?.totalAreaAcres || '?'} ac | Score: ${p.baselineScore || 0}/200</span>
          ${p._fromFirestore ? '<span class="admin-cloud-badge">Cloud</span>' : '<span class="admin-local-badge">Built-in</span>'}
        </div>
        <div class="admin-project-item-actions">
          <button onclick="ADMIN.openProjectForm('${p.id}')" class="admin-edit-btn" title="Edit"><span class="material-symbols-outlined">edit</span></button>
          ${p._fromFirestore ? `<button onclick="ADMIN.deleteProject('${p.id}')" class="admin-del-btn" title="Delete"><span class="material-symbols-outlined">delete</span></button>` : ''}
        </div>
      </div>
    `).join('');
  },

  /* ═══════ JSON IMPORT ═══════ */

  importJSON(input) {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        // Support single project or array of projects
        const projects = Array.isArray(data) ? data : [data];
        const project = projects[0]; // Load first project into form
        if (!project) { showToast('Empty JSON file', 'warn'); return; }

        // Open the form and populate it
        this.openProjectForm();
        this._populateFormFromJSON(project);
        showToast(`Loaded "${project.name || project.id || 'project'}" from JSON`, 'success');

        // If multiple projects, queue them for batch import
        if (projects.length > 1) {
          this._pendingBatchImport = projects;
          showToast(`${projects.length} projects found — save this one, then use "Import Next" for the rest`, 'info');
        }
      } catch (err) {
        console.error('[AVA] JSON parse error:', err);
        showToast('Invalid JSON file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    input.value = ''; // Reset so same file can be re-imported
  },

  _populateFormFromJSON(p) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };

    // Identity
    set('adminProjectId', p.id);
    set('adminProjectName', p.name);
    set('adminProjectShortName', p.shortName);
    set('adminProjectCollege', p.college);
    set('adminProjectSlogan', p.slogan);

    // Location
    set('adminProjectLat', p.lat);
    set('adminProjectLng', p.lng);
    set('adminPinR', p.pinColor?.[0] ?? p.pinR ?? 100);
    set('adminPinG', p.pinColor?.[1] ?? p.pinG ?? 100);
    set('adminPinB', p.pinColor?.[2] ?? p.pinB ?? 100);

    // Metrics
    set('adminProjectArea', p.totalAreaAcres ?? p.area);
    set('adminProjectElevation', p.elevationDrop ?? p.elevation);
    set('adminProjectSoil', p.soilType ?? p.soil);
    set('adminProjectBudget', p.budget);
    set('adminProjectBaseline', p.baselineScore);

    // History
    set('adminHistoryTitle', p.historyTitle ?? p.history?.title);
    set('adminHistorySummary', p.historySummary ?? p.history?.summary);

    // Site Context & Description
    set('adminSiteContext', p.siteContext);
    set('adminPopupDesc', p.popupDesc);

    // Goals
    set('adminGoalsFocus', p.goalsFocus ?? p.projectGoals?.focus);
    set('adminGoalsCharacter', p.goalsCharacter ?? p.projectGoals?.character);

    // Tag chips — prioritize / avoid
    const prioritize = p.goalsPrioritize ?? p.projectGoals?.prioritize ?? p.prioritize ?? [];
    const avoid = p.goalsAvoid ?? p.projectGoals?.avoid ?? p.avoid ?? [];
    this._setTagChips('adminPrioritizeList', prioritize);
    this._setTagChips('adminAvoidList', avoid);

    // Team members
    const teamList = document.getElementById('adminTeamList');
    if (teamList) {
      teamList.innerHTML = '';
      const team = p.team || [];
      team.forEach(t => this._addTeamRow(t.name, t.role));
      if (!team.length) this._addTeamRow();
    }

    // Video URL
    set('adminVideoUrl', p.videoOverviewUrl ?? p.videoUrl ?? p.videoOverview);

    // Make form visible
    const form = document.getElementById('adminProjectForm');
    if (form) form.style.display = 'block';
  },

  /* ═══════ JSON EXPORT ═══════ */

  exportJSON() {
    const get = id => document.getElementById(id)?.value?.trim() || '';
    const project = {
      id: get('adminProjectId'),
      name: get('adminProjectName'),
      shortName: get('adminProjectShortName'),
      college: get('adminProjectCollege'),
      slogan: get('adminProjectSlogan'),
      lat: parseFloat(get('adminProjectLat')) || 36.0726,
      lng: parseFloat(get('adminProjectLng')) || -79.7749,
      pinColor: [
        parseInt(document.getElementById('adminPinR')?.value) || 100,
        parseInt(document.getElementById('adminPinG')?.value) || 100,
        parseInt(document.getElementById('adminPinB')?.value) || 100
      ],
      totalAreaAcres: parseFloat(get('adminProjectArea')) || 0,
      elevationDrop: parseFloat(get('adminProjectElevation')) || 0,
      soilType: get('adminProjectSoil'),
      budget: parseFloat(get('adminProjectBudget')) || 0,
      baselineScore: parseInt(get('adminProjectBaseline')) || 0,
      historyTitle: get('adminHistoryTitle'),
      historySummary: get('adminHistorySummary'),
      siteContext: get('adminSiteContext'),
      popupDesc: get('adminPopupDesc'),
      goalsFocus: get('adminGoalsFocus'),
      goalsCharacter: get('adminGoalsCharacter'),
      goalsPrioritize: this._getTagValues('adminPrioritizeList'),
      goalsAvoid: this._getTagValues('adminAvoidList'),
      team: this._getTeamValues(),
      videoOverviewUrl: get('adminVideoUrl')
    };

    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ava-project-${project.id || 'new'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Project exported as JSON', 'success');
  }
};

window.ADMIN = ADMIN;
