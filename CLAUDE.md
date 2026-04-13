# FacilityView — CLAUDE.md

## Code Exploration Policy
Always use jCodemunch-MCP tools — never fall back to Read, Grep, Glob, or Bash for code exploration.
- Before reading a file: use get_file_outline or get_file_content
- Before searching: use search_symbols or search_text
- Before exploring structure: use get_file_tree or get_repo_outline
- Call resolve_repo with the current directory first; if not indexed, call index_folder.

---

## Project Overview
FacilityView is a single-file HTML/CSS/JS virtual tour simulator for facility worker training. Users upload equirectangular panorama images, link them into named routes, and navigate between them in a Google Street View-style viewer.

**The entire app lives in one file:** `virtual-tour.html` (~5,883 lines)

---

## File Layout (approximate — update when sections shift significantly)

| Lines | Content |
|---|---|
| 1–1236 | `<head>` CSS + all HTML (header, sidebar, viewer, modals incl. quiz, session log, kiosk) |
| 1237–1329 | `<script>` open + bare-global state declarations + `HOTSPOT_ICONS`/`HOTSPOT_ICON_DEFAULTS` constants |
| 1330–1668 | Helper functions: `currentRoute()`, `currentNodes()`; event listeners (keyboard, add-node file input, route select) |
| 1669–1988 | Connection modal handlers; node image upload handlers; misc raw global code |
| 1989–2080 | Navigation: `navigateTo`, `navigatePrev/Next`, `updateHeaders`, `updateRouteProgress` |
| 2081–2334 | Canvas/rendering: `resizeCanvas`, `clearViewer`, `renderFrame`, `scheduleRender`, `updateHUD`; hotspot stub (overridden by FV.hotspots shims) |
| 2335–2447 | Old `updateHotspotPositions`, `updateHelperArrows` implementations (dead code — overridden by FV.hotspots shims below) |
| 2448–2648 | Minimap: `toggleMinimapMinimize`, `drawMinimap` (incl. cross-floor ghost nodes) |
| 2649–3187 | Map editor: `openMapEditor`, `closeMapEditor`, undo/redo helpers, `setTool`, `buildEditorNodeList`, floor tab functions, `drawMapEditor`, mouse/click handlers |
| 3188–3353 | Floorplan upload: `clearFloorplan`; view controls: `adjustFov`, `resetView`, `toggleFullscreen`; old shim stubs |
| 3354–3431 | **FV.modals** module + **FV.connections** module |
| 3432–3989 | **FV.hotspots** module + shims (`buildHotspots`, `updateHotspotPositions`, `toggleHotspotEditMode`, etc.) |
| 3990–4367 | **FV.nodes** module + shims (`openRenameModal`, `confirmRenameNode`, `deleteNode`, `buildSidebar`, `reorderNode`, etc.) |
| 4368–4482 | **FV.routes** module + shims (`openNewRouteModal`, `confirmNewRoute`, `deleteRoute`, `rebuildRouteSelect`, `selectRoute`) |
| 4483–4600 | **FV.sidebar** module + shims (`toggleSidebar`, `switchSidebarView`, `toggleDocPanel`, `initSidebarResize`) |
| 4601–4673 | Demo panoramas: `makeSyntheticPanorama`, `loadDemo` |
| 4674–5026 | **FV.persistence** module + shims (`openDB`, `saveRoutes`, `loadRoutes`, `exportRoutes`, `importRoutes`, etc.) |
| 5027–5064 | **FV.settings** module + shims (`toggleSettings`, `updateSensitivity`) |
| 5065–5397 | **FV.kiosk** module + shims (`enterKioskMode`, `exitKioskMode`, `setKioskAuto`, etc.) |
| 5398–5581 | **FV.quiz** module + shims (`checkNodeQuiz`, `showQuizQuestion`, `submitQuizAnswer`, `showQuizScore`, etc.) |
| 5582–5686 | **FV.session** module (training log, CSV export) |
| 5687–5774 | WebGL init: `initWebGL` (shaders, texture setup, fallback) |
| 5775–5842 | App startup: `showLoader`, `hideLoader` |
| 5843–5883 | `init()` async entry point + call |

