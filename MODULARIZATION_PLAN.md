# FacilityView Modularization Plan

Incremental extraction of `virtual-tour.html` (~4900 lines, ~120 global functions) into namespaced modules under a single `FV` object. Each module is independently extractable and testable. No build step — the app runs via `file://`, so ES modules are not used; instead modules are namespace objects within the existing inline `<script>`.

**Branch:** `claude/plan-app-modularization-cxXHQ`
**Tests:** `npx vitest run` — must stay 149/149 green after each extraction.

---

## Architecture

```
const FV = {};
FV.moduleName = {
  // module-owned state as properties
  someState: ...,
  // methods
  someMethod() { ... }
};
```

- Each module **owns its state** as properties (no separate `FV.state`).
- Bare globals are removed as their owning module is extracted.
- Functions called from HTML `onclick` or from un-migrated code keep **backward-compat shims** as bare globals that delegate to `FV.moduleName.method()`.
- `saveRoutes()` is kept as a global shim (called from ~30 places) — will be inlined when all callers are migrated.

---

## Migration Pattern (per module)

1. Create `FV.moduleName = { ... }` block.
2. Move functions in; replace internal cross-references with `FV.moduleName.xxx()`.
3. Move owned state (bare `let`/`const` globals) into the module as properties.
4. Replace state reads/writes inside moved functions with `FV.moduleName.prop`.
5. Add backward-compat shim `function oldName(...) { FV.moduleName.method(...); }` for any caller not yet migrated (HTML onclick, other modules).
6. Run `npx vitest run` — must pass.
7. Manual smoke test in browser if feasible.
8. Commit with message: `refactor: extract FV.X module for ...`
9. Push to feature branch.

---

## Progress

### ✅ Completed (7 / 17)

| # | Module | Commit | Notes |
|---|--------|--------|-------|
| 1 | `FV.quiz` | `67deb7c` | Quiz overlay, scoring, session tracking, editor toggle. State: `answered`, `resultsShown` |
| 2 | `FV.kiosk` | `67deb7c` | Kiosk mode, auto-advance timer. State: `active`, `auto`, `intervalSec`, `timerId` |
| 3 | `FV.session` | `6afb2cf` | Training session log, CSV export. State: `log`, `startTime` |
| 4 | `FV.settings` | `219a68a` | Sensitivity, inertia toggle, helper arrows. State: `sensitivity`, `inertiaEnabled`, `helperArrowsEnabled`, `open`. **Note:** `velX`/`velY`/`inertiaId` kept as bare globals (coupled to input handlers — moves to `FV.input` later) |
| 5 | `FV.persistence` | `3b01f37` | IndexedDB, save/load, import/export, sanitize, viewer package. State: `db`, `_saveTimeout`. Added `_reconstructRoute()` helper (deduplicated load/loadFromBaked). **Global shim:** `saveRoutes()` retained — ~30 callsites |
| 6 | `FV.modals` | `f622db2` | `open(id)`, `close(id)` one-liners. Shims: `openModal`, `closeModal` |
| 7 | `FV.connections` | `ec18b83` | Bidirectional graph CRUD: `add`, `remove`, `removeAll`, `toggle`. Refactored 5 callers + map-editor connect tool to delegate. Pure version still in `virtual-tour-utils.js` for tests |

### ⏳ Remaining (10 / 17)

In recommended extraction order (safest dependencies first):

| # | Module | Description | Key state | Key functions | Depends on |
|---|--------|-------------|-----------|---------------|------------|
| 8 | `FV.hotspots` | Hotspot DOM building, positioning, edit mode, CRUD, lightbox | `editMode`, `pendingYaw`, `pendingPitch`, `editingId`, `repositioningId` | `buildHotspots`, `updateHotspotPositions`, `toggleHotspotEditMode`, `canvasClickToYawPitch`, `openAddHotspotModal`, `confirmAddHotspot`, `deleteHotspot`, `openManageHotspotsModal`, `buildHotspotManageList`, `openEditHotspotModal`, `startRepositionHotspot`, `showHotspotInfo`, `showHotspotImage`, `closeLightbox`, `selectHotspotIcon`, `resetHotspotColor`, `resetNavArrowColor`, `updateHotspotTypeFields` | `FV.modals`, `FV.persistence` |
| 9 | `FV.nodes` | Node CRUD, rename modal, reorder, thumbnails | `pendingNodeImage`, `renameTargetIdx` | `openRenameModal`, `confirmRenameNode`, `deleteNode`, `getThumbnail`, `reorderNode`, `removeNodeImage`, add-node modal flow | `FV.connections`, `FV.modals`, `FV.persistence` |
| 10 | `FV.routes` | Route CRUD | (none owned) | `openNewRouteModal`, `confirmNewRoute`, `deleteRoute`, `duplicateRoute`, `rebuildRouteSelect`, `selectRoute` | `FV.nodes`, `FV.persistence`, `FV.quiz` (resets), `FV.session` |
| 11 | `FV.sidebar` | Sidebar tabs, resize, node list | `sidebarOpen`, `sidebarView` | `buildSidebar`, `switchSidebarView`, `toggleDocPanel`, sidebar drag-resize | `FV.nodes`, `FV.navigation` |
| 12 | `FV.minimap` | Minimap drawing, minimize toggle | `minimapMinimized` | `drawMinimap`, `toggleMinimapMinimize`, `toMM()` | reads route/node state |
| 13 | `FV.mapEditor` | Largest module — canvas, tools, undo/redo, floor tabs | `mapTool`, `mapSelectedNodeIdx`, `mapDraggingNodeIdx`, `mapConnectFirstNodeIdx`, `mapDragOffX/Y`, `mapCurrentFloorId`, `mapEditorOpen`, `mapUndoStack`, `mapRedoStack` | `openMapEditor`, `closeMapEditor`, `setTool`, `buildEditorNodeList`, `drawMapEditor`, mouse handlers, `mapSnapshot`, `applySnapshot`, `pushUndo`, `mapUndo`, `mapRedo`, `buildFloorTabs`, `switchFloor`, `addFloor`, `deleteFloor`, `startFloorRename`, `assignNodeFloor`, `clearFloorplan`, floorplan upload | `FV.connections`, `FV.minimap`, `FV.persistence` |
| 14 | `FV.viewer` | WebGL/2D rendering pipeline, crossfade | `gl`, `ctx`, `useWebGL`, `glProgram`, `glTexture`, `glYawLoc`, `glPitchLoc`, `glFovLoc`, `glResLoc`, `img`, `renderPending`, `isFading`, `fadeTimeout`, `lastCompassDeg` | `initWebGL`, `renderFrame`, `scheduleRender`, `clearViewer`, `resizeCanvas`, `updateHUD`, crossfade logic | (foundation — minimal deps) |
| 15 | `FV.navigation` | Central hub: navigateTo, prev/next, headers | `currentRouteIdx`, `currentNodeIdx`, `yaw`, `pitch`, `fov` (these live here as the navigation owns viewer pose) | `navigateTo`, `navigatePrev`, `navigateNext`, `updateHeaders`, `updateRouteProgress` | `FV.viewer`, `FV.hotspots`, `FV.quiz`, `FV.kiosk`, `FV.minimap` |
| 16 | `FV.input` | Mouse/touch/keyboard handlers, inertia, pinch-zoom | `isDragging`, `lastX`, `lastY`, `mouseDownX`, `mouseDownY`, `velX`, `velY`, `inertiaId`, `pinchStartDist`, `pinchStartFov` | All canvas event listeners, `startInertia` (move from `FV.settings`), keyboard shortcuts | `FV.viewer`, `FV.navigation`, `FV.settings` |
| 17 | `FV.docs` | Document panel CRUD + inline viewer | (docs panel state) | `addDocument`, `deleteDocument`, `viewDocument`, doc list rendering | `FV.persistence`, `FV.modals` |

