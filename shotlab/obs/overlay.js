/**
 * ShotLab — OBS Studio Browser Source Live Overlay Controller.
 *
 * URL parameters:
 *   ?widget=hud|shape|metrics|diagnosis|compact|club|tracer|dispersion|ticker  (default: hud)
 *   &autohide=<seconds>                                                       (default: uses ShotLab Settings, 0 = always visible)
 */
(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const widget = (params.get('widget') || 'hud').toLowerCase();
  const hasUrlAutoHide = params.has('autohide');
  const urlAutoHideSec = Math.max(0, Number(params.get('autohide')) || 0);

  const root = document.getElementById('overlay-root');
  if (root && widget === 'ticker') {
    root.classList.add('root-ticker');
  }

  let hideTimer = null;
  let lastShotId = null;
  let lastRenderSig = null;
  let receivedSse = false;

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeRound(v, fallback = '—') {
    return typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v)) : fallback;
  }

  function safeFixed(v, digits = 0, fallback = '—') {
    return typeof v === 'number' && Number.isFinite(v) ? Math.abs(v).toFixed(digits) : fallback;
  }

  function fmtSignedSg(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
    return `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
  }

  function sgSeverity(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 'neutral';
    if (v >= 0.05) return 'green';
    if (v >= -0.20) return 'yellow';
    return 'red';
  }

  function lrDir(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return '';
    return v < -0.5 ? 'L' : v > 0.5 ? 'R' : '';
  }

  function cardByKey(shot, key) {
    return (shot.scorecard && shot.scorecard.cards || []).find((c) => c.key === key) || {
      label: key, value: '—', unit: '', grade: 'neutral', target: '', delta: '',
    };
  }

  function renderHud(shot, pulseClass) {
    const sh = shot.shotShape || { name: '—', severity: 'neutral', svgParams: {} };
    const del = shot.delivery || { name: '—', severity: 'neutral', tagline: '' };
    const st = shot.strike || { label: '—', severity: 'neutral' };
    const pot = shot.potential || {};
    const fl = shot.flight || {};
    const sc = shot.scorecard || { score: '—' };
    const det = shot.clubDetection || {};
    const keys = ['carry', 'ballSpeed', 'clubSpeed', 'smash', 'vla', 'backSpin', 'aoa'];
    const tiles = keys.map((k) => {
      const c = cardByKey(shot, k);
      return `
        <div class="hm-cell sev-${esc(c.grade)}">
          <span class="hm-lbl">${esc(String(c.label || k).replace('Angle of Attack', 'AoA').replace('Launch (VLA)', 'VLA'))}</span>
          <span class="hm-val">${esc(c.value)}<span class="hm-unit">${esc(c.unit)}</span></span>
        </div>
      `;
    }).join('');

    const leftYds = typeof pot.totalLeftOnTableYds === 'number' && Number.isFinite(pot.totalLeftOnTableYds)
      ? Math.round(pot.totalLeftOnTableYds)
      : 0;

    return `
      <div class="ov-card hud-bar sev-${esc(sh.severity)} ${pulseClass}">
        <div class="hud-shape">
          <div class="hud-shape-svg">
            ${window.ShotLabSVG.renderShotShapeIcon(sh.svgParams, { width: 72, height: 72, compact: true })}
          </div>
          <div class="hud-shape-meta">
            <div class="hud-club-line">
              <span class="hud-club">${esc(shot.activeClub || '—')}</span>
              <span class="badge badge-${shot.confirmedClub ? 'green' : 'cyan'}">${shot.confirmedClub ? 'CONF' : `${safeRound(det.confidencePct, '0')}%`}</span>
            </div>
            <div class="hud-shape-name">${esc(sh.name)}</div>
            <div class="hud-sub">Curve ${safeFixed(fl.curveYds, 0)}y ${lrDir(fl.curveYds)} · Apex ${safeRound(fl.apexFt)}ft</div>
          </div>
        </div>
        <div class="hud-metrics">${tiles}</div>
        <div class="hud-coach">
          <span class="hud-coach-kicker">Coach Diagnosis · Score ${esc(sc.score)}</span>
          <span class="hud-coach-main" style="color:${window.ShotLabSVG.gradeColor(del.severity)}">${esc(del.name)}</span>
          <span class="hud-coach-sub">${esc(st.label)}${leftYds >= 4 ? ` · +${leftYds}y pot.` : ' · Maxed'}</span>
        </div>
      </div>
    `;
  }

  function renderShape(shot, pulseClass) {
    const sh = shot.shotShape || { name: '—', severity: 'neutral', heightTag: '—', svgParams: {} };
    const fl = shot.flight || {};
    const m = shot.metrics || {};
    return `
      <div class="ov-card shape-card sev-${esc(sh.severity)} ${pulseClass}">
        <div class="shape-card-svg">
          ${window.ShotLabSVG.renderShotShapeIcon(sh.svgParams, { width: 90, height: 90 })}
        </div>
        <div class="shape-card-info">
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="badge badge-cyan">${esc(shot.activeClub || '—')}</span>
            <span class="badge badge-${esc(sh.severity)}">${esc(sh.heightTag)}</span>
          </div>
          <div class="sc-title">${esc(sh.name)}</div>
          <div class="sc-carry">${safeRound(m.effectiveCarry)}<span style="font-size:13px;color:var(--dim);margin-left:3px;">yds</span></div>
          <div class="sc-meta">Tot ${safeRound(m.totalYds)}y · Off ${safeFixed(fl.offlineYds, 0)}y ${lrDir(fl.offlineYds)}</div>
        </div>
      </div>
    `;
  }

  function renderMetrics(shot, pulseClass) {
    const keys = ['carry', 'ballSpeed', 'clubSpeed', 'smash', 'vla', 'backSpin', 'aoa', 'path'];
    return `
      <div class="metrics-strip ${pulseClass}">
        ${keys.map((k) => {
          const c = cardByKey(shot, k);
          return `
            <div class="ms-tile sev-${esc(c.grade)}">
              <div class="ms-lbl">${esc(String(c.label || k).replace('Angle of Attack', 'AoA').replace('Launch (VLA)', 'VLA').replace('Club Path', 'Path'))}</div>
              <div class="ms-val">${esc(c.value)}</div>
              <div class="ms-sub">${esc(c.unit || c.target)}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderDiagnosis(shot, pulseClass, handedness) {
    const del = shot.delivery || { name: '—', severity: 'neutral', tagline: '' };
    const st = shot.strike || { label: '—', location: 'center', severity: 'neutral' };
    const pot = shot.potential || {};
    const sc = shot.scorecard || { score: '—' };
    const leftYds = typeof pot.totalLeftOnTableYds === 'number' && Number.isFinite(pot.totalLeftOnTableYds)
      ? Math.round(pot.totalLeftOnTableYds)
      : 0;
    const locLabel = String(st.location || 'center').toUpperCase();
    return `
      <div class="ov-card diag-card sev-${esc(del.severity)} ${pulseClass}">
        <div class="diag-face">
          ${window.ShotLabSVG.renderClubfaceMap(st, shot.clubSpec, handedness)}
        </div>
        <div class="diag-info">
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="badge badge-${esc(del.severity)}">${esc(shot.activeClub || '—')} · Score ${esc(sc.score)}</span>
            <span class="badge badge-${esc(st.severity)}">${esc(locLabel)}</span>
          </div>
          <div class="diag-title">${esc(del.name)}</div>
          <div class="diag-strike">${esc(st.label)}</div>
          <div class="diag-pot">
            ${leftYds >= 3
              ? `Carry ${safeRound(pot.actualCarryYds)}y → Max ${safeRound(pot.maxCarryAtSpeedYds)}y (+${leftYds}y left)`
              : `Carry ${safeRound(pot.actualCarryYds)}y (${safeRound(pot.efficiencyPct, '100')}% speed efficiency)`}
          </div>
          <div class="diag-reason">${esc((pot.reasons && pot.reasons[0]) || del.tagline)}</div>
        </div>
      </div>
    `;
  }

  function renderCompact(shot, pulseClass) {
    const sh = shot.shotShape || { name: '—', severity: 'neutral', svgParams: {} };
    const del = shot.delivery || { name: '—', severity: 'neutral', tagline: '' };
    const st = shot.strike || { label: '—' };
    const fl = shot.flight || {};
    const m = shot.metrics || {};
    const sc = shot.scorecard || { score: '—', overallGrade: 'neutral' };
    const pot = shot.potential || {};
    const keys = ['ballSpeed', 'clubSpeed', 'smash', 'vla', 'backSpin', 'aoa'];
    return `
      <div class="ov-card compact-stack sev-${esc(sh.severity)} ${pulseClass}">
        <div class="cs-head">
          <span class="cs-club">${esc(shot.activeClubLabel || shot.activeClub || '—')}</span>
          <span class="badge badge-${esc(sc.overallGrade)}">Score ${esc(sc.score)}</span>
        </div>
        <div class="cs-hero">
          <div class="cs-svg">
            ${window.ShotLabSVG.renderShotShapeIcon(sh.svgParams, { width: 76, height: 76, compact: true })}
          </div>
          <div style="min-width:0;flex:1;">
            <div class="sc-title">${esc(sh.name)}</div>
            <div class="sc-carry">${safeRound(m.effectiveCarry)}<span style="font-size:12px;color:var(--dim);margin-left:3px;">y carry</span></div>
            <div class="sc-meta">Total ${safeRound(m.totalYds)}y · Apex ${safeRound(fl.apexFt)}ft</div>
          </div>
        </div>
        <div class="cs-grid">
          ${keys.map((k) => {
            const c = cardByKey(shot, k);
            return `
              <div class="cs-cell sev-${esc(c.grade)}">
                <div class="cs-lbl">${esc(String(c.label || k).replace('Angle of Attack', 'AoA').replace('Launch (VLA)', 'VLA').replace('Ball Speed', 'Ball Spd').replace('Club Speed', 'Club Spd').replace('Smash Factor', 'Smash'))}</div>
                <div class="cs-val">${esc(c.value)}</div>
              </div>
            `;
          }).join('')}
        </div>
        <div class="cs-foot">
          <strong style="color:${window.ShotLabSVG.gradeColor(del.severity)}">${esc(del.name)} · ${esc(st.label)}</strong>
          <span class="cs-foot-reason">${esc((pot.reasons && pot.reasons[0]) || del.tagline)}</span>
        </div>
      </div>
    `;
  }

  function renderClub(shot, pulseClass) {
    const det = shot.clubDetection || {};
    const conf = safeRound(det.confidencePct, '0');
    return `
      <div class="ov-card club-pill-card ${pulseClass}">
        <div style="min-width:0;">
          <div class="cp-sub">${shot.confirmedClub ? 'Confirmed Club' : 'Detected Club'}</div>
          <div class="cp-name">${esc(shot.activeClubLabel || shot.activeClub || '—')}</div>
        </div>
        <div class="cp-conf">${shot.confirmedClub ? '✓' : `${conf}%`}</div>
      </div>
    `;
  }

  /**
   * 7. 3D-Perspective Broadcast Shot Tracer (640x360).
   */
  function renderTracer(shot, pulseClass) {
    const sh = shot.shotShape || { name: '—', severity: 'cyan' };
    const fl = shot.flight || {};
    const m = shot.metrics || {};
    const color = window.ShotLabSVG.gradeColor(sh.severity);

    const w = 620;
    const h = 290;
    const cx = w / 2;
    const horizonY = 178;
    const teeY = 266;
    const camBack = 32;

    // Build 3D trajectory points ({ x: yds downrange, y: ft height, z: yds offline })
    let pts = Array.isArray(fl.points) && fl.points.length >= 2
      ? fl.points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z ?? 0))
      : [];

    const rawCarryVal = m.effectiveCarry ?? fl.carryYds;
    const rawCarry = (rawCarryVal === null || rawCarryVal === undefined || rawCarryVal === '') ? NaN : Number(rawCarryVal);
    const hasPositivePoints = pts.length >= 2 && pts.some((p) => p.x > 0.5 || p.y > 0.5);

    if (!hasPositivePoints) {
      if (Number.isFinite(rawCarry) && rawCarry > 0) {
        const carry = rawCarry;
        const apex = Math.max(5, Number(fl.apexFt) || Math.max(10, carry * 0.25));
        const off = Number(fl.offlineYds) || 0;
        const startOff = Number(fl.startOfflineYds) || 0;
        pts = [];
        for (let i = 0; i <= 28; i += 1) {
          const t = i / 28;
          const x = carry * t;
          const y = apex * 4 * t * (1 - t);
          const z = startOff * t + (off - startOff) * (t * t);
          pts.push({ x, y, z });
        }
      } else {
        pts = [];
      }
    }

    const hasArc = pts.length >= 2;
    const maxCarry = hasArc ? Math.max(100, ...pts.map((p) => p.x)) : 150;
    const maxRawLift = hasArc
      ? Math.max(1, ...pts.map((p) => (Math.max(0, p.y) / 3) * (camBack / (Math.max(0, p.x) + camBack))))
      : 10;
    const maxRawLat = hasArc
      ? Math.max(1, ...pts.map((p) => Math.abs(p.z || 0) * (camBack / (Math.max(0, p.x) + camBack))))
      : 10;

    const elevScale = Math.min(22, 142 / maxRawLift);
    const latScale = Math.min(26, (w * 0.40) / maxRawLat);

    const projGroundY = (x) => horizonY + (teeY - horizonY) * (camBack / (Math.max(0, x) + camBack));
    const projX = (x, z) => cx + (z || 0) * latScale * (camBack / (Math.max(0, x) + camBack));
    const projY = (x, yFt) => projGroundY(x) - (Math.max(0, yFt) / 3) * elevScale * (camBack / (Math.max(0, x) + camBack));

    const screenPts = hasArc
      ? pts.map((p) => ({
          sx: projX(p.x, p.z || 0),
          sy: projY(p.x, p.y || 0),
          gy: projGroundY(p.x),
        }))
      : [];

    const flightPath = hasArc
      ? screenPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.sx.toFixed(1)} ${p.sy.toFixed(1)}`).join(' ')
      : '';
    const shadowPath = hasArc
      ? screenPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.sx.toFixed(1)} ${p.gy.toFixed(1)}`).join(' ')
      : '';

    const land = hasArc ? screenPts[screenPts.length - 1] : null;
    const tee = hasArc ? screenPts[0] : { sx: cx, sy: teeY, gy: teeY };

    // Fairway perspective grid lines
    const maxGridX = Math.max(250, Math.ceil(maxCarry / 50) * 50 + 50);
    const distMarkers = [50, 100, 150, 200, 250, 300].filter((d) => d <= maxGridX);
    const gridHoriz = distMarkers.map((d) => {
      const y = projGroundY(d);
      const xL = projX(d, -30);
      const xR = projX(d, 30);
      return `
        <line x1="${xL.toFixed(1)}" y1="${y.toFixed(1)}" x2="${xR.toFixed(1)}" y2="${y.toFixed(1)}"
              stroke="rgba(56, 189, 248, 0.18)" stroke-width="1"/>
        <text x="${(xR + 6).toFixed(1)}" y="${(y + 3).toFixed(1)}" fill="rgba(148, 163, 184, 0.72)"
              font-size="8.5" font-family="ui-monospace, Menlo, Consolas, monospace">${d}y</text>
      `;
    }).join('');

    const corridorLines = [-30, -15, 0, 15, 30].map((zOff) => {
      const xNear = projX(15, zOff);
      const yNear = projGroundY(15);
      const xFar = projX(maxGridX, zOff);
      const yFar = projGroundY(maxGridX);
      const isCenter = zOff === 0;
      const isFairway = Math.abs(zOff) === 15;
      return `
        <line x1="${xNear.toFixed(1)}" y1="${yNear.toFixed(1)}" x2="${xFar.toFixed(1)}" y2="${yFar.toFixed(1)}"
              stroke="${isCenter ? 'rgba(56, 189, 248, 0.36)' : isFairway ? 'rgba(34, 197, 94, 0.25)' : 'rgba(148, 163, 184, 0.14)'}"
              stroke-width="${isCenter ? 1.4 : 1}"
              stroke-dasharray="${isCenter ? '5 4' : ''}"/>
      `;
    }).join('');

    // Fairway ribbon fill between -15y and +15y
    const fwPoly = [
      `${projX(15, -15).toFixed(1)},${projGroundY(15).toFixed(1)}`,
      `${projX(maxGridX, -15).toFixed(1)},${projGroundY(maxGridX).toFixed(1)}`,
      `${projX(maxGridX, 15).toFixed(1)},${projGroundY(maxGridX).toFixed(1)}`,
      `${projX(15, 15).toFixed(1)},${projGroundY(15).toFixed(1)}`,
    ].join(' ');

    const uid = `tr3d_${Math.random().toString(36).slice(2, 7)}`;
    const animClass = pulseClass ? 'tracer-anim' : '';
    const curveStr = typeof fl.curveYds === 'number' && Number.isFinite(fl.curveYds)
      ? `${Math.abs(fl.curveYds).toFixed(0)}y ${lrDir(fl.curveYds) || 'STR'}`
      : '—';

    const arcMarkup = hasArc
      ? `
            <!-- Ground Shadow Path -->
            <path d="${shadowPath}" fill="none" stroke="rgba(15, 23, 42, 0.72)" stroke-width="3.5" stroke-linecap="round"/>
            <path d="${shadowPath}" fill="none" stroke="rgba(148, 163, 184, 0.26)" stroke-width="1.2" stroke-dasharray="3 3"/>

            <!-- Tee Origin Dot -->
            <circle cx="${tee.sx.toFixed(1)}" cy="${tee.sy.toFixed(1)}" r="3.2" fill="#e2e8f0" opacity="0.85"/>

            <!-- 3D Glowing Shot Tracer Arc -->
            <path d="${flightPath}" pathLength="1000" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"
                  opacity="0.28" filter="url(#${uid}_glow)" class="tracer-glow-path ${animClass}"/>
            <path d="${flightPath}" pathLength="1000" fill="none" stroke="url(#${uid}_beam)" stroke-width="3.2" stroke-linecap="round"
                  filter="url(#${uid}_glow)" class="tracer-core-path ${animClass}"/>

            <!-- Landing Ripple Beacon -->
            <circle cx="${land.sx.toFixed(1)}" cy="${land.gy.toFixed(1)}" r="10" fill="${color}" opacity="0.22" class="tracer-land-ring ${animClass}"/>
            <circle cx="${land.sx.toFixed(1)}" cy="${land.gy.toFixed(1)}" r="4.2" fill="${color}" stroke="#0b0f17" stroke-width="1.4"/>

            <!-- Animated Glowing Ball Head -->
            <circle r="5.2" fill="#ffffff" stroke="${color}" stroke-width="2" filter="url(#${uid}_glow)"
                    ${pulseClass ? '' : `cx="${land.sx.toFixed(1)}" cy="${land.sy.toFixed(1)}"`}>
              ${pulseClass ? `<animateMotion dur="1.35s" fill="freeze" keySplines="0.22 1 0.36 1" calcMode="spline" keyTimes="0;1" path="${flightPath}"/>` : ''}
            </circle>
      `
      : `
            <!-- Minimal Ground Dot / Ready State (no flight distance) -->
            <circle cx="${tee.sx.toFixed(1)}" cy="${tee.sy.toFixed(1)}" r="10" fill="${color}" opacity="0.18"/>
            <circle cx="${tee.sx.toFixed(1)}" cy="${tee.sy.toFixed(1)}" r="4.5" fill="#e2e8f0" stroke="${color}" stroke-width="1.8"/>
            <text x="${cx.toFixed(1)}" y="${(horizonY - 24).toFixed(1)}" text-anchor="middle" fill="rgba(148, 163, 184, 0.78)"
                  font-size="11" font-weight="600" font-family="ui-sans-serif, system-ui, sans-serif">Ball on Tee — No Flight Distance</text>
      `;

    return `
      <div class="ov-card tracer-card sev-${esc(sh.severity)} ${pulseClass}">
        <div class="tracer-header">
          <div class="tracer-title-group">
            <span class="badge badge-cyan">${esc(shot.activeClub || '—')}</span>
            <span class="tracer-shape-name" style="color:${color}">${esc(sh.name)}</span>
          </div>
          <span class="tracer-kicker">3D SHOT TRACER</span>
        </div>
        <div class="tracer-stage">
          <svg viewBox="0 0 ${w} ${h}" class="tracer-svg" aria-label="3D Perspective Shot Tracer">
            <defs>
              <linearGradient id="${uid}_fairway" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#22c55e" stop-opacity="0.06"/>
                <stop offset="100%" stop-color="#22c55e" stop-opacity="0.18"/>
              </linearGradient>
              <linearGradient id="${uid}_beam" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stop-color="#f8fafc" stop-opacity="0.95"/>
                <stop offset="35%" stop-color="${color}" stop-opacity="1"/>
                <stop offset="100%" stop-color="${color}" stop-opacity="0.95"/>
              </linearGradient>
              <filter id="${uid}_glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="4" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            <!-- Horizon glow -->
            <line x1="16" y1="${horizonY}" x2="${w - 16}" y2="${horizonY}" stroke="rgba(56, 189, 248, 0.22)" stroke-width="1"/>

            <!-- Perspective Fairway Grid -->
            <polygon points="${fwPoly}" fill="url(#${uid}_fairway)"/>
            ${corridorLines}
            ${gridHoriz}

            ${arcMarkup}
          </svg>
        </div>
        <div class="tracer-pill">
          <div class="tp-item">
            <span class="tp-lbl">CARRY</span>
            <span class="tp-val">${safeRound(m.effectiveCarry ?? fl.carryYds)}<span class="tp-unit">y</span></span>
          </div>
          <div class="tp-div"></div>
          <div class="tp-item">
            <span class="tp-lbl">APEX</span>
            <span class="tp-val">${safeRound(fl.apexFt)}<span class="tp-unit">ft</span></span>
          </div>
          <div class="tp-div"></div>
          <div class="tp-item">
            <span class="tp-lbl">CURVE</span>
            <span class="tp-val">${esc(curveStr)}</span>
          </div>
          <div class="tp-div"></div>
          <div class="tp-item">
            <span class="tp-lbl">BALL SPD</span>
            <span class="tp-val">${safeFixed(m.ballSpeed, 1)}<span class="tp-unit">mph</span></span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 8. Live Dispersion Radar (360x310).
   */
  function renderDispersion(payload, pulseClass) {
    const shot = payload && payload.shot;
    const disp = (payload && payload.dispersion) || (shot ? {
      club: shot.activeClub || 'ALL',
      n: 1,
      meanCarry: shot.metrics && shot.metrics.effectiveCarry,
      meanOffline: shot.flight && shot.flight.offlineYds,
      ellipse80: null,
      avgSg: shot.strokesGained && shot.strokesGained.sg,
      points: [{
        carryYds: shot.metrics && shot.metrics.effectiveCarry,
        offlineYds: shot.flight && shot.flight.offlineYds,
        score: shot.scorecard && shot.scorecard.score,
        shotShape: shot.shotShape && shot.shotShape.name,
      }],
    } : null);

    const club = (disp && disp.club) || (shot && shot.activeClub) || 'ALL';
    const n = disp && Number.isFinite(disp.n) ? disp.n : 0;
    const widthHalf = (n >= 2 && disp && disp.ellipse80 && Number.isFinite(disp.ellipse80.widthYds) && disp.ellipse80.widthYds > 0)
      ? Math.round(disp.ellipse80.widthYds / 2)
      : null;
    const avgSg = disp && typeof disp.avgSg === 'number' && Number.isFinite(disp.avgSg)
      ? disp.avgSg
      : null;
    const avgCarry = disp && typeof disp.meanCarry === 'number' && Number.isFinite(disp.meanCarry)
      ? Math.round(disp.meanCarry)
      : null;

    return `
      <div class="ov-card disp-card ${pulseClass}">
        <div class="disp-head">
          <div class="disp-head-left">
            <span class="badge badge-cyan">${esc(club)}</span>
            <span class="disp-title">Dispersion Radar</span>
          </div>
          <span class="badge">${n} ${n === 1 ? 'shot' : 'shots'}</span>
        </div>
        <div class="disp-kpis">
          <div class="disp-kpi">
            <span class="dk-lbl">80% Width</span>
            <span class="dk-val">${widthHalf !== null ? `±${widthHalf}y` : '—'}</span>
          </div>
          <div class="disp-kpi">
            <span class="dk-lbl">Avg Carry</span>
            <span class="dk-val">${avgCarry !== null ? `${avgCarry}y` : '—'}</span>
          </div>
          <div class="disp-kpi sev-${sgSeverity(avgSg)}">
            <span class="dk-lbl">Avg SG</span>
            <span class="dk-val" style="color:var(--sev, #fff)">${fmtSignedSg(avgSg)}</span>
          </div>
        </div>
        <div class="disp-plot-wrap">
          ${window.ShotLabSVG.renderDispersionPlot(disp, { width: 320, height: 204, compact: true })}
        </div>
      </div>
    `;
  }

  /**
   * 9. Session & Active Feel Broadcast Ticker (1280x48).
   */
  function renderTicker(payload, pulseClass) {
    const shot = payload && payload.shot;
    const settings = (payload && payload.settings) || {};
    const t = (payload && payload.sessionTicker) || {};

    const sessionCount = t.count ?? t.sessionShots ?? t.sessionCount ?? t.n ?? (shot ? 1 : 0);
    const avgScore = t.avgScore ?? (shot && shot.scorecard ? shot.scorecard.score : null);
    const avgCarry = t.avgCarry ?? (shot && shot.metrics ? shot.metrics.effectiveCarry : null);
    const avgSg = t.avgSg ?? (shot && shot.strokesGained ? shot.strokesGained.sg : null);
    const activeClub = t.activeClub || (shot && shot.activeClub) || '—';
    const activeFeel = t.activeFeelLabel || t.activeFeel || t.feelLabel || t.feelName || t.feelId || settings.activeFeelLabel || settings.activeFeelId || null;
    const practiceMode = t.practiceMode || (shot && shot.practiceMode) || settings.practiceMode || 'real';
    const totalDb = t.totalDbSwings ?? t.totalShots ?? t.dbTotalShots ?? null;

    const scoreGrade = typeof avgScore === 'number' && Number.isFinite(avgScore)
      ? (avgScore >= 78 ? 'green' : avgScore >= 52 ? 'yellow' : 'red')
      : 'neutral';

    const modeLabel = practiceMode === 'almost'
      ? 'Quiet Mode (Foam)'
      : practiceMode === 'sore'
        ? 'Sore / Recovery'
        : 'Real Ball';

    return `
      <div class="ov-card ticker-bar ${pulseClass}">
        <span class="ticker-brand">SHOTLAB</span>
        <div class="ticker-item">
          <span class="tk-lbl">SESSION</span>
          <span class="tk-val">${esc(sessionCount)}</span>
        </div>
        <span class="tk-sep"></span>
        <div class="ticker-item sev-${scoreGrade}">
          <span class="tk-lbl">AVG SCORE</span>
          <span class="tk-val" style="color:var(--sev, #fff)">${safeRound(avgScore)}</span>
        </div>
        <span class="tk-sep"></span>
        <div class="ticker-item">
          <span class="tk-lbl">AVG CARRY</span>
          <span class="tk-val">${avgCarry !== null && Number.isFinite(Number(avgCarry)) ? `${Math.round(Number(avgCarry))}y` : '—'}</span>
        </div>
        <span class="tk-sep"></span>
        <div class="ticker-item sev-${sgSeverity(avgSg)}">
          <span class="tk-lbl">AVG SG</span>
          <span class="tk-val" style="color:var(--sev, #fff)">${fmtSignedSg(avgSg)}</span>
        </div>
        <span class="tk-sep"></span>
        <div class="ticker-item">
          <span class="tk-lbl">CLUB</span>
          <span class="badge badge-cyan">${esc(activeClub)}</span>
        </div>
        <span class="tk-sep"></span>
        <div class="ticker-feel">
          ${activeFeel
            ? `<span class="badge badge-green">FEEL: ${esc(activeFeel)}</span>`
            : `<span class="badge ${practiceMode === 'almost' ? 'badge-yellow' : 'badge-cyan'}">${esc(modeLabel)}</span>`}
        </div>
        <div class="ticker-db">
          <span class="tk-lbl">DB</span>
          <span class="tk-val">${totalDb !== null && Number.isFinite(Number(totalDb)) ? `${Math.round(Number(totalDb))} swings` : '—'}</span>
        </div>
      </div>
    `;
  }

  function render(payload, pulseClass, handedness) {
    const shot = payload && payload.shot;
    switch (widget) {
      case 'shape': return renderShape(shot, pulseClass);
      case 'metrics': return renderMetrics(shot, pulseClass);
      case 'diagnosis': return renderDiagnosis(shot, pulseClass, handedness);
      case 'compact': return renderCompact(shot, pulseClass);
      case 'club': return renderClub(shot, pulseClass);
      case 'tracer': return renderTracer(shot, pulseClass);
      case 'dispersion': return renderDispersion(payload, pulseClass);
      case 'ticker': return renderTicker(payload, pulseClass);
      case 'hud':
      default:
        return renderHud(shot, pulseClass);
    }
  }

  function renderState(payload, isNewShot) {
    const shot = payload && payload.shot;
    const settings = (payload && payload.settings) || {};
    const handedness = settings.handedness === 'LH' ? 'LH' : 'RH';
    const effectiveAutoHide = hasUrlAutoHide
      ? urlAutoHideSec
      : Math.max(0, Number(settings.obsAutoHideSec) || 0);

    const canRenderWithoutShot =
      (widget === 'ticker' && payload && payload.sessionTicker) ||
      (widget === 'dispersion' && payload && payload.dispersion && payload.dispersion.n > 0);

    if (!shot && !canRenderWithoutShot) {
      lastShotId = null;
      lastRenderSig = null;
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      root.classList.remove('fade-out');
      root.innerHTML = `<div class="ov-card waiting-pill"><span class="waiting-dot"></span> ShotLab Ready — Waiting for Launch Monitor Shot</div>`;
      return;
    }

    const currentId = shot ? shot.id : null;
    const isShotOnlyWidget = widget !== 'dispersion' && widget !== 'ticker';
    const renderSig = shot
      ? [
          shot.id || '',
          shot.activeClub || '',
          shot.confirmedClub || '',
          handedness,
          shot.practiceMode || settings.practiceMode || '',
          shot.scorecard ? shot.scorecard.score : '',
        ].join('|')
      : null;

    if (!isNewShot && isShotOnlyWidget && currentId !== null && currentId === lastShotId && renderSig === lastRenderSig) {
      return;
    }

    const shotChanged = Boolean(shot) && (isNewShot || currentId !== lastShotId);
    lastShotId = currentId;
    lastRenderSig = renderSig;

    // Only wake a faded overlay and play entry animation when a new or newly-selected shot arrives
    if (shotChanged) {
      root.classList.remove('fade-out');
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    }

    const pulseClass = shotChanged ? 'pulse-in' : '';
    root.innerHTML = render(payload, pulseClass, handedness);

    if (effectiveAutoHide > 0 && shotChanged) {
      hideTimer = setTimeout(() => {
        root.classList.add('fade-out');
        hideTimer = null;
      }, effectiveAutoHide * 1000);
    }
  }

  function connect() {
    const es = new EventSource('/api/events');
    es.addEventListener('state', (ev) => {
      receivedSse = true;
      try { renderState(JSON.parse(ev.data), false); } catch {}
    });
    es.addEventListener('shot', (ev) => {
      receivedSse = true;
      try { renderState(JSON.parse(ev.data), true); } catch {}
    });
    es.onerror = () => {
      // EventSource automatically reconnects
    };
  }

  connect();
  fetch('/api/state')
    .then((r) => r.json())
    .then((d) => {
      if (!receivedSse) renderState(d, false);
    })
    .catch(() => {});
})();