---

## Architecture

### Rendering
- Panoramas are rendered on `#panoramaCanvas` using an equirectangular projection.
- **WebGL (preferred):** Fragment shader samples equirectangular texture by converting `gl_FragCoord` → yaw/pitch → UV. Context created with `preserveDrawingBuffer: true`. Falls back to 2D CPU pixel loop if WebGL unavailable.
- WebGL state: `gl`, `glProgram`, `glTexture`, `glYawLoc`, `glPitchLoc`, `glFovLoc`, `glResLoc`, `useWebGL`. `initWebGL()` sets this up at startup.
- A second overlay canvas (`#fadeCanvas`) handles **crossfade transitions** between nodes.
- Rendering is triggered by `scheduleRender()` → `renderFrame()`.
- `clearViewer()` clears either the WebGL or 2D canvas appropriately.
- When `img` is null (no panorama), `renderFrame()` clears the canvas and shows `#noPanoramaMsg` overlay.

### Coordinate System
- **Yaw**: radians, `0 = north/forward`. Increases clockwise (drag right = yaw increases).
- **Pitch**: radians, `0 = horizon`, clamped to `±Math.PI/2.2`.
- **FOV**: degrees, default 75.
- **Minimap & Map editor**: both use Y-down canvas coords. Larger `mapY` = further south on screen. Orientations are consistent with each other.
- **Bearing formula** (current→target): `Math.atan2(target.mapX - current.mapX, -(target.mapY - current.mapY))` — dy is negated because mapY increases downward (south) but yaw=0 = north in the viewer/minimap.

### Data Model
```js
routes[] = [{
  id, name, desc,
  floors: [{ id, name, image: Image | null }],  // array of floors; at least one always present
  nodes: [{
    id,              // e.g. "N01" — reassigned after reorder/delete
    name, desc,
    image: Image | null,  // panorama; null = not yet assigned
    thumbUrl,        // lazy-generated 96×60 thumbnail data URL (null if no image)
    mapX, mapY,      // 2D map position (null if unplaced)
    floorId,         // string floor ID (null = unassigned)
    connections: [], // array of node IDs for ALL nav links (bidirectional) — auto-populated on node creation; editable via Connect tool
    navArrowColor: null, // hex string or null (default gold #f0a500) — set via Edit Node modal
    hotspots: [{ id, type: 'info'|'link', icon: 'info'|'warning'|'danger'|'important'|'note'|'link', color: null|hexStr, yaw, pitch, label, content }],
    quiz: null  // or { question, options: [A,B,C,D], correctIndex: 0–3, explanation: '' }
  }]
}]
```
- `floors[]` — replaces old `floorplan` field. At least one floor always exists. Serialized as `imageSrc` in IndexedDB/export. Old saves (with `floorplan`) are migrated in `loadRoutes()`.
- `connections[]` — set via Map Editor "Connect" tool. Cross-floor connections are supported; shown as `↕` badge in map editor instead of a line. `buildHotspots()` shows nav arrows for all connections regardless of floor.
- `image` may be `null` — nodes can be created name-only; panorama added later via Edit Node modal.

### Persistence
- **IndexedDB** (`facilityview_db`, store: `tours`, key: `'main'`).
- Images stored as data URLs (too large for localStorage).
- `saveRoutes()` must be called after every mutation.
- `loadRoutes()` reconstructs `Image` objects via `Promise.all` (skips null imageSrc).

---

## Key Functions