---

## State Currently Still Bare-Global (to be claimed)

These remain at the top of `<script>` until their owning module is extracted:

```
// Core data
routes[], currentRouteIdx, currentNodeIdx     → FV.navigation (or FV.routes)

// Viewer
yaw, pitch, fov, img, renderPending,
isFading, fadeTimeout                          → FV.viewer / FV.navigation

// Input/inertia
isDragging, lastX, lastY,
mouseDownX, mouseDownY,
velX, velY, inertiaId,
pinchStartDist, pinchStartFov                  → FV.input

// WebGL
gl, ctx, useWebGL, glProgram, glTexture,
glYawLoc, glPitchLoc, glFovLoc, glResLoc       → FV.viewer

// Compass
lastCompassDeg                                 → FV.viewer

// Map editor
mapTool, mapSelectedNodeIdx, mapDraggingNodeIdx,
mapConnectFirstNodeIdx, mapDragOffX, mapDragOffY,
mapCurrentFloorId, mapEditorOpen,
mapUndoStack, mapRedoStack                     → FV.mapEditor

// Hotspot editing
hotspotEditMode, pendingHotspotYaw, pendingHotspotPitch,
editingHotspotId, repositioningHotspotId       → FV.hotspots

// Node editing
pendingNodeImage, renameTargetIdx              → FV.nodes

// Sidebar
sidebarOpen, sidebarView                       → FV.sidebar
```

---

## Known Cross-Cutting Concerns

1. **`saveRoutes()`** — called from ~30 places. Currently a shim delegating to `FV.persistence.save()`. Inline these as each calling module migrates.
2. **`mapEditorOpen` flag** — checked from non-mapEditor code (e.g. modal-driven connection updates rebuild the editor list when open). Will become `FV.mapEditor.isOpen`.
3. **`currentNodes()` / `currentRoute()` helpers** — used everywhere. Probably stay as global helpers, or move to `FV.routes` with shims.
4. **`escapeHtml()`** — generic util, leave as global or put on `FV.util`.
5. **HTML `onclick` attributes** — when migrating, prefer keeping a thin global shim over editing every HTML attribute. Update HTML only when shim removal is the goal.
6. **`virtual-tour-utils.js`** — pure functions for tests (serialization, connections, quiz, node management). Not loaded by the HTML; the HTML duplicates the logic. Long-term goal: dedupe by importing utils into the HTML once a build step exists, OR keep parallel.

---

## Verification Checklist (per extraction)

- [ ] `npx vitest run` → 149/149 passing
- [ ] `git diff` reviewed for unintended changes
- [ ] No new ESLint/console errors (manual browser check if practical)
- [ ] Commit with descriptive message
- [ ] Push to `claude/plan-app-modularization-cxXHQ`
- [ ] Update this file's "Completed" table with commit hash

---

## Resume Instructions for Next Session

1. Read this file (`MODULARIZATION_PLAN.md`).
2. Read `CLAUDE.md` for app architecture/state reference.
3. Run `git log --oneline -15` to confirm latest extraction commit.
4. Run `npx vitest run` to confirm baseline 149/149 passing.
5. Pick the next module from "Remaining" table (currently `FV.hotspots`).
6. Read the relevant lines in `virtual-tour.html` (use the File Layout table in `CLAUDE.md` to locate them).
7. Follow the Migration Pattern above.
8. Commit + push + update this file.

**Current next step:** Extract `FV.hotspots` (Step 8). Target lines ~3290–3560 in `virtual-tour.html` (per CLAUDE.md File Layout — verify before editing as line numbers shift with each extraction).
