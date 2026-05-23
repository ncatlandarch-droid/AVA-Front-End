/* ==========================================================================
   AVA — TTS Engine (AVA's Voice)
   Now powered by ThinkAvatarTTS universal module v1.1.
   AVA-specific: coaching text, language-aware prompts, SITES v2 context.
   Audio engine: ThinkAvatarTTS handles queue, PCM→WAV, Web Audio, speaking ring.
   Voice: Kore (warm female, natural)

   INTERACTION PATTERN (standard across all Think! avatars):
     Click avatar     → She speaks contextual greeting
     Click again       → She stops
     Mic icon          → Toggle voice on/off (mute/unmute)
   ========================================================================== */

window.AVA_TTS = (() => {
  'use strict';

  let _engine = null;

  /* ── Pre-recorded coaching WAVs (project-specific) ── */
  const PRE_RECORDED = {
    'welcome':        'assets/audio/en-welcome.wav',
    'design_welcome': 'assets/audio/en-design_welcome.wav',
    'tier_certified': 'assets/audio/en-tier_certified.wav',
    'tier_silver':    'assets/audio/en-tier_silver.wav',
    'tier_gold':      'assets/audio/en-tier_gold.wav',
    'tier_platinum':  'assets/audio/en-tier_platinum.wav',
    'boost_applied':  'assets/audio/en-boost_applied.wav'
  };

  /* ── Coaching text (fallback if WAV not found) ── */
  const COACHING_TEXT = {
    'welcome':        "Hi! I'm AVA, your Adaptive Visualization Assistant. Tap a project pin on the map, or switch to Projects to browse all sites.",
    'design_welcome': "Welcome to the design studio! Describe a landscape element you'd like to add, or let me auto-design something beautiful.",
    'tier_certified': "Congratulations! You've reached SITES Certified status! Your design is making a real difference.",
    'tier_silver':    "Silver tier! Your design is showing real sustainability impact. Keep pushing!",
    'tier_gold':      "Gold tier achieved! Outstanding sustainable design work! You're almost at the top.",
    'tier_platinum':  "Platinum! You've mastered all SITES v2 focus areas. Incredible work, Architect!",
    'boost_applied':  "Great! I've targeted the weakest scoring area to maximize your sustainability points."
  };

  /* ── Language-aware TTS prompt ── */
  function _buildTTSPrompt(text) {
    const lang = (window.AVA_I18N && AVA_I18N.getGeminiLang) ? AVA_I18N.getGeminiLang() : 'English';
    if (lang === 'English') return text;
    return `Speak the following text in ${lang}. Say it naturally and fluently: ${text}`;
  }

  /* ══════════════════════════════════════════════════════════════
     INIT — Create ThinkAvatarTTS instance with server-side proxy
     ══════════════════════════════════════════════════════════════ */
  function init() {
    if (typeof ThinkAvatarTTS === 'undefined') {
      console.warn('[AVA TTS] ThinkAvatarTTS not loaded — voice disabled');
      return;
    }

    ThinkAvatarTTS.injectSpeakingCSS('#003087');

    _engine = ThinkAvatarTTS.create({
      name: 'AVA',
      voice: 'Kore',
      avatarId: null,                    // AVA uses class-based targeting (multiple avatars)
      muteKey: 'ava-voice-muted',
      proxyUrl: '/.netlify/functions/gemini-tts-proxy',  // Server-side — no client key needed
      apiKeySource: () => localStorage.getItem('ava_gemini_key') || '',  // Fallback for local dev
      preRecorded: PRE_RECORDED,
      speakingClass: 'speaking',

      onSpeakStart: () => {
        document.querySelectorAll('.ava-avatar-wrapper').forEach(el => el.classList.add('speaking'));
      },

      onSpeakEnd: () => {
        document.querySelectorAll('.ava-avatar-wrapper').forEach(el => el.classList.remove('speaking'));
      },

      onMuteChanged: (muted) => {
        document.querySelectorAll('.ava-voice-badge').forEach(el => {
          el.textContent = muted ? '🔇' : '🔊';
        });
        if (window.showToast) showToast(muted ? 'AVA voice off' : 'AVA voice on', 'info');
      }
    });

    // Set initial badge state
    document.querySelectorAll('.ava-voice-badge').forEach(el => {
      el.textContent = _engine.isMuted() ? '🔇' : '🔊';
    });

    console.log('[AVA TTS] Initialized via ThinkAvatarTTS v1.1 (Kore voice, server proxy)');
  }

  /* ══════════════════════════════════════════════════════════════
     SPEAK — Resolves coaching keys, wraps with language prompt
     ══════════════════════════════════════════════════════════════ */
  function speak(textOrKey) {
    if (!_engine) return;

    // Resolve coaching keys to full text
    const resolvedText = COACHING_TEXT[textOrKey] || textOrKey;

    // Wrap with language-aware prompt
    const finalText = _buildTTSPrompt(resolvedText);

    // Pass to engine — it handles queue, pre-recorded lookup, live TTS
    _engine.speak(finalText, { fallbackText: finalText });
  }

  /* ══════════════════════════════════════════════════════════════
     STOP
     ══════════════════════════════════════════════════════════════ */
  function stop() {
    if (_engine) _engine.stop();
    // Also kill any lingering browser speechSynthesis
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  /* ══════════════════════════════════════════════════════════════
     TOGGLE MUTE — Mic icon handler
     ══════════════════════════════════════════════════════════════ */
  function toggleMute() {
    if (!_engine) return false;
    return _engine.toggleMute();
  }

  /* ══════════════════════════════════════════════════════════════
     STATE QUERIES
     ══════════════════════════════════════════════════════════════ */
  function isMuted()    { return _engine ? _engine.isMuted()    : true; }
  function isSpeaking() { return _engine ? _engine.isSpeaking() : false; }

  /* ── Auto-init on DOM ready ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ── Public API (backward compatible with old tts.js) ── */
  return {
    speak,
    stop,
    toggleMute,
    isMuted,
    isSpeaking,
    setLanguage: (code) => {
      console.log(`[AVA TTS] Language set to: ${code}`);
    }
  };
})();

console.log('[AVA TTS] Module loaded (ThinkAvatarTTS v1.1 + server proxy)');
