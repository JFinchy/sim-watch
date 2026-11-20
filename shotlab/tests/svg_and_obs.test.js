'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../engine');
const { DEMO_SHOTS } = require('../engine/demo_shots');
const svg = require('../renderer/svg');

test('SVG visualizers render valid SVG markup for all 16 demo archetypes without NaN', () => {
  for (const d of DEMO_SHOTS) {
    const analysis = engine.analyzeShot(d, { clubOverride: d.actualClub });
    assert.ok(analysis, `analyzeShot should return analysis for ${d.id}`);

    const shapeSvg = svg.renderShotShapeIcon(analysis.shotShape.svgParams, { width: 112, height: 112 });
    assert.ok(shapeSvg.includes('<svg') && shapeSvg.includes('</svg>'));
    assert.ok(!shapeSvg.includes('NaN'), `shapeSvg had NaN for ${d.id}`);

    const sideSvg = svg.renderSideTrajectory(analysis.flight, analysis.potential, analysis.shotShape.severity);
    assert.ok(sideSvg.includes('<svg') && sideSvg.includes('</svg>'));
    assert.ok(!sideSvg.includes('NaN'), `sideSvg had NaN for ${d.id}`);

    const faceSvg = svg.renderClubfaceMap(analysis.strike, analysis.clubSpec);
    assert.ok(faceSvg.includes('<svg') && faceSvg.includes('</svg>'));
    assert.ok(!faceSvg.includes('NaN'), `faceSvg had NaN for ${d.id}`);

    const dpSvg = svg.renderDPlaneDiagram(analysis.metrics, analysis.dplane);
    assert.ok(dpSvg.includes('<svg') && dpSvg.includes('</svg>'));
    assert.ok(!dpSvg.includes('NaN'), `dpSvg had NaN for ${d.id}`);
  }
});

test('OBS overlay assets exist and expose all 9 transparent widget modes', () => {
  const obsDir = path.join(__dirname, '..', 'obs');
  const html = fs.readFileSync(path.join(obsDir, 'overlay.html'), 'utf8');
  const css = fs.readFileSync(path.join(obsDir, 'overlay.css'), 'utf8');
  const js = fs.readFileSync(path.join(obsDir, 'overlay.js'), 'utf8');

  assert.ok(html.includes('/svg.js') && html.includes('/obs/overlay.js'));
  assert.ok(css.includes('background: transparent !important'));
  assert.ok(!/backdrop-filter\s*:/i.test(css), 'overlay.css should omit backdrop-filter property for OBS CEF transparency');
  for (const mode of ['hud', 'shape', 'metrics', 'diagnosis', 'compact', 'club', 'tracer', 'dispersion', 'ticker']) {
    assert.ok(js.includes(`'${mode}'`), `overlay.js should handle widget mode '${mode}'`);
  }
});

test('Clubface SVG mirrors for LH golfers and side trajectory hides 100ft line on low apex shots', () => {
  const analysis = engine.analyzeShot(DEMO_SHOTS[0], { clubOverride: 'DR' });
  const rhFace = svg.renderClubfaceMap(analysis.strike, analysis.clubSpec, 'RH');
  const lhFace = svg.renderClubfaceMap(analysis.strike, analysis.clubSpec, 'LH');
  assert.ok(!rhFace.includes('scale(-1, 1)'));
  assert.ok(lhFace.includes('scale(-1, 1)'));
  assert.ok(lhFace.indexOf('>TOE<') < lhFace.indexOf('>HEEL<'), 'LH clubface should put TOE on the left and HEEL on the right');

  const lowFlight = {
    carryYds: 110,
    apexFt: 42,
    points: [{ x: 0, y: 0 }, { x: 55, y: 42 }, { x: 110, y: 0 }],
  };
  const lowSvg = svg.renderSideTrajectory(lowFlight, { totalLeftOnTableYds: 0, ghostPoints: [] }, 'yellow');
  assert.ok(!lowSvg.includes('100ft'), 'Low-apex trajectory should omit 100ft gridline so it never clips');
});

