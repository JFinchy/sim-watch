/**
 * ShotLab — Short Game (≤100 Yards), Live Wedge Clock Matrix & Putting Start-Line/Speed Lab.
 * Re-exports the single-source UMD module from `shotlab/renderer/shortGame.js` so
 * Node engine consumers and the Electron renderer share identical math and thresholds.
 */
'use strict';

const {
  ballSpeedMphToPuttFt,
  targetPuttSpeedMph,
  analyzePuttShot,
  analyzeShortGameShot,
  summarizeCalibrationShots,
  recommendWedgeFromMatrix,
  scoreScoringZoneShot,
} = require('../renderer/shortGame');

module.exports = {
  ballSpeedMphToPuttFt,
  targetPuttSpeedMph,
  analyzePuttShot,
  analyzeShortGameShot,
  summarizeCalibrationShots,
  recommendWedgeFromMatrix,
  scoreScoringZoneShot,
};
