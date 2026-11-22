/**
 * ShotLab — Local SQLite Swing Pattern Database (zero native C++ build dependencies).
 *
 * Uses Node.js 22+ built-in `node:sqlite` (`DatabaseSync`, also bundled in Electron 35+)
 * to store every real swing in `shotlab/data/swings.sqlite`, automatically sync historical
 * SimWatch `Swings/Sessions/YYYY-MM-DD/shots.jsonl` files, and run fast pattern queries:
 *   - 2D DECADE dispersion & root-cause stroke-leak breakdown per club
 *   - A/B Active Feel comparison verdicts
 *   - Multi-session daily skill trends & warmup/fatigue curve
 *   - 14-club Bag Gapping & Stopping-Power report
 *   - "Compare vs Best" benchmark shot lookup (preferring shots with Kinovea video clips)
 *
 * Falls back cleanly to a JSON-backed in-memory store if `node:sqlite` is unavailable.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { CLUB_ORDER, CLUB_SPECS } = require('./constants');
const { computeDispersionStats } = require('./strokesGained');

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  DatabaseSync = null;
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS shots (
    id TEXT PRIMARY KEY,
    ts TEXT NOT NULL,
    session_date TEXT NOT NULL,
    club TEXT NOT NULL,
    predicted_club TEXT,
    confirmed_club TEXT,
    confidence REAL,
    practice_mode TEXT DEFAULT 'real',
    feel_id TEXT,
    drill_id TEXT,
    source TEXT DEFAULT 'live',
    ball_speed REAL,
    club_speed REAL,
    smash REAL,
    vla REAL,
    hla REAL,
    total_spin REAL,
    back_spin REAL,
    spin_axis REAL,
    aoa REAL,
    path REAL,
    face_to_target REAL,
    face_to_path REAL,
    est_dyn_loft REAL,
    est_shaft_lean REAL,
    carry_yds REAL,
    total_yds REAL,
    apex_ft REAL,
    descent_deg REAL,
    curve_yds REAL,
    offline_yds REAL,
    shot_shape TEXT,
    delivery_id TEXT,
    delivery_name TEXT,
    strike_location TEXT,
    score INTEGER,
    sg_shot REAL,
    left_on_table_yds REAL,
    clip_dtl TEXT,
    clip_fo TEXT,
    is_goto INTEGER DEFAULT 0,
    raw_json TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_shots_ts ON shots(ts DESC);
  CREATE INDEX IF NOT EXISTS idx_shots_club_ts ON shots(club, ts DESC);
  CREATE INDEX IF NOT EXISTS idx_shots_date ON shots(session_date DESC);
  CREATE INDEX IF NOT EXISTS idx_shots_feel ON shots(feel_id);
`;

const NON_FAULT_DELIVERY_IDS = new Set([
  'pure_compression',
  'solid_delivery',
  'tour_sweep',
  'solid_driver',
  'neutral_delivery',
  'ball_flight_ok', // no club read, launch & spin fine (not a fault)
  'no_data',        // Quiet Mode with no club read (nothing graded)
]);

function toNumOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function deriveSiblingClips(clipName) {
  if (!clipName || typeof clipName !== 'string') return { dtl: null, fo: null };
  const clean = clipName.trim();
  if (!clean) return { dtl: null, fo: null };
  if (/_DTL(\.[^.]+)$/i.test(clean)) {
    return { dtl: clean, fo: clean.replace(/_DTL(\.[^.]+)$/i, '_FO$1') };
  }
  if (/_FO(\.[^.]+)$/i.test(clean)) {
    return { dtl: clean.replace(/_FO(\.[^.]+)$/i, '_DTL$1'), fo: clean };
  }
  return { dtl: clean, fo: null };
}

function rowFromAnalyzed(analyzed, extra = {}) {
  const m = analyzed.metrics || {};
  const fl = analyzed.flight || {};
  const dp = analyzed.dplane || {};
  const del = analyzed.delivery || {};
  const st = analyzed.strike || {};
  const pot = analyzed.potential || {};
  const sc = analyzed.scorecard || {};
  const det = analyzed.clubDetection || {};
  const sg = analyzed.strokesGained || {};
  const raw = analyzed.raw || {};

  const ts = analyzed.ts || new Date().toISOString();
  const sessionDate = String(ts).slice(0, 10);
  const clipInfo = deriveSiblingClips(extra.clip || raw.clip || analyzed.clipDtl || null);

  return {
    id: analyzed.id,
    ts,
    session_date: sessionDate,
    club: analyzed.activeClub || '7I',
    predicted_club: det.predictedClub || null,
    confirmed_club: analyzed.confirmedClub || null,
    confidence: toNumOrNull(det.confidencePct),
    practice_mode: extra.practiceMode || analyzed.practiceMode || 'real',
    feel_id: extra.feelId ?? raw.feel_id ?? analyzed.feelId ?? null,
    drill_id: extra.drillId ?? raw.drill_id ?? analyzed.drillId ?? null,
    source: extra.source || raw.source || 'live',
    ball_speed: toNumOrNull(m.ballSpeed),
    club_speed: toNumOrNull(m.clubSpeed),
    smash: toNumOrNull(m.smash),
    vla: toNumOrNull(m.vla),
    hla: toNumOrNull(m.hla),
    total_spin: toNumOrNull(m.totalSpin),
    back_spin: toNumOrNull(m.backSpin),
    spin_axis: toNumOrNull(m.spinAxis),
    aoa: toNumOrNull(m.aoa),
    path: toNumOrNull(m.path),
    face_to_target: toNumOrNull(dp.faceToTarget),
    face_to_path: toNumOrNull(dp.faceToPath),
    est_dyn_loft: toNumOrNull(del.estDynamicLoft),
    est_shaft_lean: toNumOrNull(del.estShaftLean),
    carry_yds: toNumOrNull(m.effectiveCarry ?? fl.carryYds),
    total_yds: toNumOrNull(m.totalYds ?? fl.totalYds),
    apex_ft: toNumOrNull(fl.apexFt),
    descent_deg: toNumOrNull(fl.descentAngleDeg),
    curve_yds: toNumOrNull(fl.curveYds),
    offline_yds: toNumOrNull(fl.offlineYds),
    shot_shape: analyzed.shotShape ? analyzed.shotShape.name : null,
    delivery_id: del.id || null,
    delivery_name: del.name || null,
    strike_location: st.location || null,
    score: Number.isFinite(sc.score) ? Math.round(sc.score) : null,
    sg_shot: toNumOrNull(sg.sg),
    left_on_table_yds: toNumOrNull(pot.totalLeftOnTableYds),
    clip_dtl: extra.clipDtl ?? clipInfo.dtl,
    clip_fo: extra.clipFo ?? clipInfo.fo,
    is_goto: extra.isGoTo ? 1 : 0,
    raw_json: JSON.stringify(raw),
  };
}

class SwingDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.backend = 'memory';
    this.db = null;
    this._fallbackRows = new Map();
    this._fallbackFile = null;

    if (dbPath && dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }

    if (DatabaseSync) {
      this.db = new DatabaseSync(dbPath || ':memory:');
      this.backend = 'sqlite';
      if (dbPath && dbPath !== ':memory:') {
        try {
          this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
        } catch {
          // ignore pragma errors on restricted filesystems
        }
      }
      this.db.exec(SCHEMA_SQL);
    } else {
      this.backend = 'json-fallback';
      if (dbPath && dbPath !== ':memory:') {
        this._fallbackFile = dbPath.replace(/\.sqlite$/i, '.json');
        this._loadFallback();
      }
    }
  }

  _loadFallback() {
    try {
      if (this._fallbackFile && fs.existsSync(this._fallbackFile)) {
        const arr = JSON.parse(fs.readFileSync(this._fallbackFile, 'utf8'));
        if (Array.isArray(arr)) {
          for (const r of arr) {
            if (r && r.id) this._fallbackRows.set(r.id, r);
          }
        }
      }
    } catch {
      // ignore corrupted fallback file
    }
  }

  _saveFallback() {
    if (!this._fallbackFile) return;
    try {
      const tmp = `${this._fallbackFile}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify([...this._fallbackRows.values()]), 'utf8');
      fs.renameSync(tmp, this._fallbackFile);
    } catch {
      // ignore write errors
    }
  }

  close() {
    if (this.db) {
      try { this.db.close(); } catch {}
      this.db = null;
    }
  }

  upsertShot(analyzed, extra = {}) {
    if (!analyzed || !analyzed.id) return null;
    if (analyzed.isDemo || analyzed.isPreviewSeed) return null;
    const row = rowFromAnalyzed(analyzed, extra);

    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT INTO shots (
          id, ts, session_date, club, predicted_club, confirmed_club, confidence,
          practice_mode, feel_id, drill_id, source,
          ball_speed, club_speed, smash, vla, hla, total_spin, back_spin, spin_axis,
          aoa, path, face_to_target, face_to_path, est_dyn_loft, est_shaft_lean,
          carry_yds, total_yds, apex_ft, descent_deg, curve_yds, offline_yds,
          shot_shape, delivery_id, delivery_name, strike_location,
          score, sg_shot, left_on_table_yds, clip_dtl, clip_fo, is_goto, raw_json
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(id) DO UPDATE SET
          club = CASE WHEN excluded.confirmed_club IS NULL AND shots.confirmed_club IS NOT NULL THEN shots.club ELSE excluded.club END,
          predicted_club = excluded.predicted_club,
          confirmed_club = COALESCE(excluded.confirmed_club, shots.confirmed_club),
          confidence = excluded.confidence,
          practice_mode = CASE WHEN excluded.source = 'simwatch_history' AND shots.practice_mode != 'real' THEN shots.practice_mode ELSE excluded.practice_mode END,
          feel_id = COALESCE(excluded.feel_id, shots.feel_id),
          drill_id = COALESCE(excluded.drill_id, shots.drill_id),
          face_to_target = excluded.face_to_target,
          face_to_path = excluded.face_to_path,
          est_dyn_loft = excluded.est_dyn_loft,
          est_shaft_lean = excluded.est_shaft_lean,
          carry_yds = excluded.carry_yds,
          total_yds = excluded.total_yds,
          apex_ft = excluded.apex_ft,
          descent_deg = excluded.descent_deg,
          curve_yds = excluded.curve_yds,
          offline_yds = excluded.offline_yds,
          shot_shape = excluded.shot_shape,
          delivery_id = excluded.delivery_id,
          delivery_name = excluded.delivery_name,
          strike_location = excluded.strike_location,
          score = excluded.score,
          sg_shot = excluded.sg_shot,
          left_on_table_yds = excluded.left_on_table_yds,
          clip_dtl = COALESCE(excluded.clip_dtl, shots.clip_dtl),
          clip_fo = COALESCE(excluded.clip_fo, shots.clip_fo),
          is_goto = MAX(shots.is_goto, excluded.is_goto),
          raw_json = excluded.raw_json
      `);
      stmt.run(
        row.id, row.ts, row.session_date, row.club, row.predicted_club, row.confirmed_club, row.confidence,
        row.practice_mode, row.feel_id, row.drill_id, row.source,
        row.ball_speed, row.club_speed, row.smash, row.vla, row.hla, row.total_spin, row.back_spin, row.spin_axis,
        row.aoa, row.path, row.face_to_target, row.face_to_path, row.est_dyn_loft, row.est_shaft_lean,
        row.carry_yds, row.total_yds, row.apex_ft, row.descent_deg, row.curve_yds, row.offline_yds,
        row.shot_shape, row.delivery_id, row.delivery_name, row.strike_location,
        row.score, row.sg_shot, row.left_on_table_yds, row.clip_dtl, row.clip_fo, row.is_goto, row.raw_json
      );
    } else {
      const prev = this._fallbackRows.get(row.id);
      this._fallbackRows.set(row.id, prev ? {
        ...prev,
        ...row,
        club: !row.confirmed_club && prev.confirmed_club ? prev.club : row.club,
        predicted_club: row.predicted_club,
        confirmed_club: row.confirmed_club || prev.confirmed_club,
        practice_mode: (row.source === 'simwatch_history' && prev.practice_mode && prev.practice_mode !== 'real')
          ? prev.practice_mode
          : row.practice_mode,
        feel_id: row.feel_id || prev.feel_id,
        drill_id: row.drill_id || prev.drill_id,
        face_to_target: row.face_to_target,
        face_to_path: row.face_to_path,
        clip_dtl: row.clip_dtl || prev.clip_dtl,
        clip_fo: row.clip_fo || prev.clip_fo,
        is_goto: Math.max(prev.is_goto || 0, row.is_goto || 0),
      } : row);
      if (!extra._deferSave) {
        this._saveFallback();
      }
    }
    return row;
  }

  getShotById(id) {
    if (!id) return null;
    if (this.db) {
      return this.db.prepare('SELECT * FROM shots WHERE id = ?').get(id) || null;
    }
    return this._fallbackRows.get(id) || null;
  }

  updateClipByTs(ts, clipName) {
    if (!ts || !clipName) return false;
    const { dtl, fo } = deriveSiblingClips(clipName);
    if (this.db) {
      const res = this.db.prepare(
        'UPDATE shots SET clip_dtl = COALESCE(?, clip_dtl), clip_fo = COALESCE(?, clip_fo) WHERE ts = ?'
      ).run(dtl, fo, ts);
      return Number(res.changes || 0) > 0;
    }
    let hit = false;
    for (const r of this._fallbackRows.values()) {
      if (r.ts === ts) {
        r.clip_dtl = dtl || r.clip_dtl;
        r.clip_fo = fo || r.clip_fo;
        hit = true;
      }
    }
    if (hit) this._saveFallback();
    return hit;
  }

  markGoTo(id, isGoTo = true) {
    if (!id) return false;
    const val = isGoTo ? 1 : 0;
    if (this.db) {
      const res = this.db.prepare('UPDATE shots SET is_goto = ? WHERE id = ?').run(val, id);
      return Number(res.changes || 0) > 0;
    }
    const r = this._fallbackRows.get(id);
    if (!r) return false;
    r.is_goto = val;
    this._saveFallback();
    return true;
  }

  _queryShots({ club = null, mode = null, days = null, feelId = null, limit = 2000 } = {}) {
    let cutoffDate = null;
    if (Number.isFinite(days) && days > 0) {
      const d = new Date(Date.now() - days * 86400 * 1000);
      cutoffDate = d.toISOString().slice(0, 10);
    }
    const safeLimit = Math.max(1, Math.min(10000, Number(limit) || 2000));

    if (this.db) {
      const where = [];
      const params = [];
      if (club && club !== 'ALL') { where.push('club = ?'); params.push(club); }
      if (mode && mode !== 'all') { where.push('practice_mode = ?'); params.push(mode); }
      if (cutoffDate) { where.push('session_date >= ?'); params.push(cutoffDate); }
      if (feelId) { where.push('feel_id = ?'); params.push(feelId); }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      params.push(safeLimit);
      return this.db.prepare(`SELECT * FROM shots ${clause} ORDER BY ts DESC LIMIT ?`).all(...params);
    }

    return [...this._fallbackRows.values()]
      .filter((r) => (!club || club === 'ALL' || r.club === club))
      .filter((r) => (!mode || mode === 'all' || r.practice_mode === mode))
      .filter((r) => (!cutoffDate || r.session_date >= cutoffDate))
      .filter((r) => (!feelId || r.feel_id === feelId))
      .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
      .slice(0, safeLimit);
  }

  getSummary() {
    if (this.db) {
      const row = this.db.prepare(`
        SELECT
          COUNT(*) AS totalShots,
          COUNT(DISTINCT session_date) AS totalSessions,
          COUNT(DISTINCT club) AS clubsTracked,
          MIN(session_date) AS firstDate,
          MAX(session_date) AS lastDate,
          COALESCE(SUM(CASE WHEN clip_dtl IS NOT NULL OR clip_fo IS NOT NULL THEN 1 ELSE 0 END), 0) AS clipsLinked
        FROM shots
      `).get();
      return { backend: this.backend, ...row };
    }
    const rows = [...this._fallbackRows.values()];
    const dates = new Set(rows.map((r) => r.session_date));
    const clubs = new Set(rows.map((r) => r.club));
    const sorted = [...dates].sort();
    return {
      backend: this.backend,
      totalShots: rows.length,
      totalSessions: dates.size,
      clubsTracked: clubs.size,
      firstDate: sorted[0] || null,
      lastDate: sorted[sorted.length - 1] || null,
      clipsLinked: rows.filter((r) => r.clip_dtl || r.clip_fo).length,
    };
  }

  getClubPatterns({ club = 'ALL', mode = 'real', days = 90 } = {}) {
    const rows = this._queryShots({ club, mode, days, limit: 2000 });
    const dispersion = computeDispersionStats(rows, { club });

    const avg = (arr) => {
      const vals = arr.filter((v) => typeof v === 'number' && Number.isFinite(v));
      if (!vals.length) return null;
      return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
    };

    return {
      club,
      mode,
      days,
      ...dispersion,
      averages: {
        ballSpeed: avg(rows.map((r) => r.ball_speed)),
        clubSpeed: avg(rows.map((r) => r.club_speed)),
        smash: avg(rows.map((r) => r.smash)),
        vla: avg(rows.map((r) => r.vla)),
        backSpin: avg(rows.map((r) => r.back_spin)) !== null ? Math.round(avg(rows.map((r) => r.back_spin))) : null,
        aoa: avg(rows.map((r) => r.aoa)),
        path: avg(rows.map((r) => r.path)),
        estShaftLean: avg(rows.map((r) => r.est_shaft_lean)),
        carryYds: avg(rows.map((r) => r.carry_yds)),
        apexFt: avg(rows.map((r) => r.apex_ft)),
        descentDeg: avg(rows.map((r) => r.descent_deg)),
      },
    };
  }

  /**
   * A/B Active Feel Verdicts — proves with real BLP data which swing feel wins!
   */
  getFeelComparison({ club = 'ALL', mode = 'real', days = 90 } = {}) {
    const rows = this._queryShots({ club, mode, days, limit: 3000 });
    const groups = new Map();

    for (const r of rows) {
      const key = r.feel_id || '__untagged__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }

    const avg = (arr, digits = 2) => {
      const vals = arr.filter((v) => typeof v === 'number' && Number.isFinite(v));
      if (!vals.length) return null;
      const p = 10 ** digits;
      return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * p) / p;
    };

    return [...groups.entries()]
      .map(([feelId, list]) => {
        const disp = computeDispersionStats(list, { club });
        const faultCount = list.filter((r) => r.delivery_id && !NON_FAULT_DELIVERY_IDS.has(r.delivery_id)).length;
        return {
          feelId: feelId === '__untagged__' ? null : feelId,
          label: feelId === '__untagged__' ? 'Baseline (No Feel Tagged)' : feelId,
          n: list.length,
          avgScore: disp.avgScore,
          avgSg: disp.avgSg,
          avgSmash: avg(list.map((r) => r.smash), 2),
          avgCarry: avg(list.map((r) => r.carry_yds), 1),
          avgShaftLean: avg(list.map((r) => r.est_shaft_lean), 1),
          width80Yds: disp.ellipse80 ? disp.ellipse80.widthYds : null,
          faultPct: Math.round((faultCount / list.length) * 100),
          lastUsed: list[0] ? list[0].session_date : null,
        };
      })
      .sort((a, b) => {
        if (a.feelId === null) return 1;
        if (b.feelId === null) return -1;
        return (b.avgScore ?? -1) - (a.avgScore ?? -1);
      });
  }

  /**
   * Multi-session daily trend series for long-term skill tracking.
   */
  getSessionTrends({ club = 'ALL', mode = 'real', days = null, limit = 30 } = {}) {
    const rows = this._queryShots({ club, mode, days, limit: 5000 });
    const byDate = new Map();
    for (const r of rows) {
      if (!byDate.has(r.session_date)) byDate.set(r.session_date, []);
      byDate.get(r.session_date).push(r);
    }

    const avg = (arr, d = 1) => {
      const vals = arr.filter((v) => typeof v === 'number' && Number.isFinite(v));
      if (!vals.length) return null;
      const p = 10 ** d;
      return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * p) / p;
    };

    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-limit)
      .map(([date, list]) => {
        const faults = list.filter((r) => r.delivery_id && !NON_FAULT_DELIVERY_IDS.has(r.delivery_id)).length;
        return {
          date,
          n: list.length,
          avgScore: avg(list.map((r) => r.score), 0),
          avgSmash: avg(list.map((r) => r.smash), 2),
          avgCarry: avg(list.map((r) => r.carry_yds), 1),
          avgShaftLean: avg(list.map((r) => r.est_shaft_lean), 1),
          avgSg: avg(list.map((r) => r.sg_shot), 2),
          faultPct: Math.round((faults / list.length) * 100),
        };
      });
  }

  /**
   * Warmup & Fatigue Curve — buckets shots by within-session shot index (1-10, 11-25, 26-45, 46-70, 71+).
   */
  getFatigueCurve({ mode = 'real', days = 90 } = {}) {
    const rows = this._queryShots({ mode, days, limit: 5000 });
    const byDate = new Map();
    for (const r of rows) {
      if (!byDate.has(r.session_date)) byDate.set(r.session_date, []);
      byDate.get(r.session_date).push(r);
    }

    const buckets = [
      { id: '1-10', label: 'Warmup (1–10)', min: 1, max: 10, rows: [] },
      { id: '11-25', label: 'Dialed In (11–25)', min: 11, max: 25, rows: [] },
      { id: '26-45', label: 'Peak Window (26–45)', min: 26, max: 45, rows: [] },
      { id: '46-70', label: 'Late Session (46–70)', min: 46, max: 70, rows: [] },
      { id: '71+', label: 'Fatigue Zone (71+)', min: 71, max: 9999, rows: [] },
    ];

    for (const list of byDate.values()) {
      list.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
      list.forEach((shot, i) => {
        const num = i + 1;
        const b = buckets.find((x) => num >= x.min && num <= x.max);
        if (b) b.rows.push(shot);
      });
    }

    const avg = (arr, d = 1) => {
      const vals = arr.filter((v) => typeof v === 'number' && Number.isFinite(v));
      if (!vals.length) return null;
      const p = 10 ** d;
      return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * p) / p;
    };

    return buckets.map((b) => ({
      id: b.id,
      label: b.label,
      n: b.rows.length,
      avgScore: avg(b.rows.map((r) => r.score), 0),
      avgSmash: avg(b.rows.map((r) => r.smash), 2),
      avgSg: avg(b.rows.map((r) => r.sg_shot), 2),
    }));
  }

  /**
   * 14-Club Bag Gapping & Stopping-Power Report (with dead-zone gap alerts).
   */
  getBagGapping({ mode = 'real', days = 180 } = {}) {
    const rows = this._queryShots({ mode, days, limit: 5000 });
    const byClub = new Map();
    for (const r of rows) {
      if (!byClub.has(r.club)) byClub.set(r.club, []);
      byClub.get(r.club).push(r);
    }

    const avg = (arr, d = 1) => {
      const vals = arr.filter((v) => typeof v === 'number' && Number.isFinite(v));
      if (!vals.length) return null;
      const p = 10 ** d;
      return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * p) / p;
    };

    const clubs = CLUB_ORDER.map((code) => {
      const list = byClub.get(code) || [];
      const disp = computeDispersionStats(list, { club: code });
      const spec = CLUB_SPECS[code];
      const avgDescent = avg(list.map((r) => r.descent_deg), 1);
      const stoppingPower = avgDescent === null ? '—'
        : avgDescent >= 47 ? 'Drop & Stop'
        : avgDescent >= 41 ? 'Holds Green'
        : 'Runs Out';

      return {
        club: code,
        label: spec ? spec.label : code,
        n: list.length,
        avgCarry: disp.meanCarry,
        avgTotal: avg(list.map((r) => r.total_yds), 1),
        avgBallSpeed: avg(list.map((r) => r.ball_speed), 1),
        avgSmash: avg(list.map((r) => r.smash), 2),
        avgSpin: avg(list.map((r) => r.back_spin), 0),
        avgDescent,
        stoppingPower,
        width80Yds: disp.ellipse80 ? disp.ellipse80.widthYds : null,
        avgSg: disp.avgSg,
        avgScore: disp.avgScore,
        gapToNextYds: null,
        gapAlert: null,
      };
    });

    // Compute gapping between populated consecutive clubs
    const populated = clubs.filter((c) => c.n >= 2 && c.avgCarry !== null);
    for (let i = 0; i < populated.length - 1; i += 1) {
      const cur = populated[i];
      const next = populated[i + 1];
      const gap = Math.round((cur.avgCarry - next.avgCarry) * 10) / 10;
      cur.gapToNextYds = gap;
      if (gap < 7) {
        cur.gapAlert = `Overlap (${gap}y gap to ${next.club})`;
      } else if (gap > 22 && cur.club !== 'DR') {
        cur.gapAlert = `Big gap (${gap}y to ${next.club})`;
      }
    }

    return clubs;
  }

  /**
   * Find the player's benchmark "Best Shot" for a club (for Side-by-Side Compare vs Best).
   * Prefers Go-To / video-linked high-score shots, falling back to highest-scoring real shot.
   */
  getBestShotForClub(club, { excludeId = null, preferClip = true } = {}) {
    const preferClipInt = preferClip ? 1 : 0;
    if (this.db) {
      const where = ["practice_mode = 'real'"];
      const params = [];
      if (club && club !== 'ALL') {
        where.push('club = ?');
        params.push(club);
      }
      if (excludeId) {
        where.push('id != ?');
        params.push(excludeId);
      }
      params.push(preferClipInt);
      return this.db.prepare(`
        SELECT * FROM shots
        WHERE ${where.join(' AND ')}
        ORDER BY
          (CASE WHEN ? AND (clip_dtl IS NOT NULL OR clip_fo IS NOT NULL) THEN 1 ELSE 0 END) DESC,
          is_goto DESC,
          COALESCE(score, -1) DESC,
          ts DESC
        LIMIT 1
      `).get(...params) || null;
    }

    const rows = [...this._fallbackRows.values()]
      .filter((r) => r.practice_mode === 'real')
      .filter((r) => !club || club === 'ALL' || r.club === club)
      .filter((r) => !excludeId || r.id !== excludeId);
    if (!rows.length) return null;

    rows.sort((a, b) => {
      const aClip = preferClip && (a.clip_dtl || a.clip_fo) ? 1 : 0;
      const bClip = preferClip && (b.clip_dtl || b.clip_fo) ? 1 : 0;
      if (aClip !== bClip) return bClip - aClip;
      if ((b.is_goto || 0) !== (a.is_goto || 0)) return (b.is_goto || 0) - (a.is_goto || 0);
      if ((b.score ?? -1) !== (a.score ?? -1)) return (b.score ?? -1) - (a.score ?? -1);
      return String(b.ts).localeCompare(String(a.ts));
    });
    return rows[0];
  }

  /**
   * Return recent shots that have linked Kinovea DTL/FO clips (for the Video Compare tab).
   */
  getRecentShotsWithClips({ club = 'ALL', limit = 40 } = {}) {
    return this._queryShots({ club, limit: 400 })
      .filter((r) => r.clip_dtl || r.clip_fo)
      .slice(0, limit);
  }

  /**
   * Ingest all historical SimWatch `Swings/Sessions/YYYY-MM-DD/shots.jsonl` files into the local DB.
   */
  syncSimWatchSessions(sessionsDir, analyzeFn) {
    if (!sessionsDir || !fs.existsSync(sessionsDir) || typeof analyzeFn !== 'function') {
      return { filesScanned: 0, shotsImported: 0 };
    }

    let filesScanned = 0;
    let shotsImported = 0;
    let entries;
    try {
      entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
    } catch {
      return { filesScanned: 0, shotsImported: 0 };
    }

    // Prefetch existing shot IDs & clip status once to skip re-analyzing already-ingested shots
    const existing = new Map();
    if (this.db) {
      for (const r of this.db.prepare('SELECT id, clip_dtl, clip_fo FROM shots').all()) {
        existing.set(r.id, { clip_dtl: r.clip_dtl || null, clip_fo: r.clip_fo || null });
      }
    } else {
      for (const r of this._fallbackRows.values()) {
        existing.set(r.id, { clip_dtl: r.clip_dtl || null, clip_fo: r.clip_fo || null });
      }
    }

    const updateClipStmt = this.db
      ? this.db.prepare('UPDATE shots SET clip_dtl = COALESCE(clip_dtl, ?), clip_fo = COALESCE(clip_fo, ?) WHERE id = ?')
      : null;

    let fallbackDirty = false;
    const inTx = Boolean(this.db);
    if (inTx) {
      this.db.exec('BEGIN');
    }

    try {
      for (const ent of entries) {
        if (!ent.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(ent.name)) continue;
        const jsonlPath = path.join(sessionsDir, ent.name, 'shots.jsonl');
        if (!fs.existsSync(jsonlPath)) continue;
        filesScanned += 1;

        let lines;
        try {
          lines = fs.readFileSync(jsonlPath, 'utf8').split(/\r?\n/);
        } catch {
          continue;
        }

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const raw = JSON.parse(trimmed);
            const rawShotNum = raw.shot_num ?? raw.ShotNumber;
            const parsedNum = (rawShotNum !== null && rawShotNum !== undefined && rawShotNum !== '' && typeof rawShotNum !== 'boolean')
              ? Number(rawShotNum)
              : NaN;
            const candidateId = raw.ts
              ? `${raw.ts}_${Number.isFinite(parsedNum) && parsedNum ? parsedNum : 0}`
              : null;

            if (candidateId && existing.has(candidateId)) {
              const prevClips = existing.get(candidateId);
              if (raw.clip && (!prevClips.clip_dtl || !prevClips.clip_fo)) {
                const { dtl, fo } = deriveSiblingClips(raw.clip);
                if ((dtl && !prevClips.clip_dtl) || (fo && !prevClips.clip_fo)) {
                  if (updateClipStmt) {
                    updateClipStmt.run(dtl, fo, candidateId);
                  } else {
                    const row = this._fallbackRows.get(candidateId);
                    if (row) {
                      row.clip_dtl = row.clip_dtl || dtl;
                      row.clip_fo = row.clip_fo || fo;
                      fallbackDirty = true;
                    }
                  }
                  existing.set(candidateId, {
                    clip_dtl: prevClips.clip_dtl || dtl,
                    clip_fo: prevClips.clip_fo || fo,
                  });
                }
              }
              continue;
            }

            const analyzed = analyzeFn(raw);
            if (analyzed && analyzed.id) {
              if (existing.has(analyzed.id)) {
                const prevClips = existing.get(analyzed.id);
                if (raw.clip && (!prevClips.clip_dtl || !prevClips.clip_fo)) {
                  const { dtl, fo } = deriveSiblingClips(raw.clip);
                  if ((dtl && !prevClips.clip_dtl) || (fo && !prevClips.clip_fo)) {
                    if (updateClipStmt) {
                      updateClipStmt.run(dtl, fo, analyzed.id);
                    } else {
                      const row = this._fallbackRows.get(analyzed.id);
                      if (row) {
                        row.clip_dtl = row.clip_dtl || dtl;
                        row.clip_fo = row.clip_fo || fo;
                        fallbackDirty = true;
                      }
                    }
                    existing.set(analyzed.id, {
                      clip_dtl: prevClips.clip_dtl || dtl,
                      clip_fo: prevClips.clip_fo || fo,
                    });
                  }
                }
                continue;
              }

              const inserted = this.upsertShot(analyzed, {
                source: 'simwatch_history',
                clip: raw.clip || null,
                feelId: raw.feel_id || null,
                drillId: raw.drill_id || null,
                _deferSave: true,
              });
              if (inserted) {
                existing.set(inserted.id, {
                  clip_dtl: inserted.clip_dtl || null,
                  clip_fo: inserted.clip_fo || null,
                });
                shotsImported += 1;
                fallbackDirty = true;
              }
            }
          } catch {
            // skip torn/malformed JSONL lines
          }
        }
      }

      if (inTx) {
        this.db.exec('COMMIT');
      } else if (fallbackDirty) {
        this._saveFallback();
      }
    } catch (err) {
      if (inTx) {
        try { this.db.exec('ROLLBACK'); } catch {}
      }
      throw err;
    }

    return { filesScanned, shotsImported };
  }
}

module.exports = {
  NON_FAULT_DELIVERY_IDS,
  SwingDatabase,
  deriveSiblingClips,
};
