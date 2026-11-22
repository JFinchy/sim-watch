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

  /**
   * Tempo sound sets: one sound per beat (takeaway, top, impact). `kind` picks the synth:
   *   tone  = pitched oscillator ping
   *   wood  = short pitched knock with a fast pitch drop (woodblock / clave feel)
   *   noise = filtered noise burst (stick / shaker click, pitch-free)
   */
  const TEMPO_SOUNDS = {
    tones: {
      id: 'tones', label: 'Tones (rising)',
      beats: [
        { kind: 'tone', freq: 440, type: 'triangle', gain: 0.14, dur: 0.065 },
        { kind: 'tone', freq: 660, type: 'triangle', gain: 0.16, dur: 0.065 },
        { kind: 'tone', freq: 988, type: 'triangle', gain: 0.20, dur: 0.065 },
      ],
    },
    woodblock: {
      id: 'woodblock', label: 'Woodblock',
      beats: [
        { kind: 'wood', freq: 900, gain: 0.30, dur: 0.05 },
        { kind: 'wood', freq: 1200, gain: 0.30, dur: 0.05 },
        { kind: 'wood', freq: 1600, gain: 0.36, dur: 0.06 },
      ],
    },
    click: {
      id: 'click', label: 'Click (sharp)',
      beats: [
        { kind: 'noise', freq: 2500, gain: 0.35, dur: 0.025 },
        { kind: 'noise', freq: 3500, gain: 0.35, dur: 0.025 },
        { kind: 'noise', freq: 5000, gain: 0.45, dur: 0.03 },
      ],
    },
    beep: {
      id: 'beep', label: 'Beep (classic)',
      beats: [
        { kind: 'tone', freq: 880, type: 'sine', gain: 0.14, dur: 0.08 },
        { kind: 'tone', freq: 880, type: 'sine', gain: 0.14, dur: 0.08 },
        { kind: 'tone', freq: 1320, type: 'sine', gain: 0.18, dur: 0.12 },
      ],
    },
    soft: {
      id: 'soft', label: 'Soft (low, late night)',
      beats: [
        { kind: 'tone', freq: 220, type: 'sine', gain: 0.10, dur: 0.12 },
        { kind: 'tone', freq: 277, type: 'sine', gain: 0.10, dur: 0.12 },
        { kind: 'tone', freq: 330, type: 'sine', gain: 0.13, dur: 0.14 },
      ],
    },
    swoosh: {
      id: 'swoosh', label: 'Swoosh (sweep up/down)',
      beats: [
        { kind: 'tone', freq: 300, endFreq: 600, type: 'sine', gain: 0.12, dur: 0.18 },
        { kind: 'tone', freq: 600, endFreq: 620, type: 'sine', gain: 0.10, dur: 0.05 },
        { kind: 'tone', freq: 1400, endFreq: 500, type: 'triangle', gain: 0.20, dur: 0.12 },
      ],
    },
  };

  /** Rest between swings. 0 = the preset's own short loop (non-stop). */
  const TEMPO_GAPS_SEC = [0, 3, 5, 8, 10, 15, 20, 30];
  const READY_CUE_LEAD_MS = 1000;    // quiet "get ready" tick this long before the takeaway beat
  const READY_CUE_MIN_GAP_SEC = 3;   // only when resting at least this long (non-stop loops need no warning)

  /**
   * Pure timing of one tempo cycle (ms from the takeaway beat), so it can be tested without audio.
   * gapSec 0 keeps the preset's pauseMs; otherwise the rest after impact is gapSec seconds.
   */
  function tempoCycleTimings(preset = '24/8', gapSec = 0) {
    const cfg = TEMPO_PRESETS[preset] || TEMPO_PRESETS['24/8'];
    const gap = Number(gapSec);
    const restMs = Number.isFinite(gap) && gap > 0 ? Math.min(gap, 120) * 1000 : cfg.pauseMs;
    const impact = cfg.backswingMs + cfg.downswingMs;
    const readyCue = Number.isFinite(gap) && gap >= READY_CUE_MIN_GAP_SEC;
    return {
      top: cfg.backswingMs,
      impact,
      next: impact + restMs,
      // Ready tick for the NEXT swing, scheduled within this cycle (null when non-stop).
      ready: readyCue ? impact + restMs - READY_CUE_LEAD_MS : null,
      restMs,
    };
  }

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
  let tempoOptions = { sound: 'tones', gapSec: 0 };

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

  function scheduleNoiseClick(ctx, centerFreq, durationSec, peakGain) {
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const len = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filt = ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.setValueAtTime(centerFreq, now);
      filt.Q.setValueAtTime(4, now);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(peakGain, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
      src.connect(filt);
      filt.connect(gain);
      gain.connect(ctx.destination);
      src.start(now);
      src.stop(now + durationSec + 0.02);
    } catch {
      // ignore audio failures
    }
  }

  function playTempoSound(beat) {
    const ctx = getAudioContext();
    if (!ctx || !beat) return;
    if (beat.kind === 'noise') {
      scheduleNoiseClick(ctx, beat.freq, beat.dur, beat.gain);
    } else if (beat.kind === 'wood') {
      // Woody knock: fast attack, quick downward pitch drop, short decay.
      scheduleTone(ctx, beat.freq, 0, beat.dur, { type: 'sine', peakGain: beat.gain, attackSec: 0.001, endFreq: beat.freq * 0.6 });
      scheduleTone(ctx, beat.freq * 2.7, 0, beat.dur * 0.5, { type: 'sine', peakGain: beat.gain * 0.3, attackSec: 0.001 });
    } else {
      scheduleTone(ctx, beat.freq, 0, beat.dur, {
        type: beat.type || 'triangle', peakGain: beat.gain, attackSec: 0.003, endFreq: beat.endFreq || null,
      });
    }
  }

  function playTempoClick(freq, gain = 0.16) {
    playTempoSound({ kind: 'tone', freq, type: 'triangle', gain, dur: 0.065 });
  }

  function playReadyCue() {
    // Quiet, low, pitch-neutral tick: "next swing coming" without sounding like a tempo beat.
    playTempoSound({ kind: 'tone', freq: 330, type: 'sine', gain: 0.05, dur: 0.05 });
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

  function normalizeTempoOptions(opts = {}) {
    const sound = TEMPO_SOUNDS[opts.sound] ? opts.sound : tempoOptions.sound;
    const g = Number(opts.gapSec);
    const gapSec = Number.isFinite(g) && g >= 0 ? Math.min(g, 120) : tempoOptions.gapSec;
    return { sound: TEMPO_SOUNDS[sound] ? sound : 'tones', gapSec };
  }

  /** Change sound / rest between swings; applies from the next beat if the metronome is running. */
  function setTempoOptions(opts = {}) {
    tempoOptions = normalizeTempoOptions(opts);
    return { ...tempoOptions };
  }

  function getTempoOptions() {
    return { ...tempoOptions };
  }

  /**
   * Start the Tour Tempo 3-beat metronome: takeaway -> top of backswing -> impact, then rest.
   * opts.sound picks a TEMPO_SOUNDS set; opts.gapSec > 0 rests that many seconds between swings
   * (with a quiet ready tick 1 s before the next takeaway), 0 loops non-stop at the preset's pause.
   */
  function startTempo(preset = '24/8', onBeat = null, opts = null) {
    stopTempo();
    if (opts) setTempoOptions(opts);

    const key = TEMPO_PRESETS[preset] ? preset : '24/8';
    const cfg = TEMPO_PRESETS[key];
    activeTempoPreset = key;
    tempoRunning = true;

    const beat = (idx, name) => {
      if (!tempoRunning) return;
      const set = TEMPO_SOUNDS[tempoOptions.sound] || TEMPO_SOUNDS.tones;
      playTempoSound(set.beats[idx]);
      if (typeof onBeat === 'function') {
        try { onBeat(name, cfg); } catch {}
      }
    };

    const fireCycle = () => {
      if (!tempoRunning) return;
      clearTempoTimers();
      const t = tempoCycleTimings(key, tempoOptions.gapSec);  // re-read each cycle: live option changes apply

      beat(0, 'takeaway');
      const tTop = setTimeout(() => beat(1, 'top'), t.top);
      const tImpact = setTimeout(() => beat(2, 'impact'), t.impact);
      tempoTimers.push(tTop, tImpact);
      if (t.ready !== null) {
        tempoTimers.push(setTimeout(() => {
          if (!tempoRunning) return;
          playReadyCue();
          if (typeof onBeat === 'function') {
            try { onBeat('ready', cfg); } catch {}
          }
        }, t.ready));
      }
      tempoTimers.push(setTimeout(() => {
        if (!tempoRunning) return;
        fireCycle();
      }, t.next));
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
    TEMPO_SOUNDS,
    TEMPO_GAPS_SEC,
    tempoCycleTimings,
    setTempoOptions,
    getTempoOptions,
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
