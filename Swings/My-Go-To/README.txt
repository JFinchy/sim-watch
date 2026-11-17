Your personal "go-to swing" reference clips, shown in the bottom Kinovea grid.

Layout (this is what simwatch.py reads and writes):
  My-Go-To/Driver/   GoTo_<Club>_DTL.mp4, GoTo_<Club>_FO.mp4   (driver and woods)
  My-Go-To/Iron/     GoTo_<Club>_DTL.mp4, GoTo_<Club>_FO.mp4   (irons)
  My-Go-To/Wedge/    GoTo_<Club>_DTL.mp4, GoTo_<Club>_FO.mp4   (PW/GW/AW/SW/LW)

Press Alt+G (or run `python simwatch.py bookmark`) after a pure swing to copy your latest DTL + FO
clips into the folder matching the active club, as GoTo_<Club>_DTL.mp4 / GoTo_<Club>_FO.mp4.

Clips placed directly in My-Go-To/ (not in a Driver/Iron/Wedge subfolder) are NOT picked up.
You can drop your own clips into a subfolder by hand: any video (.mp4 .mkv .avi .mov) whose name
contains DTL or FO (for example MyDriver_DTL.mp4) works; the newest match wins. If the folder for
the active club has no clips, SimWatch falls back to Iron, then Driver, then Wedge.
