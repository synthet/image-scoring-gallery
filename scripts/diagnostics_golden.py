"""Golden values for the gallery's local diagnostics port, from the backend's compute.py.

Regenerate after the backend changes `modules/visual_evidence/compute.py` (needs numpy + opencv):

    python scripts/diagnostics_golden.py ../image-scoring-pipeline > src/services/localDiagnostics/golden.fixture.json

The image formula must stay identical to `pixel()` in src/services/localDiagnostics/compute.test.ts.
"""
import json
import sys

import numpy as np

sys.path.insert(0, sys.argv[1])
from modules.visual_evidence import compute  # noqa: E402

W, H = 600, 200


def pixel(x, y):
    h = ((x * 73856093) ^ (y * 19349663)) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    noise = (h >> 24) % 13 - 6
    if x < 400:
        base = 128 + (50 if ((x // 24 + y // 24) % 2) else -50)
    else:
        base = 60 + (x - 400) // 2 + y // 4
    return max(0, min(255, base + noise))


image = np.array([[pixel(x, y) for x in range(W)] for y in range(H)], np.uint8)
grey = image.astype(np.float32) / 255

maps = compute.compute_maps(image)
fields = compute.peaking_fields(image)
samples = [(x, y) for y in (0, 37, 99, 150, 199) for x in (0, 23, 24, 250, 399, 400, 511, 512, 513, 599)]
points = [
    {"name": "left_eye", "x": .20, "y": .30, "confidence": .90, "visible": True},
    {"name": "right_eye", "x": .26, "y": .31, "confidence": .85, "visible": True},
    {"name": "beak", "x": .31, "y": .42, "confidence": .90, "visible": True},
    {"name": "head_top", "x": .22, "y": .15, "confidence": .95, "visible": True},
    {"name": "throat", "x": .25, "y": .55, "confidence": .50, "visible": True},
]
head = compute.measure_head(image, points, (.1, .1, .6, .9))


def clean(values):
    return [None if v is None else float(v) for v in values]


json.dump({
    "noise_sigma_whole": compute.noise_sigma(grey),
    "noise_sigma_left": compute.noise_sigma(grey[:, :300]),
    "sharpness_cell": compute.sharpness(grey[:64, :64], compute.noise_sigma(grey[:64, :64])),
    "maps": {k: {"cells_x": v["cells_x"], "cells_y": v["cells_y"], "x_edges": v["x_edges"], "y_edges": v["y_edges"],
                 "values": clean(v["values"])} for k, v in maps.items()},
    "peaking": {mode: {"sum": int(field.astype(np.int64).sum()), "nonzero": int(np.count_nonzero(field)),
                       "samples": [int(field[y, x]) for x, y in samples]} for mode, field in fields.items()},
    "peaking_samples": samples,
    "head_points": points,
    "head": head,
}, sys.stdout, indent=1)
