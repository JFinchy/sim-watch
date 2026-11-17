Tour pro comparison clips, shown in the bottom Kinovea grid when that pro is the active reference.

One folder per pro (names come from "pros" in config.json under "video"):
  Pros/Rory_McIlroy/
  Pros/Tiger_Woods/
  Pros/Tommy_Fleetwood/

Inside each folder, name clips by club category and camera angle:
  Driver_DTL.mp4, Driver_FO.mp4
  Iron_DTL.mp4,   Iron_FO.mp4
  Wedge_DTL.mp4,  Wedge_FO.mp4
(.mp4 .mkv .avi .mov all work.)

SimWatch maps your active GSPro club to Driver / Iron / Wedge and loads that category's DTL + FO
clips. If an exact <Category>_DTL / <Category>_FO file is missing, it falls back to the newest
file in the pro's folder whose name contains DTL or FO. If still nothing is found it falls back to
your latest session swing. Cycle references with Alt+R.
