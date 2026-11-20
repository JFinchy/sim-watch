/**
 * ShotLab — 16 Realistic Bushnell Launch Pro (1-dot, RH) Demo Shot Archetypes.
 *
 * Used for offline preview, OBS Studio scene layout testing, and verifying every
 * diagnostic rule (Snap Hook, Pull Hook, Push Slice, Flipping Floater, Early Cast,
 * Over-Hold Block, Pure Compression, Toe/Heel/Thin/Fat strikes, etc.).
 */
'use strict';

const DEMO_SHOTS = [
  {
    id: 'tour_draw_driver',
    label: 'Tour Push Draw (Driver)',
    actualClub: 'DR',
    ball: { speed: 147.8, hla: 2.4, vla: 13.1, spin: 2380, spin_axis: -5.8, carry: null },
    club_data: { speed: 99.6, path: 3.4, face: 0.0, aoa: 3.2 },
  },
  {
    id: 'snap_hook_driver',
    label: 'Snap Hook (Driver)',
    actualClub: 'DR',
    ball: { speed: 141.2, hla: -3.4, vla: 8.4, spin: 2150, spin_axis: -22.5, carry: null },
    club_data: { speed: 99.2, path: 3.8, face: 0.0, aoa: 0.8 },
  },
  {
    id: 'toe_driver',
    label: 'Toe Miss-Hit Draw (Driver)',
    actualClub: 'DR',
    ball: { speed: 136.5, hla: 1.8, vla: 12.6, spin: 1920, spin_axis: -14.2, carry: null },
    club_data: { speed: 98.8, path: 2.1, face: 0.0, aoa: 2.2 },
  },
  {
    id: 'heel_driver',
    label: 'Heel Miss-Hit Slice (Driver)',
    actualClub: 'DR',
    ball: { speed: 134.8, hla: -0.8, vla: 11.8, spin: 3780, spin_axis: 16.8, carry: null },
    club_data: { speed: 98.5, path: -1.2, face: 0.0, aoa: -0.4 },
  },
  {
    id: 'push_slice_driver',
    label: 'Push Slice / Banana (Driver)',
    actualClub: 'DR',
    ball: { speed: 138.4, hla: 3.6, vla: 13.9, spin: 3620, spin_axis: 19.5, carry: null },
    club_data: { speed: 97.8, path: -2.4, face: 0.0, aoa: -1.8 },
  },
  {
    id: 'pure_7i',
    label: 'Pure Compression (7 Iron)',
    actualClub: '7I',
    ball: { speed: 113.2, hla: 1.2, vla: 17.6, spin: 6780, spin_axis: -2.8, carry: null },
    club_data: { speed: 82.8, path: 1.9, face: 0.0, aoa: -4.2 },
  },
  {
    id: 'flipping_floater_7i',
    label: 'Flipping Floater (7 Iron)',
    actualClub: '7I',
    ball: { speed: 102.4, hla: -0.4, vla: 23.4, spin: 8350, spin_axis: 3.1, carry: null },
    club_data: { speed: 80.2, path: -1.4, face: 0.0, aoa: -0.4 },
  },
  {
    id: 'over_hold_7i',
    label: 'Over-Hold / Stalled Block (7 Iron)',
    actualClub: '7I',
    ball: { speed: 109.8, hla: 4.1, vla: 15.2, spin: 5620, spin_axis: 6.4, carry: null },
    club_data: { speed: 81.9, path: 2.6, face: 0.0, aoa: -4.6 },
  },
  {
    id: 'early_cast_6i',
    label: 'Early Cast / Pull Slice (6 Iron)',
    actualClub: '6I',
    ball: { speed: 103.5, hla: -2.6, vla: 19.8, spin: 7450, spin_axis: 14.5, carry: null },
    club_data: { speed: 75.8, path: -5.4, face: 0.0, aoa: -5.8 },
  },
  {
    id: 'pull_hook_5i',
    label: 'Pull Hook (5 Iron)',
    actualClub: '5I',
    ball: { speed: 116.4, hla: -3.2, vla: 12.1, spin: 4320, spin_axis: -14.8, carry: null },
    club_data: { speed: 84.8, path: 0.8, face: 0.0, aoa: -3.5 },
  },
  {
    id: 'thin_8i',
    label: 'Thin / Low Groove (8 Iron)',
    actualClub: '8I',
    ball: { speed: 96.4, hla: 0.6, vla: 13.8, spin: 5900, spin_axis: 2.0, carry: null },
    club_data: { speed: 78.6, path: -0.5, face: 0.0, aoa: -0.8 },
  },
  {
    id: 'fat_pw',
    label: 'Heavy / Fat Strike (PW)',
    actualClub: 'PW',
    ball: { speed: 78.2, hla: -1.2, vla: 26.8, spin: 7900, spin_axis: 1.5, carry: null },
    club_data: { speed: 69.5, path: -1.8, face: 0.0, aoa: -7.1 },
  },
  {
    id: 'pure_pw',
    label: 'Pure Spin Wedge (PW)',
    actualClub: 'PW',
    ball: { speed: 94.8, hla: -0.5, vla: 24.8, spin: 9240, spin_axis: 1.2, carry: null },
    club_data: { speed: 74.2, path: -0.8, face: 0.0, aoa: -5.1 },
  },
  {
    id: 'power_fade_3w',
    label: 'Power Pull Fade (3 Wood)',
    actualClub: '3W',
    ball: { speed: 136.2, hla: -2.1, vla: 12.1, spin: 3580, spin_axis: 5.4, carry: null },
    club_data: { speed: 93.4, path: -2.8, face: 0.0, aoa: -1.6 },
  },
  {
    id: 'sky_3w',
    label: 'Sky / Pop-Up (3 Wood)',
    actualClub: '3W',
    ball: { speed: 112.0, hla: -1.5, vla: 21.8, spin: 5100, spin_axis: 4.5, carry: null },
    club_data: { speed: 92.0, path: -3.2, face: 0.0, aoa: -5.4 },
  },
  {
    id: 'pure_gw',
    label: 'Pure Gap Wedge (50°)',
    actualClub: 'GW',
    ball: { speed: 86.5, hla: 0.3, vla: 27.9, spin: 9820, spin_axis: -0.8, carry: null },
    club_data: { speed: 70.8, path: 0.4, face: 0.0, aoa: -5.2 },
  },
];

