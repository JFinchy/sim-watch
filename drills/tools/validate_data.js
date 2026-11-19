#!/usr/bin/env node
/* Validates drills/drills_data.js (window.DEFAULT_DRILLS_DATA). No dependencies.
   Usage: node drills/tools/validate_data.js [path/to/drills_data.js]
   Exits 1 on errors; warnings do not fail the run. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const file = process.argv[2] || path.join(__dirname, "..", "drills_data.js");
const win = {};
vm.runInNewContext(fs.readFileSync(file, "utf8"), { window: win }, { filename: file });
const D = win.DEFAULT_DRILLS_DATA;
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const isNum = (v) => typeof v === "number" && isFinite(v);

if (!D || typeof D !== "object") { console.error("ERROR: window.DEFAULT_DRILLS_DATA missing"); process.exit(1); }
for (const k of ["modes", "routines", "drills", "goals", "courseCategories", "courses", "cadencePresets", "bagMatrix"]) {
  if (!Array.isArray(D[k])) err(`${k} must be an array`);
}

function uniqueIds(list, label) {
  const seen = new Set();
  (list || []).forEach((x, i) => {
    if (!x || !isStr(x.id)) { err(`${label}[${i}] has no string id`); return; }
    if (seen.has(x.id)) err(`${label}: duplicate id "${x.id}"`);
    seen.add(x.id);
  });
  return seen;
}

const modeIds = uniqueIds(D.modes, "modes");
const routineIds = uniqueIds(D.routines, "routines");
const drillIds = uniqueIds(D.drills, "drills");
const catIds = uniqueIds(D.courseCategories, "courseCategories");
const courseIds = uniqueIds(D.courses, "courses");
uniqueIds(D.goals, "goals");
uniqueIds(D.cadencePresets, "cadencePresets");
uniqueIds(D.bagMatrix, "bagMatrix");
uniqueIds(D.customPracticeRounds, "customPracticeRounds");

(D.modes || []).forEach((m) => { if (!isStr(m.label)) err(`mode ${m.id}: missing label`); });
(D.routines || []).forEach((r) => {
  for (const f of ["title", "fullTitle", "focus", "summary"]) if (!isStr(r[f])) err(`routine ${r.id}: missing ${f}`);
  (r.recommendedModes || []).forEach((m) => { if (!modeIds.has(m)) err(`routine ${r.id}: unknown mode "${m}"`); });
});

const sectionsSeen = new Set();
(D.drills || []).forEach((d) => {
  const t = `drill ${d.id}`;
  for (const f of ["title", "section", "focus", "duration", "reps", "why"]) if (!isStr(d[f])) err(`${t}: missing ${f}`);
  if (!Array.isArray(d.days) || !d.days.length) err(`${t}: days must be a non-empty array`);
  else d.days.forEach((x) => { if (!routineIds.has(x)) err(`${t}: days -> unknown routine "${x}"`); });
  if (!Array.isArray(d.modes) || !d.modes.length) err(`${t}: modes must be a non-empty array`);
  else d.modes.forEach((x) => { if (!modeIds.has(x)) err(`${t}: unknown mode "${x}"`); });
  if (!Array.isArray(d.clubs)) err(`${t}: clubs must be an array`);
  if (!Array.isArray(d.instructions) || !d.instructions.length) err(`${t}: instructions must be a non-empty array`);
  if (!d.video || typeof d.video !== "object") err(`${t}: missing video object`);
  else {
    if (typeof d.video.localPath !== "string") err(`${t}: video.localPath must be a string`);
    else if (d.video.localPath && !/\.(mp4|mov|webm|m4v)$/i.test(d.video.localPath)) warn(`${t}: localPath "${d.video.localPath}" has no video extension`);
    if (!isStr(d.video.diagram)) warn(`${t}: video.diagram missing`);
  }
  if (!d.checkpoints || !isStr(d.checkpoints.dtl) || !isStr(d.checkpoints.fo)) warn(`${t}: checkpoints.dtl/fo incomplete`);
  if (d.target !== undefined) {
    const g = d.target, metrics = ["hla", "carry", "ball_speed", "face", "path", "spin_axis", "aoa", "manual"];
    if (!g || typeof g !== "object") err(`${t}: target must be an object`);
    else {
      if (!metrics.includes(g.metric)) err(`${t}: target.metric "${g.metric}" must be one of ${metrics.join("/")}`);
      if (g.metric !== "manual" && (!isNum(g.goal) || !isNum(g.tol) || g.tol < 0)) err(`${t}: target needs numeric goal and tol >= 0`);
      if (g.reps !== undefined && (!isNum(g.reps) || g.reps <= 0)) err(`${t}: target.reps must be a positive number`);
      if (g.pass !== undefined && (!isNum(g.pass) || g.pass <= 0 || (isNum(g.reps) && g.pass > g.reps))) err(`${t}: target.pass must be 1..reps`);
      if (["carry", "ball_speed", "spin_axis"].includes(g.metric) && (d.modes || []).includes("almost")) warn(`${t}: ${g.metric} target is not scorable with Almost (foam) balls - mat mode falls back to tap-to-score`);
    }
  }
  if (!d.modePlans) warn(`${t}: no modePlans`);
  else (d.modes || []).forEach((m) => { if (!isStr(d.modePlans[m])) warn(`${t}: modePlans.${m} empty but mode is enabled`); });
  sectionsSeen.add(d.section);
});
// Routines with no drills
(D.routines || []).forEach((r) => {
  if (!(D.drills || []).some((d) => (d.days || []).includes(r.id))) warn(`routine ${r.id}: no drills reference it`);
});

(D.courses || []).forEach((c) => {
  const t = `course ${c.id}`;
  if (!isStr(c.name)) err(`${t}: missing name`);
  if (!isNum(c.par) || c.par <= 0) err(`${t}: par must be a positive number`);
  if (!isNum(c.holes) || ![9, 18, 27, 36].includes(c.holes)) warn(`${t}: unusual holes value ${c.holes}`);
  if (isNum(c.par) && isNum(c.holes)) {
    const lo = c.holes * 3, hi = c.holes * 5;
    if (c.par < lo || c.par > hi) warn(`${t}: par ${c.par} outside ${lo}-${hi} for ${c.holes} holes`);
  }
  if (c.tees && typeof c.tees !== "object") err(`${t}: tees must be an object`);
  else if (c.tees) for (const [k, v] of Object.entries(c.tees)) if (!isNum(v) || v < 0) err(`${t}: tee "${k}" must be a non-negative number`);
  if (!Array.isArray(c.categories)) err(`${t}: categories must be an array`);
  else c.categories.forEach((x) => { if (!catIds.has(x)) err(`${t}: categories -> unknown "${x}"`); });
  if (c.recommendedDrills !== undefined) {
    if (!Array.isArray(c.recommendedDrills)) err(`${t}: recommendedDrills must be an array`);
    else c.recommendedDrills.forEach((x) => { if (!drillIds.has(x)) err(`${t}: recommendedDrills -> unknown drill "${x}"`); });
  }
  if (c.rating !== undefined && (!isNum(c.rating) || c.rating < 0 || c.rating > 5)) warn(`${t}: rating ${c.rating} outside 0-5`);
});

(D.customPracticeRounds || []).forEach((r) => {
  const t = `customPracticeRound ${r.id}`;
  if (!isStr(r.name)) err(`${t}: missing name`);
  if (r.courseKey && !courseIds.has(r.courseKey)) warn(`${t}: courseKey "${r.courseKey}" is not a course id`);
});

(D.bagMatrix || []).forEach((b) => {
  const t = `bag club ${b.id}`;
  if (!isStr(b.club)) err(`${t}: missing club`);
  for (const f of ["carry", "total", "ballSpeed"]) if (!isNum(b[f])) err(`${t}: ${f} must be a number`);
  if (isNum(b.carry) && isNum(b.total) && b.total < b.carry) err(`${t}: total ${b.total} < carry ${b.carry}`);
});
const bagByCarry = (D.bagMatrix || []).filter((b) => isNum(b.carry) && b.carry > 0 && b.club !== "Putter");
for (let i = 1; i < bagByCarry.length; i++) {
  if (bagByCarry[i].carry > bagByCarry[i - 1].carry) warn(`bag: ${bagByCarry[i].club} carries farther than ${bagByCarry[i - 1].club} (gapping order)`);
}

(D.cadencePresets || []).forEach((p) => {
  const t = `cadence preset ${p.id}`;
  for (const f of ["backSec", "downSec", "totalSec", "bpm"]) if (!isNum(p[f]) || p[f] <= 0) err(`${t}: ${f} must be a positive number`);
  if (p.fps !== undefined && (!isNum(p.fps) || p.fps <= 0)) err(`${t}: fps must be a positive number`);
  const fps = isNum(p.fps) ? p.fps : 30; // Tour Tempo frame counts are at 30fps
  if (isNum(p.backFrames) && isNum(p.backSec) && Math.abs(p.backFrames / fps - p.backSec) > 0.02) warn(`${t}: backSec != backFrames / ${fps}`);
  if (isNum(p.downFrames) && isNum(p.downSec) && Math.abs(p.downFrames / fps - p.downSec) > 0.02) warn(`${t}: downSec != downFrames / ${fps}`);
  if (isNum(p.backSec) && isNum(p.downSec) && isNum(p.totalSec) && Math.abs(p.backSec + p.downSec - p.totalSec) > 0.02) warn(`${t}: totalSec != backSec + downSec`);
});

(D.goals || []).forEach((g) => {
  if (!isStr(g.title)) err(`goal ${g.id}: missing title`);
  if (g.progress !== undefined && (!isNum(g.progress) || g.progress < 0 || g.progress > 100)) warn(`goal ${g.id}: progress outside 0-100`);
});

// swingChecklist (Swing Checklist view)
if (D.swingChecklist !== undefined) {
  const sc = D.swingChecklist;
  if (!sc || typeof sc !== "object" || Array.isArray(sc)) err("swingChecklist must be an object");
  else {
    const phaseIds = uniqueIds(sc.phases, "swingChecklist.phases");
    (sc.phases || []).forEach((p) => { if (!isStr(p.name)) err(`swingChecklist phase ${p.id}: missing name`); });
    if (!Array.isArray(sc.phases) || !sc.phases.length) err("swingChecklist.phases must be a non-empty array");
    const itemIds = uniqueIds(sc.items, "swingChecklist.items");
    if (!Array.isArray(sc.items) || !sc.items.length) err("swingChecklist.items must be a non-empty array");
    (sc.items || []).forEach((it) => {
      const t = `swingChecklist item ${it.id}`;
      for (const f of ["title", "cue"]) if (!isStr(it[f])) err(`${t}: missing ${f}`);
      if (!isStr(it.phase) || !phaseIds.has(it.phase)) err(`${t}: unknown phase "${it.phase}"`);
      if (it.why !== undefined && typeof it.why !== "string") err(`${t}: why must be a string`);
      if (it.fault !== undefined && typeof it.fault !== "string") err(`${t}: fault must be a string`);
      if (it.feel !== undefined && typeof it.feel !== "string") err(`${t}: feel must be a string`);
      if (!it.check || typeof it.check !== "object" || typeof it.check.dtl !== "string" || typeof it.check.fo !== "string") err(`${t}: check must be {dtl, fo} strings`);
      if (!Array.isArray(it.drillIds)) err(`${t}: drillIds must be an array`);
      else it.drillIds.forEach((x) => { if (!drillIds.has(x)) err(`${t}: drillIds -> unknown drill "${x}"`); });
    });
    if (!Array.isArray(sc.defaultFocusIds)) err("swingChecklist.defaultFocusIds must be an array");
    else {
      if (sc.defaultFocusIds.length > 2) err(`swingChecklist.defaultFocusIds has ${sc.defaultFocusIds.length} ids; the active-cue cap is 2`);
      sc.defaultFocusIds.forEach((x) => { if (!itemIds.has(x)) err(`swingChecklist.defaultFocusIds -> unknown item "${x}"`); });
    }
  }
}

// Coach taxonomy: faults, environments, sessionTemplates, and per-drill tags (all additive)
{
  const PHASES = ["setup", "takeaway", "top", "transition", "impact", "finish", "short-game", "putting", "mental-tempo"];
  const KINDS = ["warmup", "cold", "block", "transfer", "putting", "speed", "log"];
  const USES = ["full", "short-game", "putting"];
  const faultIds = uniqueIds(D.faults, "faults");
  (D.faults || []).forEach((f) => {
    for (const k of ["name", "symptom", "rootCauseHint"]) if (!isStr(f[k])) err(`fault ${f.id}: missing ${k}`);
    if (!PHASES.includes(f.swingPhase)) err(`fault ${f.id}: swingPhase "${f.swingPhase}" must be one of ${PHASES.join("/")}`);
  });
  const envIds = uniqueIds(D.environments, "environments");
  (D.environments || []).forEach((e) => {
    for (const k of ["name", "desc"]) if (!isStr(e[k])) err(`environment ${e.id}: missing ${k}`);
  });
  uniqueIds(D.sessionTemplates, "sessionTemplates");
  (D.sessionTemplates || []).forEach((st) => {
    const t = `sessionTemplate ${st.id}`;
    if (!isStr(st.name)) err(`${t}: missing name`);
    if (!isNum(st.minutes) || st.minutes <= 0) err(`${t}: minutes must be a positive number`);
    if (!Array.isArray(st.blocks) || !st.blocks.length) { err(`${t}: blocks must be a non-empty array`); return; }
    let sum = 0;
    st.blocks.forEach((b, i) => {
      if (!isStr(b.name)) err(`${t}: block ${i} missing name`);
      if (!isNum(b.minutes) || b.minutes <= 0) err(`${t}: block ${i} minutes must be a positive number`);
      else sum += b.minutes;
      if (!KINDS.includes(b.kind)) err(`${t}: block ${i} kind "${b.kind}" must be one of ${KINDS.join("/")}`);
      if (!isStr(b.note)) err(`${t}: block ${i} missing note`);
    });
    if (isNum(st.minutes) && Math.abs(sum - st.minutes) > 2) err(`${t}: blocks total ${sum} min but template is ${st.minutes} min (tolerance 2)`);
  });
  (D.cadencePresets || []).forEach((p) => {
    if (p.use !== undefined && !USES.includes(p.use)) err(`cadence preset ${p.id}: use "${p.use}" must be one of ${USES.join("/")}`);
  });
  (D.drills || []).forEach((d) => {
    const t = `drill ${d.id}`;
    if (!Array.isArray(d.faultTags)) err(`${t}: faultTags must be an array`);
    else d.faultTags.forEach((x) => { if (!faultIds.has(x)) err(`${t}: faultTags -> unknown fault "${x}"`); });
    if (!Array.isArray(d.environments)) err(`${t}: environments must be an array`);
    else d.environments.forEach((x) => { if (!envIds.has(x)) err(`${t}: environments -> unknown environment "${x}"`); });
    if (!PHASES.includes(d.swingPhase)) err(`${t}: swingPhase "${d.swingPhase}" must be one of ${PHASES.join("/")}`);
    if (!Array.isArray(d.equipment)) err(`${t}: equipment must be an array`);
    if (!isStr(d.keyFeel)) err(`${t}: missing keyFeel`);
    if (d.pacing !== undefined && !["block", "transfer", "either"].includes(d.pacing)) err(`${t}: pacing must be block/transfer/either`);
    if (d.video) for (const k of ["startSec", "endSec"]) if (d.video[k] !== undefined && (!isNum(d.video[k]) || d.video[k] < 0)) err(`${t}: video.${k} must be a non-negative number`);
    if (d.video && isNum(d.video.startSec) && isNum(d.video.endSec) && d.video.endSec <= d.video.startSec) err(`${t}: video.endSec must be after startSec`);
  });
}

// Optional private profile (git-ignored): validated only when the file exists.
{
  const pdFile = path.join(path.dirname(file), "player_data.js");
  if (fs.existsSync(pdFile)) {
    const pw = {};
    let ok = true;
    try { vm.runInNewContext(fs.readFileSync(pdFile, "utf8"), { window: pw }, { filename: pdFile }); } catch (e) { ok = false; err(`player_data.js failed to load: ${e.message}`); }
    const P = pw.PLAYER_DATA;
    if (ok && (!P || typeof P !== "object")) err("player_data.js must set window.PLAYER_DATA to an object");
    else if (ok) {
      const feels = Array.isArray(P.feels) ? P.feels : [];
      const fids = uniqueIds(feels, "PLAYER_DATA.feels");
      let active = 0;
      feels.forEach((f) => {
        const t = `PLAYER_DATA feel ${f.id}`;
        if (!["all", "driver", "irons"].includes(f.club)) err(`${t}: club "${f.club}" must be all/driver/irons`);
        if (!["candidate", "active", "parked", "retired"].includes(f.status)) err(`${t}: status "${f.status}" must be candidate/active/parked/retired`);
        if (f.status === "active") active++;
        if (f.drillIds !== undefined && !Array.isArray(f.drillIds)) err(`${t}: drillIds must be an array`);
        else (f.drillIds || []).forEach((x) => { if (!drillIds.has(x)) err(`${t}: drillIds -> unknown drill "${x}"`); });
      });
      if (active > 1) err(`PLAYER_DATA has ${active} active feels; at most one allowed`);
      const list = Array.isArray(P.personalChecklist) ? P.personalChecklist : [];
      const cids = uniqueIds(list, "PLAYER_DATA.personalChecklist");
      const builtIn = new Set(((D.swingChecklist || {}).items || []).map((i) => i.id));
      let pre = 0;
      list.forEach((c) => {
        if (builtIn.has(c.id)) err(`PLAYER_DATA checklist id "${c.id}" collides with a swingChecklist item`);
        if (c.clubs !== undefined && !["all", "driver", "irons"].includes(c.clubs)) err(`PLAYER_DATA checklist ${c.id}: clubs "${c.clubs}" must be all/driver/irons`);
        if (c.preSwing === true) pre++;
      });
      if (list.length && pre !== 4) err(`PLAYER_DATA.personalChecklist has ${pre} preSwing items; exactly 4 required`);
    }
  }
}

console.log(`Checked ${file}`);
console.log(`  drills=${(D.drills || []).length} routines=${(D.routines || []).length} courses=${(D.courses || []).length} bag=${(D.bagMatrix || []).length}`);
warnings.forEach((w) => console.log("WARN  " + w));
errors.forEach((e) => console.log("ERROR " + e));
console.log(`${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
