/**
 * ShotLab — Secure IPC bridge exposed to the renderer window via contextBridge.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shotlabAPI', {
  getState: () => ipcRenderer.invoke('shotlab:get-state'),
  selectShot: (shotId) => ipcRenderer.invoke('shotlab:select-shot', shotId),
  clearSession: () => ipcRenderer.invoke('shotlab:clear-session'),
  fireDemo: (archetypeId) => ipcRenderer.invoke('shotlab:fire-demo', archetypeId),
  confirmClub: (shotId, actualClub) => ipcRenderer.invoke('shotlab:confirm-club', { shotId, actualClub }),
  updateSettings: (patch) => ipcRenderer.invoke('shotlab:update-settings', patch),
  resetCalibration: () => ipcRenderer.invoke('shotlab:reset-calibration'),
  switchGsproClub: (targetClub) => ipcRenderer.invoke('shotlab:switch-gspro-club', targetClub),
  importCsv: (opts) => ipcRenderer.invoke('shotlab:import-csv', opts),
  stopCsvWatch: () => ipcRenderer.invoke('shotlab:stop-csv-watch'),
  getHotkeys: () => ipcRenderer.invoke('shotlab:get-hotkeys'),
  copyText: (text) => ipcRenderer.invoke('shotlab:copy-text', text),
  openExternal: (url) => ipcRenderer.invoke('shotlab:open-external', url),

  // ShotLab v2: Patterns, Bag Gapping, Video Compare, My-Go-To, Practice Context, History Sync & Debrief
  getPatterns: (opts) => ipcRenderer.invoke('shotlab:get-patterns', opts),
  getBagGapping: (opts) => ipcRenderer.invoke('shotlab:get-bag-gapping', opts),
  getVideoCompare: (opts) => ipcRenderer.invoke('shotlab:get-video-compare', opts),
  promoteGoTo: (shotId) => ipcRenderer.invoke('shotlab:promote-goto', shotId),
  setPracticeContext: (ctx) => ipcRenderer.invoke('shotlab:set-practice-context', ctx),
  syncHistory: () => ipcRenderer.invoke('shotlab:sync-history'),
  exportDebrief: (opts) => ipcRenderer.invoke('shotlab:export-debrief', opts),

  onState: (cb) => {
    const handler = (_e, snap) => cb(snap);
    ipcRenderer.on('shotlab:state', handler);
    return () => ipcRenderer.removeListener('shotlab:state', handler);
  },
  onAutoSwitch: (cb) => {
    const handler = (_e, info) => cb(info);
    ipcRenderer.on('shotlab:autoswitch', handler);
    return () => ipcRenderer.removeListener('shotlab:autoswitch', handler);
  },
});
