import copy
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


@pytest.fixture()
def real_cfg():
    """A fresh deep copy of the shipped config.json (raw, as json.loads returns it)."""
    return copy.deepcopy(json.loads((ROOT / "config.json").read_text(encoding="utf-8")))
