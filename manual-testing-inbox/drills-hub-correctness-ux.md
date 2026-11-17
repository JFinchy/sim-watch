# Drills hub correctness + UX pass

Branch: `master` (working tree)
Files changed: `drills/index.html`

## What to verify

State merging (goals, bag clubs, imports), keyboard shortcuts, the HackMotion/mode
display changes, the new Gear & Sensor Reference, accessibility tweaks and phone layout.
Headless Chrome checked these automatically. A human still needs to confirm they feel
right in a real browser, with real saved data, on a real phone.

## Steps

Open `drills/index.html` by double-clicking it (file://). Use your normal browser profile
so your existing saved data is loaded.

1. **Existing data survives / new goals appear**: go to the **📊 Goals & Delivery Chart** tab.
   Your old goal progress and notes are unchanged. Any default goal you never had (for example
   "HackMotion -14° Impact Flexion Compression") now shows up. Custom goals you added are still listed.
2. **Goal delete sticks**: click 🗑️ on a default goal and confirm. Reload the page. The goal
   stays gone. (Editor tab > "↺ Reset Drills & Goals" brings it back.)
3. **Custom club kept**: if you added a club to the bag in an older backup, import that backup
   (Editor tab > "⬆️ Import Backup"). The club appears in the **🎒 Club Bag & Gapping** table.
4. **Failed import can be retried**: import a non-JSON file. The toast says "Invalid JSON backup file."
   Choose the same file again. The toast appears again, which proves the picker was reset.
5. **Tombstone-only import**: import a JSON file containing only `{"deletedDrillIds":["thoracic-pelvic-unlock"]}`.
   That drill disappears from the deck straight away.
6. **Volume 0 kept**: on the **⏱️ Cadence & Tempo** tab, the lowest the slider goes is 10%. Import a
   backup with `"cadenceVolume": 0` and reload. The display shows 0%, not 70%.
7. **T key**: on the Drill Deck, hold **T** for 2 seconds. The metronome starts once and does not flicker
   on and off. Press T again to stop. Click into "Personal Feel Notes" and type a "t". The metronome does not start.
8. **Header link**: the header shows "⌚ HackMotion targets" as a plain underlined link, not a green status
   badge. Click it. The Bag tab opens with "🧰 Gear & Sensor Reference" expanded and scrolled to the HackMotion entry.
9. **HackMotion card**: on a drill with HackMotion data, a collapsed "⌚ HackMotion Wrist Targets"
   section appears. Expand it. The angles match the drill. The old wrist-angle slider simulator is gone.
   On a mobility drill without `hackmotion` data (once the content agent's data change lands), the section does not appear.
10. **Mode drives content**: click **💪 Gym-Sore / Recovery**. The drill count drops. Each drill card shows only
    the "Gym-Sore / Recovery Plan" box. Click **All Modes**. All three plan boxes return.
11. **Undo**: on the Goals tab, click "✅ Met Daily Delivery". The toast reads "Logged M/D: Daily delivery met"
    (no raw ids). Click Clear Day. The toast reads "Cleared log for M/D" with an **Undo** button. Click Undo.
    The day is restored. Deleting a round on the Courses tab also offers Undo.
12. **Start-metronome toast**: the toast shows the preset name, for example "(24 / 8 (Tour Standard))", not "(24-8)".
13. **Keyboard focus**: press Tab through the page. Every button and input shows a visible blue focus ring.
14. **Phone (390px)**: in DevTools device mode (iPhone 12/13, 390x844), or on a real phone, visit every tab.
    The page never scrolls sideways. The main tabs form one swipeable row. The 30-day chart scrolls inside its own box.
15. **Reduced motion**: turn on OS "Reduce motion" and reload. The cadence orb and pulse dot do not animate.

## Pass criteria

Every step behaves as described, no saved data is lost, and the browser console shows no
red errors (missing `shorts/*.mp4` 404s are expected).
