#!/usr/bin/env node
/**
 * generate-coaching-wavs.mjs
 * 
 * Pre-records AVA coaching phrases as WAV files using Gemini TTS API.
 * Run: node scripts/generate-coaching-wavs.mjs
 * 
 * Requires: GEMINI_API_KEY environment variable or pass as argument
 * Output:   assets/audio/en-{key}.wav for each coaching key
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const AUDIO_DIR = path.join(ROOT, 'assets', 'audio');

const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const VOICE_NAME = 'Kore';

// ── All coaching phrases (must match tts.js getCoachingText) ──
const COACHING = {
  'welcome': "Hi! I'm AVA, your Adaptive Visualization Assistant. Tap a project pin on the map, or switch to Projects to browse all sites.",
  'design_welcome': "Welcome to the design studio! Describe a landscape element you'd like to add, or let me auto-design something beautiful.",
  'tier_certified': "Congratulations! You've reached SITES Certified status! Your design is making a real difference.",
  'tier_silver': "Silver tier! Your design is showing real sustainability impact. Keep pushing!",
  'tier_gold': "Gold tier achieved! Outstanding sustainable design work! You're almost at the top.",
  'tier_platinum': "Platinum! You've mastered all SITES v2 focus areas. Incredible work, Architect!",
  'boost_applied': "Great! I've targeted the weakest scoring area to maximize your sustainability points."
};

// ── Get API key ──
const API_KEY = process.argv[2] || process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('Usage: node scripts/generate-coaching-wavs.mjs <GEMINI_API_KEY>');
  console.error('   or: set GEMINI_API_KEY environment variable');
  process.exit(1);
}

// ── Ensure output directory ──
fs.mkdirSync(AUDIO_DIR, { recursive: true });

// ── Build WAV from raw PCM bytes ──
function buildWav(pcmBytes, sampleRate = 24000) {
  const dataSize = pcmBytes.length;
  const buffer = Buffer.alloc(44 + dataSize);
  
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);        // chunk size
  buffer.writeUInt16LE(1, 20);         // PCM format
  buffer.writeUInt16LE(1, 22);         // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32);         // block align
  buffer.writeUInt16LE(16, 34);        // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcmBytes.copy(buffer, 44);
  
  return buffer;
}

// ── Generate one coaching WAV ──
async function generateWav(key, text) {
  console.log(`  🎙️  Generating: ${key} ...`);
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${API_KEY}`;
  const body = {
    contents: [{ parts: [{ text: `Say the following text out loud exactly as written: ${text}` }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_NAME } }
      }
    }
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`API ${resp.status}: ${errText.substring(0, 200)}`);
  }

  const data = await resp.json();
  const audioPart = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!audioPart) {
    throw new Error(`No audio data returned for key "${key}"`);
  }

  // Decode base64 PCM
  const pcmBytes = Buffer.from(audioPart.inlineData.data, 'base64');
  
  // Extract sample rate from mime type
  const mime = audioPart.inlineData.mimeType || '';
  const rateMatch = mime.match(/rate=(\d+)/);
  const sampleRate = rateMatch ? parseInt(rateMatch[1]) : 24000;

  // Build WAV
  const wavBuffer = buildWav(pcmBytes, sampleRate);
  
  // Save
  const outPath = path.join(AUDIO_DIR, `en-${key}.wav`);
  fs.writeFileSync(outPath, wavBuffer);
  
  const sizeKB = Math.round(wavBuffer.length / 1024);
  const durationSec = (pcmBytes.length / (sampleRate * 2)).toFixed(1);
  console.log(`  ✅  Saved: en-${key}.wav (${sizeKB} KB, ~${durationSec}s)`);
  
  return outPath;
}

// ── Main ──
async function main() {
  console.log('\n🔊 AVA Coaching WAV Generator');
  console.log(`   Voice: ${VOICE_NAME} | Model: ${TTS_MODEL}`);
  console.log(`   Output: ${AUDIO_DIR}\n`);

  const keys = Object.keys(COACHING);
  let success = 0;
  let failed = 0;

  for (const key of keys) {
    try {
      await generateWav(key, COACHING[key]);
      success++;
      // Rate limit courtesy — 1 second between calls
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(`  ❌  Failed: ${key} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${success} generated, ${failed} failed out of ${keys.length} total`);
  if (success === keys.length) {
    console.log('🎉 All coaching WAVs generated successfully!\n');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
