/**
 * ShotLab — Broadcast-Grade Dynamic SVG Visualizers.
 * Shared by the Electron Desktop Dashboard and the OBS Studio Browser Source overlays.
 */
(function (root) {
  'use strict';

  const COLORS = {
    green: '#22c55e',
    yellow: '#f59e0b',
    red: '#ef4444',
    neutral: '#94a3b8',
    cyan: '#38bdf8',
    ghost: '#64748b',
  };

  function gradeColor(sev) {
    return COLORS[sev] || COLORS.cyan;
  }

  /**
   * 1. Top-Down Shot Shape Flight Curve SVG (hero or compact badge).
   */
  function renderShotShapeIcon(svgParams, { width = 140, height = 140, compact = false, intendedShape = null, handedness = 'RH' } = {}) {
    const p = svgParams || { hlaDeg: 0, curveYds: 0, offlineYds: 0, carryYds: 160, severity: 'green' };
    const color = gradeColor(p.severity);
    const w = width;
    const h = height;
    const cx = w / 2;
    const startY = h - (compact ? 10 : 16);
    const endY = compact ? 12 : 20;
    const spanY = startY - endY;

    // Map offline yards into lateral SVG pixels (clamped nicely inside viewport)
    const maxLatYds = Math.max(32, Math.abs(p.offlineYds || 0) * 1.25, Math.abs(p.curveYds || 0) * 1.4);
    const toX = (yds) => cx + (Math.max(-maxLatYds, Math.min(maxLatYds, yds)) / maxLatYds) * (w * 0.40);

    const startLineYds = (p.carryYds || 160) * Math.sin(((p.hlaDeg || 0) * Math.PI) / 180);
    const ctrlX = toX(startLineYds * 0.65);
    const ctrlY = startY - spanY * 0.52;
    const endX = toX(p.offlineYds || 0);
    const startLineEndX = toX(startLineYds);
    const shapeKey = typeof intendedShape === 'string' ? intendedShape.toLowerCase() : '';
    const handSign = handedness === 'LH' ? -1 : 1;
    const goalCurveHtml = !compact && (shapeKey === 'draw' || shapeKey === 'fade')
      ? (() => {
          const goalStart = shapeKey === 'draw' ? toX(9 * handSign) : toX(-9 * handSign);
          const goalEnd = shapeKey === 'draw' ? toX(-3 * handSign) : toX(3 * handSign);
          return `<path d="M ${cx} ${startY} Q ${goalStart.toFixed(1)} ${ctrlY.toFixed(1)} ${goalEnd.toFixed(1)} ${endY}" fill="none" stroke="#10f296" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.65"/>`;
        })()
      : '';

    const strokeW = compact ? 3 : 3.5;
    const dotR = compact ? 4 : 5.5;
    const uid = `sg_${Math.random().toString(36).slice(2, 7)}`;

    return `
      <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="shot-shape-svg" aria-hidden="true">
        <defs>
          <filter id="${uid}_glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="${compact ? 1.8 : 2.6}" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <linearGradient id="${uid}_grad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stop-color="#e2e8f0" stop-opacity="0.7"/>
            <stop offset="45%" stop-color="${color}" stop-opacity="0.95"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="1"/>
          </linearGradient>
        </defs>
        <!-- Fairway grid arcs -->
        ${compact ? '' : `
          <line x1="${cx}" y1="${startY}" x2="${cx}" y2="${endY - 6}" stroke="#334155" stroke-width="1.2" stroke-dasharray="3 4"/>
          <line x1="${cx - w * 0.22}" y1="${startY}" x2="${cx - w * 0.22}" y2="${endY}" stroke="#1e293b" stroke-width="1"/>
          <line x1="${cx + w * 0.22}" y1="${startY}" x2="${cx + w * 0.22}" y2="${endY}" stroke="#1e293b" stroke-width="1"/>
          <!-- Start line reference -->
          <line x1="${cx}" y1="${startY}" x2="${startLineEndX.toFixed(1)}" y2="${endY}" stroke="#475569" stroke-width="1" stroke-dasharray="2 3" opacity="0.7"/>
        `}
        ${compact ? `<line x1="${cx}" y1="${startY}" x2="${cx}" y2="${endY}" stroke="#475569" stroke-width="1" stroke-dasharray="2 2" opacity="0.65"/>` : ''}
        <!-- Tee dot -->
        <circle cx="${cx}" cy="${startY}" r="${compact ? 2.2 : 3}" fill="#cbd5e1"/>
        ${goalCurveHtml}
        <!-- Ball flight curve -->
        <path d="M ${cx} ${startY} Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${endX.toFixed(1)} ${endY}"
              fill="none" stroke="url(#${uid}_grad)" stroke-width="${strokeW}" stroke-linecap="round"
              filter="url(#${uid}_glow)"/>
        <!-- Landing beacon -->
        <circle cx="${endX.toFixed(1)}" cy="${endY}" r="${dotR + 3}" fill="${color}" opacity="0.22"/>
        <circle cx="${endX.toFixed(1)}" cy="${endY}" r="${dotR}" fill="${color}" stroke="#0b0f17" stroke-width="1.5"/>
        ${compact ? '' : `
          <text x="6" y="14" fill="#64748b" font-size="9" font-weight="600">L</text>
          <text x="${w - 13}" y="14" fill="#64748b" font-size="9" font-weight="600">R</text>
        `}
      </svg>
    `;
  }

  /**
   * 2. Side-View Ballistic Trajectory SVG (Actual flight vs Center-Strike Potential ghost arc vs Dotted Goal & Reference Benchmarks).
   */
  function renderSideTrajectory(flight, potential, severity = 'green', references = [], visibleRefs = [], opts = {}) {
    const w = 360;
    const h = 132;
    const padL = 26, padR = 16, padT = 16, padB = 24;
    const pts = (flight && flight.points && flight.points.length >= 2) ? flight.points : [];
    const ghost = (potential && potential.ghostPoints && potential.ghostPoints.length >= 2) ? potential.ghostPoints : [];
    const goalFlight = (opts && opts.goalFlight && Array.isArray(opts.goalFlight.points) && opts.goalFlight.points.length >= 2)
      ? opts.goalFlight
      : null;
    const goalPts = goalFlight ? goalFlight.points : [];
    const shown = new Set(Array.isArray(visibleRefs) ? visibleRefs : []);
    const refs = (Array.isArray(references) ? references : [])
      .filter((r) => r && shown.has(r.id) && Array.isArray(r.points) && r.points.length >= 2);
    const refPts = refs.flatMap((r) => r.points);

    if (!pts.length) {
      return `<svg viewBox="0 0 ${w} ${h}" class="traj-svg"><text x="${w / 2}" y="${h / 2}" text-anchor="middle" fill="#64748b" font-size="12">Waiting for shot data...</text></svg>`;
    }

    const maxX = Math.max(
      100,
      ...pts.map((p) => p.x),
      ...ghost.map((p) => p.x),
      ...goalPts.map((p) => p.x),
      ...refPts.map((p) => p.x)
    ) * 1.07;
    const maxY = Math.max(
      60,
      ...pts.map((p) => p.y),
      ...ghost.map((p) => p.y),
      ...goalPts.map((p) => p.y),
      ...refPts.map((p) => p.y)
    ) * 1.18;

    const sx = (x) => padL + (x / maxX) * (w - padL - padR);
    const sy = (y) => (h - padB) - (y / maxY) * (h - padT - padB);
    const pathOf = (arr) => arr.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');

    const color = gradeColor(severity);
    const landPt = pts[pts.length - 1];
    const ghostLand = ghost.length ? ghost[ghost.length - 1] : null;
    const apexPt = pts.reduce((best, p) => (p.y > best.y ? p : best), pts[0]);
    const showGhost = ghostLand && potential && potential.totalLeftOnTableYds >= 3;
    const show100Ft = maxY >= 102;
    const landX = sx(landPt.x);
    const ghostX = ghostLand ? Math.min(w - 28, sx(ghostLand.x)) : 0;
    const labelsClose = showGhost && Math.abs(ghostX - landX) < 46;

    const uid = `tr_${Math.random().toString(36).slice(2, 7)}`;

    return `
      <svg viewBox="0 0 ${w} ${h}" class="traj-svg" aria-label="Side-view ball trajectory">
        <defs>
          <linearGradient id="${uid}_fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0.01"/>
          </linearGradient>
        </defs>
        <!-- Ground line -->
        <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="#334155" stroke-width="1.2"/>
        <!-- Reference height lines -->
        <line x1="${padL}" y1="${sy(50).toFixed(1)}" x2="${w - padR}" y2="${sy(50).toFixed(1)}" stroke="#1e293b" stroke-dasharray="3 4"/>
        <text x="8" y="${(sy(50) + 3).toFixed(1)}" fill="#475569" font-size="8">50ft</text>
        ${show100Ft ? `
          <line x1="${padL}" y1="${sy(100).toFixed(1)}" x2="${w - padR}" y2="${sy(100).toFixed(1)}" stroke="#1e293b" stroke-dasharray="3 4"/>
          <text x="4" y="${(sy(100) + 3).toFixed(1)}" fill="#475569" font-size="8">100ft</text>
        ` : ''}

        <!-- Benchmark trajectories (toggleable: Tour / Scratch / Low HCP / Mid HCP), drawn under your shot -->
        ${refs.map((r) => {
          const land = r.points[r.points.length - 1];
          const apex = r.points.reduce((b, p) => (p.y > b.y ? p : b), r.points[0]);
          return `
            <path d="${pathOf(r.points)}" fill="none" stroke="${r.color}" stroke-width="1.4" stroke-dasharray="${r.dash || '4 3'}" opacity="0.85"/>
            <circle cx="${sx(apex.x).toFixed(1)}" cy="${sy(apex.y).toFixed(1)}" r="1.8" fill="${r.color}"/>
            <circle cx="${sx(land.x).toFixed(1)}" cy="${(h - padB)}" r="2.2" fill="${r.color}"/>`;
        }).join('')}

        <!-- Toggleable Dotted Goal Trajectory (Intended Shot Shape Target) -->
        ${goalFlight ? (() => {
          const gLand = goalPts[goalPts.length - 1];
          return `
            <path d="${pathOf(goalPts)}" fill="none" stroke="#10f296" stroke-width="1.6" stroke-dasharray="5 3" opacity="0.82"/>
            <circle cx="${sx(gLand.x).toFixed(1)}" cy="${(h - padB)}" r="2.8" fill="#10f296" opacity="0.9"/>`;
        })() : ''}

        <!-- Potential Ghost Arc (Center-Face Optimal) -->
        ${showGhost ? `
          <path d="${pathOf(ghost)}" fill="none" stroke="#38bdf8" stroke-width="1.75" stroke-dasharray="5 4" opacity="0.72"/>
          <circle cx="${sx(ghostLand.x).toFixed(1)}" cy="${(h - padB)}" r="3.2" fill="#38bdf8"/>
          <text x="${ghostX.toFixed(1)}" y="${labelsClose ? (h - padB - 7) : (h - 7)}" text-anchor="middle" fill="#38bdf8" font-size="9" font-weight="700">Max ${Math.round(potential.maxCarryAtSpeedYds)}y</text>
        ` : ''}

        <!-- Actual trajectory fill + stroke -->
        <path d="${pathOf(pts)} L ${landX.toFixed(1)} ${h - padB} L ${padL} ${h - padB} Z" fill="url(#${uid}_fill)"/>
        <path d="${pathOf(pts)}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round"/>

        <!-- Apex marker -->
        <circle cx="${sx(apexPt.x).toFixed(1)}" cy="${sy(apexPt.y).toFixed(1)}" r="2.8" fill="#f8fafc"/>
        <text x="${sx(apexPt.x).toFixed(1)}" y="${Math.max(11, sy(apexPt.y) - 6).toFixed(1)}" text-anchor="middle" fill="#cbd5e1" font-size="9" font-weight="600">${Math.round(flight.apexFt)} ft</text>

        <!-- Actual carry pin -->
        <circle cx="${landX.toFixed(1)}" cy="${h - padB}" r="4" fill="${color}" stroke="#0b0f17" stroke-width="1.5"/>
        <text x="${landX.toFixed(1)}" y="${h - 7}" text-anchor="middle" fill="${color}" font-size="9.5" font-weight="700">${Math.round(flight.carryYds)}y</text>
      </svg>
    `;
  }

  /**
   * 3. Photorealistic CAD Clubface Strike Map SVG (4 silhouettes: driver | hybrid/wood | iron | wedge).
   * coords: x (-1 heel .. +1 toe), y (-1 low/thin .. +1 high).
   * Mirrors hosel + HEEL/TOE sides automatically for Left-Handed golfers.
   */
  function renderClubfaceMap(strike, clubSpec, handedness = 'RH') {
    const w = 176;
    const h = 114;
    const isLH = handedness === 'LH';
    const cat = clubSpec && clubSpec.category ? clubSpec.category : 'mid_iron';
    const kind = cat === 'driver' ? 'driver'
      : (cat === 'wood' || cat === 'hybrid') ? 'hybrid'
      : cat === 'wedge' ? 'wedge'
      : 'iron';
    const isWood = kind === 'driver' || kind === 'hybrid';
    const isUnknown = Boolean(strike && strike.location === 'unknown');
    const isFoam = Boolean(strike && strike.location === 'foam_na');
    const noHotspot = isUnknown || isFoam; // no club read or foam quiet mode: don't draw a fake hotspot
    const coords = (strike && strike.coords) || { x: 0, y: 0 };
    const color = gradeColor(strike ? strike.severity : 'green');

    // RH view looking at the clubface: Heel (hosel) on LEFT, Toe on RIGHT (mirrored via <g> for LH)
    const cx = w / 2 + 4;
    const cy = h / 2 + 2;
    const labelX = isLH ? (w - cx) : cx;
    const hitX = cx + Math.max(-1, Math.min(1, coords.x || 0)) * (kind === 'driver' ? 42 : isWood ? 38 : 36);
    const hitY = cy - Math.max(-1, Math.min(1, coords.y || 0)) * (kind === 'driver' ? 25 : 22);

    const uid = `cf_${Math.random().toString(36).slice(2, 7)}`;

    let headSvg = '';
    if (kind === 'driver') {
      headSvg = `
        <!-- Stepped Loft-Sleeve Hosel + Ti Pearl Body + Split-Groove Milling -->
        <path d="M 22 6 L 32 6 L 37 42 L 26 44 Z" fill="#1e293b" stroke="#475569" stroke-width="1"/>
        <rect x="25" y="34" width="12" height="3.5" rx="1" fill="#94a3b8"/>
        <path d="M 32 72 C 26 42, 46 20, 90 17 C 134 14, 158 32, 160 58 C 162 84, 130 96, 88 96 C 52 96, 36 86, 32 72 Z"
              fill="url(#${uid}_ti)" stroke="#64748b" stroke-width="1.8"/>
        <path d="M 40 36 C 62 20, 126 18, 150 35 C 124 25, 64 26, 40 36 Z" fill="#090d16" opacity="0.88"/>
        <path d="M 44 69 C 40 48, 56 32, 91 29 C 126 27, 145 41, 146 58 C 147 78, 124 88, 91 88 C 60 88, 46 79, 44 69 Z"
              fill="#111827" stroke="#334155" stroke-width="1"/>
        ${[42, 49, 56, 63, 70, 77].map((gy) =>
          `<line x1="50" y1="${gy}" x2="72" y2="${gy}" stroke="#475569" stroke-width="1.1" stroke-linecap="round"/>
           <line x1="110" y1="${gy}" x2="134" y2="${gy}" stroke="#475569" stroke-width="1.1" stroke-linecap="round"/>`
        ).join('')}
      `;
    } else if (kind === 'hybrid') {
      headSvg = `
        <path d="M 24 8 L 33 8 L 37 46 L 26 48 Z" fill="#1e293b" stroke="#475569" stroke-width="1"/>
        <rect x="26" y="38" width="11" height="3" rx="1" fill="#38bdf8" opacity="0.7"/>
        <path d="M 30 74 C 27 52, 42 32, 90 30 C 132 28, 156 42, 158 63 C 160 84, 134 94, 89 94 C 52 94, 33 87, 30 74 Z"
              fill="url(#${uid}_ti)" stroke="#64748b" stroke-width="1.8"/>
        <path d="M 40 72 C 38 56, 52 40, 91 38 C 126 37, 144 48, 145 63 C 146 78, 126 86, 90 86 C 58 86, 42 81, 40 72 Z"
              fill="#111827" stroke="#334155" stroke-width="1"/>
        ${[48, 55, 62, 69, 76].map((gy) =>
          `<line x1="49" y1="${gy}" x2="74" y2="${gy}" stroke="#475569" stroke-width="1.1"/>
           <line x1="108" y1="${gy}" x2="134" y2="${gy}" stroke="#475569" stroke-width="1.1"/>`
        ).join('')}
      `;
    } else if (kind === 'wedge') {
      headSvg = `
        <path d="M 23 6 L 33 6 L 38 66 L 26 68 Z" fill="url(#${uid}_steel)" stroke="#64748b" stroke-width="1"/>
        <rect x="24" y="20" width="11" height="5" rx="1" fill="#0f172a" stroke="#475569" stroke-width="0.7"/>
        <path d="M 30 84 L 35 42 C 37 33, 46 31, 60 30 C 96 27, 134 15, 146 18 C 156 21, 159 34, 156 54 L 151 80 C 148 91, 136 94, 114 94 L 44 94 C 33 94, 29 90, 30 84 Z"
              fill="url(#${uid}_steel)" stroke="#94a3b8" stroke-width="1.8"/>
        ${[30, 36, 42, 48, 54, 60, 66, 72, 78, 84].map((gy) => {
          const x1 = gy < 42 ? 84 : 44;
          return `<line x1="${x1}" y1="${gy}" x2="143" y2="${gy}" stroke="#334155" stroke-width="1.15"/>`;
        }).join('')}
        <line x1="42" y1="88.5" x2="139" y2="88.5" stroke="#e2e8f0" stroke-width="1.5" opacity="0.65"/>
      `;
    } else {
      headSvg = `
        <!-- Forged Blade Iron Silhouette with Ferrule, Hosel & Scorelines -->
        <path d="M 23 6 L 33 6 L 38 68 L 26 70 Z" fill="url(#${uid}_steel)" stroke="#64748b" stroke-width="1"/>
        <rect x="24" y="21" width="11" height="5" rx="1" fill="#0f172a" stroke="#38bdf8" stroke-width="0.7"/>
        <path d="M 30 84 L 36 37 C 38 30, 46 27, 62 26 L 136 19 C 149 18, 156 26, 155 42 L 149 78 C 146 89, 134 92, 114 92 L 42 92 C 32 92, 29 89, 30 84 Z"
              fill="url(#${uid}_steel)" stroke="#94a3b8" stroke-width="1.8"/>
        ${[34, 41, 48, 55, 62, 69, 76, 83].map((gy) =>
          `<line x1="46" y1="${gy}" x2="138" y2="${gy}" stroke="#334155" stroke-width="1.2"/>`
        ).join('')}
        <line x1="44" y1="87.5" x2="136" y2="87.5" stroke="#e2e8f0" stroke-width="1.4" opacity="0.6"/>
      `;
    }

    const faceGroupOpen = isLH ? `<g transform="translate(${w}, 0) scale(-1, 1)">` : '<g>';

    return `
      <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="clubface-svg" aria-label="Inferred clubface strike location">
        <defs>
          <linearGradient id="${uid}_ti" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#1e293b"/>
            <stop offset="55%" stop-color="#0f172a"/>
            <stop offset="100%" stop-color="#1e293b"/>
          </linearGradient>
          <linearGradient id="${uid}_steel" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#334155"/>
            <stop offset="50%" stop-color="#1e293b"/>
            <stop offset="100%" stop-color="#0f172a"/>
          </linearGradient>
          ${noHotspot ? '' : `
          <radialGradient id="${uid}_spot" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.95"/>
            <stop offset="55%" stop-color="${color}" stop-opacity="0.45"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
          </radialGradient>`}
        </defs>
        ${faceGroupOpen}
          ${headSvg}
          <!-- Sweet spot crosshairs -->
          <line x1="${cx - 8}" y1="${cy}" x2="${cx + 8}" y2="${cy}" stroke="#64748b" stroke-width="1" stroke-dasharray="2 2"/>
          <line x1="${cx}" y1="${cy - 8}" x2="${cx}" y2="${cy + 8}" stroke="#64748b" stroke-width="1" stroke-dasharray="2 2"/>
          <circle cx="${cx}" cy="${cy}" r="11" fill="none" stroke="#475569" stroke-width="0.9" stroke-dasharray="2 2"/>
          ${noHotspot ? '' : `<!-- Inferred strike hotspot -->
          <circle cx="${hitX.toFixed(1)}" cy="${hitY.toFixed(1)}" r="19" fill="url(#${uid}_spot)"/>
          <circle cx="${hitX.toFixed(1)}" cy="${hitY.toFixed(1)}" r="5" fill="${color}" stroke="#f8fafc" stroke-width="1.4"/>`}
        </g>
        ${isUnknown ? `<text x="${labelX}" y="${cy + 6}" text-anchor="middle" fill="#94a3b8" font-size="18" font-weight="800">?</text>
        <text x="${labelX}" y="${h - 20}" text-anchor="middle" fill="#94a3b8" font-size="8">no club read</text>` : ''}
        ${isFoam ? `<text x="${labelX}" y="${cy + 4}" text-anchor="middle" fill="#a855f7" font-size="9" font-weight="800">QUIET</text>
        <text x="${labelX}" y="${h - 20}" text-anchor="middle" fill="#94a3b8" font-size="8">foam paused</text>` : ''}
        <!-- Labels -->
        <text x="12" y="${h - 5}" fill="#64748b" font-size="8.5" font-weight="700">${isLH ? 'TOE' : 'HEEL'}</text>
        <text x="${w - 12}" y="${h - 5}" text-anchor="end" fill="#64748b" font-size="8.5" font-weight="700">${isLH ? 'HEEL' : 'TOE'}</text>
      </svg>
    `;
  }

  /**
   * 4. D-Plane Overhead Impact Geometry SVG (Club Path + Est. Face + Ball Start HLA).
   */
  function renderDPlaneDiagram(metrics, dplane) {
    const w = 156;
    const h = 112;
    const cx = w / 2;
    const cy = h / 2 + 12;

    // Amplify small angles (x2.8) so 2-5 deg differences are immediately legible at a glance
    const scale = 2.8;
    const rawPath = metrics && typeof metrics.path === 'number' && Number.isFinite(metrics.path) ? metrics.path : null;
    const rawFace = dplane && typeof dplane.faceToTarget === 'number' && Number.isFinite(dplane.faceToTarget) ? dplane.faceToTarget : null;
    const rawHla = metrics && typeof metrics.hla === 'number' && Number.isFinite(metrics.hla) ? metrics.hla : null;
    const pathDeg = rawPath !== null ? Math.max(-14, Math.min(14, rawPath)) : 0;
    const faceDeg = rawFace !== null ? Math.max(-14, Math.min(14, rawFace)) : 0;
    const hlaDeg = rawHla !== null ? Math.max(-14, Math.min(14, rawHla)) : 0;

    const rad = (deg) => (deg * scale * Math.PI) / 180;
    const vec = (deg, len) => {
      const r = rad(deg);
      return { x: cx + Math.sin(r) * len, y: cy - Math.cos(r) * len };
    };

    const pFwd = vec(pathDeg, 46);
    const hlaEnd = vec(hlaDeg, 52);

    // Clubface bar is perpendicular to face normal
    const fRad = rad(faceDeg);
    const fx1 = cx - Math.cos(fRad) * 24;
    const fy1 = cy - Math.sin(fRad) * 24;
    const fx2 = cx + Math.cos(fRad) * 24;
    const fy2 = cy + Math.sin(fRad) * 24;

    return `
      <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="dplane-svg" aria-label="D-Plane overhead impact geometry">
        <!-- Target line -->
        <line x1="${cx}" y1="${h - 8}" x2="${cx}" y2="10" stroke="#334155" stroke-width="1.2" stroke-dasharray="3 3"/>
        <text x="${cx}" y="9" text-anchor="middle" fill="#64748b" font-size="8" font-weight="700">TARGET</text>

        <!-- Club Path vector (cyan) -->
        ${rawPath !== null ? `
          <line x1="${(cx - Math.sin(rad(pathDeg)) * 30).toFixed(1)}" y1="${(cy + Math.cos(rad(pathDeg)) * 30).toFixed(1)}"
                x2="${pFwd.x.toFixed(1)}" y2="${pFwd.y.toFixed(1)}"
                stroke="#38bdf8" stroke-width="2.4" stroke-linecap="round"/>
          <circle cx="${pFwd.x.toFixed(1)}" cy="${pFwd.y.toFixed(1)}" r="2.8" fill="#38bdf8"/>
        ` : ''}

        <!-- Ball start HLA vector (emerald/white) -->
        <line x1="${cx}" y1="${cy}" x2="${hlaEnd.x.toFixed(1)}" y2="${hlaEnd.y.toFixed(1)}"
              stroke="#22c55e" stroke-width="2" stroke-dasharray="4 2" stroke-linecap="round"/>

        <!-- Clubface blade (amber) -->
        <line x1="${fx1.toFixed(1)}" y1="${fy1.toFixed(1)}" x2="${fx2.toFixed(1)}" y2="${fy2.toFixed(1)}"
              stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>

        <!-- Golf ball -->
        <circle cx="${cx}" cy="${cy - 4}" r="4.5" fill="#f8fafc" stroke="#0b0f17" stroke-width="1.2"/>

        <!-- Legend -->
        <text x="6" y="${h - 4}" fill="#38bdf8" font-size="8" font-weight="600">Path</text>
        <text x="${cx}" y="${h - 4}" text-anchor="middle" fill="#f59e0b" font-size="8" font-weight="600">Face</text>
        <text x="${w - 6}" y="${h - 4}" text-anchor="end" fill="#22c55e" font-size="8" font-weight="600">Start</text>
      </svg>
    `;
  }

  function escXml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function scoreColor(score) {
    if (typeof score !== 'number' || !Number.isFinite(score)) return COLORS.cyan;
    if (score >= 78) return COLORS.green;
    if (score >= 52) return COLORS.yellow;
    return COLORS.red;
  }

  /**
   * 5. 2D Bird's-Eye Dispersion Scatter + 80% Confidence Ellipse + DECADE Aim Marker SVG.
   * Accepts output of `computeDispersionStats()` (supports both carryYds/offlineYds and carry/offline points).
   */
  function renderDispersionPlot(pattern, opts = {}) {
    const w = Math.max(180, Number(opts.width) || 360);
    const h = Math.max(140, Number(opts.height) || 260);
    const compact = Boolean(opts.compact);

    const rawPts = (pattern && Array.isArray(pattern.points)) ? pattern.points : [];
    const pts = rawPts
      .map((p) => {
        const rawCarry = p.carryYds ?? p.carry ?? p.carry_yds ?? p.y;
        const rawOffline = p.offlineYds ?? p.offline ?? p.offline_yds ?? p.x;
        const carry = (rawCarry === null || rawCarry === undefined || rawCarry === '') ? NaN : Number(rawCarry);
        const offline = (rawOffline === null || rawOffline === undefined || rawOffline === '') ? NaN : Number(rawOffline);
        const score = (typeof p.score === 'number' && Number.isFinite(p.score)) ? p.score : null;
        const shape = p.shotShape || p.shape || '';
        const club = p.club || (pattern && pattern.club) || '';
        return { carry, offline, score, shape, club };
      })
      .filter((p) => Number.isFinite(p.carry) && Number.isFinite(p.offline));

    const n = (pattern && Number.isFinite(pattern.n)) ? pattern.n : pts.length;
    if (!pattern || n === 0 || pts.length === 0) {
      const msg = compact ? 'Waiting for dispersion shots...' : 'Hit real-ball shots to build your 2D dispersion pattern';
      return `
        <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="dispersion-svg" aria-label="2D Shot Dispersion Plot">
          <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="10" fill="#0b1120" stroke="#1e293b"/>
          <line x1="${(w / 2).toFixed(1)}" y1="16" x2="${(w / 2).toFixed(1)}" y2="${h - 16}" stroke="#1e293b" stroke-dasharray="4 4"/>
          <line x1="20" y1="${(h / 2).toFixed(1)}" x2="${w - 20}" y2="${(h / 2).toFixed(1)}" stroke="#1e293b" stroke-dasharray="4 4"/>
          <text x="${(w / 2).toFixed(1)}" y="${(h / 2 + 4).toFixed(1)}" text-anchor="middle" fill="#64748b" font-size="${compact ? 11 : 12}" font-weight="600">${escXml(msg)}</text>
        </svg>
      `;
    }

    const meanCarry = Number.isFinite(pattern.meanCarry)
      ? pattern.meanCarry
      : pts.reduce((a, p) => a + p.carry, 0) / pts.length;
    const meanOffline = Number.isFinite(pattern.meanOffline)
      ? pattern.meanOffline
      : pts.reduce((a, p) => a + p.offline, 0) / pts.length;

    const ell = pattern.ellipse80 && Number.isFinite(pattern.ellipse80.cx) && Number.isFinite(pattern.ellipse80.cy)
      ? pattern.ellipse80
      : null;

    const padL = compact ? 30 : 38;
    const padR = compact ? 12 : 16;
    const padT = compact ? 16 : 20;
    const padB = compact ? 22 : 26;
    const plotW = Math.max(40, w - padL - padR);
    const plotH = Math.max(40, h - padT - padB);

    const ellHalfW = ell && Number.isFinite(ell.widthYds) ? ell.widthYds * 0.62 : 10;
    const ellHalfD = ell && Number.isFinite(ell.depthYds) ? ell.depthYds * 0.62 : 12;

    const maxAbsOffline = Math.max(
      32,
      Math.abs(meanOffline) + ellHalfW,
      Math.abs(meanOffline) * 1.25,
      ...pts.map((p) => Math.abs(p.offline) * 1.15)
    );
    const maxLat = Math.ceil(maxAbsOffline / 5) * 5;

    const rawMinC = Math.min(meanCarry - ellHalfD, ...pts.map((p) => p.carry));
    const rawMaxC = Math.max(meanCarry + ellHalfD, ...pts.map((p) => p.carry));
    const midC = (rawMinC + rawMaxC) / 2;
    const halfSpanC = Math.max(18, (rawMaxC - rawMinC) * 0.62);
    const minCarry = Math.max(0, Math.floor((midC - halfSpanC) / 5) * 5);
    const maxCarry = Math.ceil((midC + halfSpanC) / 5) * 5;
    const carrySpan = Math.max(10, maxCarry - minCarry);

    const toX = (offYds) => padL + ((offYds + maxLat) / (2 * maxLat)) * plotW;
    const toY = (carryYds) => padT + ((maxCarry - carryYds) / carrySpan) * plotH;
    const scaleX = plotW / (2 * maxLat);
    const scaleY = plotH / carrySpan;

    // Horizontal yardage gridlines (clean rounded steps)
    const carryStep = carrySpan <= 45 ? 10 : carrySpan <= 110 ? 20 : 30;
    const firstGridCarry = Math.ceil(minCarry / carryStep) * carryStep;
    const carryTicks = [];
    for (let c = firstGridCarry; c <= maxCarry; c += carryStep) {
      carryTicks.push(c);
    }

    // Offline yardage ticks (-30y, 0, +30y or adaptive wider ticks)
    const latTick = maxLat <= 35 ? 30 : maxLat <= 55 ? 40 : Math.floor((maxLat * 0.75) / 10) * 10;
    const latTicks = compact ? [-latTick, 0, latTick] : [-latTick, -Math.round(latTick / 2), 0, Math.round(latTick / 2), latTick];

    // Subtle concentric distance arcs anchored at tee below viewport
    const teeX = toX(0);
    const teeY = padT + plotH + Math.min(260, Math.max(70, minCarry * scaleY));
    const ringMarkup = carryTicks.map((c) => {
      const yPos = toY(c);
      const r = Math.max(10, teeY - yPos);
      return `
        <line x1="${padL}" y1="${yPos.toFixed(1)}" x2="${w - padR}" y2="${yPos.toFixed(1)}" stroke="#1e293b" stroke-width="1"/>
        <circle cx="${teeX.toFixed(1)}" cy="${teeY.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="#1e293b" stroke-width="0.9" stroke-dasharray="3 4" opacity="0.65"/>
        <text x="${padL - 5}" y="${(yPos + 3).toFixed(1)}" text-anchor="end" fill="#64748b" font-size="${compact ? 8 : 8.5}" font-family="ui-monospace, Menlo, Consolas, monospace">${c}y</text>
      `;
    }).join('');

    const latGridMarkup = latTicks.map((xVal) => {
      const xPos = toX(xVal);
      const isCenter = xVal === 0;
      const lbl = xVal === 0 ? '0' : `${xVal > 0 ? '+' : ''}${xVal}y`;
      return `
        <line x1="${xPos.toFixed(1)}" y1="${padT}" x2="${xPos.toFixed(1)}" y2="${padT + plotH}"
              stroke="${isCenter ? '#475569' : '#1e293b'}" stroke-width="${isCenter ? 1.25 : 1}"
              stroke-dasharray="${isCenter ? '4 4' : '2 4'}"/>
        <text x="${xPos.toFixed(1)}" y="${h - 6}" text-anchor="middle"
              fill="${isCenter ? '#94a3b8' : '#64748b'}" font-size="${compact ? 8 : 8.5}"
              font-weight="${isCenter ? 700 : 500}" font-family="ui-monospace, Menlo, Consolas, monospace">${lbl}</text>
      `;
    }).join('');

    // Transform rotated 80% ellipse from yard space into SVG pixel space without aspect distortion
    let ellipseMarkup = '';
    if (ell && n >= 2 && Number.isFinite(ell.rx) && Number.isFinite(ell.ry) && ell.rx > 0 && ell.ry > 0) {
      const ecx = toX(ell.cx);
      const ecy = toY(ell.cy);
      const th = ((Number.isFinite(ell.angleDeg) ? ell.angleDeg : 0) * Math.PI) / 180;
      const ax = ell.rx * Math.cos(th) * scaleX;
      const ay = -ell.rx * Math.sin(th) * scaleY;
      const bx = -ell.ry * Math.sin(th) * scaleX;
      const by = -ell.ry * Math.cos(th) * scaleY;

      const m11 = ax * ax + bx * bx;
      const m22 = ay * ay + by * by;
      const m12 = ax * ay + bx * by;
      const tr = m11 + m22;
      const disc = Math.sqrt(Math.max(0, ((m11 - m22) * (m11 - m22)) / 4 + m12 * m12));
      const rxPx = Math.max(4, Math.sqrt(Math.max(1, tr / 2 + disc)));
      const ryPx = Math.max(4, Math.sqrt(Math.max(1, tr / 2 - disc)));
      const angleSvg = (0.5 * Math.atan2(2 * m12, m11 - m22) * 180) / Math.PI;

      ellipseMarkup = `
        <ellipse cx="${ecx.toFixed(1)}" cy="${ecy.toFixed(1)}" rx="${rxPx.toFixed(1)}" ry="${ryPx.toFixed(1)}"
                 transform="rotate(${angleSvg.toFixed(1)} ${ecx.toFixed(1)} ${ecy.toFixed(1)})"
                 fill="rgba(56, 189, 248, 0.14)" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="5 3"/>
      `;
    }

    // Individual shot dots color-coded by score
    const dotR = compact ? 3.2 : 3.8;
    const dotsMarkup = pts.map((p) => {
      const px = toX(p.offline);
      const py = toY(p.carry);
      const col = scoreColor(p.score);
      const dir = Math.abs(p.offline) < 0.5 ? 'center' : `${Math.abs(p.offline).toFixed(1)}y ${p.offline < 0 ? 'L' : 'R'}`;
      const tipParts = [`${Math.round(p.carry)}y carry`, dir];
      if (p.shape) tipParts.push(p.shape);
      if (p.score !== null) tipParts.push(`Score ${Math.round(p.score)}`);
      return `
        <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${dotR}" fill="${col}" fill-opacity="0.88" stroke="#0b0f17" stroke-width="1">
          <title>${escXml(tipParts.join(' · '))}</title>
        </circle>
      `;
    }).join('');

    // Mean landing crosshair
    const mx = toX(meanOffline);
    const my = toY(meanCarry);
    const meanCrosshair = `
      <g class="disp-mean">
        <circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="7" fill="none" stroke="#f8fafc" stroke-width="1.2" opacity="0.65"/>
        <line x1="${(mx - 6).toFixed(1)}" y1="${my.toFixed(1)}" x2="${(mx + 6).toFixed(1)}" y2="${my.toFixed(1)}" stroke="#f8fafc" stroke-width="1.5"/>
        <line x1="${mx.toFixed(1)}" y1="${(my - 6).toFixed(1)}" x2="${mx.toFixed(1)}" y2="${(my + 6).toFixed(1)}" stroke="#f8fafc" stroke-width="1.5"/>
        <title>Mean: ${Math.round(meanCarry)}y carry · ${Math.abs(meanOffline).toFixed(1)}y ${meanOffline < 0 ? 'L' : 'R'}</title>
      </g>
    `;

    // DECADE recommended aim offset marker when |meanOffline| >= 3y
    let decadeMarkup = '';
    const customAim = (typeof pattern.decadeAim === 'number' && Number.isFinite(pattern.decadeAim))
      ? pattern.decadeAim
      : (pattern.decadeAim && Number.isFinite(pattern.decadeAim.aimOffsetYds) ? pattern.decadeAim.aimOffsetYds : null);
    const aimOffsetYds = customAim !== null ? customAim : (Math.abs(meanOffline) >= 3 ? -meanOffline : 0);

    if (n >= 4 && Math.abs(meanOffline) >= 3 && Math.abs(aimOffsetYds) >= 2.5) {
      const x0 = toX(0);
      const xAim = Math.max(padL + 10, Math.min(w - padR - 10, toX(aimOffsetYds)));
      const yAim = padT + 12;
      const aimDir = aimOffsetYds > 0 ? 'R' : 'L';
      const arrowHead = aimOffsetYds > 0
        ? `M ${(xAim - 5).toFixed(1)} ${(yAim - 3.5).toFixed(1)} L ${xAim.toFixed(1)} ${yAim.toFixed(1)} L ${(xAim - 5).toFixed(1)} ${(yAim + 3.5).toFixed(1)}`
        : `M ${(xAim + 5).toFixed(1)} ${(yAim - 3.5).toFixed(1)} L ${xAim.toFixed(1)} ${yAim.toFixed(1)} L ${(xAim + 5).toFixed(1)} ${(yAim + 3.5).toFixed(1)}`;
      const lblX = Math.max(padL + 34, Math.min(w - padR - 34, xAim));
      decadeMarkup = `
        <g class="disp-decade">
          <line x1="${x0.toFixed(1)}" y1="${yAim.toFixed(1)}" x2="${xAim.toFixed(1)}" y2="${yAim.toFixed(1)}"
                stroke="#f59e0b" stroke-width="1.8" stroke-dasharray="3 2"/>
          <path d="${arrowHead}" fill="none" stroke="#f59e0b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          <polygon points="${xAim.toFixed(1)},${(yAim - 4.5).toFixed(1)} ${(xAim + 4.5).toFixed(1)},${yAim.toFixed(1)} ${xAim.toFixed(1)},${(yAim + 4.5).toFixed(1)} ${(xAim - 4.5).toFixed(1)},${yAim.toFixed(1)}"
                   fill="#f59e0b" stroke="#0b0f17" stroke-width="1"/>
          <text x="${lblX.toFixed(1)}" y="${(yAim + 13).toFixed(1)}" text-anchor="middle" fill="#fde68a" font-size="${compact ? 8 : 8.5}" font-weight="700">Aim ${Math.round(Math.abs(aimOffsetYds))}y ${aimDir}</text>
          <title>DECADE Aim: Aim ${Math.round(Math.abs(aimOffsetYds))}y ${aimDir} of target to center your 80% dispersion cone</title>
        </g>
      `;
    }

    const uid = `dp_${Math.random().toString(36).slice(2, 7)}`;

    return `
      <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="dispersion-svg" aria-label="2D Bird's-Eye Dispersion Plot">
        <defs>
          <clipPath id="${uid}_clip">
            <rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" rx="4"/>
          </clipPath>
        </defs>
        <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="10" fill="#0b1120" stroke="#1e293b"/>
        <!-- Target & Yardage Grid -->
        ${ringMarkup}
        ${latGridMarkup}
        <g clip-path="url(#${uid}_clip)">
          ${ellipseMarkup}
          ${dotsMarkup}
          ${meanCrosshair}
          ${decadeMarkup}
        </g>
        <!-- Left / Right orientation markers -->
        <text x="${padL + 4}" y="${padT - 5}" fill="#64748b" font-size="8" font-weight="700">LEFT</text>
        <text x="${w - padR - 4}" y="${padT - 5}" text-anchor="end" fill="#64748b" font-size="8" font-weight="700">RIGHT</text>
      </svg>
    `;
  }

  /**
   * 6. Multi-Session Trend Sparkline Area + Line Chart SVG.
   * Accepts output of `swingDb.getSessionTrends()`.
   */
  function renderTrendSparkline(trends, metricKey = 'avgScore', opts = {}) {
    const w = Math.max(160, Number(opts.width) || 320);
    const h = Math.max(64, Number(opts.height) || 104);

    const defaultsByMetric = {
      avgScore: { color: COLORS.green, digits: 0, unit: '', signed: false, label: 'Score' },
      avgSmash: { color: COLORS.cyan, digits: 2, unit: '', signed: false, label: 'Smash' },
      avgCarry: { color: COLORS.cyan, digits: 0, unit: 'y', signed: false, label: 'Carry' },
      avgSg: { color: COLORS.green, digits: 2, unit: '', signed: true, label: 'SG' },
      faultPct: { color: COLORS.yellow, digits: 0, unit: '%', signed: false, label: 'Fault %' },
    };
    const meta = defaultsByMetric[metricKey] || { color: COLORS.cyan, digits: 1, unit: '', signed: false, label: metricKey };
    const color = opts.color || meta.color;
    const digits = typeof opts.digits === 'number' ? opts.digits : meta.digits;
    const unit = opts.unit !== undefined ? opts.unit : meta.unit;
    const signed = opts.signed !== undefined ? Boolean(opts.signed) : meta.signed;

    const valid = (Array.isArray(trends) ? trends : [])
      .filter((row) => row && typeof row[metricKey] === 'number' && Number.isFinite(row[metricKey]));

    if (valid.length < 2) {
      return `
        <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="trend-svg" aria-label="Session trend sparkline">
          <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="8" fill="#0b1120" stroke="#1e293b"/>
          <text x="${(w / 2).toFixed(1)}" y="${(h / 2 + 4).toFixed(1)}" text-anchor="middle" fill="#64748b" font-size="11" font-weight="600">Log 2+ sessions to view trend</text>
        </svg>
      `;
    }

    const fmtVal = (v) => {
      const prefix = signed && v > 0 ? '+' : '';
      return `${prefix}${v.toFixed(digits)}${unit}`;
    };

    const vals = valid.map((r) => r[metricKey]);
    const rawMin = Math.min(...vals);
    const rawMax = Math.max(...vals);
    const span = rawMax - rawMin;
    const padVal = span < 1e-6 ? Math.max(0.1, Math.abs(rawMax) * 0.1 || 1) : span * 0.14;
    const yMin = rawMin - padVal;
    const yMax = rawMax + padVal;
    const ySpan = Math.max(1e-6, yMax - yMin);

    const padL = 36;
    const padR = 44;
    const padT = 14;
    const padB = 18;
    const plotW = Math.max(40, w - padL - padR);
    const plotH = Math.max(24, h - padT - padB);

    const toX = (idx) => padL + (idx / Math.max(1, valid.length - 1)) * plotW;
    const toY = (v) => padT + ((yMax - v) / ySpan) * plotH;

    const coords = valid.map((row, i) => ({
      x: toX(i),
      y: toY(row[metricKey]),
      val: row[metricKey],
      date: row.date || `#${i + 1}`,
      n: row.n ?? null,
    }));

    const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
    const baseY = padT + plotH;
    const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${baseY.toFixed(1)} L ${coords[0].x.toFixed(1)} ${baseY.toFixed(1)} Z`;

    const last = coords[coords.length - 1];
    const uid = `sp_${Math.random().toString(36).slice(2, 7)}`;

    const dots = coords.map((c, i) => {
      const isLast = i === coords.length - 1;
      const tip = `${c.date}${c.n !== null ? ` (${c.n} shots)` : ''}: ${fmtVal(c.val)}`;
      return `
        <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${isLast ? 4 : 2.6}"
                fill="${isLast ? color : '#e2e8f0'}" stroke="#0b0f17" stroke-width="${isLast ? 1.5 : 1}">
          <title>${escXml(tip)}</title>
        </circle>
      `;
    }).join('');

    const fmtDate = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(5) : String(d || ''));
    const firstDate = fmtDate(coords[0].date);
    const lastDate = fmtDate(last.date);

    return `
      <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="trend-svg" aria-label="Session trend sparkline">
        <defs>
          <linearGradient id="${uid}_area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.32"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
          </linearGradient>
        </defs>
        <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="8" fill="#0b1120" stroke="#1e293b"/>
        <!-- Min / Max reference lines -->
        <line x1="${padL}" y1="${toY(rawMax).toFixed(1)}" x2="${padL + plotW}" y2="${toY(rawMax).toFixed(1)}" stroke="#1e293b" stroke-dasharray="3 3"/>
        <text x="${padL - 5}" y="${(toY(rawMax) + 3).toFixed(1)}" text-anchor="end" fill="#64748b" font-size="8" font-family="ui-monospace, Menlo, Consolas, monospace">${escXml(fmtVal(rawMax))}</text>
        ${span >= 1e-6 ? `
          <line x1="${padL}" y1="${toY(rawMin).toFixed(1)}" x2="${padL + plotW}" y2="${toY(rawMin).toFixed(1)}" stroke="#1e293b" stroke-dasharray="3 3"/>
          <text x="${padL - 5}" y="${(toY(rawMin) + 3).toFixed(1)}" text-anchor="end" fill="#64748b" font-size="8" font-family="ui-monospace, Menlo, Consolas, monospace">${escXml(fmtVal(rawMin))}</text>
        ` : ''}

        <!-- Area + Line -->
        <path d="${areaPath}" fill="url(#${uid}_area)"/>
        <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>

        <!-- Latest callout glow + dots -->
        <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="8" fill="${color}" opacity="0.24"/>
        ${dots}
        <text x="${(last.x + 8).toFixed(1)}" y="${(last.y + 3.5).toFixed(1)}" fill="${color}" font-size="10" font-weight="800" font-family="ui-monospace, Menlo, Consolas, monospace">${escXml(fmtVal(last.val))}</text>

        <!-- Date range labels -->
        <text x="${padL}" y="${h - 4}" fill="#475569" font-size="8" font-family="ui-monospace, Menlo, Consolas, monospace">${escXml(firstDate)}</text>
        <text x="${padL + plotW}" y="${h - 4}" text-anchor="end" fill="#475569" font-size="8" font-family="ui-monospace, Menlo, Consolas, monospace">${escXml(lastDate)}</text>
      </svg>
    `;
  }

  const api = {
    gradeColor,
    renderShotShapeIcon,
    renderSideTrajectory,
    renderClubfaceMap,
    renderDPlaneDiagram,
    renderDispersionPlot,
    renderTrendSparkline,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof root !== 'undefined' && root) {
    root.ShotLabSVG = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
