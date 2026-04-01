# Plan: Production-Grade Fixes for FacilityView Virtual Tour

## Context

A comprehensive code review identified critical security vulnerabilities, correctness bugs, and quality issues in the FacilityView virtual tour app. This plan addresses the highest-impact items in priority order. The app is a single-file HTML/CSS/JS virtual tour simulator (`virtual-tour.html`, ~4078 lines) with extracted test utilities (`virtual-tour-utils.js`, 408 lines) and 8 test files under `tests/`.

The user wants **incremental improvements**, not a rewrite. Each phase is one atomic commit pushed to `claude/code-review-production-RSqd9`.

---

## Phase 1: Fix XSS via innerHTML (Critical Security)

**File:** `virtual-tour.html`

`escapeHtml()` exists at line 1197 but is only used in quiz display code. 12 injection points render user-controlled data (node names, descriptions, labels, floor names) via innerHTML without escaping. An attacker can craft a malicious `.json` export file that executes arbitrary JS when imported.

### Changes

**A. Add `escapeHtml()` to all user-data innerHTML interpolations:**

| Line(s) | Function | Variables to wrap |
|----------|----------|-------------------|
| 1453 | `refreshModalConnections()` | `cn.id`, `cn.name`, `badge` (contains `floorName`) |
| 1687-1688 | `buildSidebar()` | `node.name`, `node.desc` |
| 1975 | `buildHotspots()` | `t.label` |
| 2368-2370 | `buildEditorNodeList()` | `node.name`, `floorName`, `node.id` |
| 2399-2408 | `updateSelectedNodeInfo()` conn rows | `cn.id`, `cn.name`, `floorName` |
| 2418 | `updateSelectedNodeInfo()` header | `node.id`, `node.name` |
| 3641 | `buildSessionLogTable()` | `e.nodeName`, `e.quizAnswerText` |
| 3844-3845 | `buildHotspotManageList()` | `hs.label`, `previewText` |

**B. Fix onclick injection vectors (lines 1454, 2407):**

Replace inline `onclick="removeConnectionFromModal('${cid}')"` with `data-cid` attributes + delegated event listeners. The `cid` values are node IDs like `N01` which are normally safe, but an imported file could contain crafted IDs with `');alert(1);//`. Use data attributes and `addEventListener` instead.

---

## Phase 2: Fix calcQuizScore Over-Counting Bug

**Files:** `virtual-tour-utils.js` (line 229), `virtual-tour.html` (line 3553), `tests/quiz.test.js` (lines 147-172)

### Problem
`correct` counts ALL entries in `quizAnswered` regardless of whether the node has a quiz. This can produce scores >100%.

### Changes

**virtual-tour-utils.js line 229** — filter to quiz node IDs:
```js
const quizNodeIds = new Set(quizNodes.map(n => n.id));
const correct = Object.entries(quizAnswered)
  .filter(([id, a]) => quizNodeIds.has(id) && a.correct).length;
```

**virtual-tour.html line 3553** — same fix in inline `showQuizScore()`.

**tests/quiz.test.js lines 147-172** — update regression canary to expect correct behavior: `correct: 1`, `pct: 100`.

---

## Phase 3: Fix deleteNodePure to Match App Behavior

**Files:** `virtual-tour-utils.js` (lines 124-128), `tests/node-management.test.js` (lines 143-181)

### Problem
The extracted `deleteNodePure()` only splices + reassigns IDs. It does NOT remove the deleted node's ID from other nodes' connections, remap surviving connection IDs, or clean up hotspot link targets. The app's inline `deleteNode()` (lines 1586-1601) does all of this correctly. The utils version has diverged from the app — tests validate the wrong behavior.

### Changes

**virtual-tour-utils.js** — rewrite `deleteNodePure` to match app behavior:
- After splice + ID reassignment, build an `idMap` (old ID -> new ID)
- Filter out `deletedId` from all nodes' connections, then remap remaining via `idMap`
- Filter out hotspots of type `'link'` pointing at `deletedId`, remap others via `idMap`

**tests/node-management.test.js** — update 2 tests:
- Lines 143-154: Change from "does NOT clean up back-references" to verify they ARE cleaned up
- Lines 156-181: Expect correctly remapped connection IDs instead of stale ones

---

## Phase 4: Fix arrivalBearing mapY Null Guard

**Files:** `virtual-tour-utils.js` (lines 273-276), `virtual-tour.html` (lines 1762-1770), `tests/coordinates.test.js`

### Problem
`arrivalBearing()` only checks `mapX` for null. If `mapX` is valid but `mapY` is null, `Math.atan2` produces NaN.

### Changes

**virtual-tour-utils.js** — add `mapY` null/undefined checks for both nodes.

**virtual-tour.html** — add `mapY` guards at lines 1763 and 1769 (the two places arrival yaw is computed).

**tests/coordinates.test.js** — add test: `arrivalBearing({ mapX: 0, mapY: null }, { mapX: 10, mapY: 10 })` returns null.

---

## Phase 5: Debounce saveRoutes()

**File:** `virtual-tour.html` (line 3076)

