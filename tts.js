/* ==========================================================================
   AVA — TTS Engine (AVA's Voice)
   Pre-recorded WAV files for coaching · Live Gemini TTS for dynamic content
   Ported from Tia TM's proven tts.js pattern
   ========================================================================== */
(function () {
  'use strict';

  const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
  const VOICE_NAME = 'Kore'; // Warm female voice — matches AVA's persona (per KI)

  let muted = localStorage.getItem('ava-voice-muted') === 'true';
  let queue = [];
  let currentAudio = null;

  /* ── Known coaching keys that have pre-recorded WAV files ── */
  const COACHING_KEYS = [
    'welcome', 'design_welcome', 'tier_certified', 'tier_silver',
    'tier_gold', 'tier_platinum', 'boost_applied'
  ];

  /* ── Get API key from settings (no hardcoded fallback) ── */
  function getApiKey() {
    return localStorage.getItem('ava_gemini_key') || '';
  }

  /* ── Speaking ring animation — targets avatar wrapper ── */
  function setSpeakingRing(active) {
    // Both map view and design workspace avatars
    document.querySelectorAll('.ava-avatar-wrapper').forEach(el => {
      el.classList.toggle('speaking', active);
    });
  }

  /* ══════════════════════════════════════════════════════════════
     FILE-BASED PLAYBACK — Pre-recorded coaching WAVs
     Zero latency, zero static, consistent Kore voice
     ══════════════════════════════════════════════════════════════ */

  function getAudioPath(key) {
    return `assets/audio/en-${key}.wav`;
  }

  function hasPreRecording(key) {
    return COACHING_KEYS.includes(key);
  }

  function playFile(filePath) {
    return new Promise((resolve) => {
      const audio = new Audio(filePath);
      currentAudio = audio;
      audio.onplay = () => setSpeakingRing(true);
      audio.onended = () => { setSpeakingRing(false); currentAudio = null; resolve(); };
      audio.onerror = (e) => {
        console.warn('[AVA TTS] Audio file not found:', filePath, '— falling back to live TTS');
        setSpeakingRing(false);
        currentAudio = null;
        resolve('fallback'); // Signal to try live generation
      };
      audio.play().catch((err) => {
        console.warn('[AVA TTS] Audio play blocked:', err.message);
        setSpeakingRing(false);
        currentAudio = null;
        resolve();
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════
     LIVE TTS — Gemini Neural Voice for dynamic content
     ══════════════════════════════════════════════════════════════ */

  async function generateLiveAudio(text, retries = 2) {
    const apiKey = getApiKey();
    if (!apiKey) { console.warn('[AVA TTS] No API key'); return null; }

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `Say the following text out loud exactly as written: ${text}` }] }],
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_NAME } }
                }
              }
            })
          }
        );

        if (!response.ok) {
          const errBody = await response.text();
          console.warn(`[AVA TTS] API error ${response.status} (attempt ${attempt + 1}):`, errBody);
          if (response.status >= 500 && attempt < retries) { await new Promise(r => setTimeout(r, 1000)); continue; }
          throw new Error(`TTS: ${response.status}`);
        }

        const data = await response.json();
        console.log('[AVA TTS] API response keys:', Object.keys(data));
        const audioPart = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!audioPart) {
          console.warn('[AVA TTS] No inlineData in response:', JSON.stringify(data).substring(0, 500));
          if (attempt < retries) { await new Promise(r => setTimeout(r, 1000)); continue; }
          throw new Error('No audio');
        }

        console.log('[AVA TTS] Audio received:', audioPart.inlineData.mimeType, 'size:', audioPart.inlineData.data?.length);
        return audioPart.inlineData;
      } catch (err) {
        if (attempt >= retries) throw err;
        console.warn(`[AVA TTS] Attempt ${attempt + 1} failed, retrying:`, err.message);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  function playLiveAudio(inlineData) {
    return new Promise(async (resolve) => {
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const raw = atob(inlineData.data);
        const pcmBytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) pcmBytes[i] = raw.charCodeAt(i);

        const mime = inlineData.mimeType || '';
        const rateMatch = mime.match(/rate=(\d+)/);
        const sampleRate = rateMatch ? parseInt(rateMatch[1]) : 24000;

        // Build WAV in memory for clean browser decoding
        const dataSize = pcmBytes.length;
        const wavBuffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(wavBuffer);
        const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

        writeStr(0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeStr(8, 'WAVE');
        writeStr(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);      // PCM
        view.setUint16(22, 1, true);      // mono
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeStr(36, 'data');
        view.setUint32(40, dataSize, true);
        new Uint8Array(wavBuffer, 44).set(pcmBytes);

        // Let browser decode WAV natively — eliminates static
        const audioBuffer = await audioCtx.decodeAudioData(wavBuffer);
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);

        currentAudio = { pause: () => { try { source.stop(); audioCtx.close(); } catch(e){} } };
        setSpeakingRing(true);

        source.onended = () => {
          setSpeakingRing(false);
          currentAudio = null;
          audioCtx.close().catch(() => {});
          resolve();
        };
        source.start();
      } catch (err) {
        console.warn('[AVA TTS] Live audio playback failed:', err.message);
        setSpeakingRing(false);
        currentAudio = null;
        resolve();
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════
     QUEUE — Routes to file playback or live generation
     ══════════════════════════════════════════════════════════════ */

  async function speak(textOrKey) {
    if (muted || !textOrKey) return;
    queue.push(textOrKey);
    if (queue.length === 1) processQueue();
  }

  async function processQueue() {
    while (queue.length > 0) {
      const item = queue[0];

      if (hasPreRecording(item)) {
        // Try pre-recorded coaching — instant file playback
        const result = await playFile(getAudioPath(item));
        if (result === 'fallback') {
          // File not found — generate the text for this key and try live
          const text = getCoachingText(item);
          if (text) {
            try {
              const inlineData = await generateLiveAudio(text);
              if (inlineData) await playLiveAudio(inlineData);
            } catch (err) {
              console.warn('[AVA TTS] Fallback live generation failed:', err.message);
            }
          }
        }
      } else {
        // Live generation for chat / dynamic content
        try {
          const inlineData = await generateLiveAudio(item);
          if (inlineData) {
            await playLiveAudio(inlineData);
          } else {
            console.warn('[AVA TTS] No audio returned, skipping voice.');
          }
        } catch (err) {
          console.warn('[AVA TTS] Live generation failed, skipping voice:', err.message);
        }
      }
      queue.shift();
    }
  }

  /* ── Coaching text for pre-recorded keys (used as fallback if WAV missing) ── */
  function getCoachingText(key) {
    const texts = {
      'welcome': "Hi! I'm AVA, your Aggie Visualization Assistant. Tap a project pin on the campus map, or switch to Projects to browse all sites.",
      'design_welcome': "Welcome to the design studio! Describe a landscape element you'd like to add, or let me auto-design something beautiful.",
      'tier_certified': "Congratulations! You've reached SITES Certified status! Your design is making a real difference.",
      'tier_silver': "Silver tier! Your design is showing real sustainability impact. Keep going, Aggie!",
      'tier_gold': "Gold tier achieved! Outstanding sustainable design work, Aggie! You're almost at the top.",
      'tier_platinum': "Platinum! You've mastered all SITES v2 focus areas. Incredible work, Aggie Architect!",
      'boost_applied': "Great! I've targeted the weakest scoring area to maximize your sustainability points."
    };
    return texts[key] || null;
  }

  /** Stop current playback */
  function stop() {
    if (currentAudio) {
      if (typeof currentAudio.pause === 'function') currentAudio.pause();
      currentAudio = null;
    }
    setSpeakingRing(false);
    queue = [];
    // Also kill any browser speechSynthesis that might be lingering
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  /* ══════════════════════════════════════════════════════════════
     PUBLIC API
     ══════════════════════════════════════════════════════════════ */

  window.AVA_TTS = {
    speak,
    stop,
    isMuted: () => muted,
    toggleMute: () => {
      muted = !muted;
      localStorage.setItem('ava-voice-muted', muted);
      if (muted) stop();
      // Update voice badge icons
      document.querySelectorAll('.ava-voice-badge').forEach(el => {
        el.textContent = muted ? '🔇' : '🔊';
      });
      // Show toast
      if (window.showToast) showToast(muted ? 'AVA voice off' : 'AVA voice on', 'info');
      return muted;
    }
  };

  // Set initial badge state on load
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.ava-voice-badge').forEach(el => {
      el.textContent = muted ? '🔇' : '🔊';
    });
  });

  console.log('[AVA TTS] Engine ready (Kore voice, file-based coaching + live Gemini TTS)');
})();
