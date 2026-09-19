# YUVA Fitness Website — Performance Optimization Audit

## Baseline Report
_Audit date: 2026-09-19 · Project root: D:\opencode_

---

## 1. Baseline Project Sizes

| File | Bytes |
|---|---|
| index.html | 96,644 |
| franchise/gallery.html | 94,818 |
| api/send-enquiry.js | 8,448 |
| api/send-franchise-enquiry.js | 10,243 |

## 2. HTML / CSS / JS Sizes

| Resource | Bytes |
|---|---|
| index.html inline <style> block | 40,718 |
| index.html inline <script> block | 36,707 |
| gallery.html inline <script> blocks | ~29,003 |

## 3. Equipment JPG Sizes

| File | KB | Classification |
|---|---|---|
| seated-leg-curl.jpg | 1,110 | CRITICAL (>1MB) |
| leg-press.jpg | 1,067 | CRITICAL |
| leg-extension.jpg | 1,046 | CRITICAL |
| dumbbell-rack.jpg | 1,013 | CRITICAL |
| power-rack.jpg | 1,013 | CRITICAL |
| shoulder-press.jpg | 968 | WARNING |
| lat-pulldown.jpg | 889 | WARNING |
| cable-crossover.jpg | 889 | WARNING |
| incline-bench-press.jpg | 871 | WARNING |
| smith-machine.jpg | 785 | WARNING |
| flat-bench-press.jpg | 785 | WARNING |
| chest-press.jpg | 210 | Preferred |
| chest-press-backup.jpg | 146 | Preferred (backup) |
| **TOTAL JPG** | **10,791** | |

## 4. Equipment PNG Sizes (duplicates of JPGs)

| File | KB |
|---|---|
| seated-leg-curl.png | 1,110 |
| leg-press.png | 1,067 |
| leg-extension.png | 1,046 |
| power-rack.png | 1,013 |
| dumbbell-rack.png | 1,013 |
| shoulder-press.png | 968 |
| cable-crossover.png | 889 |
| lat-pulldown.png | 889 |
| incline-bench-press.png | 871 |
| smith-machine.png | 785 |
| flat-bench-press.png | 785 |
| chest-press.png | 74 |
| **TOTAL PNG** | **10,510** |

## 5. Duplicate / Dead Asset Findings

- 12 PNG files duplicate the 12 JPG equipment files. PNGs are NOT referenced by any production HTML/CSS/JS. They are only referenced by the existing test files (tests/load-test.js, tests/run-tests.js). Deleting them would require test changes, which is out of scope.
- chest-press-backup.jpg is a backup, not referenced by production code.

## 6. API Handler Sizes

| Handler | Bytes |
|---|---|
| api/send-enquiry.js | 8,448 |
| api/send-franchise-enquiry.js | 10,243 |

## 7. Existing Test Status

- node tests/run-tests.js ? 119 PASS / 27 FAIL
- The 27 failures are pre-existing static-source-check failures unrelated to this audit.

## 8. What Was Actually Measured

- File sizes (bytes) — MEASURED
- Equipment image sizes — MEASURED
- Inline CSS/JS byte sizes — MEASURED
- Test suite results — MEASURED

## 9. What Could NOT Be Tested

- LCP / INP / CLS / FCP / TTFB — NOT MEASURED (no browser/Lighthouse tooling available in this environment)
- Real iOS/Android device testing — NOT PHYSICALLY VERIFIED
- Production network latency — NOT MEASURED
- Real Telegram/WhatsApp API latency — NOT MEASURED

## 10. Performance Risks & Opportunities

### Risks
- Equipment JPG total ~10.8 MB — largest single transfer cost
- 12 duplicate PNGs (~10.5 MB) unused by production code
- No image width/height attributes on equipment gallery <img> tags — potential CLS
- External Unsplash images with no caching
- Google Fonts loaded without font-display strategy

### Opportunities
- Compress equipment JPGs to <250 KB each
- Add width/height to gallery images to prevent CLS
- Add decoding="async" to non-critical images
- Add font-display: swap to Google Fonts CSS
- Remove dead CSS/JS if proven unused
- Add srcset to program images

## 11. Classification Legend

- MEASURED FACT: value obtained from actual file/test execution
- OBSERVED ISSUE: problem identified by inspection
- RECOMMENDATION: suggested change (not yet implemented)
- ASSUMPTION: inference made without direct measurement
- NOT TESTED: could not be verified in this environment
- NOT AVAILABLE: tooling/data not present

---
_This is a baseline report only. No production code, tests, assets, Telegram, WhatsApp, or website design have been modified._## Optimization Changes
