/**
 * ShotLab — Broadcast Studio SVG Chart Suite & Metric Explainer Registry.
 * Smooth cubic-bezier splines, Cruise Speed Pareto curve, Diverging SG bars,
 * Delivery Faults by Cost, Coupled Lab Matrix cards, and 91-day consistency heatmap.
 */
(function (root) {
  'use strict';

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const METRIC_HELP = {
    carry: {
      title: 'Carry Distance',
      badge: 'MEASURED / RK4',
      def: 'Airborne yards before first bounce, isolated from sim-floor rollout.',
      goal: 'Match stock club window (±4–6 yds).',
      impact: 'Determines bunker, water, and forced-carry clearance.',
      cue: 'Verify Smash Factor and launch window before adding swing speed.',
    },
    offline: {
      title: 'Offline Dispersion',
      badge: 'BALL FLIGHT',
      def: 'Final lateral yards Left (−) or Right (+) of your target line after spin curve settles.',
      goal: 'Tour Pro ±3.5% · Low HCP ±6.5% of carry.',
      impact: 'Drives Strokes Gained, green-in-regulation %, and penalty avoidance.',
      cue: 'Lock Start Line (HLA) first, then tame Face-to-Path curve.',
    },
    smash: {
      title: 'Smash Factor (Ball ÷ Club Spd)',
      badge: '1-DOT MEASURED',
      def: 'Energy transfer efficiency from clubhead to ball. Ideal varies by club loft.',
      goal: 'DR 1.48 · 4H 1.41 · 7I 1.36 · PW 1.27.',
      impact: 'Every 0.03 drop loses ~6–9 yds and reveals toe/heel/fat strikes.',
      cue: 'Keep sternum centered over the ball through impact.',
    },
    ballSpeed: {
      title: 'Ball Speed',
      badge: 'CAMERA MEASURED',
      def: 'Initial speed leaving the clubface in mph.',
      goal: 'Scales linearly with Club Speed × Target Smash.',
      impact: 'Primary driver of maximum carry potential.',
      cue: 'Center contact lifts ball speed faster and safer than swinging harder.',
    },
    clubSpeed: {
      title: 'Club Speed',
      badge: '1-DOT MEASURED',
      def: 'Clubhead velocity just before impact via BLP 1-dot metallic sticker.',
      goal: 'Stay inside your personal Cruise Gear corridor.',
      impact: 'Swinging above your Cruise Cliff often costs SG via big curves.',
      cue: 'Preserve smooth transition rather than forcing top-of-backswing speed.',
    },
    aoa: {
      title: 'Angle of Attack (AoA)',
      badge: '1-DOT MEASURED',
      def: 'Vertical path of the clubhead into the ball (− downward, + upward).',
      goal: 'Driver +1° to +5° up · Irons −3° to −6° down.',
      impact: 'Controls compression on irons and spin/launch efficiency on Driver.',
      cue: 'Driver: tee slightly inside lead heel. Irons: brush target-side turf.',
    },
    path: {
      title: 'Club Path',
      badge: '1-DOT MEASURED',
      def: 'Horizontal swing direction through impact (In-to-Out vs Out-to-In).',
      goal: 'Stay inside ±2.5° (Scratch) / ±3.5° (Low HCP).',
      impact: 'Determines shot start-vs-curve relationship (D-Plane).',
      cue: 'Match alignment stick rail on the mat.',
    },
    face: {
      title: 'Est. Face to Target',
      badge: '~EST (D-PLANE)',
      def: 'Estimated clubface aim relative to target derived from HLA and Club Path.',
      goal: 'Inside ±1.8° (Scratch) / ±2.5° (Low HCP).',
      impact: 'Face angle accounts for 75–85% of initial ball start line.',
      cue: 'Check grip neutrality and lead-wrist extension in the takeaway.',
    },
    faceToPath: {
      title: '~Face to Path (Curvature Engine)',
      badge: '~EST (D-PLANE)',
      def: 'Estimated Face minus Club Path. Negative (RH) draws/hooks; Positive fades/slices.',
      goal: 'Inside ±1.5°–2.5° for tight dispersion.',
      impact: 'Largest statistical predictor of big-miss Strokes Gained losses.',
      cue: 'Cruise inside your sustainable speed ceiling so face timing holds.',
    },
    vla: {
      title: 'Vertical Launch Angle (VLA)',
      badge: 'CAMERA MEASURED',
      def: 'Initial vertical angle off the clubface in degrees.',
      goal: 'DR 11–14° · 7I 16–20° · PW 23–28°.',
      impact: 'Pairs with backspin to set apex height and stopping descent angle.',
      cue: 'High launch + high spin signals casting/flipping or heel/low strike.',
    },
    backSpin: {
      title: 'Backspin (RPM)',
      badge: 'CAMERA MEASURED',
      def: 'Stabilizing vertical backspin lifting the ball via Magnus force.',
      goal: 'DR 2.1k–2.8k · 7I 6.1k–7.7k · Wedges 9k+.',
      impact: 'Too little spin dives/runs out; excess spin balloons into headwinds.',
      cue: 'Clean grooves and ball-first shaft lean stabilize backspin windows.',
    },
    spinAxis: {
      title: 'Spin Axis Tilt',
      badge: 'CAMERA MEASURED',
      def: 'Tilt of the ball’s spin axis producing left (−) or right (+) aerodynamic curve.',
      goal: 'Within ±6° (Scratch) / ±8.5° (Low HCP).',
      impact: 'Exposes big two-way curves and driver gear-effect surprises.',
      cue: 'Monitor D-Plane curvature plus center-face strike consistency.',
    },
    hla: {
      title: 'Start Line (HLA)',
      badge: 'CAMERA MEASURED',
      def: 'Horizontal Launch Angle immediately off the clubface.',
      goal: 'Real ±2.0° · Kids-Asleep Start Line Gate ±1.5°.',
      impact: 'Accuracy starts on line — foam balls preserve HLA even when muted.',
      cue: 'Pick an intermediate spot 2 feet ahead of the ball on your start line.',
    },
    shaftLean: {
      title: '~Est. Shaft Lean',
      badge: '~EST (D-PLANE)',
      def: 'Static Loft minus Estimated Dynamic Loft at impact (+ = forward compression).',
      goal: 'Irons +5° to +10° forward.',
      impact: 'Negative/low shaft lean scoops the ball and leaks distance.',
      cue: 'Lead wrist flat/bowed through P6–P7 ("The Throw" / Impact Bag).',
    },
    descent: {
      title: 'Descent Angle',
      badge: 'RK4 PHYSICS',
      def: 'Landing angle of the ball onto the green or fairway.',
      goal: 'Irons 45°+ (Drop & Stop) · Driver 34–40° (carry + roll).',
      impact: 'Governs stopping power on firm course greens.',
      cue: 'Wedges/short irons below 44° often run off back fringes.',
    },
    sg: {
      title: 'Strokes Gained (SG)',
      badge: 'BROADIE BASELINE',
      def: 'Shots gained (+) or lost (−) vs your selected benchmark tier on Par 4 tee shots (OTT) and pin approaches (APP).',
      goal: '≥ +0.00 SG per shot against chosen handicap tier.',
      impact: 'Turns distance + offline dispersion into true scoring value.',
      cue: 'Eliminating big penalty misses lifts SG faster than chasing 5 extra yards.',
    },
  };

  function smoothSplinePath(pts) {
    if (!Array.isArray(pts) || pts.length < 2) return '';
    if (pts.length === 2) {
      return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)} ${pts[1].y.toFixed(1)}`;
    }
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  }

  function renderSparklineSvg(values = [], color = '#00e5ff') {
    const clean = (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (clean.length < 2) {
      return `<svg width="90" height="32" viewBox="0 0 90 32" aria-hidden="true"><line x1="6" y1="16" x2="84" y2="16" stroke="#334155" stroke-dasharray="3 3"/></svg>`;
    }
    const min = Math.min(...clean);
    const max = Math.max(...clean);
    const span = Math.max(0.01, max - min);
    const pts = clean.map((v, i) => ({
      x: 4 + (i / Math.max(1, clean.length - 1)) * 82,
      y: 28 - ((v - min) / span) * 21,
    }));
    const path = smoothSplinePath(pts);
    const uid = `spk_${Math.random().toString(36).slice(2, 7)}`;
    return `<svg width="90" height="32" viewBox="0 0 90 32" aria-hidden="true">
      <defs>
        <linearGradient id="${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.32"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${path} L 86 30 L 4 30 Z" fill="url(#${uid})"/>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
  }

  function renderSmoothSplineSvg(trends = [], metricKey = 'avgScore', opts = {}) {
    const w = Math.max(220, Number(opts.width) || 540);
    const h = Math.max(120, Number(opts.height) || 190);
    const metaByKey = {
      avgScore: { color: '#10f296', digits: 0, unit: '', signed: false, label: 'Avg Score' },
      avgSmash: { color: '#00e5ff', digits: 2, unit: '', signed: false, label: 'Avg Smash' },
      avgCarry: { color: '#00e5ff', digits: 1, unit: 'y', signed: false, label: 'Avg Carry' },
      avgSg: { color: '#10f296', digits: 2, unit: '', signed: true, label: 'Avg SG' },
      faultPct: { color: '#ffb800', digits: 0, unit: '%', signed: false, label: 'Fault %' },
    };
    const meta = metaByKey[metricKey] || { color: '#00e5ff', digits: 1, unit: '', signed: false, label: metricKey };
    const color = opts.color || meta.color;

    const valid = (Array.isArray(trends) ? trends : []).filter(
      (r) => r && typeof r[metricKey] === 'number' && Number.isFinite(r[metricKey])
    );
    if (valid.length < 2) {
      return `<svg viewBox="0 0 ${w} ${h}" width="100%" class="studio-svg"><rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="10" fill="#05080f" stroke="#1e293b"/><text x="${w / 2}" y="${h / 2}" text-anchor="middle" fill="#64748b" font-size="12" font-weight="600">Record 2+ sessions to unlock smooth trend spline</text></svg>`;
    }

    const fmtVal = (v) => `${meta.signed && v > 0 ? '+' : ''}${v.toFixed(meta.digits)}${meta.unit}`;
    const vals = valid.map((r) => r[metricKey]);
    const rawMin = Math.min(...vals);
    const rawMax = Math.max(...vals);
    const span = rawMax - rawMin;
    const padVal = span < 1e-6 ? Math.max(0.1, Math.abs(rawMax) * 0.1 || 1) : span * 0.16;
    const yMin = rawMin - padVal;
    const yMax = rawMax + padVal;
    const ySpan = Math.max(1e-6, yMax - yMin);

    const padL = 46, padR = 54, padT = 18, padB = 26;
    const plotW = Math.max(40, w - padL - padR);
    const plotH = Math.max(30, h - padT - padB);
    const toX = (i) => padL + (i / Math.max(1, valid.length - 1)) * plotW;
    const toY = (v) => padT + ((yMax - v) / ySpan) * plotH;

    const coords = valid.map((r, i) => ({
      x: toX(i),
      y: toY(r[metricKey]),
      val: r[metricKey],
      date: r.date || `#${i + 1}`,
      n: r.n ?? null,
    }));
    const linePath = smoothSplinePath(coords);
    const baseY = padT + plotH;
    const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${baseY.toFixed(1)} L ${coords[0].x.toFixed(1)} ${baseY.toFixed(1)} Z`;
    const last = coords[coords.length - 1];
    const uid = `smsp_${Math.random().toString(36).slice(2, 7)}`;

    const fmtDate = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(5) : String(d || ''));

    return `
      <svg viewBox="0 0 ${w} ${h}" width="100%" class="studio-svg" aria-label="${esc(meta.label)} trend">
        <defs>
          <linearGradient id="${uid}_area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.34"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
          </linearGradient>
        </defs>
        <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="10" fill="#05080f" stroke="#1e293b"/>
        <line x1="${padL}" y1="${toY(rawMax).toFixed(1)}" x2="${padL + plotW}" y2="${toY(rawMax).toFixed(1)}" stroke="#1e293b" stroke-dasharray="3 3"/>
        <text x="${padL - 6}" y="${(toY(rawMax) + 3).toFixed(1)}" text-anchor="end" fill="#64748b" font-size="9" font-family="monospace">${esc(fmtVal(rawMax))}</text>
        ${span >= 1e-6 ? `<line x1="${padL}" y1="${toY(rawMin).toFixed(1)}" x2="${padL + plotW}" y2="${toY(rawMin).toFixed(1)}" stroke="#1e293b" stroke-dasharray="3 3"/>
        <text x="${padL - 6}" y="${(toY(rawMin) + 3).toFixed(1)}" text-anchor="end" fill="#64748b" font-size="9" font-family="monospace">${esc(fmtVal(rawMin))}</text>` : ''}
        <path d="${areaPath}" fill="url(#${uid}_area)"/>
        <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round"/>
        <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="9" fill="${color}" opacity="0.22"/>
        ${coords.map((c, idx) => {
          const isLast = idx === coords.length - 1;
          const tip = `${c.date}${c.n !== null ? ` · ${c.n} shots` : ''}: ${meta.label} ${fmtVal(c.val)}`;
          return `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${isLast ? 4.5 : 3}" fill="${isLast ? color : '#e2e8f0'}" stroke="#05080f" stroke-width="1.4" data-tip="${esc(tip)}"><title>${esc(tip)}</title></circle>`;
        }).join('')}
        <text x="${(last.x + 8).toFixed(1)}" y="${(last.y + 3.5).toFixed(1)}" fill="${color}" font-size="11" font-weight="800" font-family="monospace">${esc(fmtVal(last.val))}</text>
        <text x="${padL}" y="${h - 7}" fill="#64748b" font-size="9" font-family="monospace">${esc(fmtDate(coords[0].date))}</text>
        <text x="${padL + plotW}" y="${h - 7}" text-anchor="end" fill="#64748b" font-size="9" font-family="monospace">${esc(fmtDate(last.date))}</text>
      </svg>
    `;
  }

  function renderCruiseSpeedSvg(buckets = [], optimalMph = null, opts = {}) {
    const w = Math.max(260, Number(opts.width) || 560);
    const h = Math.max(150, Number(opts.height) || 220);
    const valid = (Array.isArray(buckets) ? buckets : [])
      .filter((b) => b && typeof b.speedMph === 'number' && Number.isFinite(b.speedMph) && typeof b.avgSg === 'number' && Number.isFinite(b.avgSg))
      .sort((a, b) => a.speedMph - b.speedMph);
    if (valid.length < 2) {
      return `<svg viewBox="0 0 ${w} ${h}" width="100%" class="studio-svg"><rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="10" fill="#05080f" stroke="#1e293b"/><text x="${w / 2}" y="${h / 2}" text-anchor="middle" fill="#64748b" font-size="12" font-weight="600">Hit 5+ club-read swings across 2+ speeds to map Cruise Frontier</text></svg>`;
    }

    const padL = 48, padR = 20, padT = 22, padB = 30;
    const minS = valid[0].speedMph - 1;
    const maxS = valid[valid.length - 1].speedMph + 1;
    const sgs = valid.map((b) => b.avgSg);
    const yMin = Math.min(-0.45, Math.floor((Math.min(...sgs) - 0.08) * 10) / 10);
    const yMax = Math.max(0.35, Math.ceil((Math.max(...sgs) + 0.08) * 10) / 10);

    const xOf = (sp) => padL + ((sp - minS) / Math.max(1, maxS - minS)) * (w - padL - padR);
    const yOf = (sg) => padT + ((yMax - sg) / Math.max(0.2, yMax - yMin)) * (h - padT - padB);
    const pts = valid.map((b) => ({ x: xOf(b.speedMph), y: yOf(b.avgSg), b }));
    const curvePath = smoothSplinePath(pts);
    const areaPath = `${curvePath} L ${pts[pts.length - 1].x.toFixed(1)} ${(h - padB)} L ${pts[0].x.toFixed(1)} ${(h - padB)} Z`;
    const uid = `cru_${Math.random().toString(36).slice(2, 7)}`;

    let optBandSvg = '';
    let optLblSvg = '';
    if (typeof optimalMph === 'number' && Number.isFinite(optimalMph)) {
      const optLeft = Math.max(padL, xOf(optimalMph - 1.2));
      const optRight = Math.min(w - padR, Math.max(optLeft + 16, xOf(optimalMph + 1.2)));
      const optLblX = Math.max(padL + 54, Math.min(w - padR - 54, xOf(optimalMph)));
      optBandSvg = `<rect x="${optLeft.toFixed(1)}" y="${padT}" width="${Math.max(12, optRight - optLeft).toFixed(1)}" height="${h - padT - padB}" fill="rgba(16, 242, 150, 0.10)"/>`;
      optLblSvg = `<text x="${optLblX.toFixed(1)}" y="${padT + 12}" text-anchor="middle" fill="#10f296" font-size="9.5" font-weight="800">CRUISE: ${optimalMph} MPH</text>`;
    }

    return `
      <svg viewBox="0 0 ${w} ${h}" width="100%" class="studio-svg" aria-label="Club Speed vs Strokes Gained Cruise Frontier">
        <defs>
          <linearGradient id="${uid}_grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#00e5ff" stop-opacity="0.30"/>
            <stop offset="100%" stop-color="#00e5ff" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="10" fill="#05080f" stroke="#1e293b"/>
        ${optBandSvg}
        <line x1="${padL}" y1="${yOf(0).toFixed(1)}" x2="${w - padR}" y2="${yOf(0).toFixed(1)}" stroke="rgba(255,255,255,0.22)" stroke-dasharray="4 4"/>
        <text x="8" y="${(yOf(0) + 3).toFixed(1)}" fill="#8b9bb4" font-size="9" font-family="monospace">0.00</text>
        <path d="${areaPath}" fill="url(#${uid}_grad)"/>
        <path d="${curvePath}" fill="none" stroke="#00e5ff" stroke-width="2.8" stroke-linecap="round"/>
        ${pts.map(({ x, y, b }) => {
          const isOpt = optimalMph !== null && b.speedMph === optimalMph;
          const col = isOpt ? '#10f296' : b.avgSg < -0.2 ? '#ef233c' : '#ffb800';
          const missPart = b.bigMissPct !== null && b.bigMissPct !== undefined ? ` · Big Miss ${b.bigMissPct}%` : '';
          const tip = `${b.speedMph} mph (${b.n} shots) · Avg SG ${b.avgSg >= 0 ? '+' : ''}${b.avgSg.toFixed(2)}${missPart}`;
          return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isOpt ? 6 : 4.2}" fill="${col}" stroke="#05080f" stroke-width="1.6" data-tip="${esc(tip)}"><title>${esc(tip)}</title></circle>`;
        }).join('')}
        ${optLblSvg}
        <text x="${padL}" y="${h - 8}" fill="#64748b" font-size="9.5" font-family="monospace">${Math.round(minS)} mph</text>
        <text x="${w - padR}" y="${h - 8}" text-anchor="end" fill="#64748b" font-size="9.5" font-family="monospace">${Math.round(maxS)} mph</text>
      </svg>
    `;
  }

  function renderDivergingSgSvg(sgByCategory = []) {
    const cats = Array.isArray(sgByCategory) ? sgByCategory : [];
    const w = 500;
    const h = Math.max(120, 26 + cats.length * 40);
    const midX = 272;
    const maxBw = 84;
    if (!cats.length) {
      return `<svg viewBox="0 0 ${w} ${h}" width="100%" class="studio-svg"><text x="${w / 2}" y="${h / 2}" text-anchor="middle" fill="#64748b" font-size="11">No category SG data yet</text></svg>`;
    }
    return `
      <svg viewBox="0 0 ${w} ${h}" width="100%" class="studio-svg" aria-label="Strokes Gained by Bag Category">
        <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="10" fill="#05080f" stroke="#1e293b"/>
        <line x1="${midX}" y1="14" x2="${midX}" y2="${h - 14}" stroke="rgba(255,255,255,0.28)" stroke-dasharray="3 3"/>
        ${cats.map((c, i) => {
          const y = 20 + i * 40;
          const sg = typeof c.avgSg === 'number' && Number.isFinite(c.avgSg) ? c.avgSg : 0;
          const hasData = c.n > 0 && typeof c.avgSg === 'number' && Number.isFinite(c.avgSg);
          const bw = Math.min(maxBw, Math.abs(sg) * 180);
          const drawW = Math.max(4, bw);
          const bx = sg >= 0 ? midX : midX - drawW;
          const col = !hasData ? '#475569' : sg >= 0 ? '#10f296' : '#ef233c';
          const lbl = hasData ? `${sg >= 0 ? '+' : ''}${sg.toFixed(2)} SG (${c.n})` : '— (0)';
          return `
            <text x="12" y="${y + 13}" fill="#e2e8f0" font-size="10.5" font-weight="700">${esc(c.label)}</text>
            ${hasData ? `<rect x="${bx.toFixed(1)}" y="${y + 3}" width="${drawW.toFixed(1)}" height="12" rx="4" fill="${col}" opacity="0.88"/>` : ''}
            <text x="${w - 12}" y="${y + 13}" text-anchor="end" fill="${col}" font-size="10.5" font-weight="800" font-family="monospace">${esc(lbl)}</text>
          `;
        }).join('')}
      </svg>
    `;
  }

  function renderDeliveryFaultsByCost(faultLeaks = [], { faultsOnly = false } = {}) {
    const raw = Array.isArray(faultLeaks) ? faultLeaks : [];
    const list = faultsOnly ? raw.filter((l) => l && l.isFault !== false) : raw;
    if (!list.length) {
      return `<div class="sub-well muted" style="padding:12px;">${faultsOnly ? 'Zero delivery faults in current window.' : 'No swing delivery records match the current filter yet.'}</div>`;
    }
    const maxCount = Math.max(1, ...list.map((l) => l.count || 0));
    return list.slice(0, 8).map((l) => {
      const pctWidth = Math.max(6, Math.round(((l.count || 0) / maxCount) * 100));
      const isGood = l.isFault === false || (typeof l.avgSg === 'number' && l.avgSg >= 0.03);
      const barCol = isGood ? '#10f296' : (typeof l.avgSg === 'number' && l.avgSg <= -0.15 ? '#ef233c' : '#ffb800');
      const sgValCol = typeof l.avgSg === 'number' ? (l.avgSg >= 0 ? '#10f296' : '#ef233c') : '#94a3b8';
      const sgStr = typeof l.avgSg === 'number' ? `Avg SG ${l.avgSg >= 0 ? '+' : ''}${l.avgSg.toFixed(2)}` : 'No SG';
      const totalStr = typeof l.totalSg === 'number' ? `Total ${l.totalSg >= 0 ? '+' : ''}${l.totalSg.toFixed(2)}` : '';
      const lostStr = l.avgLostYds > 1 ? ` · −${l.avgLostYds}y` : '';
      return `
        <div class="leak-cost-row" data-fault-id="${esc(l.deliveryId)}" role="button" tabindex="0" style="cursor:pointer;">
          <div class="leak-cost-top">
            <strong class="leak-cost-name">${esc(l.deliveryName || l.deliveryId)}</strong>
            <span class="leak-cost-meta mono">
              ${esc(l.count)} shots (${esc(l.pct)}%) &middot;
              <span style="color:${sgValCol};font-weight:700;">${esc(sgStr)}</span>${totalStr ? ` &middot; ${esc(totalStr)}` : ''}${esc(lostStr)}
            </span>
          </div>
          <div class="leak-cost-track">
            <div class="leak-cost-fill" style="width:${pctWidth}%;background:${barCol};"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderCoupledSignalsGrid(coupledSignals) {
    const cards = (coupledSignals && Array.isArray(coupledSignals.cards)) ? coupledSignals.cards : [];
    if (!cards.length) {
      return '<div class="sub-well muted">Hit a shot to unlock coupled launch, turf &amp; D-Plane telemetry.</div>';
    }
    return `<div class="coupled-grid">${cards.map((c) => `
      <div class="coupled-card grade-${esc(c.severity)}">
        <div class="coupled-head">
          <span class="coupled-title">
            <strong>${esc(c.title)}</strong>
            <button type="button" class="q-btn" data-metric-help="${esc(c.helpKey || 'carry')}" aria-label="Explain ${esc(c.title)}">?</button>
          </span>
          <span class="goal-delta sev-pill-${esc(c.severity)}">${esc(c.delta || '—')}</span>
        </div>
        <span class="verdict-tag sev-pill-${esc(c.severity)}">${esc(c.verdict)}</span>
        <div class="coupled-rows">
          ${(c.rows || []).map((r) => `<div class="coupled-kv"><span>${esc(r.label)}</span><strong class="mono">${esc(r.value)}</strong></div>`).join('')}
        </div>
        <div class="coupled-takeaway">${esc(c.takeaway)}</div>
      </div>
    `).join('')}</div>`;
  }

  function renderHeatmap91(daysArr = []) {
    const days = Array.isArray(daysArr) ? daysArr : [];
    if (!days.length) return '';
    return days.map((d) => {
      const cnt = d.count || 0;
      const lvl = cnt === 0 ? '' : cnt < 10 ? 'l1' : cnt < 25 ? 'l2' : cnt < 50 ? 'l3' : 'l4';
      const tip = `${d.date}: ${cnt} swing${cnt === 1 ? '' : 's'}${d.avgScore != null ? ` (Avg Score ${d.avgScore})` : ''}`;
      return `<div class="hm-cell ${lvl}" title="${esc(tip)}" data-tip="${esc(tip)}"></div>`;
    }).join('');
  }

  const api = {
    METRIC_HELP,
    smoothSplinePath,
    renderSparklineSvg,
    renderSmoothSplineSvg,
    renderCruiseSpeedSvg,
    renderDivergingSgSvg,
    renderDeliveryFaultsByCost,
    renderCoupledSignalsGrid,
    renderHeatmap91,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof root !== 'undefined' && root) {
    root.ShotLabCharts = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