### Problem
24 call sites trigger full IndexedDB writes (including multi-MB base64 data URLs) with no debounce. Rapid operations queue redundant writes.

### Changes

Add internal debounce. All 24 callers remain unchanged:
```js
let _saveTimeout = null;
function saveRoutes() {
  if (!db) return;
  if (_saveTimeout) clearTimeout(_saveTimeout);
  _saveTimeout = setTimeout(_saveRoutesNow, 300);
}
function _saveRoutesNow() { /* existing save logic */ }
```

Add `_saveTimeout` declaration near the other globals (~line 1162).

---

## Phase 6: Optimize Kiosk Timer

**File:** `virtual-tour.html` (lines 3414-3436, CSS ~line 370)

### Problem
`setInterval(fn, 100)` runs 10 ticks/sec just for a progress bar animation. Wasteful on mobile/battery.

### Changes

Replace with CSS `transition: width Xs linear` on `#kioskProgressBar` + single `setTimeout` for navigation:
- Reset bar to 0% with `transition: none`, force reflow
- Set `transition: width ${kioskIntervalSec}s linear` and `width: 100%`
- `setTimeout(navigate, kioskIntervalSec * 1000)`
- Update `stopKioskTimer()` to use `clearTimeout`

---

## Phase 7: Add Data Validation on Load

**File:** `virtual-tour.html`

### Problem
`loadRoutes()` and `loadFromBaked()` trust IndexedDB/baked data completely. Corrupt data causes subtle bugs.

### Changes

Add `sanitizeRouteData(rd)` function that:
- Ensures `name` is a string (default `'Untitled'`)
- Ensures `nodes` and `floors` are arrays; floors has >= 1 entry
- Each node has `id` (string), `name` (string), `connections` (array), `hotspots` (array)
- Removes connections referencing non-existent node IDs
- Validates hotspot `type` against allowed enum

Call in `loadRoutes()` (~line 3133) and `loadFromBaked()` (~line 3202) on each route before push.

---

## Phase 8: File Size Limits

**File:** `virtual-tour.html`

### Problem
No enforcement on upload size. A 200MB image becomes a data URL in memory and IndexedDB.

### Changes

Add `file.size` checks (with user-friendly alerts) at:
- `fileInput` change handler (line 1346): 50MB limit for panoramas
- `nodeImageInput` change handler (line 1513): 50MB limit
- Viewer drop handler (line 2939): 50MB limit
- `hotspotFileInput` change handler (line 3344): 20MB limit

---

## Todo List

- [ ] **Phase 1a**: Wrap all user-data innerHTML interpolations in `escapeHtml()` (8 functions, ~15 insertions)
- [ ] **Phase 1b**: Replace onclick injection vectors with data attributes + delegated handlers (2 locations)
- [ ] **Phase 1 commit**: Commit + push XSS fix
- [ ] **Phase 2a**: Fix `calcQuizScore` in `virtual-tour-utils.js`
- [ ] **Phase 2b**: Fix `showQuizScore` in `virtual-tour.html`
- [ ] **Phase 2c**: Update regression test in `tests/quiz.test.js`
- [ ] **Phase 2 commit**: Commit + push quiz fix
- [ ] **Phase 3a**: Rewrite `deleteNodePure` in `virtual-tour-utils.js`
- [ ] **Phase 3b**: Update 2 tests in `tests/node-management.test.js`
- [ ] **Phase 3 commit**: Commit + push deleteNode fix
- [ ] **Phase 4a**: Add mapY guards in `virtual-tour-utils.js`
- [ ] **Phase 4b**: Add mapY guards in `virtual-tour.html`
- [ ] **Phase 4c**: Add test case in `tests/coordinates.test.js`
- [ ] **Phase 4 commit**: Commit + push arrivalBearing fix
- [ ] **Phase 5**: Debounce `saveRoutes()` in `virtual-tour.html`
- [ ] **Phase 5 commit**: Commit + push debounce
- [ ] **Phase 6**: Replace kiosk setInterval with CSS transition + setTimeout
- [ ] **Phase 6 commit**: Commit + push kiosk optimization
- [ ] **Phase 7**: Add `sanitizeRouteData()` + call from loadRoutes/loadFromBaked
- [ ] **Phase 7 commit**: Commit + push validation
- [ ] **Phase 8**: Add file size limits at 4 upload points
- [ ] **Phase 8 commit**: Commit + push size limits
- [ ] **Final**: Run `npm test` to verify all tests pass

---

## Verification

1. **Run tests:** `npm test` — all 8 test files pass with updated expectations
2. **XSS manual test:** Create node named `<img src=x onerror=alert(1)>`, verify it renders as text (not executed) in sidebar, map editor, hotspot labels, connection lists
3. **Quiz score:** Create route with 2 nodes (one with quiz, one without), answer correctly, verify score is 100% not 200%
4. **Delete node:** Create 3 connected nodes, delete middle, verify surviving connections are remapped correctly
5. **Import test:** Import a .json with malicious HTML in names — no script execution
6. **Kiosk test:** Enter kiosk mode with auto-advance, verify smooth progress bar and correct navigation
7. **Save debounce:** Watch IndexedDB writes in devtools during rapid editing — should batch
