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
const { CLUB_ORDER, CLUB_CATEGORY_GROUPS, CLUB_SPECS } = require('./constants');
const { computeDispersionStats, NON_FAULT_DELIVERY_IDS } = require('./strokesGained');
const { isKidsZoneRawShot } = require('./kids');

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
    deleted INTEGER DEFAULT 0,
    raw_json TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_shots_ts ON shots(ts DESC);
  CREATE INDEX IF NOT EXISTS idx_shots_club_ts ON shots(club, ts DESC);
  CREATE INDEX IF NOT EXISTS idx_shots_date ON shots(session_date DESC);
  CREATE INDEX IF NOT EXISTS idx_shots_feel ON shots(feel_id);
`;

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
    deleted: 0,
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
      const cols = this.db.prepare('PRAGMA table_info(shots)').all();
      if (!cols.some((c) => c && c.name === 'deleted')) {
        this.db.exec('ALTER TABLE shots ADD COLUMN deleted INTEGER DEFAULT 0;');
      }
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_shots_deleted ON shots(deleted);');
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
    const rawDrill = String(extra.drillId || analyzed.drillId || '').toLowerCase();
    if (analyzed.isKids || extra.isKids || analyzed.practiceMode === 'kids' || isKidsZoneRawShot(analyzed.raw) || rawDrill.startsWith('kids-')) {
      return null;
    }
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
          face_to_target = CASE WHEN excluded.confirmed_club IS NULL AND shots.confirmed_club IS NOT NULL THEN shots.face_to_target ELSE excluded.face_to_target END,
          face_to_path = CASE WHEN excluded.confirmed_club IS NULL AND shots.confirmed_club IS NOT NULL THEN shots.face_to_path ELSE excluded.face_to_path END,
          est_dyn_loft = CASE WHEN excluded.confirmed_club IS NULL AND shots.confirmed_club IS NOT NULL THEN shots.est_dyn_loft ELSE excluded.est_dyn_loft END,
          est_shaft_lean = CASE WHEN excluded.confirmed_club IS NULL AND shots.confirmed_club IS NOT NULL THEN shots.est_shaft_lean ELSE excluded.est_shaft_lean END,
          carry_yds = excluded.carry_yds,
          total_yds = excluded.total_yds,
          apex_ft = excluded.apex_ft,
          descent_deg = excluded.descent_deg,
          curve_yds = excluded.curve_yds,
          offline_yds = excluded.offline_yds,
          shot_shape = excluded.shot_shape,
          delivery_id = CASE WHEN excluded.confirmed_club IS NULL AND shots.confirmed_club IS NOT NULL THEN shots.delivery_id ELSE excluded.delivery_id END,
          delivery_name = CASE WHEN excluded.confirmed_club IS NULL AND shots.confirmed_club IS NOT NULL THEN shots.delivery_name ELSE excluded.delivery_name END,
          strike_location = CASE WHEN excluded.confirmed_club IS NULL AND shots.confirmed_club IS NOT NULL THEN shots.strike_location ELSE excluded.strike_location END,
          score = CASE WHEN excluded.confirmed_club IS NULL AND shots.confirmed_club IS NOT NULL THEN shots.score ELSE excluded.score END,
          sg_shot = CASE WHEN excluded.confirmed_club IS NULL AND shots.confirmed_club IS NOT NULL THEN shots.sg_shot ELSE excluded.sg_shot END,
          left_on_table_yds = CASE WHEN excluded.confirmed_club IS NULL AND shots.confirmed_club IS NOT NULL THEN shots.left_on_table_yds ELSE excluded.left_on_table_yds END,
          clip_dtl = COALESCE(excluded.clip_dtl, shots.clip_dtl),
          clip_fo = COALESCE(excluded.clip_fo, shots.clip_fo),
          is_goto = MAX(shots.is_goto, excluded.is_goto),
          deleted = COALESCE(shots.deleted, 0),
          raw_json = CASE WHEN excluded.confirmed_club IS NULL AND shots.confirmed_club IS NOT NULL THEN shots.raw_json ELSE excluded.raw_json END
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
      const keepConfirmed = Boolean(prev && !row.confirmed_club && prev.confirmed_club);
      this._fallbackRows.set(row.id, prev ? {
        ...prev,
        ...row,
        club: keepConfirmed ? prev.club : row.club,
        predicted_club: row.predicted_club,
        confirmed_club: row.confirmed_club || prev.confirmed_club,
        practice_mode: (row.source === 'simwatch_history' && prev.practice_mode && prev.practice_mode !== 'real')
          ? prev.practice_mode
          : row.practice_mode,
        feel_id: row.feel_id || prev.feel_id,
        drill_id: row.drill_id || prev.drill_id,
        face_to_target: keepConfirmed ? prev.face_to_target : row.face_to_target,
        face_to_path: keepConfirmed ? prev.face_to_path : row.face_to_path,
        est_dyn_loft: keepConfirmed ? prev.est_dyn_loft : row.est_dyn_loft,
        est_shaft_lean: keepConfirmed ? prev.est_shaft_lean : row.est_shaft_lean,
        delivery_id: keepConfirmed ? prev.delivery_id : row.delivery_id,
        delivery_name: keepConfirmed ? prev.delivery_name : row.delivery_name,
        strike_location: keepConfirmed ? prev.strike_location : row.strike_location,
        score: keepConfirmed ? prev.score : row.score,
        sg_shot: keepConfirmed ? prev.sg_shot : row.sg_shot,
        left_on_table_yds: keepConfirmed ? prev.left_on_table_yds : row.left_on_table_yds,
        raw_json: keepConfirmed ? prev.raw_json : row.raw_json,
        clip_dtl: row.clip_dtl || prev.clip_dtl,
        clip_fo: row.clip_fo || prev.clip_fo,
        is_goto: Math.max(prev.is_goto || 0, row.is_goto || 0),
        deleted: prev.deleted ? 1 : 0,
      } : row);
      if (!extra._deferSave) {
        this._saveFallback();
      }
    }
    return row;
  }

  getShotById(id, { includeDeleted = false } = {}) {
    if (!id) return null;
    if (this.db) {
      const sql = includeDeleted
        ? 'SELECT * FROM shots WHERE id = ?'
        : 'SELECT * FROM shots WHERE id = ? AND COALESCE(deleted, 0) = 0';
      return this.db.prepare(sql).get(id) || null;
    }
    const r = this._fallbackRows.get(id) || null;
    if (!r) return null;
    return includeDeleted || !r.deleted ? r : null;
  }

  isDeleted(id) {
    if (!id) return false;
    if (this.db) {
      const row = this.db.prepare('SELECT deleted FROM shots WHERE id = ?').get(id);
      return Boolean(row && row.deleted);
    }
    const r = this._fallbackRows.get(id);
    return Boolean(r && r.deleted);
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
      const res = this.db.prepare('UPDATE shots SET is_goto = ? WHERE id = ? AND COALESCE(deleted, 0) = 0').run(val, id);
      return Number(res.changes || 0) > 0;
    }
    const r = this._fallbackRows.get(id);
    if (!r || r.deleted) return false;
    r.is_goto = val;
    this._saveFallback();
    return true;
  }

  _queryShots({ club = null, mode = null, days = null, feelId = null, quality = 'all', includeDeleted = false, limit = 2000 } = {}) {
    let cutoffDate = null;
    if (Number.isFinite(days) && days > 0) {
      const d = new Date(Date.now() - days * 86400 * 1000);
      cutoffDate = d.toISOString().slice(0, 10);
    }
    const safeLimit = Math.max(1, Math.min(10000, Number(limit) || 2000));

    if (this.db) {
      const where = [];
      const params = [];
      if (!includeDeleted) where.push('COALESCE(deleted, 0) = 0');
      if (club && club !== 'ALL') { where.push('club = ?'); params.push(club); }
      if (mode && mode !== 'all') { where.push('practice_mode = ?'); params.push(mode); }
      if (cutoffDate) { where.push('session_date >= ?'); params.push(cutoffDate); }
      if (feelId) { where.push('feel_id = ?'); params.push(feelId); }
      if (quality === 'full') {
        where.push('club_speed IS NOT NULL AND club_speed > 0');
      } else if (quality === 'center') {
        where.push("strike_location = 'center'");
      }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      params.push(safeLimit);
      return this.db.prepare(`SELECT * FROM shots ${clause} ORDER BY ts DESC LIMIT ?`).all(...params);
    }

    return [...this._fallbackRows.values()]
      .filter((r) => (includeDeleted || !r.deleted))
      .filter((r) => (!club || club === 'ALL' || r.club === club))
      .filter((r) => (!mode || mode === 'all' || r.practice_mode === mode))
      .filter((r) => (!cutoffDate || r.session_date >= cutoffDate))
      .filter((r) => (!feelId || r.feel_id === feelId))
      .filter((r) => (!quality || quality === 'all' || (quality === 'full' ? (typeof r.club_speed === 'number' && r.club_speed > 0) : quality === 'center' ? r.strike_location === 'center' : true)))
      .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
      .slice(0, safeLimit);
  }

  softDeleteShot(id) {
    if (!id) return false;
    if (this.db) {
      const res = this.db.prepare('UPDATE shots SET deleted = 1 WHERE id = ? AND COALESCE(deleted, 0) = 0').run(id);
      return Number(res.changes || 0) > 0;
    }
    const r = this._fallbackRows.get(id);
    if (!r || r.deleted) return false;
    r.deleted = 1;
    this._saveFallback();
    return true;
  }

  getDeletedShots({ club = null, sessionDate = null } = {}) {
    if (this.db) {
      const where = ['COALESCE(deleted, 0) = 1'];
      const params = [];
      if (club && club !== 'ALL') { where.push('club = ?'); params.push(club); }
      if (sessionDate) { where.push('session_date = ?'); params.push(sessionDate); }
      return this.db.prepare(`SELECT * FROM shots WHERE ${where.join(' AND ')} ORDER BY ts DESC`).all(...params);
    }
    return [...this._fallbackRows.values()]
      .filter((r) => Boolean(r.deleted))
      .filter((r) => (!club || club === 'ALL' || r.club === club))
      .filter((r) => (!sessionDate || r.session_date === sessionDate))
      .sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  }

  restoreDeletedShots({ club = null } = {}) {
    if (this.db) {
      const sql = (club && club !== 'ALL')
        ? 'UPDATE shots SET deleted = 0 WHERE COALESCE(deleted, 0) = 1 AND club = ?'
        : 'UPDATE shots SET deleted = 0 WHERE COALESCE(deleted, 0) = 1';
      const res = (club && club !== 'ALL') ? this.db.prepare(sql).run(club) : this.db.prepare(sql).run();
      return Number(res.changes || 0);
    }
    let count = 0;
    for (const r of this._fallbackRows.values()) {
      if (r.deleted && (!club || club === 'ALL' || r.club === club)) {
        r.deleted = 0;
        count += 1;
      }
    }
    if (count > 0) this._saveFallback();
    return count;
  }

  getDeletedCount({ club = null } = {}) {
    if (this.db) {
      const row = (club && club !== 'ALL')
        ? this.db.prepare('SELECT COUNT(*) AS cnt FROM shots WHERE COALESCE(deleted, 0) = 1 AND club = ?').get(club)
        : this.db.prepare('SELECT COUNT(*) AS cnt FROM shots WHERE COALESCE(deleted, 0) = 1').get();
      return Number(row?.cnt || 0);
    }
    let cnt = 0;
    for (const r of this._fallbackRows.values()) {
      if (r.deleted && (!club || club === 'ALL' || r.club === club)) cnt += 1;
    }
    return cnt;
  }

  getClubShots({ club = 'ALL', mode = 'real', days = 90, quality = 'all', limit = 200 } = {}) {
    return this._queryShots({ club, mode, days, quality, limit });
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
        WHERE COALESCE(deleted, 0) = 0
      `).get();
      return { backend: this.backend, ...row };
    }
    const rows = [...this._fallbackRows.values()].filter((r) => !r.deleted);
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
   * 14-Club Bag Gapping & Stopping-Power Report (with quality/category filters, ±2σ outlier trim, and dead-zone gap alerts).
   */
  getBagGapping({ mode = 'real', days = 180, quality = 'all', category = 'all', trimOutliers = false } = {}) {
    const rows = this._queryShots({ mode, days, quality, limit: 5000 });
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

    const medianOf = (arr) => {
      const s = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    };

    const trimList = (rawList) => {
      if (!trimOutliers || rawList.length < 4) return { list: rawList, trimmed: 0 };
      const flightPool = rawList.filter((r) => typeof r.carry_yds === 'number' && Number.isFinite(r.carry_yds) && r.carry_yds > 5);
      if (flightPool.length < 2) {
        return flightPool.length === 1
          ? { list: flightPool, trimmed: rawList.length - 1 }
          : { list: rawList, trimmed: 0 };
      }
      const basePool = flightPool;
      const carries = basePool.map((r) => r.carry_yds).filter((v) => typeof v === 'number' && Number.isFinite(v));
      if (carries.length < 4) {
        return basePool.length < rawList.length
          ? { list: basePool, trimmed: rawList.length - basePool.length }
          : { list: rawList, trimmed: 0 };
      }
      const medC = medianOf(carries);
      const madC = medianOf(carries.map((v) => Math.abs(v - medC)));
      const robustStdC = Math.max(4, madC * 1.4826);

      const offs = basePool.map((r) => r.offline_yds).filter((v) => typeof v === 'number' && Number.isFinite(v));
      const medO = offs.length >= 4 ? medianOf(offs) : 0;
      const madO = offs.length >= 4 ? medianOf(offs.map((v) => Math.abs(v - medO))) : 0;
      const robustStdO = Math.max(5, madO * 1.4826);

      const kept = basePool.filter((r) => {
        if (typeof r.carry_yds === 'number' && Number.isFinite(r.carry_yds) && Math.abs(r.carry_yds - medC) > 2.0 * robustStdC) return false;
        if (offs.length >= 4 && typeof r.offline_yds === 'number' && Number.isFinite(r.offline_yds) && Math.abs(r.offline_yds - medO) > 2.0 * robustStdO) return false;
        return true;
      });
      if (kept.length >= 2) return { list: kept, trimmed: rawList.length - kept.length };
      return basePool.length >= 2 ? { list: basePool, trimmed: rawList.length - basePool.length } : { list: rawList, trimmed: 0 };
    };

    const clubs = CLUB_ORDER.map((code) => {
      const rawList = byClub.get(code) || [];
      const { list, trimmed } = trimList(rawList);
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
        category: spec ? spec.category : 'iron',
        n: list.length,
        rawN: rawList.length,
        outliersTrimmed: trimmed,
        avgCarry: disp.meanCarry,
        avgTotal: avg(list.map((r) => r.total_yds), 1),
        avgBallSpeed: avg(list.map((r) => r.ball_speed), 1),
        avgClubSpeed: avg(list.map((r) => r.club_speed), 1),
        avgSmash: avg(list.map((r) => r.smash), 2),
        avgSpin: avg(list.map((r) => r.back_spin), 0),
        avgDescent,
        stoppingPower,
        width80Yds: disp.ellipse80 ? disp.ellipse80.widthYds : null,
        avgOffline: disp.meanOffline,
        avgSg: disp.avgSg,
        avgScore: disp.avgScore,
        gapToNextYds: null,
        gapAlert: null,
      };
    });

    // Compute gapping between populated consecutive clubs before category filtering
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

    if (typeof category === 'string' && category !== 'all' && Object.hasOwn(CLUB_CATEGORY_GROUPS, category)) {
      const allowed = new Set(CLUB_CATEGORY_GROUPS[category]);
      return clubs.filter((c) => allowed.has(c.club));
    }
    return clubs;
  }

  /**
   * 91-day chronological practice heatmap buckets for Plan / Review studios.
   */
  getPracticeHeatmap({ days = 91 } = {}) {
    const safeDays = Math.max(7, Math.min(365, Math.round(Number(days) || 91)));
    const rows = this._queryShots({ days: safeDays, limit: 10000 });
    const byDate = new Map();
    for (const r of rows) {
      if (!byDate.has(r.session_date)) byDate.set(r.session_date, []);
      byDate.get(r.session_date).push(r);
    }
    const out = [];
    const now = Date.now();
    for (let i = safeDays - 1; i >= 0; i -= 1) {
      const dateStr = new Date(now - i * 86400 * 1000).toISOString().slice(0, 10);
      const list = byDate.get(dateStr) || [];
      const scores = list.map((r) => r.score).filter((v) => typeof v === 'number' && Number.isFinite(v));
      const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
      out.push({ date: dateStr, count: list.length, avgScore });
    }
    return out;
  }

  /**
   * Top standout highlights & promoted My-Go-To swings for Review & Clips studio.
   */
  getHighlights({ mode = 'real', days = 90, limit = 12 } = {}) {
    const rows = this._queryShots({ mode, days, limit: 2000 });
    if (!rows.length) return [];
    const ranked = [...rows].sort((a, b) => {
      if ((b.is_goto || 0) !== (a.is_goto || 0)) return (b.is_goto || 0) - (a.is_goto || 0);
      const bClip = (b.clip_dtl || b.clip_fo) ? 1 : 0;
      const aClip = (a.clip_dtl || a.clip_fo) ? 1 : 0;
      if (bClip !== aClip) return bClip - aClip;
      if ((b.sg_shot ?? -99) !== (a.sg_shot ?? -99)) return (b.sg_shot ?? -99) - (a.sg_shot ?? -99);
      return (b.score ?? -1) - (a.score ?? -1);
    });
    return ranked.slice(0, Math.max(1, Math.min(50, Number(limit) || 12)));
  }

  /**
   * SG category breakdown across Tee (Woods), Approach (Hybrids/Irons), and Scoring Wedges.
   */
  getSgByCategory({ mode = 'real', days = 90 } = {}) {
    const rows = this._queryShots({ mode, days, limit: 5000 });
    const cats = [
      { id: 'OTT', label: 'Off the Tee (Woods)', clubs: new Set(CLUB_CATEGORY_GROUPS.woods) },
      { id: 'APP', label: 'Approach (Hyb & Irons)', clubs: new Set([...CLUB_CATEGORY_GROUPS.hybrids, ...CLUB_CATEGORY_GROUPS.irons]) },
      { id: 'WEDGE', label: 'Scoring Wedges', clubs: new Set(CLUB_CATEGORY_GROUPS.wedges) },
    ];
    return cats.map((cat) => {
      const list = rows.filter((r) => cat.clubs.has(r.club));
      const sgVals = list.map((r) => r.sg_shot).filter((v) => typeof v === 'number' && Number.isFinite(v));
      const scores = list.map((r) => r.score).filter((v) => typeof v === 'number' && Number.isFinite(v));
      const totalSg = sgVals.length ? Math.round(sgVals.reduce((a, b) => a + b, 0) * 100) / 100 : null;
      const avgSg = sgVals.length ? Math.round((totalSg / sgVals.length) * 100) / 100 : null;
      const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
      return { id: cat.id, label: cat.label, n: list.length, avgSg, totalSg, avgScore };
    });
  }

  /**
   * Find the player's benchmark "Best Shot" for a club (for Side-by-Side Compare vs Best).
   * Prefers Go-To / video-linked high-score shots, falling back to highest-scoring real shot.
   */
  getBestShotForClub(club, { excludeId = null, preferClip = true } = {}) {
    const preferClipInt = preferClip ? 1 : 0;
    if (this.db) {
      const where = ["COALESCE(deleted, 0) = 0", "practice_mode = 'real'"];
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
      .filter((r) => !r.deleted && r.practice_mode === 'real')
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
            if (isKidsZoneRawShot(raw)) continue;
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
