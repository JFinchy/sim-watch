// Copy this file to player_data.js (same folder) and fill in your own details.
// player_data.js is git-ignored, so your personal profile never gets committed.
// The hub works without it; it just shows an "add your player profile" card.
window.PLAYER_DATA = {
  profile: {
    summary: "Mid-handicap golfer working on a more repeatable swing.",
    goals: ["Hit more fairways", "Gain 5 mph of driver speed"],
    gear: ["Launch monitor", "Hitting mat"],
    aids: ["Alignment sticks", "Metronome"],
    constraints: ["Sample: stiff lower back, warm up first"],
    time: "30 min sessions",
    pathNote: "", diagnosis: "", metaFault: "Sample: changing feels too often",
    driverDial: { title: "Driver miss dial", intro: "Sample text.", early: "Sample: hook side.", stalled: "Sample: slice side.", rule: "Check both ends after any fix." }
  },
  // Feel card: { id, name, cue, club: "all"|"driver"|"irons", drillIds: [], intendedFlight, failureMode, status: "candidate"|"active"|"parked"|"retired", notes, source }
  feels: [
    { id: "ex-feel-1", name: "Sample feel", club: "all", status: "candidate", cue: "Short cue you can say in a few words.", drillIds: [], intendedFlight: "Slight draw", failureMode: "Holding the club back", notes: "", source: "" }
  ],
  feelModifiers: [
    { id: "ex-mod-1", name: "Sample modifier", cue: "Add this on top of any feel.", caution: "" }
  ],
  // clubs: "all" | "driver" | "irons". preSwing: true for the checks you do before every swing. release: true for club-specific release feels.
  personalChecklist: [
    { id: "ex-pf-1", title: "Sample pre-swing check", cue: "One short cue.", why: "Why it matters.", clubs: "all", preSwing: true },
    { id: "ex-pf-2", title: "Sample fundamental", cue: "One short cue.", why: "", clubs: "all" },
    { id: "ex-pr-d", title: "Sample driver release", cue: "How the driver release feels.", clubs: "driver", release: true },
    { id: "ex-pr-i", title: "Sample iron release", cue: "How the iron release feels.", clubs: "irons", release: true }
  ],
  practiceRules: ["Sample: one feel at a time for a full week."],
  metricTargets: { driver: { smash: "1.45+" } }
};
