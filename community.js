/* community.js — Firebase Auth + Firestore + Storage for AVA V3
   Enhanced with Anonymous Auth for frictionless community participation.
   Users can save designs, vote, and browse without creating an account. */

const COMMUNITY = {
  db: null,
  storage: null,
  auth: null,
  user: null,
  initialized: false,
  designsListener: null,
  contributionsListener: null,

  /* Admin emails/domains — users matching these get delete + management rights */
  ADMIN_EMAILS: ['ncatlandarch@gmail.com'],
  ADMIN_DOMAINS: ['ncatlandarch'],

  init(config) {
    if (!config || !config.apiKey) return;
    try {
      if (!firebase.apps.length) firebase.initializeApp(config);
      this.auth = firebase.auth();
      this.db = firebase.firestore();
      this.storage = firebase.storage();
      this.initialized = true;

      this.auth.onAuthStateChanged(user => {
        this.user = user;
        this._updateAuthUI();
        // Update admin button visibility whenever auth changes
        if (typeof ADMIN !== 'undefined') ADMIN._updateAdminVisibility();
        if (user && !user.isAnonymous) {
          const role = this.isAdmin() ? ' (Admin)' : '';
          console.log(`[AVA] Signed in as ${user.displayName}${role}`);
          showToast(`Welcome${this.isAdmin() ? ', Admin' : ''}, ${user.displayName}!`, 'success');
          if (typeof GALLERY !== 'undefined') GALLERY.render();
        } else if (user && user.isAnonymous) {
          console.log('[AVA] Anonymous session active');
        }
      });

      // Auto-authenticate anonymously if no user — then notify gallery
      this._autoAuth().then(() => {
        // Fire gallery init AFTER auth is confirmed — prevents empty listener race
        if (typeof GALLERY !== 'undefined' && !GALLERY._started) {
          GALLERY._started = true;
          GALLERY.init();
        }
      });

      console.log('[AVA] ✅ Firebase initialized');
    } catch (e) {
      console.error('[AVA] Firebase error:', e);
    }
  },

  /* ═══════ ANONYMOUS AUTH — Frictionless access ═══════ */

  async _autoAuth() {
    if (!this.auth) return;
    // Wait briefly for existing auth state
    await new Promise(r => setTimeout(r, 500));
    if (this.user) return; // Already signed in (Google or anonymous)
    try {
      await this.auth.signInAnonymously();
      console.log('[AVA] 👤 Anonymous auth activated — users can save designs without login');
    } catch (e) {
      console.warn('[AVA] Anonymous auth failed:', e.message);
    }
  },

  _generateAnonName() {
    const adjectives = ['Bold', 'Creative', 'Inspired', 'Talented', 'Dynamic', 'Visionary', 'Brilliant', 'Innovative', 'Determined', 'Resilient'];
    const nouns = ['Designer', 'Architect', 'Planner', 'Builder', 'Creator', 'Visionary', 'Thinker', 'Maker', 'Dreamer', 'Artist'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 999) + 1;
    return `${adj} ${noun} #${num}`;
  },

  /* ═══════ GOOGLE SIGN IN (Optional, for credit) ═══════ */

  async signIn() {
    if (!this.auth) { showToast('Firebase not configured', 'warn'); return; }
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      // If currently anonymous, try to upgrade the session by linking
      if (this.user && this.user.isAnonymous) {
        try {
          await this.user.linkWithPopup(provider);
          showToast(`Account linked! Welcome, ${this.user.displayName}!`, 'success');
          return;
        } catch (linkErr) {
          console.warn('[AVA] Link failed, signing in directly:', linkErr.code);
          // Google account already exists — reuse the credential from the error
          // instead of opening a second popup (which COOP headers would block)
          if (linkErr.code === 'auth/credential-already-in-use' && linkErr.credential) {
            await this.auth.signInWithCredential(linkErr.credential);
            return;
          }
        }
      }
      await this.auth.signInWithPopup(provider);
    } catch (e) {
      showToast('Sign-in failed: ' + e.message, 'error');
    }
  },

  async signOut() {
    if (!this.auth) return;
    await this.auth.signOut();
    // Re-authenticate anonymously so they can still browse
    this._autoAuth();
    showToast('Signed out', 'info');
  },

  _updateAuthUI() {
    const btn = document.getElementById('btnAuth');
    const icon = document.getElementById('authIcon');
    if (!btn || !icon) return;
    if (this.user && !this.user.isAnonymous) {
      icon.textContent = 'logout';
      const adminTag = this.isAdmin() ? ' [Admin]' : '';
      btn.title = `Signed in as ${this.user.displayName}${adminTag} \u2014 click to sign out`;
      // Show admin badge if applicable
      btn.classList.toggle('admin-active', this.isAdmin());
    } else {
      icon.textContent = 'person';
      btn.title = this.user?.isAnonymous ? 'Guest \u2014 Sign in with Google for credit' : 'Sign In';
      btn.classList.remove('admin-active');
    }
  },

  /* ═══════ ADMIN SYSTEM ═══════ */

  isAdmin() {
    if (!this.user || this.user.isAnonymous) return false;
    const email = (this.user.email || '').toLowerCase();
    if (this.ADMIN_EMAILS.includes(email)) return true;
    return this.ADMIN_DOMAINS.some(d => email.includes(d));
  },

  async deleteDesign(designId) {
    if (!this.isAdmin()) { showToast('Admin access required', 'warn'); return; }
    if (!confirm('Delete this design from the community gallery?')) return;
    try {
      const doc = await this.db.collection('designs').doc(designId).get();
      if (doc.exists) {
        const data = doc.data();
        // Delete image from Storage
        if (data.imageUrl) {
          try {
            const ref = this.storage.refFromURL(data.imageUrl);
            await ref.delete();
          } catch (e) { console.warn('[AVA] Image delete skipped:', e.message); }
        }
        // Delete Firestore document
        await this.db.collection('designs').doc(designId).delete();
        showToast('Design deleted', 'success');
        console.log('[AVA] Admin deleted design:', designId);
      }
    } catch (e) {
      console.error('[AVA] Delete error:', e);
      showToast('Failed to delete: ' + e.message, 'error');
    }
  },

  /* ═══════ SAVE DESIGN ═══════ */


  async saveDesign(siteId, imageBase64, metadata) {
    if (!this.initialized) { showToast('Firebase not configured', 'warn'); return; }
    // Anonymous users CAN save — no sign-in required
    if (!this.user) {
      await this._autoAuth();
      if (!this.user) { showToast('Unable to authenticate — please try again', 'warn'); return; }
    }

    try {
      // Upload image to Storage
      const imageRef = this.storage.ref(`designs/${Date.now()}_${siteId}.png`);
      const blob = await (await fetch(`data:image/png;base64,${imageBase64}`)).blob();
      await imageRef.put(blob);
      const imageUrl = await imageRef.getDownloadURL();

      // Determine author name
      const authorName = this.user.isAnonymous
        ? (localStorage.getItem('ava_anon_name') || (() => { const n = this._generateAnonName(); localStorage.setItem('ava_anon_name', n); return n; })())
        : (this.user.displayName || 'Designer');

      // Save to Firestore
      const config = SITE_CONFIGS[siteId];
      await this.db.collection('designs').add({
        siteId,
        authorName,
        authorEmail: this.user.email || '',
        authorPhotoUrl: this.user.photoURL || '',
        authorUid: this.user.uid,
        isAnonymous: this.user.isAnonymous,
        imageUrl,
        prompt: metadata.prompt || '',
        sitesScore: metadata.score || 0,
        tier: metadata.tier || 'none',
        sectionScores: metadata.sectionScores || [],
        iterationCount: metadata.iterationCount || 0,
        cumulativePrompts: metadata.cumulativePrompts || [],
        gps: { lat: config?.lat || 0, lng: config?.lng || 0 },
        votes: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      showToast('Design saved to community! 🎉', 'success');
      console.log('[AVA] 💾 Design saved to Firestore');
    } catch (e) {
      console.error('[AVA] Save error:', e);
      // Give a more useful message for the most common failure
      if (e.code === 'storage/unauthorized') {
        showToast('Save failed: Storage permission denied. Try refreshing the page.', 'error');
      } else if (e.code === 'permission-denied') {
        showToast('Save failed: Firestore permission denied. Try refreshing the page.', 'error');
      } else {
        showToast('Failed to save: ' + e.message, 'error');
      }
    }
  },

  /* ═══════ LOAD COMMUNITY DESIGNS ═══════ */

  listenDesigns(callback) {
    if (!this.initialized) return;
    if (this.designsListener) this.designsListener();

    this.designsListener = this.db.collection('designs')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .onSnapshot(snapshot => {
        const designs = [];
        snapshot.forEach(doc => designs.push({ id: doc.id, ...doc.data() }));
        callback(designs);
      }, err => console.warn('[AVA] Designs listener error:', err));
  },

  /* ═══════ PPGIS CONTRIBUTIONS ═══════ */

  async saveContribution(type, gps, content, tags, photoFile) {
    if (!this.initialized) { showToast('Firebase not configured', 'warn'); return; }

    try {
      const data = {
        type,
        authorName: this.user?.displayName || this._generateAnonName(),
        authorEmail: this.user?.email || '',
        content,
        tags: tags || [],
        gps,
        votes: 0,
        photoUrls: [],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      if (photoFile) {
        const photoRef = this.storage.ref(`ppgis/${Date.now()}_${photoFile.name}`);
        await photoRef.put(photoFile);
        data.photoUrls = [await photoRef.getDownloadURL()];
      }

      await this.db.collection('contributions').add(data);
      showToast('Contribution submitted! 📍', 'success');
    } catch (e) {
      console.error('[AVA] Contribution error:', e);
      showToast('Failed to submit: ' + e.message, 'error');
    }
  },

  listenContributions(callback) {
    if (!this.initialized) return;
    if (this.contributionsListener) this.contributionsListener();

    this.contributionsListener = this.db.collection('contributions')
      .orderBy('createdAt', 'desc')
      .limit(200)
      .onSnapshot(snapshot => {
        const contributions = [];
        snapshot.forEach(doc => contributions.push({ id: doc.id, ...doc.data() }));
        callback(contributions);
      }, err => console.warn('[AVA] Contributions listener error:', err));
  },

  /* ═══════ VOTING ═══════ */

  async vote(collection, docId) {
    if (!this.initialized) return;
    try {
      await this.db.collection(collection).doc(docId).update({
        votes: firebase.firestore.FieldValue.increment(1)
      });
    } catch (e) {
      console.warn('[AVA] Vote error:', e);
    }
  },

  async unvote(collection, docId) {
    if (!this.initialized) return;
    try {
      await this.db.collection(collection).doc(docId).update({
        votes: firebase.firestore.FieldValue.increment(-1)
      });
    } catch (e) {
      console.warn('[AVA] Unvote error:', e);
    }
  },

  /* ======= ADMIN PROJECT MANAGEMENT ======= */

  projectsListener: null,

  async saveProject(projectData) {
    if (!this.isAdmin()) { showToast('Admin access required', 'warn'); return null; }
    if (!this.initialized) { showToast('Firebase not configured', 'warn'); return null; }
    try {
      const id = projectData.id;
      if (!id) { showToast('Project ID is required', 'warn'); return null; }
      const docRef = this.db.collection('projects').doc(id);
      projectData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      projectData.updatedBy = this.user.email;
      const existing = await docRef.get();
      if (!existing.exists) {
        projectData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        projectData.createdBy = this.user.email;
      }
      await docRef.set(projectData, { merge: true });
      showToast('Project saved!', 'success');
      console.log('[AVA] Admin saved project:', id);
      return id;
    } catch (e) {
      console.error('[AVA] Save project error:', e);
      showToast('Failed to save project: ' + e.message, 'error');
      return null;
    }
  },

  async deleteProject(projectId) {
    if (!this.isAdmin()) { showToast('Admin access required', 'warn'); return; }
    if (!confirm('Delete this project and all its data? This cannot be undone.')) return;
    try {
      // Delete project images from Storage
      try {
        const listRef = this.storage.ref(`projects/${projectId}`);
        const list = await listRef.listAll();
        await Promise.all(list.items.map(item => item.delete()));
      } catch (e) { /* Storage cleanup best-effort */ }
      // Delete Firestore document
      await this.db.collection('projects').doc(projectId).delete();
      showToast('Project deleted', 'success');
      console.log('[AVA] Admin deleted project:', projectId);
    } catch (e) {
      console.error('[AVA] Delete project error:', e);
      showToast('Failed to delete: ' + e.message, 'error');
    }
  },

  listenProjects(callback) {
    if (!this.initialized) return;
    if (this.projectsListener) this.projectsListener();
    this.projectsListener = this.db.collection('projects')
      .orderBy('name', 'asc')
      .onSnapshot(snapshot => {
        const projects = [];
        snapshot.forEach(doc => projects.push({ id: doc.id, ...doc.data() }));
        callback(projects);
      }, err => console.warn('[AVA] Projects listener error:', err));
  },

  async uploadProjectFile(file, projectId, type) {
    if (!this.isAdmin()) { showToast('Admin access required', 'warn'); return null; }
    try {
      const ext = file.name.split('.').pop();
      const ref = this.storage.ref(`projects/${projectId}/${type}.${ext}`);
      await ref.put(file);
      const url = await ref.getDownloadURL();
      console.log(`[AVA] Uploaded ${type} for ${projectId}:`, url);
      return url;
    } catch (e) {
      console.error('[AVA] Upload error:', e);
      showToast('Upload failed: ' + e.message, 'error');
      return null;
    }
  }
};
