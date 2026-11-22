/**
 * ShotLab — Zero-Dependency Audio Caddie, Grade Chimes & Tour Tempo Metronome.
 * Uses Web Audio API (AudioContext) and Web Speech API (speechSynthesis).
 * Exposes `window.ShotLabAudio` in browser/Electron renderer (and module.exports in Node).
 */
(function (root) {
  'use strict';

  const TEMPO_PRESETS = {
    '24/8': {
      id: '24/8',
      label: '24/8 Tour (3:1)',
      ratio: '3:1',
      backswingMs: 800,
      downswingMs: 267,
      pauseMs: 1800,
    },
    '27/9': {
      id: '27/9',
      label: '27/9 Smooth (3:1)',
      ratio: '3:1',
      backswingMs: 900,
      downswingMs: 300,
      pauseMs: 1900,
    },
    '21/7': {
      id: '21/7',
      label: '21/7 Brisk (3:1)',
      ratio: '3:1',
      backswingMs: 700,
      downswingMs: 233,
      pauseMs: 1700,
    },
    '18/9': {
      id: '18/9',
      label: '18/9 Short Game (2:1)',
      ratio: '2:1',
      backswingMs: 600,
      downswingMs: 300,
      pauseMs: 1600,
    },
  };

  const SPOKEN_CLUBS = {
    DR: 'Driver',
    '3W': '3 wood',
    '5W': '5 wood',
    '7W': '7 wood',
    '3H': '3 hybrid',
    '4H': '4 hybrid',
    '5H': '5 hybrid',
    '3I': '3 iron',
    '4I': '4 iron',
    '5I': '5 iron',
    '6I': '6 iron',
    '7I': '7 iron',
    '8I': '8 iron',
    '9I': '9 iron',
    PW: 'Pitching wedge',
    GW: 'Gap wedge',
    AW: 'Approach wedge',
    SW: 'Sand wedge',
    LW: 'Lob wedge',
    PT: 'Putter',
  };

  let audioCtx = null;
  let tempoRunning = false;
  let activeTempoPreset = '24/8';
  let tempoTimers = [];

  function getAudioContext() {
    if (typeof root === 'undefined') return null;
    const Ctor = root.AudioContext || root.webkitAudioContext;
    if (!Ctor) return null;
    if (!audioCtx) {
      try {
        audioCtx = new Ctor();
      } catch {
        return null;
      }
    }
    if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
      try {
        audioCtx.resume().catch(() => {});
      } catch {
        // ignore autoplay resume failures
      }
    }
    return audioCtx;
  }

  function scheduleTone(ctx, freq, startOffsetSec, durationSec, {
    type = 'sine',
    peakGain = 0.14,
    attackSec = 0.008,
    endFreq = null,
  } = {}) {
    if (!ctx) return;
    try {
      const now = ctx.currentTime + Math.max(0, startOffsetSec);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (endFreq && endFreq !== freq) {
        osc.frequency.exponentialRampToValueAtTime(endFreq, now + durationSec);
      }

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peakGain, now + Math.min(attackSec, durationSec * 0.35));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + durationSec + 0.02);
    } catch {
      // gracefully ignore audio scheduling failures
    }
  }

  /**
   * Play a subtle synthesized chime for shot grade ('green' | 'yellow' | 'red').
   */
  function playGradeChime(grade) {
    const ctx = getAudioContext();
    if (!ctx) return false;

    const g = String(grade || '').toLowerCase();
    if (g === 'green') {
      // Warm rising major fifth: C5 (523.25 Hz) -> G5 (783.99 Hz)
      scheduleTone(ctx, 523.25, 0, 0.17, { type: 'sine', peakGain: 0.13 });
      scheduleTone(ctx, 783.99, 0.11, 0.26, { type: 'triangle', peakGain: 0.12 });
      return true;
    }
    if (g === 'yellow') {
      // Single clean 440 Hz ping
      scheduleTone(ctx, 440, 0, 0.19, { type: 'sine', peakGain: 0.11 });
      return true;
    }
    if (g === 'red') {
      // Soft low descending 220 -> 185 Hz tone
      scheduleTone(ctx, 220, 0, 0.16, { type: 'sine', peakGain: 0.12 });
      scheduleTone(ctx, 185, 0.11, 0.24, { type: 'sine', peakGain: 0.11 });
      return true;
    }
    return false;
  }

  function spokenClubName(shot) {
    if (!shot) return 'Shot';
    const code = String(shot.activeClub || '').toUpperCase();
    if (SPOKEN_CLUBS[code]) return SPOKEN_CLUBS[code];
    return shot.activeClubLabel || shot.activeClub || 'Shot';
  }

  function cleanCue(text) {
    return String(text || '')
      .replace(/^Quiet Mode:\s*/i, '')
      .replace(/\s*\((ball-flight )?estimate\)/gi, '') // "No club read" is spoken separately
      .replace(/[±]/g, 'plus or minus ')
      .replace(/°/g, ' degrees')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\.+$/, '');
  }

  /**
   * Build concise eyes-free spoken summary for a shot.
   */
  function buildShotSpeechText(shot, opts = {}) {
    if (!shot || typeof shot !== 'object') return '';
    const mode = opts.practiceMode || shot.practiceMode || 'real';
    const handedness = opts.handedness === 'LH' ? 'LH' : 'RH';
    const club = spokenClubName(shot);
    const m = shot.metrics || {};
    const fl = shot.flight || {};
    const sh = shot.shotShape || {};
    const del = shot.delivery || {};

    if (mode === 'almost') {
      const parts = [club];
      if (typeof m.hla === 'number' && Number.isFinite(m.hla)) {
        const absHla = Math.abs(m.hla);
        if (absHla < 0.3) {
          parts.push('Start line dead straight');
        } else {
          const dir = m.hla > 0 ? 'right' : 'left';
          parts.push(`Start line ${absHla.toFixed(1)} ${dir}`);
        }
      }
      if (typeof m.path === 'number' && Number.isFinite(m.path)) {
        const absPath = Math.abs(m.path);
        if (absPath < 0.4) {
          parts.push('Path neutral');
        } else {
          // For RH, +path is in-to-out; for LH, -path is in-to-out
          const inToOut = handedness === 'LH' ? m.path < 0 : m.path > 0;
          parts.push(`Path ${absPath.toFixed(1)} ${inToOut ? 'in to out' : 'out to in'}`);
        }
      }
      if (del.severity === 'green') {
        parts.push('Pure delivery');
      } else {
        const cue = cleanCue((del.cues && del.cues[0]) || del.name);
        if (cue) parts.push(cue);
      }
      return `${parts.join('. ')}.`;
    }

    // Real-ball (or sore/recovery) callout
    const parts = [club];
    if (sh.name) {
      parts.push(cleanCue(sh.name));
    }

    const carry = typeof m.effectiveCarry === 'number' && Number.isFinite(m.effectiveCarry)
      ? m.effectiveCarry
      : (typeof fl.carryYds === 'number' && Number.isFinite(fl.carryYds) ? fl.carryYds : null);
    if (carry !== null && carry > 0) {
      parts.push(`${Math.round(carry)} yards`);
    }

    if (typeof m.smash === 'number' && Number.isFinite(m.smash) && m.smash > 0.5) {
      parts.push(`Smash ${m.smash.toFixed(2)}`);
    }
    if (shot.dataQuality && shot.dataQuality.clubRead === false) {
      parts.push('No club read'); // eyes-free cue to check the club sticker
    }

    if (del.severity === 'green') {
      const name = cleanCue(del.name) || 'Pure compression';
      parts.push(name);
    } else {
      const cue = cleanCue((del.cues && del.cues[0]) || del.name);
      if (cue) parts.push(cue);
    }

    return `${parts.join('. ')}.`;
  }

  /**
   * Cancel any queued or in-flight Web Speech utterances.
   */
  function stopSpeech() {
    if (typeof root === 'undefined' || !root.speechSynthesis) return;
    try {
      root.speechSynthesis.cancel();
    } catch {
      // ignore speech synthesis errors
    }
  }

  /**
   * Speak a concise eyes-free audio caddie callout via Web Speech API.
   * Cancels queued utterances first so callouts never back up.
   */
  function speakShot(shot, opts = {}) {
    if (typeof root === 'undefined' || !root.speechSynthesis || typeof root.SpeechSynthesisUtterance !== 'function') {
      return '';
    }
    const text = buildShotSpeechText(shot, opts);
    if (!text) return '';

    try {
      root.speechSynthesis.cancel();
      const utt = new root.SpeechSynthesisUtterance(text);
      utt.rate = typeof opts.rate === 'number' && Number.isFinite(opts.rate) ? opts.rate : 1.06;
      utt.pitch = typeof opts.pitch === 'number' && Number.isFinite(opts.pitch) ? opts.pitch : 1.0;
      utt.volume = typeof opts.volume === 'number' && Number.isFinite(opts.volume) ? opts.volume : 0.95;
      root.speechSynthesis.speak(utt);
    } catch {
      // gracefully ignore speech errors
    }
    return text;
  }

  function playTempoClick(freq, gain = 0.16) {
    const ctx = getAudioContext();
    if (!ctx) return;
    // Short crisp percussive ping for clear cadence timing
    scheduleTone(ctx, freq, 0, 0.065, { type: 'triangle', peakGain: gain, attackSec: 0.003 });
  }

  function clearTempoTimers() {
    for (const id of tempoTimers) {
      clearTimeout(id);
    }
    tempoTimers = [];
  }

  function stopTempo() {
    tempoRunning = false;
    clearTempoTimers();
  }

  /**
   * Start Tour Tempo 3-tone cadence metronome:
   *   1. Takeaway (440 Hz)
   *   2. Top of Backswing (660 Hz)
   *   3. Impact (988 Hz)
   */
  function startTempo(preset = '24/8', onBeat = null) {
    stopTempo();

    const key = TEMPO_PRESETS[preset] ? preset : '24/8';
    const cfg = TEMPO_PRESETS[key];
    activeTempoPreset = key;
    tempoRunning = true;

    const fireCycle = () => {
      if (!tempoRunning) return;
      clearTempoTimers();

      // Beat 1: Takeaway (440 Hz)
      playTempoClick(440, 0.14);
      if (typeof onBeat === 'function') {
        try { onBeat('takeaway', cfg); } catch {}
      }

      // Beat 2: Top of Backswing (660 Hz)
      const tTop = setTimeout(() => {
        if (!tempoRunning) return;
        playTempoClick(660, 0.16);
        if (typeof onBeat === 'function') {
          try { onBeat('top', cfg); } catch {}
        }
      }, cfg.backswingMs);

      // Beat 3: Impact (988 Hz)
      const tImpact = setTimeout(() => {
        if (!tempoRunning) return;
        playTempoClick(988, 0.20);
        if (typeof onBeat === 'function') {
          try { onBeat('impact', cfg); } catch {}
        }
      }, cfg.backswingMs + cfg.downswingMs);

      // Next cycle
      const tNext = setTimeout(() => {
        if (!tempoRunning) return;
        fireCycle();
      }, cfg.backswingMs + cfg.downswingMs + cfg.pauseMs);

      tempoTimers.push(tTop, tImpact, tNext);
    };

    fireCycle();
    return cfg;
  }

  function isTempoRunning() {
    return tempoRunning;
  }

  function getTempoPreset() {
    return activeTempoPreset;
  }

  const api = {
    TEMPO_PRESETS,
    playGradeChime,
    buildShotSpeechText,
    speakShot,
    stopSpeech,
    startTempo,
    stopTempo,
    isTempoRunning,
    getTempoPreset,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof root !== 'undefined' && root) {
    root.ShotLabAudio = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
