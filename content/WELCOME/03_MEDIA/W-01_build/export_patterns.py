from patterns import PATTERNS
import os
os.makedirs("out/backgrounds", exist_ok=True)
# 5:7 invitation ratio, print-usable
W, H = 1500, 2100
for name, fn in PATTERNS.items():
    im = fn(W, H)
    p = f"out/backgrounds/welcome-bg-{name.lower()}.png"
    im.save(p, "PNG", optimize=True)
    print(f"{name:12} {im.size}  ->  {p}")