function makeDemoShot(archetypeId = null, shotNum = 1, jitter = true) {
  const pick = archetypeId
    ? DEMO_SHOTS.find((s) => s.id === archetypeId) || DEMO_SHOTS[0]
    : DEMO_SHOTS[Math.floor(Math.random() * DEMO_SHOTS.length)];

  const j = (scale) => (jitter ? (Math.random() - 0.5) * 2 * scale : 0);
  const ball = {
    speed: Math.round((pick.ball.speed + j(1.2)) * 10) / 10,
    carry: pick.ball.carry,
    total: null,
    hla: Math.round((pick.ball.hla + j(0.35)) * 10) / 10,
    vla: Math.round((pick.ball.vla + j(0.4)) * 10) / 10,
    spin: Math.round(pick.ball.spin + j(140)),
    spin_axis: Math.round((pick.ball.spin_axis + j(0.9)) * 10) / 10,
  };
  const club_data = {
    speed: Math.round((pick.club_data.speed + j(0.7)) * 10) / 10,
    path: Math.round((pick.club_data.path + j(0.4)) * 10) / 10,
    face: pick.club_data.face,
    aoa: Math.round((pick.club_data.aoa + j(0.3)) * 10) / 10,
  };
  return {
    ts: new Date().toISOString(),
    shot_num: shotNum,
    club: null, // intentionally null or mismatched so user can test club auto-detection!
    gspro_club: 'DR',
    demo_archetype: pick.id,
    demo_label: pick.label,
    demo_actual_club: pick.actualClub,
    ball,
    club_data,
  };
}

module.exports = {
  DEMO_SHOTS,
  makeDemoShot,
};