| Function | Purpose |
|---|---|
| `initWebGL()` | Compile shaders, set up full-screen quad, create texture; falls back to 2D |
| `renderFrame()` | Draw current panorama; shows no-panorama overlay if `img` is null |
| `clearViewer()` | Clear WebGL or 2D canvas (use instead of direct ctx.clearRect) |
| `scheduleRender()` | rAF-debounced trigger for `renderFrame()` |
| `navigateTo(index)` | Switch nodes — handles crossfade, arrival yaw, hotspot rebuild |
| `buildHotspots(index)` | Create nav arrows (linear + explicit connections) + custom hotspot DOM |
| `updateHotspotPositions()` | Reposition hotspot overlays each frame via yaw/pitch math |
| `drawMinimap()` | Render 2D position map; `toMM(nx,ny)` maps coords to canvas px; floor-aware (shows active node's floor) |
| `toggleMinimapMinimize()` | Toggle ▼/▲ collapse of minimap canvas |
| `switchSidebarView(mode)` | Switch sidebar between `'nodes'` and `'docs'` tabs; opens sidebar if collapsed; syncs `docPanelOpen` |
| `toggleDocPanel()` | Legacy toggle — delegates to `switchSidebarView` |
| `resizeCanvas()` | Sync canvas pixel dimensions to layout size |
| `saveRoutes()` | Serialize routes[] → IndexedDB |
| `loadRoutes()` | Deserialize IndexedDB → routes[] (reconstructs Images) |
| `exportRoutes()` | Download routes as JSON file with base64 images |
| `importRoutes(file)` | Read JSON, sanitize, reconstruct Images, append to routes[] |
| `buildSidebar()` | Rebuild node list in left panel (includes drag-reorder handles) |
| `reorderNode(from, to)` | Splice nodes[], reassign IDs, remap connections[], update currentNodeIdx |
| `rebuildRouteSelect()` | Rebuild route dropdown in header |
| `openModal(id)` / `closeModal(id)` | Show/hide modals by adding/removing `.open` class |
| `openRenameModal(nodeIdx)` | Open "Edit Node" modal (name, desc, panorama change/remove) |
| `removeNodeImage()` | Clear node.image + node.thumbUrl; shows no-panorama overlay |
| `confirmRenameNode()` | Save name/desc edits from Edit Node modal |
| `deleteNode(nodeIdx)` | Remove node, reassign IDs, update connections on other nodes |
| `getThumbnail(node)` | Lazy-generate 96×60 center-crop thumbnail; cached as `node.thumbUrl` |
| `selectHotspotIcon(icon)` | Highlight icon button in picker and update color input to that icon's default |
| `resetHotspotColor()` | Reset color picker to the active icon's default color |
| `resetNavArrowColor()` | Reset nav arrow color picker to default gold |
| `toggleHotspotEditMode()` | Toggle crosshair cursor for hotspot placement |
| `canvasClickToYawPitch(x, y)` | Convert canvas click → yaw/pitch coords |
| `openManageHotspotsModal()` | Open hotspot list panel for current node |
| `openEditHotspotModal(hsId)` | Edit existing hotspot label/type/content |
| `startRepositionHotspot(hsId)` | Enter reposition mode — next canvas click sets new yaw/pitch |
| `startInertia()` | rAF loop that decays velX/velY at 0.88/frame |
| `drawMapEditor()` | Render full-screen map editor canvas; floor-aware background + node dimming + cross-floor badges |
| `buildEditorNodeList()` | Rebuild node list panel inside map editor (shows floor name per node) |
| `setTool(tool)` | Switch map editor tool: `'place'` \| `'move'` \| `'connect'` |
| `buildFloorTabs()` | Rebuild floor tabs bar from `route.floors`; click→switch, dblclick→rename, ✕→delete |
| `switchFloor(floorId)` | Set `mapCurrentFloorId`, rebuild tabs, redraw |
| `addFloor()` | Prompt name, push new floor, switchFloor, saveRoutes |
| `deleteFloor(floorId)` | Guard (min 1 floor), unassign nodes, remove floor, rebuild |
| `startFloorRename(floorId, nameEl)` | Inline input replace for floor tab rename |
| `assignNodeFloor(nodeIdx, floorId)` | Set `node.floorId`, redraw, save |
| `mapSnapshot()` | Capture node positions+connections for undo |
| `applySnapshot(snap)` | Restore positions+connections from snapshot (matches by node ID) |
| `pushUndo()` | Push snapshot to undoStack (cap 50), clear redoStack |
| `mapUndo()` | Pop undoStack, restore, push to redoStack, redraw+save |
| `mapRedo()` | Pop redoStack, restore, push to undoStack, redraw+save |
| `duplicateRoute()` | Copy route with new ID; shares Image/thumbUrl object references; copies floors[] and quiz data |
| `checkNodeQuiz(index)` | Called from `navigateTo()` after crossfade — shows quiz overlay if node has quiz and it hasn't been answered this session; auto-shows score at last node |
| `showQuizQuestion(node)` | Render quiz overlay with question and 4 option buttons |
| `submitQuizAnswer(node, idx)` | Record answer, highlight correct/wrong, show feedback + continue button |
| `closeQuizOverlay()` | Hide overlay; auto-shows score modal if on last node |
| `showQuizScore()` | Populate and open #modalQuizScore with % score, pass/fail, per-node breakdown |
| `resetQuizSession()` | Clear quizAnswered + quizResultsShown; hide Results button |
| `toggleQuizEditor()` | Expand/collapse quiz editor section in Edit Node modal |
| `showLoader(msg)` / `hideLoader()` | Show/hide full-screen loading overlay |
| `init()` | App entry point: openDB → loadRoutes → loadDemo (if empty) |

---

## State Variables (JS globals)

**Bare globals (still to be claimed by future modules):**

```js
// Core data — → FV.navigation (not yet extracted)
routes[]                // all route data
currentRouteIdx         // index into routes[]
currentNodeIdx          // index into currentRoute().nodes

// Viewer pose — → FV.viewer / FV.navigation (not yet extracted)
yaw, pitch, fov         // viewer orientation (radians / degrees)
img                     // current panorama Image object (null if none)
renderPending           // true if a rAF render is already queued
isFading, fadeTimeout   // crossfade animation state

// Input/inertia — → FV.input (not yet extracted)
isDragging              // true while mouse/touch dragging
lastX, lastY            // last drag position for delta calculation
mouseDownX, mouseDownY  // drag start (used to distinguish click vs drag)
velX, velY              // current inertia velocity (rad/frame)
inertiaId               // rAF handle for inertia loop
pinchStartDist          // pixel distance between fingers at pinch start
pinchStartFov           // fov value at pinch start

// WebGL — → FV.viewer (not yet extracted)
gl, ctx                 // WebGL context (preferred) / 2D fallback context
useWebGL                // true if WebGL initialized successfully
glProgram, glTexture    // compiled shader program and texture handle
glYawLoc, glPitchLoc, glFovLoc, glResLoc  // uniform locations
lastCompassDeg          // accumulated compass rotation (unwrapped)

// Map editor — → FV.mapEditor (not yet extracted)
mapTool                 // 'place' | 'move' | 'connect'
mapSelectedNodeIdx      // selected node in editor (-1 = none)
mapDraggingNodeIdx      // node being dragged in editor (-1 = none)
mapConnectFirstNodeIdx  // first node clicked in connect tool (-1 = none)
mapDragOffX, mapDragOffY // drag offset within node circle
mapCurrentFloorId       // string ID of floor being viewed/edited (null = none)
mapEditorOpen           // true when map editor overlay is visible
mapUndoStack            // array of position/connection snapshots (capped at 50)
mapRedoStack            // array of redoable snapshots
```

**State now owned by FV modules (access via module property):**

| Module | Properties |
|--------|-----------|
| `FV.hotspots` | `editMode`, `pendingYaw`, `pendingPitch`, `editingId`, `repositioningId`, `pendingFileData` |
| `FV.nodes` | `pendingNodeImage`, `renameTargetIdx` |
| `FV.sidebar` | `open`, `view`, `docPanelOpen` |
| `FV.settings` | `sensitivity`, `inertiaEnabled`, `helperArrowsEnabled`, `open` |
| `FV.persistence` | `db`, `_saveTimeout` |
| `FV.quiz` | `answered`, `resultsShown` |
| `FV.kiosk` | `active`, `auto`, `intervalSec`, `timerId` |
| `FV.session` | `log`, `startTime` |

---

## UI Structure

```
header
  .header-left    — logo, sidebar toggle (#sidebarToggle), route selector (#routeSelect), New Route button
  .header-right   — Add Node, Add Hotspot (#btnAddHotspot), Settings gear, SAVED indicator (#savedIndicator)

.main
  .sidebar (#sidebar)   — collapsible; two tabs at top (Nodes / Docs)
    #sidebarNodesView     — nodes tab: search, #locationList, sidebar-bottom (upload + node count)
    #sidebarDocsView      — docs tab: #docList, #docViewArea, #docPanelFooter (Add Document)
  .viewer-wrap (#viewerWrap)
    #panoramaCanvas       — main render target (WebGL or 2D)
    #fadeCanvas           — crossfade overlay (reads WebGL frame via preserveDrawingBuffer)
    #noPanoramaMsg        — shown when current node has no panorama image
    #hotspots             — container for nav arrow + custom hotspot DOM elements
    #minimapCanvas        — 2D position map (bottom-right, inside .minimap#minimapWidget)
    #hotspotInfoPopup     — floating info panel for info-type hotspots
    #quizOverlay          — full-screen quiz overlay (z-index 200); shown when arriving at a node with a quiz
    .compass              — yaw indicator (top-right)
    #settingsPanel        — gear menu (sensitivity slider, inertia toggle)
    .controls-bar         — zoom in/out, reset view, fullscreen buttons
  #mapEditorWrap          — full-screen map editor overlay
    #mapEditorCanvas      — the editor drawing surface
    #editorNodeList       — node list panel inside map editor
```

---

## Adding a New Feature — Checklist

1. If the feature mutates route/node data → call `saveRoutes()` at the end.
2. If adding a new node field → also add it to `loadRoutes()` reconstruction, `saveRoutes()` serialization, `exportRoutes()`, `importRoutes()`, and `duplicateRoute()`.
3. If adding a new hotspot element type → extend `updateHotspotPositions()` to handle its `data-pitch`.
4. If changing canvas layout → update `resizeCanvas()`.
5. If adding a new function or state variable → update this CLAUDE.md file (Key Functions / State Variables tables + File Layout line ranges).
6. Test: open in Opera GX via `/c/Users/jamey/AppData/Local/Programs/Opera\ GX/opera.exe virtual-tour.html`.

---

## Known Behaviors / Gotchas

- **`clearViewer()` must not contain `clearViewer()`** — it was once replaced recursively by a bulk find-replace. The 2D branch must use `ctx.clearRect(...)` directly.
- **`connections[]` drives ALL navigation** — linear prev/next arrows are no longer hardcoded. New nodes auto-connect to the previous node; users can remove any connection via the Connect tool. On load, pre-v2 saves (all-empty connections) are migrated to sequential connections.
- **Node IDs reassign on reorder/delete** — connections[] on other nodes are remapped by `reorderNode()` and `deleteNode()`. Hotspot `content` field (link type) is also remapped automatically.
- **WebGL crossfade** — requires `preserveDrawingBuffer: true` so `fadeCtx.drawImage(canvas)` can read the last WebGL frame.
- **Non-POT textures** — WebGL 1 requires `CLAMP_TO_EDGE` for non-power-of-2 textures.
- **Touch tap detection** — `mouseDownX/Y` must be set in both `mousedown` and `touchstart` handlers or tap detection breaks on mobile.
- **`image` can be null** — nodes may have no panorama. Always guard with `if (node.image)` before accessing `.src` or `.naturalWidth`.
- **`floorId` can be null** — unassigned nodes show on all floor tabs in the editor and on all floor views in the minimap. Always use `node.floorId || null` when reading.
- **Undo stack covers only map positions/connections** — does NOT undo node add/delete. Stacks reset when the map editor opens or closes. `applySnapshot()` filters restored connections to exclude node IDs that no longer exist.
- **`sanitizeRouteData()`** — runs on `loadRoutes()`, `loadFromBaked()`, and `importRoutes()`. Validates connections against valid node IDs, filters invalid hotspot types, and removes link-type hotspots targeting non-existent nodes.
- **Cross-floor connections are stored in `connections[]`** — no special handling needed in `buildHotspots()`. In `drawMapEditor()`, same-floor connections draw lines; cross-floor connections draw a `↕` badge on both endpoints.
- **`route.floors` always has at least one entry** — `openMapEditor()` defensively adds the default if missing (handles old saves).

---

## Git & GitHub

- Remote: `https://github.com/yemajj/facilityview-virtual-tour`
- Branch: `main`
- **Commit and push after every logical change** — don't batch multiple features into one commit.
- Commit as soon as a feature or fix is working, before moving on to the next task.
- Use clean, descriptive commit messages that explain *what* changed and *why*.
- Never leave working changes uncommitted at the end of a session.

---

## Completed Features

- Export / Import routes as JSON files
- Hotspot management panel (edit/reposition existing hotspots)
- Loading indicator for large panoramas
- Branching routes / non-linear navigation (connections[] — additive with linear nav)
- Thumbnail previews in sidebar
- Mobile pinch-to-zoom / swipe support
- WebGL renderer (fragment shader, falls back to 2D)
- Route duplication
- Node reordering (drag handles in sidebar)
- Minimap enlarged 1.5× with minimize toggle
- Minimap orientation matches map editor (Y-down, consistent)
- Optional panorama on node creation (name-only nodes supported)
- Change / remove panorama via Edit Node modal
- Undo / redo in map editor (Ctrl+Z / Ctrl+Y) — node placement, movement, connections
- Multi-floor support — floor tabs in map editor, per-node floor assignment, cross-floor connections, floor-aware minimap
- Full connection control — all nav via `connections[]`, editable/removable; linear auto-connect on new node; pre-v2 migration
- Compass smooth rotation fix (accumulated degrees, no CSS spin-back at north)
- Custom hotspot icons + color pickers + per-node nav arrow color
- Node 1 starting yaw faces toward first connected node on map
- Cross-floor ghost nodes on minimap (connected nodes on other floors shown dimmed)
- Hotspot links to external URLs, images, and documents/PDFs
- Export Viewer Package — self-contained viewer.html with baked route data
- Kiosk / Presentation Mode — hides editing UI, optional auto-advance with progress bar
- Quiz / Assessment Mode — per-node multiple-choice questions, instant feedback, score modal

## Roadmap (as of 2026-03-27)

1. ~~Quiz / assessment mode~~ ✓ Done — per-node questions, score modal, results button
2. Training session log — record which nodes were visited, timestamps, quiz scores
3. ~~Custom hotspot icons~~ ✓ Done — icon/color per hotspot + per-node nav arrow color
4. Hotspot links to external URLs — open browser tab from a link-type hotspot
5. ~~Undo / redo in map editor~~ ✓ Done
6. Kiosk / presentation mode — full-screen, hide all editing UI, auto-advance option
7. ~~Multi-floor support~~ ✓ Done
8. Export Viewer Package — generate a self-contained viewer-only `viewer.html` with all editing UI stripped, route data baked in, for distribution to end users
