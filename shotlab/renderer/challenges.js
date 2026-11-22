/**
 * ShotLab — 7-Mode Challenge & Pressure Combine Engine.
 * Evaluates real incoming analyzed shots (or simulated/manual trials) across:
 *   1. 18-Ball Tour Combine
 *   2. 21-Point Wedge Dartboard
 *   3. Shape-Caller Gauntlet (requested Draw / Fade / Straight vs actual shotShape)
 *   4. Iron Carry Ladder
 *   5. Driving Fairway Combine
 *   6. 5/5 Pressure Gate (with Ball #5 tension indicator)
 *   7. 3-Hole Course Prep (Tee -> Approach vs Par)
 */
(function (root) {
  'use strict';

  const CHALLENGE_DEFS = [
    { id: 'combine18', name: '18-Ball Tour Combine', short: '18-Ball Combine', target: 'Variable approach distances (0–100 pts)' },
    { id: 'wedge21', name: '21-Point Wedge Dartboard', short: '21-Pt Wedges', target: 'Hit cycling 75–115y pins cleanly to 21 pts' },
    { id: 'shape_caller', name: 'Shape-Caller Gauntlet', short: 'Shape Caller', target: 'Hit the called Draw / Fade / Straight on command' },
    { id: 'iron_ladder', name: 'Iron Carry Ladder', short: 'Iron Ladder', target: 'Step up in clean 10–15y carry gates' },
    { id: 'driver_fairway', name: 'Driving Fairway Combine', short: 'Fairway Combine', target: '±14y fairway corridor with 225y+ carries' },
    { id: 'pressure5', name: '5/5 Pressure Gate', short: '5/5 Pressure', target: 'Make 5 in a row to unlock clear badge' },
    { id: 'course3', name: '3-Hole Course Prep', short: '3-Hole Prep', target: 'Beat Even Par across 3 windy sim holes' },
  ];

  const COMBINE_TARGETS = [65, 85, 105, 125, 145, 165, 185, 95, 155, 175, 75, 135, 195, 115, 160, 140, 170, 110];
  const WEDGE_TARGETS = [75, 90, 105, 85, 115, 95];
  const SHAPE_SEQUENCE = ['Draw', 'Fade', 'Straight', 'Draw', 'Fade', 'Straight'];

  function createChallengeStore(initialBests = {}) {
    const state = {
      activeId: 'combine18',
      combineIdx: 0,
      combinePoints: 0,
      combineResults: [],
      wedgePoints: 0,
      wedgeShots: 0,
      shapeIdx: 0,
      shapeHits: 0,
      ladderStage: 0, // target = 135 + stage * 12
      ladderStreak: 0,
      driverHits: 0,
      driverShots: 0,
      pressure: { gate: 'hla', streak: 0, clears: 0, mutedVignette: false, lastNote: '' },
      course: {
        holeIdx: 0,
        stage: 'tee', // tee | app | done
        holes: [
          { num: 1, par: 4, yds: 412, wind: '-8y Head', appYds: null, score: null },
          { num: 2, par: 3, yds: 164, wind: '12y Cross', appYds: 164, score: null },
          { num: 3, par: 4, yds: 388, wind: '+6y Tail', appYds: null, score: null },
        ],
      },
      bests: { ...(initialBests && typeof initialBests === 'object' ? initialBests : {}) },
    };

    function getCurrentTargetText() {
      switch (state.activeId) {
        case 'combine18':
          if (state.combineIdx >= 18) {
            const avg = Math.round(state.combinePoints / Math.max(1, state.combineResults.length));
            return `Combine Complete (18/18) · Avg ${avg} pts`;
          }
          return `Ball ${state.combineIdx + 1}/18 · Target ${COMBINE_TARGETS[state.combineIdx % COMBINE_TARGETS.length]}y`;
        case 'wedge21': {
          if (state.wedgePoints >= 21) return `Target Reached! ${state.wedgePoints}/21 pts in ${state.wedgeShots} shots`;
          const pin = WEDGE_TARGETS[state.wedgeShots % WEDGE_TARGETS.length];
          return `Pin ${pin}y · Score ${state.wedgePoints}/21 pts`;
        }
        case 'shape_caller':
          return `Call: Hit a clean ${SHAPE_SEQUENCE[state.shapeIdx % SHAPE_SEQUENCE.length]}`;
        case 'iron_ladder':
          return `Rung ${state.ladderStage + 1}: Carry ${135 + state.ladderStage * 12}y ±6y`;
        case 'driver_fairway':
          return `Corridor ±14y · ≥225y · ${state.driverHits}/${state.driverShots} FW`;
        case 'pressure5': {
          const labels = { hla: 'HLA ±1.5°', path: 'Path ±2.5°', smash: 'Smash ≥1.34' };
          return `${labels[state.pressure.gate] || 'Gate'} · Streak ${state.pressure.streak}/5`;
        }
        case 'course3': {
          if (state.course.stage === 'done') {
            const rel = state.course.holes.reduce((a, x) => a + ((x.score ?? x.par) - x.par), 0);
            return `Round Complete (${rel === 0 ? 'E' : rel > 0 ? `+${rel}` : rel}) — Reset to replay`;
          }
          const h = state.course.holes[state.course.holeIdx] || state.course.holes[0];
          return `Hole ${h.num} (Par ${h.par}) · ${state.course.stage === 'tee' ? `${h.yds}y Tee` : `${h.appYds}y Approach`}`;
        }
        default:
          return '';
      }
    }

    function scoreProximityPts(errYds, maxPts = 100) {
      const raw = Number(errYds);
      if (!Number.isFinite(raw)) return 0;
      const e = Math.abs(raw);
      if (e <= 3) return maxPts;
      if (e <= 8) return Math.round(maxPts * 0.85);
      if (e <= 15) return Math.round(maxPts * 0.65);
      if (e <= 25) return Math.round(maxPts * 0.35);
      return 0;
    }

    function recordShot(shot) {
      if (!shot || !shot.metrics) return { recorded: false, bestsChanged: false };
      const rawCarry = shot.metrics.effectiveCarry ?? shot.flight?.carryYds;
      const rawOffline = shot.flight?.offlineYds;
      const carry = (rawCarry === null || rawCarry === undefined || rawCarry === '') ? NaN : Number(rawCarry);
      const offline = (rawOffline === null || rawOffline === undefined || rawOffline === '') ? NaN : Number(rawOffline);
      const hla = shot.metrics.hla;
      const path = shot.metrics.path;
      const smash = shot.metrics.smash;
      const shapeName = String(shot.shotShape?.name || '');
      if (state.activeId !== 'pressure5' && (!Number.isFinite(carry) || !Number.isFinite(offline))) {
        return { recorded: false, bestsChanged: false, pass: false, message: 'No ball flight data for this shot', targetText: getCurrentTargetText(), bests: { ...state.bests } };
      }

      const prevBests = { ...state.bests };
      let message = '';
      let pass = false;

      if (state.activeId === 'combine18') {
        if (state.combineIdx >= 18) {
          return { recorded: false, bestsChanged: false, done: true, pass: true, message: '18-Ball Combine complete — click Reset Challenge', targetText: getCurrentTargetText(), bests: { ...state.bests } };
        }
        const tgt = COMBINE_TARGETS[state.combineIdx % COMBINE_TARGETS.length];
        const prox = Math.hypot(carry - tgt, offline);
        const pts = scoreProximityPts(prox, 100);
        state.combineResults.push({ shot: state.combineIdx + 1, tgt, carry: Math.round(carry), offline: Math.round(offline), prox: Math.round(prox), pts });
        state.combinePoints += pts;
        state.combineIdx += 1;
        const avg = Math.round(state.combinePoints / Math.max(1, state.combineResults.length));
        if (state.combineIdx >= 18 && avg > (state.bests.combine18 || 0)) state.bests.combine18 = avg;
        pass = pts >= 65;
        message = `Target ${tgt}y -> ${Math.round(carry)}y (${prox.toFixed(1)}y prox, +${pts} pts)`;
      } else if (state.activeId === 'wedge21') {
        if (state.wedgePoints >= 21) {
          return { recorded: false, bestsChanged: false, done: true, pass: true, message: `21-Pt Wedge complete in ${state.wedgeShots} shots — click Reset`, targetText: getCurrentTargetText(), bests: { ...state.bests } };
        }
        const tgt = WEDGE_TARGETS[state.wedgeShots % WEDGE_TARGETS.length];
        const prox = Math.hypot(carry - tgt, offline);
        const pts = prox <= 4 ? 5 : prox <= 8 ? 3 : prox <= 13 ? 1 : -2;
        state.wedgeShots += 1;
        state.wedgePoints = Math.min(21, Math.max(0, state.wedgePoints + pts));
        if (state.wedgePoints >= 21) {
          state.bests.wedge21 = state.bests.wedge21 ? Math.min(state.bests.wedge21, state.wedgeShots) : state.wedgeShots;
        }
        pass = pts > 0;
        message = `Pin ${tgt}y -> ${Math.round(carry)}y (${prox.toFixed(1)}y prox) -> ${pts >= 0 ? `+${pts}` : pts} pts`;
      } else if (state.activeId === 'shape_caller') {
        const want = SHAPE_SEQUENCE[state.shapeIdx % SHAPE_SEQUENCE.length];
        const rawCurve = shot.flight?.curveYds;
        const curve = typeof rawCurve === 'number' && Number.isFinite(rawCurve) ? rawCurve : 0;
        if (want === 'Draw') pass = /Draw/i.test(shapeName) && Math.abs(offline) <= 18;
        else if (want === 'Fade') pass = /Fade/i.test(shapeName) && Math.abs(offline) <= 18;
        else pass = Math.abs(offline) <= 8 && Math.abs(curve) <= 10;
        if (pass) state.shapeHits += 1;
        state.shapeIdx += 1;
        if (state.shapeHits > (state.bests.shape_caller || 0)) state.bests.shape_caller = state.shapeHits;
        message = `Called ${want} -> Got ${shapeName || 'Unknown'} (${pass ? 'PASS' : 'MISS'})`;
      } else if (state.activeId === 'iron_ladder') {
        const tgt = 135 + state.ladderStage * 12;
        pass = Math.abs(carry - tgt) <= 6 && Math.abs(offline) <= 12;
        if (pass) {
          state.ladderStage += 1;
          state.ladderStreak += 1;
          if (state.ladderStage > (state.bests.iron_ladder || 0)) state.bests.iron_ladder = state.ladderStage;
        } else {
          state.ladderStreak = 0;
        }
        message = `Ladder Target ${tgt}y -> ${Math.round(carry)}y (${pass ? 'CLIMBED!' : 'HOLD RUNG'})`;
      } else if (state.activeId === 'driver_fairway') {
        pass = Math.abs(offline) <= 14 && carry >= 225;
        state.driverShots += 1;
        if (pass) state.driverHits += 1;
        const pct = Math.round((state.driverHits / state.driverShots) * 100);
        if (state.driverShots >= 5 && pct > (state.bests.driver_fairway || 0)) state.bests.driver_fairway = pct;
        message = `Fairway check: ${Math.round(carry)}y carry, ${Math.abs(offline).toFixed(1)}y offline -> ${pass ? 'FAIRWAY HIT' : 'MISSED FW'}`;
      } else if (state.activeId === 'pressure5') {
        const g = state.pressure.gate;
        const gateVal = g === 'hla' ? hla : g === 'path' ? path : smash;
        if (typeof gateVal !== 'number' || !Number.isFinite(gateVal)) {
          return {
            recorded: false,
            bestsChanged: false,
            pass: false,
            message: `No ${g.toUpperCase()} read for Pressure Gate — streak preserved (${state.pressure.streak}/5)`,
            targetText: getCurrentTargetText(),
            bests: { ...state.bests },
          };
        }
        if (g === 'hla') pass = Math.abs(gateVal) <= 1.5;
        else if (g === 'path') pass = Math.abs(gateVal) <= 2.5;
        else pass = gateVal >= 1.34;
        if (pass) {
          state.pressure.streak += 1;
          if (state.pressure.streak >= 5) {
            state.pressure.clears += 1;
            state.pressure.streak = 0;
            state.bests.pressure5 = Math.max(state.bests.pressure5 || 0, state.pressure.clears);
            message = '5/5 PRESSURE GATE CLEARED!';
          } else {
            message = `Gate MADE (${state.pressure.streak}/5)`;
          }
        } else {
          state.pressure.lastNote = `${g.toUpperCase()} missed under pressure at ${state.pressure.streak}/5`;
          state.pressure.streak = 0;
          message = `Streak reset (missed ${g.toUpperCase()} gate)`;
        }
      } else if (state.activeId === 'course3') {
        if (state.course.stage === 'done') {
          return { recorded: false, bestsChanged: false, done: true, pass: true, message: '3-Hole Course Prep finished — click Reset to replay', targetText: getCurrentTargetText(), bests: { ...state.bests } };
        }
        const h = state.course.holes[state.course.holeIdx];
        if (h) {
          if (state.course.stage === 'tee' && h.par === 4) {
            const rem = Math.max(45, Math.round(h.yds - carry));
            const penalty = Math.abs(offline) > 26 ? 1 : 0;
            h.appYds = rem;
            state.course.stage = 'app';
            message = `Hole ${h.num} Tee: ${Math.round(carry)}y -> ${rem}y left${penalty ? ' (+1 penalty drop)' : ''}`;
            h._pen = penalty;
            pass = penalty === 0;
          } else {
            const prox = Math.hypot(carry - (h.appYds || h.yds), offline);
            const putts = prox <= 5 ? 1 : 2;
            const gross = (h.par === 3 ? 1 : 2) + putts + (h._pen || 0);
            h.score = gross;
            pass = gross <= h.par;
            message = `Hole ${h.num} finished in ${gross} (Par ${h.par}) — ${prox.toFixed(1)}y prox`;
            if (state.course.holeIdx < state.course.holes.length - 1) {
              state.course.holeIdx += 1;
              const nxt = state.course.holes[state.course.holeIdx];
              state.course.stage = nxt.par === 3 ? 'app' : 'tee';
            } else {
              state.course.stage = 'done';
              const rel = state.course.holes.reduce((a, x) => a + ((x.score ?? x.par) - x.par), 0);
              if (state.bests.course3 === undefined || rel < state.bests.course3) {
                state.bests.course3 = rel;
              }
            }
          }
        }
      }

      const bestsChanged = Object.keys(state.bests).some((k) => state.bests[k] !== prevBests[k]);
      return { recorded: true, bestsChanged, pass, message, targetText: getCurrentTargetText(), bests: { ...state.bests } };
    }

    function setBests(bests = {}) {
      if (bests && typeof bests === 'object' && !Array.isArray(bests)) {
        state.bests = { ...state.bests, ...bests };
      }
    }

    function setActive(id) {
      if (CHALLENGE_DEFS.some((d) => d.id === id)) state.activeId = id;
    }

    function setPressureGate(gate) {
      if (['hla', 'path', 'smash'].includes(gate)) state.pressure.gate = gate;
    }

    function resetActive() {
      if (state.activeId === 'combine18') {
        state.combineIdx = 0; state.combinePoints = 0; state.combineResults = [];
      } else if (state.activeId === 'wedge21') {
        state.wedgePoints = 0; state.wedgeShots = 0;
      } else if (state.activeId === 'shape_caller') {
        state.shapeIdx = 0; state.shapeHits = 0;
      } else if (state.activeId === 'iron_ladder') {
        state.ladderStage = 0; state.ladderStreak = 0;
      } else if (state.activeId === 'driver_fairway') {
        state.driverHits = 0; state.driverShots = 0;
      } else if (state.activeId === 'pressure5') {
        state.pressure.streak = 0; state.pressure.lastNote = '';
      } else if (state.activeId === 'course3') {
        state.course.holeIdx = 0;
        state.course.stage = 'tee';
        state.course.holes = [
          { num: 1, par: 4, yds: 412, wind: '-8y Head', appYds: null, score: null },
          { num: 2, par: 3, yds: 164, wind: '12y Cross', appYds: 164, score: null },
          { num: 3, par: 4, yds: 388, wind: '+6y Tail', appYds: null, score: null },
        ];
      }
    }

    function getObsPayload() {
      const def = CHALLENGE_DEFS.find((d) => d.id === state.activeId) || CHALLENGE_DEFS[0];
      let score = 'Ready';
      let isDone = false;
      if (state.activeId === 'combine18') {
        score = `${state.combineResults.length ? Math.round(state.combinePoints / state.combineResults.length) : 0} avg`;
        isDone = state.combineIdx >= 18;
      } else if (state.activeId === 'wedge21') {
        score = `${state.wedgePoints} / 21`;
        isDone = state.wedgePoints >= 21;
      } else if (state.activeId === 'shape_caller') {
        score = `${state.shapeHits}/${state.shapeIdx} hit`;
      } else if (state.activeId === 'iron_ladder') {
        score = `Rung ${state.ladderStage + 1}`;
      } else if (state.activeId === 'driver_fairway') {
        score = `${state.driverHits}/${state.driverShots} FW`;
      } else if (state.activeId === 'pressure5') {
        score = `${state.pressure.streak} / 5`;
      } else if (state.activeId === 'course3') {
        const done = state.course.holes.filter((h) => h.score !== null);
        const rel = done.reduce((a, h) => a + (h.score - h.par), 0);
        score = done.length ? `${rel === 0 ? 'E' : rel > 0 ? `+${rel}` : rel} (${done.length}/3)` : 'Tee 1';
        isDone = state.course.stage === 'done';
      }
      return {
        name: def.short,
        score,
        streak: state.activeId === 'pressure5' ? state.pressure.streak : (state.activeId === 'iron_ladder' ? state.ladderStreak : 0),
        target: getCurrentTargetText(),
        status: isDone ? 'Complete' : 'Live',
      };
    }

    return {
      state,
      getCurrentTargetText,
      recordShot,
      setBests,
      setActive,
      setPressureGate,
      resetActive,
      getObsPayload,
    };
  }

  const api = { CHALLENGE_DEFS, createChallengeStore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof root !== 'undefined' && root) root.ShotLabChallenges = api;
})(typeof window !== 'undefined' ? window : globalThis);
