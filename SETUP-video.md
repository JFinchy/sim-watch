# Video rig setup: cameras + Kinovea 2025.2

SimWatch drives Kinovea for the 2x2 swing grid. **Kinovea 2025.1 or newer (2025.2 recommended)** gets
the reliable path: one UDP packet per shot triggers both cameras, and Kinovea itself runs
`simwatch.py clip-ready` when each clip is saved. Kinovea 2024.1 still works as a legacy fallback
(window-message toggle), but it is less reliable.

## 1. Install Kinovea 2025.2

1. Download Kinovea 2025.2 (64-bit installer) from kinovea.org and install it to the default
   `C:\Program Files\Kinovea\`. If you install it somewhere else, set `video.kinovea_exe` in
   `config.local.json`.
2. Start Kinovea by hand once, then close it. This creates `%APPDATA%\Kinovea\` (preferences + `Windows\`).
3. Run `python simwatch.py video`. The log should show `Kinovea 2025.2.0.0 (...) -> 2025 backend`.
   A `legacy version` warning means it found 2024.1. To force a backend, set `video.kinovea_backend`
   to `"2025"` or `"legacy"`.

SimWatch only writes Kinovea's `Preferences.xml` while **no Kinovea window is open**. It changes
only its own settings: the UDP trigger, port 8875, audio trigger off, Delay recording mode, a 3 s quiet
period, a memory buffer of at least 2048 MB, and four "SimWatch ..." capture folders. Everything
else in that file stays as you set it. If you started Kinovea yourself, close every Kinovea window
and re-run `video`. SimWatch closes and reopens its own Capture/LiveReplay/Reference windows itself.

The named windows are saved as `%APPDATA%\Kinovea\Windows\<id>.xml` with "Startup: specific screens",
so Kinovea doesn't overwrite them. Don't rename the windows `Capture`, `LiveReplay` or `Reference`.

## 2. One-time steps inside Kinovea

1. **Camera aliases:** in the Capture window's camera list, right-click each camera > rename it to
   exactly `DTL` and `FO` (or set `video.dtl_camera` / `video.fo_camera` to your aliases).
   The capture screens find cameras by alias.
2. **Confirm the trigger:** Options > Preferences > Capture > Automation should show
   *UDP trigger* enabled on port 8875, the audio trigger off, and the action set to "Record video". Both capture
   screens should show the trigger as *armed*.
3. **Post-recording command:** each capture screen's menu > *Post-recording command* should show
   `"...python.exe" "...simwatch.py" clip-ready "%filepath%" DTL` (or `FO`), and it should be enabled.
   Don't edit it. SimWatch regenerates it.
4. **Firewall prompt:** Kinovea listens on UDP 8875 on all interfaces, so Windows may ask once whether
   Kinovea may use the network. Windows Firewall doesn't filter loopback traffic and SimWatch sends to
   `127.0.0.1`, so the trigger works either way. Choose "Cancel"/deny unless you want other machines
   to trigger it.
5. **Custom golf drawing tools:** they install into `C:\Program Files\Kinovea\DrawingTools\Custom`.
   That folder needs Administrator rights once. Either run `python simwatch.py lines apply` from an
   Administrator terminal, or copy `Swings\Workspaces\CustomTools\*.xml` there by hand. The log tells you
   if this hasn't been done.

## 3. Capture folder (not on OneDrive)

Raw recordings go to `video.capture_root`. The default is `%LOCALAPPDATA%\SimWatch\Captures\<date>\DTL|FO`.
**Keep it off OneDrive.** OneDrive locks files while it syncs, which delays or breaks the
"file finished" detection and slows recording. The organized library copies
(`Swings\Sessions\<date>\NNN_<club>_<carry>y_<speed>mph[_D-<drill>]_<angle>.mp4` + `.kva`) and the
LiveReplay folders (`Swings\Sessions\<date>\DTL|FO`) are written by `clip-ready`.

## 4. Timing

| Setting | Default | Meaning |
|---|---|---|
| `video.pre_trigger_sec` | 3.0 | Kinovea delay buffer: seconds kept *before* the shot (backswing start) |
| `video.post_trigger_sec` | 1.5 | Seconds after impact. The clip length is pre + post = 4.5 s (Kinovea "max duration") |
| `video.trigger_quiet_period_sec` | 3.0 | Kinovea ignores triggers for this long after a recording stops |
| `video.udp_trigger_port` | 8875 | Must match Kinovea's UDP port |
| `video.clip_link_window_sec` | 20 | A clip is linked to the newest shot within this many seconds before it was saved |

Putts (`PT`/Putter, or an unlabeled roll under 20 mph) never trigger a recording.

**Clap test (trigger latency):** start `python simwatch.py video`, stand in view of both cameras, and clap
while pressing **Alt+C** (manual trigger) at the same moment. Open the two new clips in Kinovea and step
frame by frame. The clap should sit about `pre_trigger_sec` (3.0 s) after the clip starts. If it's
consistently early or late, the difference is your latency. Adjust `pre_trigger_sec`/`post_trigger_sec`
so the whole swing fits. With a real ball, impact should land at about 3.0 s.

## 5. Camera checklist

- **120 fps at 720p, MJPEG** format in each camera's Kinovea settings. YUY2 can't do 120 fps over USB.
- **Shutter ≤ 1/1000 s, fixed (manual) exposure**, so the club isn't blurred. Turn off auto exposure, auto
  gain changes and auto white balance.
- **Light:** flicker-free LED, about **2000 lux** on the hitting area. A short shutter needs a lot of light.
  Set the **power-line frequency to 60 Hz** (North America) in the camera settings to stop banding.
- **One USB 3 controller per camera.** Two 120 fps MJPEG streams on one controller drop frames. Use ports
  on different controllers, for example one on the motherboard and one on a PCIe card. Check this in
  Device Manager > View by connection.
- **DTL (down the line):** on the hand line (target line through your hands at address), at
  **hand height**, about **3–4 m behind**, pointing at the target.
- **FO (face on):** at **sternum height**, perpendicular to the target line, centered on you.
- **Avoid wide-angle lenses** or wide fields of view. Barrel distortion bends the plane lines. Zoom or move
  the camera instead.

## 6. Legacy fallback (Kinovea 2024.1)

SimWatch sets `General/InstancesOwnPreferences=true` so each named instance reads its own
`Preferences.<name>.xml`. Per shot it sends one `ToggleRecording`, and Kinovea stops by itself after
pre + post seconds (`RecordingSeconds`). The audio trigger is turned off. Set `video.legacy_trigger: "audio"`
to use only Kinovea's audio trigger instead. Clips are organized by the watchdog after the file has been
stable for 1.5 s and can be opened exclusively. Generated workspaces live in `Swings\Workspaces\*.xml`
(gitignored).
