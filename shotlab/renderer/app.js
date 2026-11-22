/**
 * ShotLab v2 — Electron Desktop Dashboard Renderer Controller ("Coaching & Pattern OS").
 * Preserves all v1 Live Telemetry intelligence boxes, hover popovers, 14-metric R/Y/G grid,
 * club calibration, OBS modal, CSV watcher, and Settings modal, while adding:
 *   - 4-Tab View Switcher (Live Telemetry, Patterns & Dispersion, Bag Gapping, Video Compare)
 *   - Practice Context Controls (Real Balls / Kids Asleep, Active Feel tagger, Audio Caddie, Tour Tempo)
 *   - Fault-Streak -> Drill Prescription Banner & Per-Shot Strokes Gained Pill
 *   - Fullscreen 10-foot readable Mat Glance Mode (Hotkey: M / Esc)
 *   - Local SQLite Patterns Lab (2D DECADE Dispersion, Stroke Leaks, A/B Feel Verdicts, Trends, Fatigue)
 *   - 14-Club Bag Gapping & Stopping Power Table
 *   - Synced Kinovea Dual-Angle (DTL + FO) Video Player, Compare vs Personal Best, 1-Click Promote to My-Go-To
 */
(function () {
  'use strict';

  const CLUB_ORDER = ['DR', '3W', '5W', '4H', '4I', '5I', '6I', '7I', '8I', '9I', 'PW', 'GW', 'SW', 'LW'];
  const DEFAULT_LOFTS = {
    DR: 10.5, '3W': 15, '5W': 18, '4H': 22,
    '4I': 22, '5I': 25, '6I': 28, '7I': 32, '8I': 36, '9I': 40,
    PW: 45, GW: 50, SW: 55, LW: 60,
  };
  const CLUB_LABELS = {
    DR: 'Driver', '3W': '3 Wood', '5W': '5 Wood', '4H': '4 Hybrid',
    '4I': '4 Iron', '5I': '5 Iron', '6I': '6 Iron', '7I': '7 Iron',
    '8I': '8 Iron', '9I': '9 Iron', PW: 'Pitching Wedge', GW: 'Gap Wedge',
    SW: 'Sand Wedge', LW: 'Lob Wedge',
  };

  let state = null;
  let toastTimer = null;
  let activeTab = 'live';
  let matGlanceOpen = false;

  // Audio guard state — prevents speech/chime spam on startup, settings edits, or clicking tape rows
  let initialLoadComplete = false;
  let lastKnownNewestShotId = null;

  // Fault banner dismissal key (`${faultId}:${latestShotId}`)
  let dismissedFaultKey = null;

  // Patterns Lab local state
  const patternFilters = { club: 'ALL', mode: 'real', days: 90 };
  let activeTrendMetric = 'avgScore';
  let lastPatternsData = null;

  // Bag Gapping local state
  const gappingFilters = { mode: 'real', days: 180 };

  // Video Compare local state
  const videoState = {
    club: 'ALL',
    selectedShotId: null,
    playbackRate: 0.5,
    data: null,
  };

  // Debounced background refresh for SQLite-backed tabs when a new shot arrives
  let tabRefreshTimer = null;

  const $ = (id) => document.getElementById(id);

  function showToast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
  }

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtSg(val, { prefix = 'SG ' } = {}) {
    if (typeof val !== 'number' || !Number.isFinite(val)) return '—';
    const sign = val > 0 ? '+' : val < 0 ? '−' : '';
    return `${prefix}${sign}${Math.abs(val).toFixed(2)}`;
  }

  function sgClass(val) {
    if (typeof val !== 'number' || !Number.isFinite(val)) return 'sg-flat';
    if (val >= 0.04) return 'sg-pos';
    if (val <= -0.1) return 'sg-neg';
    return 'sg-flat';
  }

  function sgTagClass(val) {
    if (typeof val !== 'number' || !Number.isFinite(val)) return 'tag-neutral';
    if (val >= 0.05) return 'tag-green';
    if (val > -0.15) return 'tag-yellow';
    return 'tag-red';
  }

  function fmtNum(val, digits = 1, unit = '') {
    if (typeof val !== 'number' || !Number.isFinite(val)) return '—';
    return `${val.toFixed(digits)}${unit}`;
  }

  function fmtSigned(val, digits = 1, unit = '') {
    if (typeof val !== 'number' || !Number.isFinite(val)) return '—';
    const sign = val > 0 ? '+' : val < 0 ? '−' : '';
    return `${sign}${Math.abs(val).toFixed(digits)}${unit}`;
  }

  function feelLabelById(feelId, snap = state) {
    if (!feelId) return 'Baseline (No Feel Tagged)';
    const feels = (snap && snap.drillsHub && Array.isArray(snap.drillsHub.feels)) ? snap.drillsHub.feels : [];
    const found = feels.find((f) => f && f.id === feelId);
    if (found) return found.label || found.name || found.id;
    return feelId;
  }

  function populateClubFilterSelect(sel) {
    if (!sel || sel.options.length > 0) return;
    const allOpt = document.createElement('option');
    allOpt.value = 'ALL';
    allOpt.textContent = 'All Clubs';
    sel.appendChild(allOpt);
    for (const code of CLUB_ORDER) {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = `${code} — ${CLUB_LABELS[code] || code}`;
      sel.appendChild(opt);
    }
  }

  // --------------------------------------------------------------------------- Smart Hover Popover

  const popover = $('hover-popover');

  function hidePopover() {
    popover.classList.add('hidden');
  }

  function positionPopover(ev) {
    const pad = 14;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    popover.style.left = '0px';
    popover.style.top = '0px';
    const rect = popover.getBoundingClientRect();
    let x = ev.clientX + 16;
    let y = ev.clientY + 14;
    if (x + rect.width + pad > vw) x = Math.max(pad, ev.clientX - rect.width - 16);
    if (y + rect.height + pad > vh) y = Math.max(pad, ev.clientY - rect.height - 14);
    popover.style.left = `${x}px`;
    popover.style.top = `${y}px`;
  }

  function bindHover(el, getHtml) {
    if (!el) return;
    el.onmouseenter = (ev) => {
      const html = getHtml();
      if (!html) return;
      popover.innerHTML = html;
      popover.classList.remove('hidden');
      positionPopover(ev);
    };
    el.onmousemove = (ev) => {
      if (!popover.classList.contains('hidden')) positionPopover(ev);
    };
    el.onmouseleave = hidePopover;
  }

  window.addEventListener('blur', hidePopover);
  window.addEventListener('scroll', hidePopover, true);

  // --------------------------------------------------------------------------- Audio Caddie & Chimes Guard

  function maybePlayShotAudio(snap) {
    const newest = (snap.shots && snap.shots.length > 0) ? snap.shots[0] : snap.currentShot;
    const newestId = newest ? newest.id : null;

    if (!initialLoadComplete) {
      initialLoadComplete = true;
      lastKnownNewestShotId = newestId;
      return;
    }

    if (!newest || !newestId || newestId === lastKnownNewestShotId) return;
    lastKnownNewestShotId = newestId;

    if (snap.eventType !== 'shot') return;
    if (newest.isPreviewSeed) return;
    if (!snap.currentShot || snap.currentShot.id !== newestId) return;

    const audio = window.ShotLabAudio;
    if (!audio) return;
    const settings = snap.settings || {};

    if (settings.audioChimes && typeof audio.playGradeChime === 'function') {
      audio.playGradeChime(newest.scorecard && newest.scorecard.overallGrade);
    }
    if (settings.audioCaddie && typeof audio.speakShot === 'function') {
      audio.speakShot(newest, {
        practiceMode: newest.practiceMode || settings.practiceMode || 'real',
        handedness: settings.handedness || 'RH',
      });
    }
  }

  // --------------------------------------------------------------------------- Topbar & Subbar Render

  function setCardSeverity(el, sev) {
    el.classList.remove('sev-green', 'sev-yellow', 'sev-red');
    if (sev === 'green' || sev === 'yellow' || sev === 'red') el.classList.add(`sev-${sev}`);
  }

  // SimWatch watchdog states -> short label + pill style (see simwatch.py _watch_step)
  const RIG_STATES = {
    healthy: ['Rig OK', 'pill-live'],
    degraded: ['Rig: checking', 'pill-warn'],
    recovering: ['Rig: recovering', 'pill-bad'],
    gave_up: ['Rig: needs you', 'pill-bad'],
    device_offline: ['Launch Pro off', 'pill-warn'],
    device_check: ['Rig: checking LM', 'pill-warn'],
    device_backoff: ['Rig: LM retry wait', 'pill-warn'],
    discovery_grace: ['Rig: connecting LM', 'pill-warn'],
  };

  let lastHotkeys = [];
  const HOTKEY_NOTES = { failed: 'taken by another app', invalid: 'bad key in config', ctrl_alt_only: 'use Ctrl+Alt' };

  function hotkeysHtml() {
    if (!lastHotkeys.length) {
      return `<div class="hp-title"><span>SimWatch Hotkeys</span></div>
        <div class="hp-body">Not available: SimWatch isn't connected, or its video rig (which owns the hotkeys) isn't running.</div>`;
    }
    const rows = lastHotkeys.map((h) => {
      const note = HOTKEY_NOTES[h.state];
      return `<div style="display:flex;gap:10px;align-items:baseline;margin:3px 0;">
        <span style="font-family:var(--mono);color:#facc15;min-width:92px;">${esc(h.keys)}</span>
        <span>${esc(h.label)}${note ? ` <span style="color:#f87171;">(${esc(note)})</span>` : ''}</span>
      </div>`;
    }).join('');
    return `<div class="hp-title"><span>SimWatch Hotkeys</span><span class="tag">Alt+H on screen</span></div>
      <div class="hp-body">${rows}<div style="margin-top:6px;color:#94a3b8;font-size:10.5px;">Every Alt+&lt;key&gt; also works as Ctrl+Alt+&lt;key&gt;.</div></div>`;
  }

  function initKeysPill() {
    const el = $('pill-keys');
    if (!el) return;
    bindHover(el, hotkeysHtml);
    el.addEventListener('mouseenter', () => {
      // Refresh in the background so the next hover reflects live registration state.
      window.shotlabAPI.getHotkeys().then((list) => {
        if (Array.isArray(list)) lastHotkeys = list;
      }).catch(() => {});
    });
  }

  // Missing-data notice: says plainly what the launch monitor didn't send and what is an estimate.
  function renderDataQuality(shot, snap) {
    const el = $('data-quality-note');
    if (!el) return;
    const dq = shot && shot.dataQuality;
    const cov = shot && shot.scorecard && shot.scorecard.coverage;
    if (!dq || dq.clubRead) {
      el.classList.add('hidden');
      el.textContent = '';
      return;
    }
    const st = snap && snap.sessionStats;
    const rate = st && st.count > 1 ? ` Club read on ${st.clubReads}/${st.count} shots this session.` : '';
    const graded = cov ? ` Score uses ${cov.graded} of ${cov.total} metrics.` : '';
    el.innerHTML = `<strong>No club read</strong> (sticker missed): club speed, smash, path &amp; attack angle unavailable.
      Delivery and strike below are <em>ball-flight estimates</em>.${esc(graded)}${esc(rate)}`;
    el.classList.remove('hidden');
  }

  function renderRigPill(el, health) {
    if (!el) return;
    if (!health || !health.state) {
      el.className = 'pill pill-muted';
      el.textContent = 'Rig: —';
      el.title = 'No watchdog verdict yet (SimWatch bridge offline, or watchdog not running)';
      return;
    }
    const [label, cls] = RIG_STATES[health.state] || [`Rig: ${health.state}`, 'pill-muted'];
    el.className = `pill ${cls}`;
    el.textContent = label;
    const failing = Array.isArray(health.failing) ? health.failing : [];
    el.title = failing.length
      ? `SimWatch: ${health.state} - failing: ${failing.join(', ')}`
      : `SimWatch: ${health.state}${health.ts ? ` (as of ${health.ts})` : ''}`;
  }

  function renderTopbar(snap) {
    const pillBridge = $('pill-bridge');
    const pillSniffer = $('pill-sniffer');
    const pillGspro = $('pill-gspro-club');
    const port = snap.simwatchPort || 8765;

    pillBridge.title = `Connection to SimWatch local bridge (127.0.0.1:${port})`;
    if (snap.bridgeConnected) {
      pillBridge.className = 'pill pill-live';
      pillBridge.innerHTML = `<span class="dot"></span> Bridge :${esc(port)} Live`;
    } else {
      pillBridge.className = 'pill pill-warn';
      pillBridge.innerHTML = `<span class="dot"></span> Bridge :${esc(port)} Offline`;
    }

    if (snap.bridgeConnected && snap.bridgeSnifferOk) {
      pillSniffer.className = 'pill pill-live';
      pillSniffer.textContent = ':921 Sniffer OK';
    } else {
      pillSniffer.className = 'pill pill-muted';
      pillSniffer.textContent = ':921 Sniffer Idle';
    }

    pillGspro.textContent = `GSPro: ${snap.gsproClub || '—'}`;

    renderRigPill($('pill-rig'), snap.rigHealth);
    lastHotkeys = Array.isArray(snap.hotkeys) ? snap.hotkeys : [];

    // Tier buttons
    document.querySelectorAll('.tier-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tier === (snap.settings && snap.settings.tierId));
    });

    // Populate demo select once
    const sel = $('demo-select');
    if (sel.options.length === 0 && Array.isArray(snap.demoArchetypes)) {
      const optRand = document.createElement('option');
      optRand.value = '';
      optRand.textContent = 'Random Archetype';
      sel.appendChild(optRand);
      for (const d of snap.demoArchetypes) {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.label;
        sel.appendChild(opt);
      }
    }

    // CSV watcher indicator
    const csvInd = $('csv-watch-indicator');
    if (snap.watchedCsvPath) {
      csvInd.classList.remove('hidden');
      csvInd.className = 'tag tag-green';
      csvInd.textContent = `Watching: ${snap.watchedCsvPath.split(/[/\\]/).pop()}`;
      $('btn-csv-stop').classList.remove('hidden');
    } else {
      csvInd.classList.add('hidden');
      $('btn-csv-stop').classList.add('hidden');
    }
  }

  function renderSubbar(snap) {
    const settings = snap.settings || {};
    const mode = settings.practiceMode === 'almost' ? 'almost' : 'real';

    document.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Populate Active Feel dropdown from snapshot.drillsHub.feels
    const feelSel = $('select-active-feel');
    const feels = (snap.drillsHub && Array.isArray(snap.drillsHub.feels)) ? snap.drillsHub.feels : [];
    const activeFeelId = settings.activeFeelId || '';
    const sig = feels.map((f) => `${f.id}:${f.label || f.name || ''}`).join('|');
    if (feelSel.dataset.sig !== sig) {
      feelSel.dataset.sig = sig;
      feelSel.innerHTML = '';
      const noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = 'No Feel Tagged';
      feelSel.appendChild(noneOpt);
      for (const f of feels) {
        if (!f || !f.id) continue;
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = f.label || f.name || f.id;
        const tip = f.trigger || f.cue || f.note || '';
        if (tip) opt.title = tip;
        feelSel.appendChild(opt);
      }
    }
    if (activeFeelId && !Array.from(feelSel.options).some((o) => o.value === activeFeelId)) {
      const customOpt = document.createElement('option');
      customOpt.value = activeFeelId;
      customOpt.textContent = activeFeelId;
      feelSel.appendChild(customOpt);
    }
    feelSel.value = activeFeelId;

    // Audio Caddie button
    const btnVoice = $('btn-audio-caddie');
    const voiceOn = Boolean(settings.audioCaddie);
    btnVoice.classList.toggle('btn-voice-on', voiceOn);
    btnVoice.classList.toggle('btn-ghost', !voiceOn);
    btnVoice.textContent = voiceOn ? '🔊 Voice ON' : '🔇 Voice';

    // Tour Tempo dropdown reflects actual running metronome state
    const tempoSel = $('select-tempo');
    const audio = window.ShotLabAudio;
    const isRunning = Boolean(audio && typeof audio.isTempoRunning === 'function' && audio.isTempoRunning());
    const runningPreset = isRunning && typeof audio.getTempoPreset === 'function' ? audio.getTempoPreset() : 'off';
    tempoSel.value = isRunning ? (runningPreset || '24/8') : 'off';

    // Local DB pill
    const pillDb = $('pill-db');
    const db = snap.dbSummary;
    if (db && typeof db.totalShots === 'number') {
      pillDb.textContent = `DB: ${db.totalShots} swing${db.totalShots === 1 ? '' : 's'}`;
      pillDb.title = `Local ${db.backend || 'sqlite'} DB · ${db.totalSessions || 0} sessions · ${db.clubsTracked || 0} clubs · ${db.clipsLinked || 0} clips linked. Click to sync SimWatch history.`;
    } else {
      pillDb.textContent = 'DB: Sync';
    }
  }

  // --------------------------------------------------------------------------- Tab 1: Live Telemetry

  function renderFaultBanner(snap) {
    const banner = $('fault-streak-banner');
    const alert = snap.faultAlert;
    const latestId = (snap.shots && snap.shots[0] && snap.shots[0].id) || (snap.currentShot && snap.currentShot.id) || '';

    if (!alert || !alert.faultId) {
      banner.classList.add('hidden');
      banner.innerHTML = '';
      return;
    }

    const key = `${alert.faultId}:${latestId}`;
    if (dismissedFaultKey === key) {
      banner.classList.add('hidden');
      return;
    }

    const count = alert.count ?? alert.streak ?? 2;
    const drills = alert.drills || alert.recommendedDrills || [];
    const topDrill = drills[0] || null;
    const activeDrillId = snap.settings && snap.settings.activeDrillId;
    const isTagged = Boolean(topDrill && activeDrillId === topDrill.id);

    banner.classList.remove('hidden');
    banner.classList.toggle('urgent', count >= 3 || Boolean(alert.urgent));

    const drillHtml = topDrill
      ? `<div class="fault-banner-drill">Recommended Drill: <strong>${esc(topDrill.title)}</strong>${topDrill.keyFeel ? ` — <em>${esc(topDrill.keyFeel)}</em>` : ''}</div>`
      : `<div class="fault-banner-drill">Repeating delivery pattern detected — check Focus Cues below before your next swing.</div>`;

    banner.innerHTML = `
      <div class="fault-banner-info">
        <div class="fault-banner-head">
          <span class="streak-pill">${esc(count)}× STREAK</span>
          ${esc(alert.faultName || alert.faultId)} detected
        </div>
        ${drillHtml}
      </div>
      <div class="fault-banner-actions">
        ${topDrill ? `<button id="btn-tag-fault-drill" class="btn btn-sm ${isTagged ? 'btn-green' : 'btn-accent'}" data-drill-id="${esc(topDrill.id)}">${isTagged ? '✓ Drill Tagged' : 'Tag Drill'}</button>` : ''}
        <button id="btn-dismiss-fault" class="btn btn-ghost btn-sm" title="Dismiss until next shot">✕</button>
      </div>
    `;

    const btnTag = $('btn-tag-fault-drill');
    if (btnTag && topDrill) {
      btnTag.onclick = async () => {
        if (window.shotlabAPI.setPracticeContext) {
          await window.shotlabAPI.setPracticeContext({ activeDrillId: topDrill.id });
          showToast(`Tagged drill: ${topDrill.title}`);
        }
      };
    }
    const btnDismiss = $('btn-dismiss-fault');
    if (btnDismiss) {
      btnDismiss.onclick = () => {
        dismissedFaultKey = key;
        banner.classList.add('hidden');
      };
    }
  }

  function renderShotShapeBox(shot, snap) {
    const box = $('box-shape');
    const sh = shot.shotShape;
    const fl = shot.flight;
    setCardSeverity(box, sh.severity);

    const nameEl = $('shape-name');
    nameEl.textContent = sh.name;
    nameEl.className = `card-title sev-${sh.severity}`;

    const hTag = $('shape-height-tag');
    hTag.textContent = sh.heightTag;
    hTag.className = `tag ${sh.heightTag === 'Optimal Height' ? 'tag-green' : 'tag-yellow'}`;

    // Strokes Gained Pill & Quiet Mode Badge
    const practiceMode = shot.practiceMode || (snap && snap.settings && snap.settings.practiceMode) || 'real';
    const sgPill = $('shape-sg-pill');
    const quietBadge = $('shape-quiet-badge');
    const sg = shot.strokesGained;

    if (practiceMode === 'almost') {
      quietBadge.classList.remove('hidden');
      sgPill.classList.add('hidden');
    } else {
      quietBadge.classList.add('hidden');
      if (sg && typeof sg.sg === 'number' && Number.isFinite(sg.sg)) {
        sgPill.classList.remove('hidden');
        sgPill.className = `tag ${sgTagClass(sg.sg)}`;
        sgPill.textContent = fmtSg(sg.sg);
        bindHover(sgPill, () => `
          <div class="hp-title">
            <span>Strokes Gained (${esc(sg.category || 'SHOT')})</span>
            <span class="tag ${esc(sgTagClass(sg.sg))}">${esc(fmtSg(sg.sg, { prefix: '' }))}</span>
          </div>
          <div class="hp-body">${esc(sg.explanation || '')}</div>
          ${typeof sg.sgPga === 'number' ? `<div class="hp-body" style="margin-top:5px;color:#94a3b8;font-family:var(--mono);font-size:10.5px;">vs PGA Tour: ${esc(fmtSg(sg.sgPga, { prefix: '' }))} · Result: ${esc(sg.resultLie || '—')}</div>` : ''}
        `);
      } else {
        sgPill.classList.add('hidden');
      }
    }

    $('shape-icon-wrap').innerHTML = window.ShotLabSVG.renderShotShapeIcon(sh.svgParams, { width: 112, height: 112 });
    $('side-traj-wrap').innerHTML = window.ShotLabSVG.renderSideTrajectory(fl, shot.potential, sh.severity);

    $('stat-carry').textContent = `${Math.round(shot.metrics.effectiveCarry)} yds`;
    $('stat-total').textContent = `Total ${Math.round(shot.metrics.totalYds)} yds (+${Math.round(fl.rollYds)} roll)`;

    const cDir = fl.curveYds < -0.5 ? 'L' : fl.curveYds > 0.5 ? 'R' : '';
    const oDir = fl.offlineYds < -0.5 ? 'L' : fl.offlineYds > 0.5 ? 'R' : '';
    $('stat-curve').textContent = `${Math.abs(fl.curveYds).toFixed(0)}y ${cDir}`;
    $('stat-offline').textContent = `${Math.abs(fl.offlineYds).toFixed(0)}y ${oDir}`;
    $('stat-apex').textContent = `${Math.round(fl.apexFt)} ft`;
    $('shape-desc').textContent = sh.description;

    const whyHtml = () => `
      <div class="hp-title">
        <span>Why "${esc(sh.name)}"?</span>
        <span class="tag tag-${esc(sh.severity)}">${esc(sh.shortTag)}</span>
      </div>
      <div class="hp-body">Evaluated from combined launch direction, spin tilt, and aerodynamic curve:</div>
      <ul class="hp-list">${(sh.rationale || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    `;
    bindHover($('shape-why-trigger'), whyHtml);
    bindHover($('shape-icon-wrap'), whyHtml);
  }

  function renderClubBox(shot, snap) {
    const det = shot.clubDetection;
    const stats = snap.calibrationStats;
    const box = $('box-club');

    const confPct = det.confidencePct || 0;
    const sev = shot.confirmedClub ? 'green' : (confPct >= 85 ? 'green' : confPct >= 60 ? 'yellow' : 'red');
    setCardSeverity(box, sev);

    $('club-pred-name').textContent = shot.activeClubLabel;
    const badge = $('club-conf-badge');
    badge.textContent = shot.confirmedClub ? 'CONFIRMED' : `${Math.round(confPct)}%`;
    badge.className = `conf-badge ${shot.confirmedClub || confPct >= 85 ? 'high' : confPct >= 60 ? 'med' : ''}`;

    const srcTag = $('club-source-tag');
    if (shot.confirmedClub) {
      srcTag.textContent = shot.isDemo ? 'DEMO PREVIEW' : 'VERIFIED';
      srcTag.className = shot.isDemo ? 'tag tag-cyan' : 'tag tag-green';
    } else if (shot.demoActualClub) {
      srcTag.textContent = `DEMO (${shot.demoActualClub})`;
      srcTag.className = det.predictedClub === shot.demoActualClub ? 'tag tag-green' : 'tag tag-yellow';
    } else if (det.isPartialOrShortGame) {
      srcTag.textContent = (det.shotCategory || 'PARTIAL').toUpperCase();
      srcTag.className = 'tag tag-yellow';
    } else {
      srcTag.textContent = det.calibrated ? 'CALIBRATED' : 'PRIOR';
      srcTag.className = det.calibrated ? 'tag tag-green' : 'tag tag-cyan';
    }

    $('club-top3').innerHTML = (det.top3 || []).map((t, i) => `
      <div class="top3-row ${i === 0 ? 'first' : ''}">
        <span class="top3-code">${esc(t.club)}</span>
        <div class="top3-bar"><div class="top3-fill" style="width:${Math.min(100, Number(t.confidencePct) || 0)}%"></div></div>
        <span class="top3-pct">${Math.round(Number(t.confidencePct) || 0)}%</span>
      </div>
    `).join('');

    const btnConfirm = $('btn-confirm-pred');
    if (shot.confirmedClub) {
      btnConfirm.textContent = `✓ Confirmed ${shot.confirmedClub}`;
      btnConfirm.disabled = true;
      btnConfirm.onclick = null;
    } else {
      const guessClub = det.predictedClub || shot.activeClub;
      btnConfirm.textContent = `✓ Confirm ${guessClub}`;
      btnConfirm.disabled = false;
      btnConfirm.onclick = () => confirmClub(shot.id, guessClub);
    }

    $('btn-sync-gspro').onclick = async () => {
      const target = shot.confirmedClub || det.predictedClub || shot.activeClub;
      const res = await window.shotlabAPI.switchGsproClub(target);
      if (res && res.ok) {
        showToast(`Sent GSPro switch → ${target} (${res.plan.steps}× ${res.plan.key.toUpperCase()})`);
      } else {
        const reasonMap = {
          bridge_offline: 'SimWatch bridge is offline',
          unknown_gspro_club: 'GSPro active club unknown (press I/K once in GSPro)',
          already_selected: `GSPro is already on ${target}`,
          club_not_in_bag: `${target} is not in your active bag list`,
          unknown_target_club: 'No club to switch to for this shot',
          switch_in_progress: 'previous switch still settling, try again in a moment',
        };
        const msg = (res && (reasonMap[res.reason] || res.error || res.reason)) || 'switch skipped';
        showToast(`GSPro switch: ${msg}`);
      }
    };

    const chkAuto = $('chk-autoswitch');
    const minConfPct = Math.round(((snap.calibration && snap.calibration.autoSwitch && snap.calibration.autoSwitch.minConfidence) || 0.90) * 100);
    chkAuto.checked = Boolean(snap.calibration && snap.calibration.autoSwitch && snap.calibration.autoSwitch.enabled);
    chkAuto.onchange = () => {
      window.shotlabAPI.updateSettings({ autoSwitch: { enabled: chkAuto.checked } });
      showToast(chkAuto.checked ? `GSPro Auto-Switch ENABLED (≥${minConfPct}% conf)` : 'GSPro Auto-Switch paused');
    };

    const calClubs = new Set(stats.calibratedClubs || []);
    const picker = $('club-picker-grid');
    picker.innerHTML = CLUB_ORDER.map((c) => {
      const isAct = shot.activeClub === c;
      const isCal = calClubs.has(c);
      return `<button class="club-chip ${isAct ? 'active' : ''} ${isCal ? 'calibrated' : ''}" data-club="${esc(c)}" title="Tell ShotLab you actually hit ${esc(c)} to calibrate your bag">${esc(c)}</button>`;
    }).join('');
    picker.querySelectorAll('.club-chip').forEach((btn) => {
      btn.onclick = () => confirmClub(shot.id, btn.dataset.club);
    });

    $('cal-exact').textContent = stats.recentExactPct !== null ? `${stats.recentExactPct}%` : '—';
    $('cal-within1').textContent = stats.recentWithinOnePct !== null ? `${stats.recentWithinOnePct}%` : '—';
    $('cal-highconf').textContent = stats.highConfExactPct !== null ? `${stats.highConfExactPct}%` : '—';
    $('cal-count').textContent = `${stats.totalConfirmed}`;
    $('cal-progress-fill').style.width = `${Math.min(100, stats.recentExactPct || 0)}%`;

    bindHover($('club-why-trigger'), () => `
      <div class="hp-title">
        <span>How ShotLab Guessed ${esc(det.predictedLabel)}</span>
        <span class="tag tag-cyan">${Math.round(confPct)}%</span>
      </div>
      <div class="hp-body">${esc(det.summary)}</div>
      <table class="hp-table">
        ${(det.factorBreakdown || []).map((f) => `
          <tr>
            <td>${esc(f.label)}</td>
            <td><strong>${esc(f.actual)}${esc(f.unit)}</strong></td>
            <td>exp ${esc(f.expected)}</td>
            <td class="g-${esc(f.grade)}">${esc(f.match)}</td>
          </tr>
        `).join('')}
      </table>
    `);
  }

  function renderDeliveryBox(shot) {
    const del = shot.delivery;
    const box = $('box-delivery');
    setCardSeverity(box, del.severity);

    const nameEl = $('delivery-name');
    nameEl.textContent = del.name;
    nameEl.className = `card-title sev-${del.severity}`;

    const confEl = $('delivery-conf');
    confEl.textContent = `${Math.round((del.confidence || 0.8) * 100)}% conf`;
    confEl.className = `tag tag-${del.severity}`;

    $('dplane-wrap').innerHTML = window.ShotLabSVG.renderDPlaneDiagram(shot.metrics, shot.dplane);
    $('delivery-tagline').textContent = del.tagline;
    $('val-dynloft').textContent = del.estDynamicLoft !== null ? `${del.estDynamicLoft.toFixed(1)}°` : '—';
    $('val-shaftlean').textContent = del.estShaftLean !== null ? `${del.estShaftLean >= 0 ? '+' : ''}${del.estShaftLean.toFixed(1)}°` : '—';
    $('val-spinloft').textContent = del.spinLoft !== null ? `${del.spinLoft.toFixed(1)}°` : '—';

    $('delivery-cues').innerHTML = `
      <strong>Focus Cues</strong>
      <ul>${(del.cues || []).map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
    `;

    const whyHtml = () => `
      <div class="hp-title">
        <span>Delivery Analysis: ${esc(del.name)}</span>
        <span class="tag tag-${esc(del.severity)}">${Math.round((del.confidence || 0.8) * 100)}%</span>
      </div>
      <div class="hp-body">
        Inferred from VLA (${esc(shot.metrics.vla ?? '—')}°), AoA (${esc(shot.metrics.aoa ?? '—')}°), Backspin, Club Path, and ${esc(shot.clubSpec.label)} static loft (${esc(shot.clubSpec.staticLoft)}°):
      </div>
      <ul class="hp-list">${(del.evidence || []).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
      ${del.alternates && del.alternates.length ? `<div class="hp-body" style="margin-top:6px;color:#94a3b8;">Secondary tendencies: ${esc(del.alternates.join(', '))}</div>` : ''}
    `;
    bindHover($('delivery-why-trigger'), whyHtml);
    bindHover($('dplane-wrap'), whyHtml);
  }

  function renderStrikeBox(shot, snap) {
    const st = shot.strike;
    const pot = shot.potential;
    const box = $('box-strike');
    const handedness = (snap && snap.settings && snap.settings.handedness) || 'RH';
    setCardSeverity(box, st.severity);

    const lbl = $('strike-label');
    lbl.textContent = st.label;
    lbl.className = `card-title sev-${st.severity}`;

    const confEl = $('strike-conf');
    confEl.textContent = `${Math.round((st.confidence || 0.75) * 100)}% conf`;
    confEl.className = `tag tag-${st.severity}`;

    $('clubface-wrap').innerHTML = window.ShotLabSVG.renderClubfaceMap(st, shot.clubSpec, handedness);

    $('pot-actual').textContent = `${Math.round(pot.actualCarryYds)} yds`;
    if (pot.centerStrikeCarryYds) {
      const diff = Math.round(pot.centerStrikeCarryYds - pot.actualCarryYds);
      $('pot-center').textContent = `${Math.round(pot.centerStrikeCarryYds)} yds ${diff > 0 ? `(+${diff})` : ''}`;
    } else {
      $('pot-center').textContent = 'Need Club Speed';
    }
    const maxDiff = Math.round(pot.maxCarryAtSpeedYds - pot.actualCarryYds);
    $('pot-max').textContent = `${Math.round(pot.maxCarryAtSpeedYds)} yds ${maxDiff > 0 ? `(+${maxDiff})` : ''}`;
    $('pot-speed').textContent = pot.speedUpsideCarryYds
      ? `${Math.round(pot.speedUpsideCarryYds)} yds (@ ${pot.speedUpsideMph} mph)`
      : '—';

    $('pot-reasons').innerHTML = `
      <ul>${(pot.reasons || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    `;

    const whyHtml = () => `
      <div class="hp-title">
        <span>Strike Inference: ${esc(st.label)}</span>
        <span class="tag tag-${esc(st.severity)}">${Math.round((st.confidence || 0.75) * 100)}%</span>
      </div>
      <div class="hp-body">
        1-dot Launch Pro infers face impact by combining Smash Factor drop, D-Plane Gear Effect residual (${shot.dplane.gearEffectResidual !== null ? `${shot.dplane.gearEffectResidual >= 0 ? '+' : ''}${esc(shot.dplane.gearEffectResidual)}°` : 'n/a'}), Backspin, and VLA:
      </div>
      <ul class="hp-list">${(st.rationale || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    `;
    bindHover($('strike-why-trigger'), whyHtml);
    bindHover($('clubface-wrap'), whyHtml);
  }

  function renderScorecard(shot, snap) {
    const sc = shot.scorecard;
    $('scorecard-tier-label').textContent = `${sc.tierLabel} · ${shot.activeClubLabel}`;
    renderDataQuality(shot, snap);
    $('sum-green').textContent = `${sc.counts.green} Green`;
    $('sum-yellow').textContent = `${sc.counts.yellow} Yellow`;
    $('sum-red').textContent = `${sc.counts.red} Red`;

    const sessChip = $('session-summary-chip');
    const st = snap && snap.sessionStats;
    if (st && st.count > 0) {
      sessChip.classList.remove('hidden');
      const parts = [`Session (${st.count})`];
      if (st.avgScore !== null && st.avgScore !== undefined) parts.push(`Avg ${st.avgScore}`);
      if (st.totalSg !== null && st.totalSg !== undefined) parts.push(fmtSg(st.totalSg));
      if (typeof st.clubReads === 'number' && st.clubReads < st.count) parts.push(`Club read ${st.clubReads}/${st.count}`);
      sessChip.textContent = parts.join(' · ');
      sessChip.className = `tag ${st.avgSg !== null ? sgTagClass(st.avgSg) : 'tag-neutral'}`;
    } else {
      sessChip.classList.add('hidden');
    }

    const scoreNum = $('overall-score-num');
    scoreNum.textContent = `${sc.score}`;
    scoreNum.style.color = window.ShotLabSVG.gradeColor(sc.overallGrade);

    const grid = $('metrics-grid');
    grid.innerHTML = sc.cards.map((c, idx) => `
      <div class="metric-tile grade-${esc(c.grade)}" data-idx="${idx}">
        <div class="mt-top">
          <span class="mt-label">${esc(c.label)}</span>
          <span class="mt-src src-${esc(c.source)}">${esc(c.source === 'measured' ? 'BLP' : c.source === 'estimated' ? 'EST' : c.source === 'physics' ? 'PHYS' : c.source === 'missing' ? 'NO READ' : c.source)}</span>
        </div>
        <div class="mt-value">${esc(c.value)}<span class="mt-unit">${esc(c.unit)}</span></div>
        <div class="mt-foot">
          <span>${esc(c.target)}</span>
          <span class="mt-delta">${esc(c.delta || '')}</span>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.metric-tile').forEach((tile) => {
      const card = sc.cards[Number(tile.dataset.idx)];
      bindHover(tile, () => `
        <div class="hp-title">
          <span>${esc(card.label)}: ${esc(card.value)} ${esc(card.unit)}</span>
          <span class="tag tag-${esc(card.grade)}">${esc(String(card.grade || '').toUpperCase())}</span>
        </div>
        <div class="hp-body">${esc(card.tooltip)}</div>
        <div class="hp-body" style="margin-top:6px;color:#94a3b8;font-family:var(--mono);font-size:10.5px;">
          Target (${esc(sc.tierLabel)}): ${esc(card.target)} · Source: ${esc(card.source)}
        </div>
      `);
    });
  }

  function renderHistory(snap) {
    const tape = $('history-tape');
    const curId = snap.currentShot ? snap.currentShot.id : null;
    if (!snap.shots || snap.shots.length === 0) {
      tape.innerHTML = '<div class="micro-desc" style="padding:6px 2px;">No shots in tape yet — hit a ball on Launch Pro or click ▶ Test Shot.</div>';
      return;
    }
    tape.innerHTML = snap.shots.slice(0, 30).map((s) => {
      const sgVal = s.strokesGained && typeof s.strokesGained.sg === 'number' ? s.strokesGained.sg : null;
      const sgSnippet = sgVal !== null ? ` · ${fmtSg(sgVal, { prefix: 'SG ' })}` : '';
      return `
        <div class="hist-item ${s.id === curId ? 'selected' : ''}" data-shot-id="${esc(s.id)}">
          <div class="hist-mini-svg">
            ${window.ShotLabSVG.renderShotShapeIcon(s.shotShape.svgParams, { width: 38, height: 38, compact: true })}
          </div>
          <div class="hist-meta">
            <div class="hist-top">
              <span class="hist-club">${esc(s.activeClub)}${s.confirmedClub ? ' ✓' : ''}${s.isDemo ? '<span class="tag-demo">DEMO</span>' : ''}</span>
              <span class="hist-carry">${Math.round(s.metrics.effectiveCarry)}y</span>
            </div>
            <div class="hist-sub">${esc(s.shotShape.shortTag)} · ${esc(s.delivery.name)}</div>
            <div class="hist-sub">BS ${esc(s.metrics.ballSpeed?.toFixed(1) ?? '—')} · Sm ${esc(s.metrics.smash?.toFixed(2) ?? '—')} · ${esc(s.scorecard.score)}${esc(sgSnippet)}</div>
          </div>
        </div>
      `;
    }).join('');

    tape.querySelectorAll('.hist-item').forEach((item) => {
      item.onclick = () => window.shotlabAPI.selectShot(item.dataset.shotId);
    });
  }

  function renderEmptyState() {
    $('shape-name').textContent = 'Waiting for Shot';
    $('shape-name').className = 'card-title';
    $('shape-height-tag').textContent = '—';
    $('shape-sg-pill').classList.add('hidden');
    $('shape-quiet-badge').classList.add('hidden');
    $('shape-icon-wrap').innerHTML = '';
    $('side-traj-wrap').innerHTML = window.ShotLabSVG.renderSideTrajectory(null, null);
    $('stat-carry').textContent = '—';
    $('stat-total').textContent = 'Total — yds';
    $('stat-curve').textContent = '—';
    $('stat-offline').textContent = '—';
    $('stat-apex').textContent = '—';
    $('shape-desc').textContent = 'Hit a shot on your Launch Pro or click ▶ Test Shot.';
    $('club-pred-name').textContent = '—';
    $('club-conf-badge').textContent = '—%';
    $('club-top3').innerHTML = '';
    $('delivery-name').textContent = '—';
    $('delivery-tagline').textContent = 'Hit a shot to diagnose release & strike.';
    $('delivery-cues').innerHTML = '';
    $('strike-label').textContent = '—';
    $('pot-actual').textContent = '—';
    $('pot-center').textContent = '—';
    $('pot-max').textContent = '—';
    $('pot-speed').textContent = '—';
    $('pot-reasons').innerHTML = '';
    $('metrics-grid').innerHTML = '';
    $('overall-score-num').textContent = '—';
  }

  // --------------------------------------------------------------------------- Fullscreen Mat Glance Mode

  function renderScoreRingSvg(score, grade) {
    const val = Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0;
    const col = window.ShotLabSVG.gradeColor(grade);
    const r = 58;
    const circ = 2 * Math.PI * r;
    const dash = ((val / 100) * circ).toFixed(1);
    return `
      <svg viewBox="0 0 144 144" width="144" height="144" aria-label="Shot score ${val}">
        <circle cx="72" cy="72" r="${r}" fill="#090e19" stroke="#1e293b" stroke-width="10"/>
        <circle cx="72" cy="72" r="${r}" fill="none" stroke="${col}" stroke-width="10"
                stroke-linecap="round" stroke-dasharray="${dash} ${circ.toFixed(1)}"
                transform="rotate(-90 72 72)"/>
        <text x="72" y="76" text-anchor="middle" fill="#ffffff" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="38" font-weight="900">${Number.isFinite(score) ? val : '—'}</text>
        <text x="72" y="98" text-anchor="middle" fill="#94a3b8" font-size="11" font-weight="800" letter-spacing="1.4">SCORE</text>
      </svg>
    `;
  }

  function renderMatGlance(snap) {
    if (!matGlanceOpen || !snap) return;
    const shot = snap.currentShot;
    const settings = snap.settings || {};
    const mode = (shot && shot.practiceMode) || settings.practiceMode || 'real';
    const isQuiet = mode === 'almost';

    const modeEl = $('mg-mode');
    modeEl.textContent = isQuiet ? 'Kids Asleep (Quiet Mode)' : 'Real Balls';
    modeEl.className = `tag ${isQuiet ? 'tag-purple' : 'tag-green'}`;

    const feelEl = $('mg-feel');
    const activeFeelId = (shot && shot.feelId) || settings.activeFeelId;
    if (activeFeelId) {
      feelEl.classList.remove('hidden');
      feelEl.textContent = `Feel: ${feelLabelById(activeFeelId, snap)}`;
    } else {
      feelEl.classList.add('hidden');
    }

    if (!shot) {
      $('mg-club').textContent = '—';
      $('mg-shape-svg').innerHTML = '';
      $('mg-shape-name').textContent = 'Waiting for Shot';
      $('mg-shape-name').className = 'mg-shape-name';
      $('mg-shape-sub').textContent = 'Hit a shot on Launch Pro or press Test Shot';
      $('mg-score-ring').innerHTML = renderScoreRingSvg(NaN, 'neutral');
      $('mg-stats-grid').innerHTML = '';
      $('mg-del-name').textContent = '—';
      $('mg-del-cue').textContent = 'Ready on the mat.';
      return;
    }

    const m = shot.metrics || {};
    const fl = shot.flight || {};
    const sh = shot.shotShape || {};
    const del = shot.delivery || {};
    const sc = shot.scorecard || {};
    const sg = shot.strokesGained || {};

    $('mg-club').textContent = `${shot.activeClubLabel || shot.activeClub}`;
    $('mg-shape-svg').innerHTML = window.ShotLabSVG.renderShotShapeIcon(sh.svgParams, { width: 146, height: 146 });
    const shapeName = $('mg-shape-name');
    shapeName.textContent = sh.name || '—';
    shapeName.className = `mg-shape-name sev-${sh.severity || 'neutral'}`;
    const oDir = fl.offlineYds < -0.5 ? 'L' : fl.offlineYds > 0.5 ? 'R' : 'Center';
    $('mg-shape-sub').textContent = isQuiet
      ? `Start Line ${m.hla !== null ? `${Math.abs(m.hla).toFixed(1)}° ${m.hla < 0 ? 'L' : m.hla > 0 ? 'R' : ''}` : '—'} · Path ${fmtSigned(m.path, 1, '°')} · ${sh.heightTag || ''}`
      : `${Math.abs(fl.offlineYds || 0).toFixed(0)}y ${oDir} · Curve ${Math.abs(fl.curveYds || 0).toFixed(0)}y · Apex ${Math.round(fl.apexFt || 0)} ft`;

    $('mg-score-ring').innerHTML = renderScoreRingSvg(sc.score, sc.overallGrade);

    let stats;
    if (isQuiet) {
      const hlaDir = m.hla === null || Math.abs(m.hla) < 0.2 ? '' : (m.hla > 0 ? ' R' : ' L');
      stats = [
        {
          lbl: 'START LINE (HLA)',
          val: m.hla !== null ? `${Math.abs(m.hla).toFixed(1)}°${hlaDir}` : '—',
          sub: `Face ${fmtSigned(m.faceToTarget, 1, '°')}`,
          sev: m.hla !== null ? (Math.abs(m.hla) <= 2 ? 'green' : Math.abs(m.hla) <= 4 ? 'yellow' : 'red') : 'neutral',
        },
        {
          lbl: 'CLUB SPEED',
          val: m.clubSpeed !== null ? `${m.clubSpeed.toFixed(1)}` : '—',
          sub: 'mph · Tempo Focus',
          sev: 'cyan',
        },
        {
          lbl: 'CLUB PATH',
          val: fmtSigned(m.path, 1, '°'),
          sub: `Face-to-Path ${fmtSigned(m.faceToPath, 1, '°')}`,
          sev: m.path !== null ? (Math.abs(m.path) <= 3.5 ? 'green' : Math.abs(m.path) <= 6 ? 'yellow' : 'red') : 'neutral',
        },
        {
          lbl: 'ATTACK ANGLE',
          val: fmtSigned(m.aoa, 1, '°'),
          sub: `Shaft Lean ${fmtSigned(del.estShaftLean, 1, '°')}`,
          sev: del.severity || 'neutral',
        },
      ];
    } else {
      stats = [
        {
          lbl: 'CARRY',
          val: `${Math.round(m.effectiveCarry || 0)}y`,
          sub: `Total ${Math.round(m.totalYds || 0)}y · Apex ${Math.round(fl.apexFt || 0)}ft`,
          sev: sh.severity || 'cyan',
        },
        {
          lbl: 'BALL SPEED',
          val: m.ballSpeed !== null ? `${m.ballSpeed.toFixed(1)}` : '—',
          sub: m.clubSpeed !== null ? `Club Speed ${m.clubSpeed.toFixed(1)} mph` : 'mph',
          sev: 'cyan',
        },
        {
          lbl: 'SMASH FACTOR',
          val: m.smash !== null ? m.smash.toFixed(2) : '—',
          sub: m.totalSpin !== null ? `Spin ${Math.round(m.totalSpin)} rpm` : 'Strike Efficiency',
          sev: shot.strike ? shot.strike.severity : 'neutral',
        },
        {
          lbl: 'STROKES GAINED',
          val: typeof sg.sg === 'number' ? fmtSg(sg.sg, { prefix: '' }) : '—',
          sub: sg.resultLie ? `${sg.category || 'SHOT'} · ${sg.resultLie}${sg.proximityYds != null ? ` (${sg.proximityYds}y)` : ''}` : 'Broadie Baseline',
          sev: typeof sg.sg === 'number' ? (sg.sg >= 0.05 ? 'green' : sg.sg > -0.15 ? 'yellow' : 'red') : 'neutral',
        },
      ];
    }

    $('mg-stats-grid').innerHTML = stats.map((st) => `
      <div class="mg-stat-card sev-${esc(st.sev)}">
        <span class="mg-stat-lbl">${esc(st.lbl)}</span>
        <span class="mg-stat-val">${esc(st.val)}</span>
        <span class="mg-stat-sub">${esc(st.sub)}</span>
      </div>
    `).join('');

    const delBox = $('mg-delivery-box');
    delBox.className = `mg-delivery-box sev-${del.severity || 'neutral'}`;
    $('mg-del-name').textContent = del.name || '—';
    $('mg-del-cue').textContent = (del.cues && del.cues[0]) || del.tagline || '—';
  }

  function setMatGlanceOpen(open) {
    matGlanceOpen = Boolean(open);
    const el = $('mat-glance-overlay');
    el.classList.toggle('hidden', !matGlanceOpen);
    if (matGlanceOpen) {
      hidePopover();
      renderMatGlance(state);
    }
  }

  // --------------------------------------------------------------------------- Tab 2: Patterns & Dispersion Lab

  async function loadPatternsTab() {
    if (!window.shotlabAPI || typeof window.shotlabAPI.getPatterns !== 'function') return;
    try {
      const daysVal = Number(patternFilters.days);
      const res = await window.shotlabAPI.getPatterns({
        club: patternFilters.club,
        mode: patternFilters.mode,
        days: daysVal > 0 ? daysVal : null,
      });
      lastPatternsData = res;
      renderPatternsTab(res);
    } catch (err) {
      showToast(`Patterns error: ${err.message || err}`);
    }
  }

  function renderPatternsTab(data) {
    if (!data) return;
    const pattern = data.patterns || data.dispersion || data;
    const feels = data.feels || data.feelComparison || [];
    const trends = data.trends || data.sessionTrends || [];
    const fatigue = data.fatigue || data.fatigueCurve || [];

    const clubLabel = patternFilters.club === 'ALL'
      ? 'All Clubs'
      : `${patternFilters.club} (${CLUB_LABELS[patternFilters.club] || patternFilters.club})`;
    $('pat-disp-title').textContent = `${clubLabel} — 80% Dispersion Cone`;
    $('pat-disp-n').textContent = `${pattern.n || 0} shot${pattern.n === 1 ? '' : 's'}`;

    // 2D Dispersion Plot SVG
    const dispWrap = $('pat-dispersion-svg');
    if (window.ShotLabSVG && typeof window.ShotLabSVG.renderDispersionPlot === 'function') {
      dispWrap.innerHTML = window.ShotLabSVG.renderDispersionPlot(pattern, { width: 420, height: 290 });
    } else {
      dispWrap.innerHTML = '<div class="micro-desc" style="padding:20px;">Dispersion SVG renderer unavailable.</div>';
    }

    // Summary stats grid
    const ell = pattern.ellipse80;
    const offVal = pattern.meanOffline;
    const offStr = typeof offVal === 'number'
      ? `${Math.abs(offVal).toFixed(1)}y ${offVal < -0.2 ? 'L' : offVal > 0.2 ? 'R' : 'C'}`
      : '—';
    const coneStr = ell ? `${Math.round(ell.widthYds)}y × ${Math.round(ell.depthYds)}y` : '—';

    $('pat-summary-stats').innerHTML = `
      <div class="disp-stat-box">
        <span class="lbl">Mean Carry</span>
        <span class="val">${esc(pattern.meanCarry != null ? `${Math.round(pattern.meanCarry)} yds` : '—')}</span>
      </div>
      <div class="disp-stat-box">
        <span class="lbl">Mean Offline</span>
        <span class="val">${esc(offStr)}</span>
      </div>
      <div class="disp-stat-box">
        <span class="lbl">80% Width × Depth</span>
        <span class="val">${esc(coneStr)}</span>
      </div>
      <div class="disp-stat-box">
        <span class="lbl">Avg SG / Score</span>
        <span class="val ${esc(sgClass(pattern.avgSg))}">${esc(fmtSg(pattern.avgSg, { prefix: '' }))} <span style="font-size:12px;color:#94a3b8;">/ ${esc(pattern.avgScore ?? '—')}</span></span>
      </div>
    `;
    $('pat-decade-advice').textContent = pattern.decadeAdvice || 'Log real-ball swings to generate your DECADE aim offset.';

    // Root-Cause Stroke-Leak Ranking
    const leaksEl = $('pat-fault-leaks');
    const leaks = Array.isArray(pattern.faultLeaks) ? pattern.faultLeaks : [];
    if (!leaks.length) {
      leaksEl.innerHTML = '<div class="micro-desc" style="padding:12px 2px;">No swing delivery records match the current filter yet.</div>';
    } else {
      const maxCount = Math.max(1, ...leaks.map((l) => l.count || 0));
      leaksEl.innerHTML = leaks.slice(0, 7).map((l) => {
        const pctWidth = Math.max(6, Math.round(((l.count || 0) / maxCount) * 100));
        const isGood = l.deliveryId === 'pure_compression' || l.deliveryId === 'solid_delivery' || (typeof l.avgSg === 'number' && l.avgSg >= 0.03);
        const barCls = isGood ? 'leak-green' : (typeof l.avgSg === 'number' && l.avgSg <= -0.15 ? 'leak-red' : 'leak-yellow');
        const sgText = typeof l.avgSg === 'number' ? `Avg ${fmtSg(l.avgSg)}` : 'No SG';
        const totalText = typeof l.totalSg === 'number' ? `Total ${fmtSg(l.totalSg, { prefix: '' })}` : '';
        const lostText = l.avgLostYds > 1 ? ` · −${l.avgLostYds}y` : '';
        return `
          <div class="leak-row">
            <div class="leak-top">
              <span class="leak-name">${esc(l.deliveryName || l.deliveryId)}</span>
              <span class="leak-meta">
                ${esc(l.count)} shots (${esc(l.pct)}%) ·
                <span class="${esc(sgClass(l.avgSg))}">${esc(sgText)}</span>${totalText ? ` · ${esc(totalText)}` : ''}${esc(lostText)}
              </span>
            </div>
            <div class="leak-bar-track">
              <div class="leak-bar-fill ${esc(barCls)}" style="width:${pctWidth}%"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    // A/B Active Feel Verdicts Table
    const feelsTbody = $('pat-feels-tbody');
    if (!feels.length) {
      feelsTbody.innerHTML = '<tr><td colspan="8" class="micro-desc" style="padding:14px;">No shots found for this filter. Tag an Active Feel in the sub-header to start A/B testing!</td></tr>';
    } else {
      const taggedFeels = feels.filter((f) => f.feelId !== null);
      let winnerFeelId = null;
      if (taggedFeels.length > 0) {
        const best = [...taggedFeels].sort((a, b) => {
          const scoreDiff = (b.avgScore ?? -1) - (a.avgScore ?? -1);
          if (scoreDiff !== 0) return scoreDiff;
          return (b.avgSg ?? -99) - (a.avgSg ?? -99);
        })[0];
        if (best) winnerFeelId = best.feelId;
      }

      feelsTbody.innerHTML = feels.map((f) => {
        const isWinner = winnerFeelId !== null && f.feelId === winnerFeelId;
        const displayName = f.feelId ? feelLabelById(f.feelId, state) : (f.label || 'Baseline (No Feel Tagged)');
        return `
          <tr class="${isWinner ? 'winner-row' : ''}">
            <td>
              <strong>${esc(displayName)}</strong>
              ${isWinner ? '<span class="winner-badge">★ #1 FEEL</span>' : ''}
            </td>
            <td class="num">${esc(f.n)}</td>
            <td class="num">${esc(f.avgScore ?? '—')}</td>
            <td class="num ${esc(sgClass(f.avgSg))}">${esc(fmtSg(f.avgSg, { prefix: '' }))}</td>
            <td class="num">${esc(fmtNum(f.avgSmash, 2))}</td>
            <td class="num">${esc(f.avgCarry != null ? `${Math.round(f.avgCarry)}y` : '—')}</td>
            <td class="num">${esc(f.width80Yds != null ? `${Math.round(f.width80Yds)}y` : '—')}</td>
            <td class="num">${esc(f.faultPct != null ? `${f.faultPct}%` : '—')}</td>
          </tr>
        `;
      }).join('');
    }

    // Trend Sparkline
    renderTrendSparklineArea(trends);

    // Warmup & Fatigue Curve
    const fatEl = $('pat-fatigue-bars');
    if (!fatigue.length) {
      fatEl.innerHTML = '<div class="micro-desc">No session fatigue data yet.</div>';
    } else {
      const scores = fatigue.map((b) => b.avgScore).filter((v) => typeof v === 'number');
      const peakScore = scores.length ? Math.max(...scores) : 100;
      fatEl.innerHTML = fatigue.map((b) => {
        const scVal = typeof b.avgScore === 'number' ? b.avgScore : 0;
        const isDrop = b.n > 0 && scores.length >= 2 && (b.id === '46-70' || b.id === '71+') && scVal < peakScore - 5;
        const pct = b.n > 0 ? Math.max(8, Math.min(100, scVal)) : 0;
        const meta = b.n > 0
          ? `Sc ${b.avgScore ?? '—'} · Sm ${fmtNum(b.avgSmash, 2)} (${b.n})`
          : '0 shots';
        return `
          <div class="fatigue-row">
            <span class="fatigue-lbl">${esc(b.label || b.id)}</span>
            <div class="fatigue-track">
              <div class="fatigue-fill ${isDrop ? 'fat-warn' : ''}" style="width:${pct}%"></div>
            </div>
            <span class="fatigue-val">${esc(meta)}</span>
          </div>
        `;
      }).join('');
    }
  }

  function renderTrendSparklineArea(trends) {
    const wrap = $('pat-trend-svg');
    if (window.ShotLabSVG && typeof window.ShotLabSVG.renderTrendSparkline === 'function') {
      wrap.innerHTML = window.ShotLabSVG.renderTrendSparkline(trends || [], activeTrendMetric, {
        width: 440,
        height: 118,
      });
    } else {
      wrap.innerHTML = '<div class="micro-desc">Trend sparkline renderer unavailable.</div>';
    }
  }

  // --------------------------------------------------------------------------- Tab 3: 14-Club Bag Gapping

  async function loadGappingTab() {
    if (!window.shotlabAPI || typeof window.shotlabAPI.getBagGapping !== 'function') return;
    try {
      const daysVal = Number(gappingFilters.days);
      const res = await window.shotlabAPI.getBagGapping({
        mode: gappingFilters.mode,
        days: daysVal > 0 ? daysVal : null,
      });
      const clubs = Array.isArray(res) ? res : ((res && (res.clubs || res.gapping)) || []);
      renderGappingTab(clubs);
    } catch (err) {
      showToast(`Bag Gapping error: ${err.message || err}`);
    }
  }

  function renderGappingTab(clubs) {
    const tbody = $('gapping-tbody');
    const populated = clubs.filter((c) => c.n > 0);
    const alerts = clubs.filter((c) => Boolean(c.gapAlert)).length;
    $('gap-summary-badge').textContent = `${populated.length} / ${clubs.length || 14} clubs tracked${alerts ? ` · ${alerts} gap alert${alerts === 1 ? '' : 's'}` : ''}`;
    $('gap-summary-badge').className = `tag ${alerts > 0 ? 'tag-yellow' : 'tag-cyan'}`;

    const maxCarry = Math.max(240, ...clubs.map((c) => c.avgCarry || 0));

    tbody.innerHTML = clubs.map((c) => {
      const empty = !c.n;
      const barPct = c.avgCarry ? Math.max(4, Math.min(100, Math.round((c.avgCarry / maxCarry) * 100))) : 0;
      const barCat = ['DR', '3W', '5W', '4H'].includes(c.club)
        ? 'cat-wood'
        : ['PW', 'GW', 'SW', 'LW'].includes(c.club) ? 'cat-wedge' : '';

      let gapHtml = '<span style="color:#64748b;">—</span>';
      if (c.gapAlert) {
        const isOverlap = /overlap/i.test(c.gapAlert) || (c.gapToNextYds !== null && c.gapToNextYds < 7);
        gapHtml = `<span class="tag ${isOverlap ? 'tag-red' : 'tag-yellow'}">${esc(c.gapAlert)}</span>`;
      } else if (c.gapToNextYds !== null && c.gapToNextYds !== undefined) {
        gapHtml = `<span class="tag tag-green">${esc(c.gapToNextYds)}y</span>`;
      }

      const stopCls = c.stoppingPower === 'Drop & Stop'
        ? 'tag-green'
        : c.stoppingPower === 'Holds Green'
          ? 'tag-cyan'
          : c.stoppingPower === 'Runs Out'
            ? 'tag-yellow'
            : 'tag-neutral';

      return `
        <tr class="${empty ? 'row-empty' : ''}">
          <td>
            <div class="club-cell">
              <span class="club-code-pill">${esc(c.club)}</span>
              <span class="club-sub-lbl">${esc(c.label || '')}</span>
            </div>
          </td>
          <td class="num">${esc(c.n)}</td>
          <td class="num"><strong>${esc(c.avgCarry != null ? `${Math.round(c.avgCarry)}y` : '—')}</strong></td>
          <td>
            <div class="gap-bar-wrap">
              <div class="gap-bar-fill ${esc(barCat)}" style="width:${barPct}%"></div>
            </div>
          </td>
          <td>${gapHtml}</td>
          <td class="num">${esc(c.avgTotal != null ? `${Math.round(c.avgTotal)}y` : '—')}</td>
          <td class="num">${esc(fmtNum(c.avgBallSpeed, 1))}</td>
          <td class="num">${esc(fmtNum(c.avgSmash, 2))}</td>
          <td class="num">${esc(c.avgSpin != null ? `${Math.round(c.avgSpin)}` : '—')}</td>
          <td class="num">${esc(c.avgDescent != null ? `${c.avgDescent.toFixed(1)}°` : '—')}</td>
          <td><span class="tag ${esc(stopCls)}">${esc(c.stoppingPower || '—')}</span></td>
          <td class="num">${esc(c.width80Yds != null ? `${Math.round(c.width80Yds)}y` : '—')}</td>
          <td class="num ${esc(sgClass(c.avgSg))}">${esc(fmtSg(c.avgSg, { prefix: '' }))}</td>
        </tr>
      `;
    }).join('');
  }

  // --------------------------------------------------------------------------- Tab 4: Synced Kinovea Video Compare

  function buildMediaUrl(row, angle, mediaBaseUrl) {
    if (!row) return null;
    const hasDirectKey = angle === 'dtl'
      ? ('dtlUrl' in row || 'dtl_url' in row)
      : ('foUrl' in row || 'fo_url' in row);
    const direct = angle === 'dtl' ? (row.dtlUrl || row.dtl_url) : (row.foUrl || row.fo_url);
    if (hasDirectKey) {
      return (typeof direct === 'string' && /^http:\/\/127\.0\.0\.1:\d+\//.test(direct)) ? direct : null;
    }
    const clipName = angle === 'dtl' ? (row.clip_dtl || row.clipDtl) : (row.clip_fo || row.clipFo);
    if (!clipName || typeof clipName !== 'string') return null;
    const obsPort = (state && state.obsPort) || 8766;
    const base = (mediaBaseUrl && /^http:\/\/127\.0\.0\.1:\d+/.test(mediaBaseUrl))
      ? mediaBaseUrl.replace(/\/+$/, '')
      : `http://127.0.0.1:${obsPort}/media`;
    const sessionDate = row.sessionDate || row.session_date || (row.ts ? String(row.ts).slice(0, 10) : null);
    const segments = clipName.replace(/\\/g, '/').split('/').filter(Boolean);
    if (sessionDate && segments[0] !== sessionDate) {
      segments.unshift(sessionDate);
    }
    return `${base}/${segments.map((s) => encodeURIComponent(s)).join('/')}`;
  }

  function getActiveVideos() {
    const vids = [];
    const dtl = $('vid-player-dtl');
    const fo = $('vid-player-fo');
    const best = $('vid-player-best');
    if (dtl && dtl.dataset.loaded === '1') vids.push(dtl);
    if (fo && fo.dataset.loaded === '1') vids.push(fo);
    if ($('chk-sync-best') && $('chk-sync-best').checked && best && best.dataset.loaded === '1') {
      vids.push(best);
    }
    return vids;
  }

  function setVideoSource(videoEl, missingEl, url) {
    if (!videoEl) return;
    if (!videoEl.dataset.mediaListenersBound) {
      videoEl.dataset.mediaListenersBound = '1';
      videoEl.addEventListener('error', () => {
        if (!videoEl.dataset.srcUrl) return;
        videoEl.dataset.loaded = '0';
        videoEl.classList.add('hidden');
        if (missingEl) missingEl.classList.remove('hidden');
        updateVideoTimeReadout();
        updatePlayButtonLabel();
      });
      videoEl.addEventListener('loadedmetadata', () => {
        updateVideoTimeReadout();
      });
    }

    if (url) {
      if (videoEl.dataset.srcUrl !== url) {
        videoEl.pause();
        videoEl.src = url;
        videoEl.dataset.srcUrl = url;
        videoEl.load();
        videoEl.dataset.loaded = '1';
        videoEl.classList.remove('hidden');
        if (missingEl) missingEl.classList.add('hidden');
      }
      videoEl.playbackRate = videoState.playbackRate;
    } else {
      videoEl.pause();
      videoEl.dataset.srcUrl = '';
      videoEl.dataset.loaded = '0';
      videoEl.removeAttribute('src');
      videoEl.load();
      videoEl.classList.add('hidden');
      if (missingEl) missingEl.classList.remove('hidden');
    }
  }

  function updateVideoTimeReadout() {
    const vids = getActiveVideos();
    const primary = vids[0];
    const el = $('vid-time-readout');
    if (!primary || !Number.isFinite(primary.currentTime)) {
      el.textContent = '0.00s';
      return;
    }
    const dur = Number.isFinite(primary.duration) ? ` / ${primary.duration.toFixed(2)}s` : '';
    el.textContent = `${primary.currentTime.toFixed(2)}s${dur}`;
  }

  function updatePlayButtonLabel() {
    const vids = getActiveVideos();
    const playing = vids.some((v) => !v.paused && !v.ended);
    $('btn-vid-play').textContent = playing ? '⏸ Pause Synced' : '▶ Play Synced';
  }

  async function loadVideoTab() {
    if (!window.shotlabAPI || typeof window.shotlabAPI.getVideoCompare !== 'function') return;
    try {
      const res = await window.shotlabAPI.getVideoCompare({
        shotId: videoState.selectedShotId,
        club: videoState.club,
      });
      videoState.data = res;
      renderVideoTab(res);
    } catch (err) {
      showToast(`Video Compare error: ${err.message || err}`);
    }
  }

  function normalizeVideoItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const sessionDate = raw.sessionDate || raw.session_date || (raw.ts ? String(raw.ts).slice(0, 10) : '');
    const item = {
      id: raw.id,
      ts: raw.ts || null,
      sessionDate,
      club: raw.club || raw.activeClub || '—',
      score: raw.score ?? null,
      carryYds: raw.carryYds ?? raw.carry_yds ?? null,
      ballSpeed: raw.ballSpeed ?? raw.ball_speed ?? null,
      clubSpeed: raw.clubSpeed ?? raw.club_speed ?? null,
      smash: raw.smash ?? null,
      path: raw.path ?? null,
      aoa: raw.aoa ?? null,
      estShaftLean: raw.estShaftLean ?? raw.est_shaft_lean ?? null,
      shotShape: raw.shotShape ?? raw.shot_shape ?? null,
      deliveryName: raw.deliveryName ?? raw.delivery_name ?? null,
      sgShot: raw.sgShot ?? raw.sg_shot ?? null,
      isGoTo: Boolean(raw.isGoTo ?? raw.is_goto),
      clipDtl: raw.clipDtl ?? raw.clip_dtl ?? null,
      clipFo: raw.clipFo ?? raw.clip_fo ?? null,
    };
    if ('dtlUrl' in raw || 'dtl_url' in raw) {
      item.dtlUrl = raw.dtlUrl ?? raw.dtl_url ?? null;
    }
    if ('foUrl' in raw || 'fo_url' in raw) {
      item.foUrl = raw.foUrl ?? raw.fo_url ?? null;
    }
    return item;
  }

  function hasLinkedClip(item) {
    if (!item) return false;
    const hasDtl = 'dtlUrl' in item ? Boolean(item.dtlUrl) : Boolean(item.clipDtl);
    const hasFo = 'foUrl' in item ? Boolean(item.foUrl) : Boolean(item.clipFo);
    return hasDtl || hasFo;
  }

  function renderVideoTab(res) {
    const rawClips = (res && (res.recentWithClips || res.recentClips || res.clips || res.recentShots)) || [];
    const clips = rawClips.map(normalizeVideoItem).filter(Boolean);
    const rawCur = (res && (res.current || res.shot)) || null;
    const curNorm = normalizeVideoItem(rawCur);
    const cur = (curNorm && hasLinkedClip(curNorm))
      ? curNorm
      : (clips[0] || curNorm);
    const best = normalizeVideoItem((res && (res.best || res.bestShot)) || null);
    const mediaBaseUrl = res && res.mediaBaseUrl;

    const emptyEl = $('vid-empty-state');
    const wsEl = $('vid-workspace');
    const promoteBtn = $('btn-promote-goto');

    const curHasClip = hasLinkedClip(cur);
    if (clips.length === 0 && !curHasClip) {
      emptyEl.classList.remove('hidden');
      wsEl.classList.add('hidden');
      promoteBtn.disabled = true;
      setVideoSource($('vid-player-dtl'), $('vid-dtl-missing'), null);
      setVideoSource($('vid-player-fo'), $('vid-fo-missing'), null);
      setVideoSource($('vid-player-best'), $('vid-best-missing'), null);
      return;
    }

    emptyEl.classList.add('hidden');
    wsEl.classList.remove('hidden');
    if (cur) videoState.selectedShotId = cur.id;

    // Left sidebar clip list
    $('vid-list-count').textContent = `${clips.length}`;
    const listEl = $('vid-clips-list');
    listEl.innerHTML = clips.map((c) => {
      const isSel = cur && c.id === cur.id;
      const hasDtl = 'dtlUrl' in c ? Boolean(c.dtlUrl) : Boolean(c.clipDtl);
      const hasFo = 'foUrl' in c ? Boolean(c.foUrl) : Boolean(c.clipFo);
      const star = c.isGoTo ? '<span class="goto-star" title="My-Go-To Reference Swing">★</span>' : '';
      return `
        <div class="vid-clip-item ${isSel ? 'selected' : ''}" data-vid-shot-id="${esc(c.id)}">
          <div class="vid-clip-top">
            <span>${esc(c.club)} · ${esc(c.carryYds != null ? `${Math.round(c.carryYds)}y` : '—')}${star}</span>
            <span style="color:var(--cyan);font-family:var(--mono);">Sc ${esc(c.score ?? '—')}</span>
          </div>
          <div class="vid-clip-sub">
            <span>${esc(c.sessionDate)}</span>
            <span>${hasDtl ? 'DTL' : ''}${hasDtl && hasFo ? '+' : ''}${hasFo ? 'FO' : ''}</span>
          </div>
          <div class="vid-clip-sub">
            <span>${esc(c.deliveryName || c.shotShape || '—')}</span>
            <span class="${esc(sgClass(c.sgShot))}">${esc(fmtSg(c.sgShot, { prefix: '' }))}</span>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.vid-clip-item').forEach((item) => {
      item.onclick = () => {
        videoState.selectedShotId = item.dataset.vidShotId;
        loadVideoTab();
      };
    });

    // Current Shot Dual-Angle Players
    const curSummary = cur
      ? `${cur.club} · ${cur.carryYds != null ? `${Math.round(cur.carryYds)}y` : '—'} · Score ${cur.score ?? '—'} · ${cur.deliveryName || ''}`
      : '—';
    $('vid-dtl-title').textContent = curSummary;
    $('vid-fo-title').textContent = curSummary;

    const dtlUrl = buildMediaUrl(cur, 'dtl', mediaBaseUrl);
    const foUrl = buildMediaUrl(cur, 'fo', mediaBaseUrl);
    setVideoSource($('vid-player-dtl'), $('vid-dtl-missing'), dtlUrl);
    setVideoSource($('vid-player-fo'), $('vid-fo-missing'), foUrl);

    promoteBtn.disabled = !cur;
    promoteBtn.textContent = cur && cur.isGoTo ? '★ My-Go-To Saved' : '★ Promote to My-Go-To';

    // Compare vs Personal Best
    const bestUrl = buildMediaUrl(best, 'dtl', mediaBaseUrl) || buildMediaUrl(best, 'fo', mediaBaseUrl);
    setVideoSource($('vid-player-best'), $('vid-best-missing'), bestUrl);

    if (best) {
      $('vid-best-headline').textContent = `Current ${cur ? cur.club : ''} vs Personal Best (${best.sessionDate || ''}${best.isGoTo ? ' ★ Go-To' : ''})`;
      $('vid-best-meta').textContent = `Best: ${best.carryYds != null ? `${Math.round(best.carryYds)}y` : '—'} · Score ${best.score ?? '—'} · ${best.deliveryName || '—'} · ${fmtSg(best.sgShot)}`;
    } else {
      $('vid-best-headline').textContent = `Personal Best Comparison (${cur ? cur.club : 'Club'})`;
      $('vid-best-meta').textContent = 'Log more swings with this club to unlock side-by-side comparison vs your personal best.';
    }

    // Telemetry Delta Table
    const rows = [
      { label: 'Ball Speed', key: 'ballSpeed', digits: 1, unit: ' mph', higherBetter: true },
      { label: 'Club Speed', key: 'clubSpeed', digits: 1, unit: ' mph', higherBetter: true },
      { label: 'Smash Factor', key: 'smash', digits: 2, unit: '', higherBetter: true },
      { label: 'Club Path', key: 'path', digits: 1, unit: '°', higherBetter: null },
      { label: 'Attack Angle', key: 'aoa', digits: 1, unit: '°', higherBetter: null },
      { label: 'Shaft Lean', key: 'estShaftLean', digits: 1, unit: '°', higherBetter: null },
      { label: 'Carry', key: 'carryYds', digits: 1, unit: ' yds', higherBetter: true },
      { label: 'Shot Score', key: 'score', digits: 0, unit: '', higherBetter: true },
      { label: 'Strokes Gained', key: 'sgShot', digits: 2, unit: '', higherBetter: true },
    ];

    $('vid-delta-tbody').innerHTML = rows.map((r) => {
      const cv = cur && typeof cur[r.key] === 'number' && Number.isFinite(cur[r.key]) ? cur[r.key] : null;
      const bv = best && typeof best[r.key] === 'number' && Number.isFinite(best[r.key]) ? best[r.key] : null;
      const diff = (cv !== null && bv !== null) ? (cv - bv) : null;
      let deltaCls = 'sg-flat';
      if (diff !== null && r.higherBetter === true) {
        deltaCls = diff > 0.01 ? 'sg-pos' : diff < -0.01 ? 'sg-neg' : 'sg-flat';
      }
      return `
        <tr>
          <td><strong>${esc(r.label)}</strong></td>
          <td class="num">${esc(cv !== null ? fmtNum(cv, r.digits, r.unit) : '—')}</td>
          <td class="num">${esc(bv !== null ? fmtNum(bv, r.digits, r.unit) : '—')}</td>
          <td class="num ${esc(deltaCls)}">${esc(diff !== null ? fmtSigned(diff, r.digits, r.unit) : '—')}</td>
        </tr>
      `;
    }).join('');

    updateVideoTimeReadout();
    updatePlayButtonLabel();
  }

  // --------------------------------------------------------------------------- OBS & Settings Modals

  function renderObsModal(snap) {
    const warn = $('obs-server-warning');
    if (snap.obsServerError) {
      warn.textContent = `⚠ ${snap.obsServerError} — Close the conflicting app or set SHOTLAB_OBS_PORT to another port.`;
      warn.classList.remove('hidden');
    } else {
      warn.classList.add('hidden');
    }

    const base = `http://127.0.0.1:${snap.obsPort || 8766}/obs/overlay.html`;
    const widgets = [
      {
        title: 'Full Broadcast Lower-Third HUD',
        desc: 'Shot shape graphic, club, carry/total, smash/ball/club speed, spin, and delivery verdict (1280×156)',
        url: `${base}?widget=hud`,
      },
      {
        title: 'Shot Shape & Flight Badge',
        desc: 'Compact curved flight SVG + Shot Shape name + Curve/Offline yards (320×170)',
        url: `${base}?widget=shape`,
      },
      {
        title: 'Red / Yellow / Green Key Metrics Strip',
        desc: 'Color-coded Carry, Ball Speed, Club Speed, Smash, VLA, Spin, AoA, Path strip (960×105)',
        url: `${base}?widget=metrics`,
      },
      {
        title: 'Coach Diagnosis & Miss-Hit Card',
        desc: 'Release verdict (Flipping/Compression/etc.), inferred face strike, and yards left on table (440×190)',
        url: `${base}?widget=diagnosis`,
      },
      {
        title: 'Compact Corner PiP Stack',
        desc: 'Vertical corner overlay designed to sit alongside your Kinovea DTL+FO replay PiP (330×420)',
        url: `${base}?widget=compact`,
      },
      {
        title: 'Club Auto-Detector Pill',
        desc: 'Predicted/Confirmed club + confidence % badge (280×92)',
        url: `${base}?widget=club`,
      },
      {
        title: 'Broadcast Shot Tracer Arc',
        desc: 'Animated 3D-projected glowing ball-flight tracer arc with apex & carry callout (640×360)',
        url: `${base}?widget=tracer`,
      },
      {
        title: 'Live Session 2D Dispersion Plot',
        desc: 'Real-time bird’s-eye shot scatter, 80% DECADE ellipse, and target aim marker (360×310)',
        url: `${base}?widget=dispersion`,
      },
      {
        title: 'Session Stats Broadcast Ticker',
        desc: 'Slim ESPN-style bottom ticker with session count, avg score, avg carry, avg SG, active feel, and DB total (1280×48)',
        url: `${base}?widget=ticker`,
      },
    ];

    $('obs-url-list').innerHTML = widgets.map((w, i) => `
      <div class="obs-row">
        <div class="obs-info">
          <div class="obs-title">${esc(w.title)}</div>
          <div class="obs-desc">${esc(w.desc)}</div>
          <div class="obs-url">${esc(w.url)}</div>
        </div>
        <div class="obs-btns">
          <button class="btn btn-sm btn-accent" data-copy-obs="${i}">Copy URL</button>
          <button class="btn btn-sm btn-ghost" data-open-obs="${i}">Preview</button>
        </div>
      </div>
    `).join('');

    $('obs-url-list').querySelectorAll('[data-copy-obs]').forEach((b) => {
      b.onclick = () => {
        window.shotlabAPI.copyText(widgets[Number(b.dataset.copyObs)].url);
        showToast('Copied OBS Browser Source URL!');
      };
    });
    $('obs-url-list').querySelectorAll('[data-open-obs]').forEach((b) => {
      b.onclick = () => window.shotlabAPI.openExternal(widgets[Number(b.dataset.openObs)].url);
    });
  }

  function renderSettingsModal(snap) {
    $('set-driver-speed').value = snap.calibration.driverSpeedMph || 98;
    $('set-handedness').value = snap.settings.handedness || 'RH';
    $('set-altitude').value = snap.settings.altitudeFt || 0;
    $('set-autoswitch-conf').value = Math.round(((snap.calibration.autoSwitch && snap.calibration.autoSwitch.minConfidence) || 0.90) * 100);
    $('set-obs-autohide').value = snap.settings.obsAutoHideSec || 0;
    $('set-audio-chimes').checked = Boolean(snap.settings.audioChimes);
    $('set-audio-caddie').checked = Boolean(snap.settings.audioCaddie);

    const customLofts = (snap.calibration && snap.calibration.customLofts) || {};
    $('custom-lofts-grid').innerHTML = CLUB_ORDER.map((c) => {
      const val = customLofts[c] != null ? customLofts[c] : '';
      return `
        <label class="loft-field">
          <span>${esc(c)}</span>
          <input type="number" data-loft-club="${esc(c)}" min="5" max="70" step="0.5" placeholder="${esc(DEFAULT_LOFTS[c])}°" value="${esc(val)}" />
        </label>
      `;
    }).join('');

    const clubs = snap.calibration.clubs || {};
    $('cal-clubs-badges').innerHTML = CLUB_ORDER.map((c) => {
      const n = clubs[c] ? clubs[c].n : 0;
      const cls = n >= 3 ? 'tag-green' : n > 0 ? 'tag-yellow' : '';
      return `<span class="tag ${esc(cls)}">${esc(c)}: ${esc(n)}</span>`;
    }).join('');
  }

  // --------------------------------------------------------------------------- Master Render

  function scheduleActiveDataTabRefresh() {
    if (activeTab === 'live') return;
    if (tabRefreshTimer) clearTimeout(tabRefreshTimer);
    tabRefreshTimer = setTimeout(() => {
      tabRefreshTimer = null;
      if (activeTab === 'patterns') loadPatternsTab();
      else if (activeTab === 'gapping') loadGappingTab();
      else if (activeTab === 'video') loadVideoTab();
    }, 350);
  }

  function render(snap) {
    if (!snap) return;
    hidePopover();
    const prevTopId = state && state.shots && state.shots[0] ? state.shots[0].id : null;
    const nextTopId = snap.shots && snap.shots[0] ? snap.shots[0].id : null;
    const prevClipsLinked = state && state.dbSummary ? state.dbSummary.clipsLinked : null;
    const nextClipsLinked = snap.dbSummary ? snap.dbSummary.clipsLinked : null;

    state = snap;
    maybePlayShotAudio(snap);

    renderTopbar(snap);
    renderSubbar(snap);
    renderFaultBanner(snap);
    renderHistory(snap);

    if (!snap.currentShot) {
      renderEmptyState();
    } else {
      renderShotShapeBox(snap.currentShot, snap);
      renderClubBox(snap.currentShot, snap);
      renderDeliveryBox(snap.currentShot);
      renderStrikeBox(snap.currentShot, snap);
      renderScorecard(snap.currentShot, snap);
    }

    if (matGlanceOpen) {
      renderMatGlance(snap);
    }

    const shotChanged = Boolean(nextTopId && nextTopId !== prevTopId);
    const clipsChanged = prevClipsLinked !== null && nextClipsLinked !== null && nextClipsLinked !== prevClipsLinked;
    if (shotChanged || clipsChanged) {
      scheduleActiveDataTabRefresh();
    }
  }

  // --------------------------------------------------------------------------- Actions & Event Wiring

  function switchTab(tabId) {
    activeTab = tabId;
    hidePopover();
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      const isAct = btn.dataset.tab === tabId;
      btn.classList.toggle('active', isAct);
      btn.setAttribute('aria-selected', isAct ? 'true' : 'false');
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      const isAct = panel.id === `tab-${tabId}`;
      panel.classList.toggle('hidden', !isAct);
      panel.classList.toggle('active', isAct);
    });
    if (tabId === 'patterns') loadPatternsTab();
    else if (tabId === 'gapping') loadGappingTab();
    else if (tabId === 'video') loadVideoTab();
  }

  async function confirmClub(shotId, actualClub) {
    const res = await window.shotlabAPI.confirmClub(shotId, actualClub);
    if (!res || !res.ok) return;
    if (res.alreadyConfirmed) return;
    if (res.isDemoPreview) {
      showToast(`Demo preview updated to ${actualClub} (synthetic demo shots are not saved to calibration)`);
    } else if (res.updatedOnly) {
      showToast(`Updated shot club to ${actualClub}`);
    } else {
      const st = res.calibrationStats;
      showToast(`Calibrated ${actualClub}! Rolling accuracy: ${st.recentExactPct ?? '—'}% (${st.totalConfirmed} shots)`);
    }
  }

  async function runSyncHistory() {
    if (!window.shotlabAPI || typeof window.shotlabAPI.syncHistory !== 'function') return;
    showToast('Syncing historical SimWatch sessions into local DB…');
    try {
      const res = await window.shotlabAPI.syncHistory();
      if (!res || res.ok === false) {
        showToast((res && res.error) ? `Sync failed: ${res.error}` : 'Sync failed');
        return;
      }
      const imported = (res.shotsImported ?? res.imported) || 0;
      const files = (res.filesScanned ?? res.files) || 0;
      showToast(`Synced ${imported} swing${imported === 1 ? '' : 's'} across ${files} session file${files === 1 ? '' : 's'}!`);
      if (activeTab === 'patterns') loadPatternsTab();
      else if (activeTab === 'gapping') loadGappingTab();
      else if (activeTab === 'video') loadVideoTab();
    } catch (err) {
      showToast(`Sync failed: ${err.message || err}`);
    }
  }

  async function runExportDebrief() {
    if (!window.shotlabAPI || typeof window.shotlabAPI.exportDebrief !== 'function') return;
    try {
      const daysVal = Number(patternFilters.days);
      const res = await window.shotlabAPI.exportDebrief({
        club: patternFilters.club,
        days: daysVal > 0 ? daysVal : null,
      });
      if (res && res.ok) {
        const savedPath = res.filePath || res.path;
        const fileName = savedPath ? String(savedPath).split(/[/\\]/).pop() : 'debrief.md';
        showToast(`Exported Coach Debrief → ${fileName}`);
      } else if (res && res.canceled) {
        // user canceled save dialog
      } else if (res && res.error) {
        showToast(`Export failed: ${res.error}`);
      } else {
        showToast('Debrief export complete.');
      }
    } catch (err) {
      showToast(`Export error: ${err.message || err}`);
    }
  }

  // Populate club filter selects for Patterns and Video tabs
  populateClubFilterSelect($('pat-club'));
  populateClubFilterSelect($('vid-club'));

  // Topbar tier buttons
  document.querySelectorAll('.tier-btn').forEach((btn) => {
    btn.onclick = () => window.shotlabAPI.updateSettings({ tierId: btn.dataset.tier });
  });

  // Sub-header tabs
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });

  // Practice mode segmented toggle
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.onclick = () => {
      const mode = btn.dataset.mode;
      if (window.shotlabAPI.setPracticeContext) {
        window.shotlabAPI.setPracticeContext({ practiceMode: mode });
      } else {
        window.shotlabAPI.updateSettings({ practiceMode: mode });
      }
      showToast(mode === 'almost' ? 'Kids Asleep / Quiet Mode enabled' : 'Real Balls Mode enabled');
    };
  });

  // Active Feel selector
  $('select-active-feel').onchange = (ev) => {
    const val = ev.target.value || null;
    if (window.shotlabAPI.setPracticeContext) {
      window.shotlabAPI.setPracticeContext({ activeFeelId: val });
    }
    showToast(val ? `Active Feel tagged: ${feelLabelById(val)}` : 'Cleared Active Feel tag');
  };

  // Audio Caddie toggle
  $('btn-audio-caddie').onclick = () => {
    const next = !(state && state.settings && state.settings.audioCaddie);
    if (!next && window.ShotLabAudio && typeof window.ShotLabAudio.stopSpeech === 'function') {
      window.ShotLabAudio.stopSpeech();
    }
    window.shotlabAPI.updateSettings({ audioCaddie: next });
    showToast(next ? 'Audio Caddie Voice ON' : 'Audio Caddie Voice muted');
  };

  // Tour Tempo selector
  $('select-tempo').onchange = (ev) => {
    const preset = ev.target.value;
    const audio = window.ShotLabAudio;
    if (preset === 'off') {
      if (audio && typeof audio.stopTempo === 'function') audio.stopTempo();
      window.shotlabAPI.updateSettings({ tempoPreset: 'off' });
      showToast('Tour Tempo metronome stopped');
    } else {
      if (audio && typeof audio.startTempo === 'function') audio.startTempo(preset);
      window.shotlabAPI.updateSettings({ tempoPreset: preset });
      showToast(`Tour Tempo ${preset} started`);
    }
  };

  // Mat Glance button & close
  $('btn-mat-glance').onclick = () => setMatGlanceOpen(!matGlanceOpen);
  $('btn-mg-close').onclick = () => setMatGlanceOpen(false);

  // DB Sync & Export Debrief buttons
  $('pill-db').onclick = runSyncHistory;
  $('btn-export-debrief').onclick = runExportDebrief;
  $('btn-pat-sync').onclick = runSyncHistory;
  $('btn-pat-export').onclick = runExportDebrief;
  $('btn-vid-sync-empty').onclick = runSyncHistory;

  // Patterns Lab filters & trend metric switcher
  $('pat-club').onchange = (ev) => {
    patternFilters.club = ev.target.value || 'ALL';
    loadPatternsTab();
  };
  $('pat-mode').onchange = (ev) => {
    patternFilters.mode = ev.target.value || 'real';
    loadPatternsTab();
  };
  $('pat-days').onchange = (ev) => {
    patternFilters.days = Number(ev.target.value) || 0;
    loadPatternsTab();
  };
  document.querySelectorAll('.trend-metric-btn').forEach((btn) => {
    btn.onclick = () => {
      activeTrendMetric = btn.dataset.metric || 'avgScore';
      document.querySelectorAll('.trend-metric-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      const trends = lastPatternsData ? (lastPatternsData.trends || lastPatternsData.sessionTrends || []) : [];
      renderTrendSparklineArea(trends);
    };
  });

  // Bag Gapping filters
  $('gap-mode').onchange = (ev) => {
    gappingFilters.mode = ev.target.value || 'real';
    loadGappingTab();
  };
  $('gap-days').onchange = (ev) => {
    gappingFilters.days = Number(ev.target.value) || 0;
    loadGappingTab();
  };
  $('btn-gap-refresh').onclick = loadGappingTab;

  // Video Compare filters & synced playback controls
  $('vid-club').onchange = (ev) => {
    videoState.club = ev.target.value || 'ALL';
    videoState.selectedShotId = null;
    loadVideoTab();
  };
  $('btn-vid-refresh').onclick = loadVideoTab;

  $('btn-vid-play').onclick = () => {
    const vids = getActiveVideos();
    if (!vids.length) return;
    const anyPlaying = vids.some((v) => !v.paused && !v.ended);
    if (anyPlaying) {
      vids.forEach((v) => v.pause());
    } else {
      vids.forEach((v) => {
        if (v.ended) v.currentTime = 0;
        v.playbackRate = videoState.playbackRate;
        v.play().catch(() => {});
      });
    }
    updatePlayButtonLabel();
  };

  document.querySelectorAll('.speed-btn').forEach((btn) => {
    btn.onclick = () => {
      const spd = Number(btn.dataset.speed) || 1;
      videoState.playbackRate = spd;
      document.querySelectorAll('.speed-btn').forEach((b) => b.classList.toggle('active', b === btn));
      [$('vid-player-dtl'), $('vid-player-fo'), $('vid-player-best')].forEach((v) => {
        if (v) v.playbackRate = spd;
      });
    };
  });

  function stepVideoFrames(deltaFrames) {
    const vids = getActiveVideos();
    const stepSec = deltaFrames / 60;
    vids.forEach((v) => {
      v.pause();
      const maxT = Number.isFinite(v.duration) ? v.duration : 9999;
      v.currentTime = Math.max(0, Math.min(maxT, (v.currentTime || 0) + stepSec));
    });
    updatePlayButtonLabel();
    updateVideoTimeReadout();
  }

  $('btn-vid-prev-frame').onclick = () => stepVideoFrames(-1);
  $('btn-vid-next-frame').onclick = () => stepVideoFrames(1);

  [$('vid-player-dtl'), $('vid-player-fo'), $('vid-player-best')].forEach((v) => {
    if (!v) return;
    v.addEventListener('timeupdate', updateVideoTimeReadout);
    v.addEventListener('play', updatePlayButtonLabel);
    v.addEventListener('pause', updatePlayButtonLabel);
    v.addEventListener('ended', updatePlayButtonLabel);
  });

  $('btn-promote-goto').onclick = async () => {
    if (!videoState.selectedShotId || !window.shotlabAPI.promoteGoTo) return;
    try {
      const res = await window.shotlabAPI.promoteGoTo(videoState.selectedShotId);
      if (res && res.ok !== false) {
        showToast('Promoted swing to My-Go-To ★!');
        loadVideoTab();
      } else {
        showToast(`Promote failed: ${(res && (res.error || res.reason)) || 'unknown error'}`);
      }
    } catch (err) {
      showToast(`Promote error: ${err.message || err}`);
    }
  };

  // Existing v1 Topbar & Modal Actions
  $('btn-fire-demo').onclick = () => {
    const arch = $('demo-select').value || null;
    window.shotlabAPI.fireDemo(arch);
  };

  $('btn-clear-session').onclick = async () => {
    const snap = await window.shotlabAPI.clearSession();
    render(snap);
    showToast('Cleared session shot tape (calibration preserved).');
  };

  $('btn-obs').onclick = () => {
    hidePopover();
    if (state) renderObsModal(state);
    $('modal-obs').classList.remove('hidden');
  };

  $('btn-csv').onclick = () => {
    hidePopover();
    $('modal-csv').classList.remove('hidden');
  };

  $('btn-settings').onclick = () => {
    hidePopover();
    if (state) renderSettingsModal(state);
    $('modal-settings').classList.remove('hidden');
  };

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.onclick = () => $(btn.dataset.close).classList.add('hidden');
  });

  document.querySelectorAll('.modal-backdrop').forEach((bd) => {
    bd.onclick = (ev) => {
      if (ev.target === bd) bd.classList.add('hidden');
    };
  });

  $('btn-csv-import-once').onclick = async () => {
    const res = await window.shotlabAPI.importCsv({ watch: false });
    if (res.ok) {
      $('csv-status-msg').textContent = `Imported ${res.count} shot(s) from ${res.path}`;
      showToast(`Imported ${res.count} FSX shot(s)!`);
    } else if (res.error) {
      $('csv-status-msg').textContent = `Error: ${res.error}`;
    }
  };

  $('btn-csv-watch').onclick = async () => {
    const res = await window.shotlabAPI.importCsv({ watch: true });
    if (res.ok) {
      $('csv-status-msg').textContent = `Watching ${res.path} (${res.count} initial shots loaded)`;
      showToast('Live FSX CSV watcher active!');
    } else if (res.error) {
      $('csv-status-msg').textContent = `Error: ${res.error}`;
    }
  };

  $('btn-csv-stop').onclick = async () => {
    await window.shotlabAPI.stopCsvWatch();
    $('csv-status-msg').textContent = 'Stopped CSV watcher.';
    showToast('Stopped CSV watcher.');
  };

  $('btn-save-settings').onclick = async () => {
    const customLofts = {};
    document.querySelectorAll('[data-loft-club]').forEach((inp) => {
      const raw = inp.value.trim();
      customLofts[inp.dataset.loftClub] = raw === '' ? null : Number(raw);
    });
    const obsAutoHideRaw = Number($('set-obs-autohide').value);
    const altRaw = Number($('set-altitude').value);

    await window.shotlabAPI.updateSettings({
      driverSpeedMph: Number($('set-driver-speed').value) || 98,
      handedness: $('set-handedness').value,
      altitudeFt: Number.isFinite(altRaw) ? altRaw : 0,
      obsAutoHideSec: Number.isFinite(obsAutoHideRaw) ? obsAutoHideRaw : 0,
      audioChimes: Boolean($('set-audio-chimes').checked),
      audioCaddie: Boolean($('set-audio-caddie').checked),
      autoSwitch: {
        minConfidence: Math.max(0.7, Math.min(0.99, (Number($('set-autoswitch-conf').value) || 90) / 100)),
      },
      customLofts,
    });
    $('modal-settings').classList.add('hidden');
    showToast('Settings saved & shots re-evaluated!');
  };

  $('btn-reset-cal').onclick = async () => {
    const snap = await window.shotlabAPI.resetCalibration();
    if (snap) renderSettingsModal(snap);
    showToast('Club calibration reset to fresh priors.');
  };

  // Global keyboard shortcuts: M for Mat Glance, Esc to close Mat Glance or modals
  window.addEventListener('keydown', (ev) => {
    const tag = (ev.target && ev.target.tagName) ? ev.target.tagName.toUpperCase() : '';
    const isTyping = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || (ev.target && ev.target.isContentEditable);

    if (ev.key === 'Escape') {
      if (matGlanceOpen) {
        setMatGlanceOpen(false);
        return;
      }
      document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach((m) => m.classList.add('hidden'));
      return;
    }

    if (!isTyping && !ev.metaKey && !ev.ctrlKey && !ev.altKey && (ev.key === 'm' || ev.key === 'M')) {
      const anyModalOpen = Boolean(document.querySelector('.modal-backdrop:not(.hidden)'));
      if (!anyModalOpen) {
        ev.preventDefault();
        setMatGlanceOpen(!matGlanceOpen);
      }
    }
  });

  initKeysPill();

  // Subscribe to Electron main process state pushes
  window.shotlabAPI.onState(render);
  window.shotlabAPI.onAutoSwitch((info) => {
    if (info.result && info.result.ok) {
      showToast(`Auto-Switched GSPro → ${info.target} (${Math.round(info.confidence)}% conf)`);
    }
  });

  // Initial pull
  window.shotlabAPI.getState().then(render);
})();
