/**
 * ShotLab — Short Game (<=100y), Live Wedge Clock Matrix & Putting Start-Line / Speed Lab.
 * Exposes `window.ShotLabShortGame` in Electron renderer and `module.exports` in Node.js.
 */
(function (root) {
  'use strict';

  const PUTT_LADDER_FT = [6, 10, 15, 22, 30];
  const DEFAULT_SCORING_TARGETS = [28, 64, 45, 82, 35, 73, 52, 94, 40, 67];

  function toNum(v) {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function medianOf(arr) {
    const clean = arr.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
    if (!clean.length) return null;
    const mid = Math.floor(clean.length / 2);
    return clean.length % 2 === 1 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
  }

  function extractFields(shot = {}) {
    const s = shot && typeof shot === 'object' ? shot : {};
    const m = s.metrics || {};
    const f = s.flight || {};
    const b = s.ball || {};
    const ocb = s.BallData || {};
    const ballSpeed = toNum(m.ballSpeed ?? b.speed ?? ocb.Speed ?? s.ballSpeed);
    const vla = toNum(m.vla ?? b.vla ?? ocb.VLA ?? s.vla);
    const hla = toNum(m.hla ?? b.hla ?? ocb.HLA ?? s.hla);
    const backSpin = toNum(m.backSpin ?? b.back_spin ?? ocb.BackSpin ?? m.totalSpin ?? b.spin ?? ocb.TotalSpin);
    const carryRaw = toNum(m.effectiveCarry ?? f.carryYds ?? b.carry ?? ocb.CarryDistance ?? s.carryYds);
    const totalRaw = toNum(m.totalYds ?? f.totalYds ?? b.total ?? ocb.TotalDistance ?? s.totalYds);
    const carryYds = carryRaw !== null ? Math.round(carryRaw * 10) / 10 : (totalRaw !== null ? Math.round(totalRaw * 0.85 * 10) / 10 : 0);
    const totalYds = totalRaw !== null ? Math.round(Math.max(carryYds, totalRaw) * 10) / 10 : Math.round((carryYds + 3) * 10) / 10;
    const rollYds = Math.round((totalYds - carryYds) * 10) / 10;
    const offlineRaw = toNum(f.offlineYds ?? s.offlineYds);
    const offlineYds = offlineRaw !== null
      ? Math.round(offlineRaw * 10) / 10
      : (hla !== null ? Math.round(carryYds * Math.sin((hla * Math.PI) / 180) * 10) / 10 : 0);
    const smash = toNum(m.smash);
    return {
      club: s.activeClub || s.club || 'SW',
      ballSpeed,
      vla,
      hla,
      backSpin,
      carryYds,
      totalYds,
      rollYds,
      offlineYds,
      smash,
    };
  }

  function ballSpeedMphToPuttFt(mph, stimp = 10) {
    const spd = toNum(mph);
    if (spd === null || spd <= 0) return 0;
    const st = Math.max(7, Math.min(14, toNum(stimp) ?? 10));
    return Math.round(0.29 * spd * spd * (st / 10) * 10) / 10;
  }

  function targetPuttSpeedMph(targetFt, stimp = 10) {
    const ft = Math.max(1, toNum(targetFt) ?? 10);
    const st = Math.max(7, Math.min(14, toNum(stimp) ?? 10));
    return Math.round(Math.sqrt(ft / (0.29 * (st / 10))) * 10) / 10;
  }

  function analyzePuttShot(shotOrRaw, { stimp = 10, targetFt = 12, gateDeg = 1.0 } = {}) {
    const f = extractFields(shotOrRaw);
    const st = Math.max(7, Math.min(14, toNum(stimp) ?? 10));
    const tgtFt = Math.max(2, Math.min(60, toNum(targetFt) ?? 12));
    const gate = Math.max(0.3, Math.min(3.0, toNum(gateDeg) ?? 1.0));
    const mph = f.ballSpeed ?? 0;
    const hla = f.hla ?? 0;
    const estDistFt = ballSpeedMphToPuttFt(mph, st);
    const targetMph = targetPuttSpeedMph(tgtFt, st);
    const distErrFt = Math.round((estDistFt - tgtFt) * 10) / 10;
    const missAtTargetIn = Math.round(Math.tan((Math.abs(hla) * Math.PI) / 180) * tgtFt * 12 * 10) / 10;
    const wouldMakeLine = missAtTargetIn <= 2.125;
    const linePass = Math.abs(hla) <= gate;
    const speedPass = mph > 0 && Math.abs(distErrFt) <= Math.max(1.2, tgtFt * 0.14);
    const grade = (mph > 0 && linePass && speedPass) ? 'green' : (mph > 0 && (linePass || speedPass)) ? 'yellow' : 'red';
    let cue = 'Pure start line & die-in speed!';
    if (!linePass) {
      cue = `Started ${Math.abs(hla).toFixed(1)}° ${hla > 0 ? 'RIGHT (open)' : 'LEFT (closed)'} — roll over tee gate 12" ahead.`;
    } else if (!speedPass) {
      cue = distErrFt > 0
        ? `${Math.abs(distErrFt).toFixed(1)} ft fast (${mph.toFixed(1)} vs ${targetMph.toFixed(1)} mph) — shorten stroke.`
        : `${Math.abs(distErrFt).toFixed(1)} ft short (${mph.toFixed(1)} vs ${targetMph.toFixed(1)} mph) — hold pendulum tempo.`;
    }
    return {
      ballSpeedMph: Math.round(mph * 10) / 10,
      hla: Math.round(hla * 10) / 10,
      stimp: st,
      targetFt: tgtFt,
      gateDeg: gate,
      targetMph,
      estDistFt,
      distErrFt,
      missAtTargetIn,
      wouldMakeLine,
      linePass,
      speedPass,
      grade,
      cue,
    };
  }

  function analyzeShortGameShot(shotOrRaw, { matType = 'fiberbuilt', targetYds = null } = {}) {
    const f = extractFields(shotOrRaw);
    const { carryYds, totalYds, rollYds, vla, hla, backSpin, offlineYds, smash } = f;
    let win = 'stock_pitch';
    let windowLabel = 'Stock Mid Pitch (27–34°)';
    if (vla !== null && vla < 18 && carryYds >= 10) {
      win = 'thin_skull';
      windowLabel = 'Low Skulled / Thin (<18°)';
    } else if (vla !== null && vla < 27) {
      win = 'low_spinner';
      windowLabel = 'Low Nipper / Check (<27°)';
    } else if (vla !== null && vla > 34) {
      win = 'high_soft';
      windowLabel = 'High Soft Lob (>34°)';
    }
    const matFatLikely = Boolean(
      carryYds >= 10 && (
        (vla !== null && vla >= 35 && backSpin !== null && backSpin < 4300) ||
        (smash !== null && smash < 0.72 && vla !== null && vla >= 31)
      )
    );
    const crispNipper = Boolean(!matFatLikely && carryYds >= 10 && vla !== null && vla >= 22 && vla <= 33 && (backSpin === null || backSpin >= 4800));
    const absHla = hla !== null ? Math.abs(hla) : null;
    const hlaGrade = absHla === null ? 'neutral' : absHla <= 1.5 ? 'green' : absHla <= 3.0 ? 'yellow' : 'red';
    const carryErrYds = (targetYds !== null && Number.isFinite(Number(targetYds))) ? Math.round((carryYds - Number(targetYds)) * 10) / 10 : null;
    let grade = 'green';
    let verdict = crispNipper ? 'Crisp One-Hop Contact' : 'Clean Trajectory Window';
    let cue = 'Hold chest pivot & let bounce glide cleanly.';
    if (matFatLikely) {
      grade = 'red';
      verdict = `Mat-Fat Bounce Warning (${matType})`;
      cue = 'High VLA + low spin: place folded towel 2–3" behind ball so mat bristles stop masking fat contact.';
    } else if (win === 'thin_skull') {
      grade = 'red';
      verdict = 'Low Thin / Groove Strike';
      cue = 'Soften arms & brush mat turf gently under the equator.';
    } else if (hlaGrade === 'red') {
      grade = 'yellow';
      verdict = 'Start Line Wide of Gate';
      cue = `Start line ${absHla.toFixed(1)}° ${hla > 0 ? 'R' : 'L'} — match chest & clubface.`;
    } else if (carryErrYds !== null && Math.abs(carryErrYds) > Math.max(4, Number(targetYds) * 0.10)) {
      grade = 'yellow';
      verdict = carryErrYds > 0 ? `Flew ${carryErrYds}y Long` : `Short by ${Math.abs(carryErrYds)}y`;
      cue = 'Trust your swing-clock length without decelerating.';
    }
    return {
      club: f.club,
      carryYds,
      totalYds,
      rollYds,
      vla: vla !== null ? Math.round(vla * 10) / 10 : null,
      hla: hla !== null ? Math.round(hla * 10) / 10 : null,
      backSpin: backSpin !== null ? Math.round(backSpin) : null,
      offlineYds,
      window: win,
      windowLabel,
      matFatLikely,
      crispNipper,
      hlaGrade,
      carryErrYds,
      grade,
      verdict,
      cue,
    };
  }

  function summarizeCalibrationShots(shots = []) {
    const parsed = (Array.isArray(shots) ? shots : []).map(extractFields).filter((f) => f.carryYds > 0);
    if (!parsed.length) return null;
    let active = parsed;
    if (parsed.length >= 5) {
      const rawMed = medianOf(parsed.map((x) => x.carryYds));
      let maxIdx = 0;
      let maxDev = -1;
      parsed.forEach((x, idx) => {
        const dev = Math.abs(x.carryYds - rawMed);
        if (dev > maxDev) { maxDev = dev; maxIdx = idx; }
      });
      active = parsed.filter((_, idx) => idx !== maxIdx);
    }
    const carries = active.map((x) => x.carryYds);
    const rolls = active.map((x) => x.rollYds);
    const vlas = active.map((x) => x.vla).filter((v) => v !== null);
    const spins = active.map((x) => x.backSpin).filter((v) => v !== null);
    return {
      n: parsed.length,
      usedN: active.length,
      carry: Math.round(medianOf(carries)),
      roll: Math.round(medianOf(rolls)),
      vla: vlas.length ? Math.round(medianOf(vlas) * 10) / 10 : null,
      spin: spins.length ? Math.round(medianOf(spins)) : null,
      spreadYds: Math.round(((Math.max(...carries) - Math.min(...carries)) / 2) * 10) / 10,
    };
  }

  function recommendWedgeFromMatrix(matrix = [], targetYds) {
    const tgt = toNum(targetYds);
    if (tgt === null || !Array.isArray(matrix) || !matrix.length) return null;
    const entries = [];
    for (const row of matrix) {
      if (!row || !Array.isArray(row.cells)) continue;
      for (const cell of row.cells) {
        const carry = toNum(cell?.carry);
        if (carry === null || carry <= 0) continue;
        entries.push({
          club: row.club,
          label: row.label || row.club,
          arm: cell.arm,
          pct: cell.pct,
          carry,
          roll: toNum(cell.roll) ?? 0,
          vla: toNum(cell.vla),
          spin: toNum(cell.spin),
          deltaYds: Math.round(tgt - carry),
          absDiff: Math.abs(tgt - carry),
        });
      }
    }
    if (!entries.length) return null;
    entries.sort((a, b) => a.absDiff - b.absDiff || b.carry - a.carry);
    const decorate = (e) => {
      let hint = 'Stock clock swing';
      if (e.deltaYds <= -3) hint = `Take ${Math.abs(e.deltaYds)}y off (choke down 1/2")`;
      else if (e.deltaYds >= 3) hint = `Add +${e.deltaYds}y (slightly firmer pivot)`;
      return { ...e, hint };
    };
    return {
      primary: decorate(entries[0]),
      alternate: entries[1] ? decorate(entries[1]) : null,
    };
  }

  function scoreScoringZoneShot(shotOrRaw, targetYds) {
    const f = extractFields(shotOrRaw);
    const tgt = Math.max(5, Math.min(130, toNum(targetYds) ?? 50));
    const carry = f.carryYds;
    const offline = f.offlineYds;
    const carryErrYds = Math.round((carry - tgt) * 10) / 10;
    const proxYds = Math.round(Math.hypot(carryErrYds, offline) * 10) / 10;
    const proxFt = Math.round(proxYds * 3 * 10) / 10;
    const tourProxFt = Math.round((7.5 + tgt * 0.165) * 10) / 10;
    const sgEst = Math.round(Math.max(-1.2, Math.min(0.65, (tourProxFt - proxFt) * 0.018)) * 100) / 100;
    const grade = proxFt <= tourProxFt * 1.15 ? 'green' : proxFt <= tourProxFt * 1.85 ? 'yellow' : 'red';
    const shortAnalysis = analyzeShortGameShot(shotOrRaw, { targetYds: tgt });
    return {
      targetYds: tgt,
      carryYds: carry,
      offlineYds: offline,
      carryErrYds,
      proxYds,
      proxFt,
      tourProxFt,
      sgEst,
      grade,
      matFatLikely: shortAnalysis.matFatLikely,
      vla: shortAnalysis.vla,
      backSpin: shortAnalysis.backSpin,
      verdict: `${proxFt} ft from pin (Tour avg ${tourProxFt} ft)`,
    };
  }

  function generateRandomCombineTargets(count = 10) {
    const out = [];
    let prev = -100;
    const buckets = [24, 34, 44, 54, 64, 74, 84, 94];
    for (let i = 0; i < count; i += 1) {
      const base = buckets[(i * 3 + Math.floor(Math.random() * buckets.length)) % buckets.length];
      let val = Math.max(20, Math.min(100, base + Math.floor(Math.random() * 9) - 4));
      if (Math.abs(val - prev) < 8) val = Math.max(20, Math.min(100, val + (val > 60 ? -12 : 12)));
      prev = val;
      out.push(val);
    }
    return out;
  }

  function renderPuttGateSvg(puttRes = null, targetFt = 12, gateDeg = 1.0) {
    const tgt = Math.max(2, Math.min(60, Number(targetFt) || 12));
    const gate = Math.max(0.3, Math.min(3.0, Number(gateDeg) || 1.0));
    const w = 540;
    const h = 156;
    const startX = 48;
    const cy = Math.round(h / 2);
    const holeX = Math.round(startX + (tgt / Math.max(tgt * 1.22, 18)) * 410);
    const gateRad = (gate * Math.PI) / 180;
    const coneHalfPx = Math.max(6, Math.min(48, Math.round(Math.tan(gateRad) * (holeX - startX) * 4.5)));
    const hasShot = Boolean(puttRes && puttRes.ballSpeedMph > 0);
    const dist = hasShot ? Math.max(1, Math.min(tgt * 1.35, Number(puttRes.estDistFt) || 0)) : tgt;
    const endX = hasShot ? Math.max(startX + 16, Math.min(w - 22, Math.round(startX + (dist / Math.max(tgt * 1.22, 18)) * 410))) : holeX;
    const hla = hasShot && Number.isFinite(Number(puttRes.hla)) ? Number(puttRes.hla) : 0;
    const endY = Math.max(18, Math.min(h - 18, Math.round(cy + Math.tan((hla * Math.PI) / 180) * (endX - startX) * 4.5)));
    const dotCol = !hasShot ? '#38bdf8' : puttRes.grade === 'green' ? '#10b981' : puttRes.grade === 'yellow' ? '#f59e0b' : '#ef233c';

    return `
      <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block;border-radius:10px;" role="img" aria-label="Putting Start-Line Gate">
        <rect width="${w}" height="${h}" rx="10" fill="#07120e" stroke="#1e293b"/>
        <polygon points="${startX},${cy} ${holeX},${cy - coneHalfPx} ${holeX},${cy + coneHalfPx}" fill="rgba(16,185,129,0.14)" stroke="rgba(16,185,129,0.45)" stroke-dasharray="4 4"/>
        <line x1="${startX}" y1="${cy}" x2="${w - 20}" y2="${cy}" stroke="#334155" stroke-dasharray="5 5"/>
        <circle cx="${holeX}" cy="${cy}" r="9" fill="#020617" stroke="#e2e8f0" stroke-width="2"/>
        <text x="${holeX}" y="${cy - 15}" fill="#94a3b8" font-size="10" font-weight="700" text-anchor="middle">${tgt} ft Cup</text>
        <circle cx="${startX + 36}" cy="${cy - 8}" r="3" fill="#f59e0b"/><circle cx="${startX + 36}" cy="${cy + 8}" r="3" fill="#f59e0b"/>
        ${hasShot ? `
          <line x1="${startX}" y1="${cy}" x2="${endX}" y2="${endY}" stroke="${dotCol}" stroke-width="3.5" stroke-linecap="round"/>
          <circle cx="${endX}" cy="${endY}" r="6" fill="#ffffff" stroke="${dotCol}" stroke-width="2.5"/>
          <text x="${endX}" y="${endY + 18}" fill="#f8fafc" font-size="10" font-weight="800" text-anchor="middle">${puttRes.estDistFt} ft · ${puttRes.hla > 0 ? '+' : ''}${puttRes.hla.toFixed(1)}°</text>
        ` : `<circle cx="${startX}" cy="${cy}" r="5.5" fill="#ffffff"/>`}
      </svg>`;
  }

  function renderChipWindowSvg(chipRes = null) {
    const w = 540;
    const h = 156;
    const ox = 44;
    const oy = 128;
    const rayLen = 210;
    const vla = chipRes && Number.isFinite(Number(chipRes.vla)) ? Math.max(6, Math.min(55, Number(chipRes.vla))) : 30;
    const rad = (vla * Math.PI) / 180;
    const rx = Math.round(ox + Math.cos(rad) * rayLen);
    const ry = Math.round(oy - Math.sin(rad) * rayLen);
    const endX27 = Math.round(ox + Math.cos((27 * Math.PI) / 180) * 190);
    const endY27 = Math.round(oy - Math.sin((27 * Math.PI) / 180) * 190);
    const endX34 = Math.round(ox + Math.cos((34 * Math.PI) / 180) * 190);
    const endY34 = Math.round(oy - Math.sin((34 * Math.PI) / 180) * 190);
    const col = !chipRes ? '#38bdf8' : chipRes.grade === 'green' ? '#10b981' : chipRes.grade === 'yellow' ? '#f59e0b' : '#ef233c';

    return `
      <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block;border-radius:10px;" role="img" aria-label="Chip and Pitch Launch Window">
        <rect width="${w}" height="${h}" rx="10" fill="#090f1c" stroke="#1e293b"/>
        <line x1="20" y1="${oy}" x2="${w - 20}" y2="${oy}" stroke="#334155" stroke-width="2"/>
        <polygon points="${ox},${oy} ${endX34},${endY34} ${endX27},${endY27}" fill="rgba(16,185,129,0.16)" stroke="rgba(16,185,129,0.45)"/>
        <text x="275" y="42" fill="#6ee7b7" font-size="10.5" font-weight="700">Stock Window (27–34°)</text>
        <text x="275" y="64" fill="#7dd3fc" font-size="10">Low Checker (&lt;27°)</text>
        <text x="275" y="22" fill="${chipRes?.matFatLikely ? '#fb7185' : '#cbd5e1'}" font-size="10">${chipRes?.matFatLikely ? '⚠ High Mat-Fat Bounce Zone (>35° + low spin)' : 'High Soft (>34° + high spin)'}</text>
        ${chipRes ? `<line x1="${ox}" y1="${oy}" x2="${rx}" y2="${ry}" stroke="${col}" stroke-width="3.5" stroke-linecap="round"/><text x="${rx + 8}" y="${ry + 4}" fill="#ffffff" font-size="11" font-weight="800">${vla.toFixed(1)}° VLA</text>` : ''}
        <circle cx="${ox}" cy="${oy - 4}" r="4.5" fill="#ffffff"/>
      </svg>`;
  }

  function createShortGameStore() {
    const state = {
      subTab: 'matrix', // 'matrix' | 'combine' | 'chip' | 'putt'
      calClubIdx: 2, // default SW
      calCellIdx: 1, // default 9:00
      calShots: [],
      combineTargets: DEFAULT_SCORING_TARGETS.slice(),
      combineIdx: 0,
      combineResults: [],
      lastChipRes: null,
      stimp: 10,
      gateDeg: 1.0,
      puttIdx: 1, // 10 ft
      freePuttMode: false,
      puttLog: [],
    };

    function resetCombine(randomize = true) {
      state.combineTargets = randomize ? generateRandomCombineTargets(10) : DEFAULT_SCORING_TARGETS.slice();
      state.combineIdx = 0;
      state.combineResults = [];
    }

    function recordShot(shot, { matrix = [], matType = 'fiberbuilt' } = {}) {
      if (!shot) return { recorded: false };
      if (state.subTab === 'matrix') {
        state.calShots.push(shot);
        return { recorded: true, subTab: 'matrix', summary: summarizeCalibrationShots(state.calShots) };
      }
      if (state.subTab === 'combine') {
        if (state.combineIdx >= state.combineTargets.length) return { recorded: false, done: true };
        const tgt = state.combineTargets[state.combineIdx];
        const scored = scoreScoringZoneShot(shot, tgt);
        state.combineResults.push(scored);
        state.combineIdx += 1;
        return { recorded: true, subTab: 'combine', scored, rec: recommendWedgeFromMatrix(matrix, tgt) };
      }
      if (state.subTab === 'chip') {
        state.lastChipRes = analyzeShortGameShot(shot, { matType });
        return { recorded: true, subTab: 'chip', chip: state.lastChipRes };
      }
      if (state.subTab === 'putt') {
        const tgtFt = PUTT_LADDER_FT[state.puttIdx % PUTT_LADDER_FT.length];
        const res = analyzePuttShot(shot, { stimp: state.stimp, targetFt: tgtFt, gateDeg: state.gateDeg });
        state.puttLog.unshift(res);
        if (state.puttLog.length > 25) state.puttLog = state.puttLog.slice(0, 25);
        if (!state.freePuttMode && res.grade === 'green') {
          state.puttIdx = (state.puttIdx + 1) % PUTT_LADDER_FT.length;
        }
        return { recorded: true, subTab: 'putt', putt: res };
      }
      return { recorded: false };
    }

    return {
      state,
      resetCombine,
      recordShot,
    };
  }

  const api = {
    PUTT_LADDER_FT,
    DEFAULT_SCORING_TARGETS,
    ballSpeedMphToPuttFt,
    targetPuttSpeedMph,
    analyzePuttShot,
    analyzeShortGameShot,
    summarizeCalibrationShots,
    recommendWedgeFromMatrix,
    scoreScoringZoneShot,
    generateRandomCombineTargets,
    renderPuttGateSvg,
    renderChipWindowSvg,
    createShortGameStore,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof root !== 'undefined' && root) root.ShotLabShortGame = api;
})(typeof window !== 'undefined' ? window : globalThis);
