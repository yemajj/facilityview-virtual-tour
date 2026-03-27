# FacilityView — CLAUDE.md

## Project Overview
FacilityView is a single-file HTML/CSS/JS virtual tour simulator for facility worker training. Users upload equirectangular panorama images, link them into named routes, and navigate between them in a Google Street View-style viewer.

**The entire app lives in one file:** `virtual-tour.html` (~2,904 lines)

---

## File Layout (approximate — update when sections shift significantly)

| Lines | Content |
|---|---|
| 1–320 | `<head>`: CSS styles (incl. floor tabs) |
| 320–596 | HTML: header, sidebar, viewer, map editor overlay (incl. floor tabs bar) |
| 596–705 | HTML: modals (add route, add node, edit node with connections, hotspots, manage hotspots) |
| 705–768 | `<script>` open + all JS global state declarations |
| 768–795 | Helper functions: `currentRoute()`, `currentNodes()` |
| 795–938 | Route management: `openNewRouteModal`, `confirmNewRoute`, `deleteRoute`, `duplicateRoute`, `rebuildRouteSelect`, `selectRoute` |
| 938–1190 | Node management: `openRenameModal`, `refreshModalConnections`, `addConnectionFromModal`, `removeConnectionFromModal`, `removeAllConnectionsFromModal`, `confirmRenameNode`, `deleteNode`, `getThumbnail`, `buildSidebar`, `reorderNode` |
| 1190–1262 | Navigation: `navigateTo`, `navigatePrev/Next`, `updateHeaders`, `updateRouteProgress` |
| 1262–1356 | Canvas/rendering utils: `resizeCanvas`, `clearViewer`, `renderFrame`, `scheduleRender`, `updateHUD` |
| 1356–1459 | Hotspot DOM: `buildHotspots`, `updateHotspotPositions` |
| 1459–1631 | Minimap: `toggleMinimapMinimize`, `drawMinimap` |
| 1631–2185 | Map editor: `openMapEditor`, `closeMapEditor`, undo/redo helpers, `setTool`, `buildEditorNodeList`, floor tab functions (`buildFloorTabs`, `switchFloor`, `addFloor`, `deleteFloor`, `startFloorRename`, `assignNodeFloor`), `removeConnection`, `removeAllConnections`, `drawMapEditor`, mouse/click handlers |
| 2185–2311 | Floorplan upload: `clearFloorplan`, undo/redo keyboard listener |
| 2311–2335 | View controls: `adjustFov`, `resetView`, `toggleFullscreen`, `openModal`, `closeModal` |
| 2335–2398 | Demo panoramas: `makeSyntheticPanorama`, `loadDemo` |
| 2398–2481 | IndexedDB: `openDB`, `saveRoutes`, `loadRoutes`, `flashSavedIndicator` |
| 2481–2571 | Export/Import: `exportRoutes`, `importRoutes` |
| 2571–2604 | Settings & inertia: `toggleSettings`, `updateSensitivity`, `startInertia` |
| 2604–2782 | Custom hotspot CRUD: `toggleHotspotEditMode`, `canvasClickToYawPitch`, `openAddHotspotModal`, `confirmAddHotspot`, `deleteHotspot`, `openManageHotspotsModal`, `buildHotspotManageList`, `openEditHotspotModal`, `startRepositionHotspot`, `showHotspotInfo` |
| 2782–2870 | WebGL init: `initWebGL` (shaders, texture setup, fallback) |
| 2870–2904 | App init: `showLoader`, `hideLoader`, `init` |

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
    connections: [], // array of node IDs for explicit (non-linear) nav links — cross-floor allowed
    hotspots: [{ id, type: 'info'|'link', yaw, pitch, label, content }]
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
| `resizeCanvas()` | Sync canvas pixel dimensions to layout size |
| `saveRoutes()` | Serialize routes[] → IndexedDB |
| `loadRoutes()` | Deserialize IndexedDB → routes[] (reconstructs Images) |
| `exportRoutes()` | Download routes as JSON file with base64 images |
| `importRoutes(file)` | Read JSON, reconstruct Images, append to routes[] |
| `buildSidebar()` | Rebuild node list in left panel (includes drag-reorder handles) |
| `reorderNode(from, to)` | Splice nodes[], reassign IDs, remap connections[], update currentNodeIdx |
| `rebuildRouteSelect()` | Rebuild route dropdown in header |
| `openModal(id)` / `closeModal(id)` | Show/hide modals by adding/removing `.open` class |
| `openRenameModal(nodeIdx)` | Open "Edit Node" modal (name, desc, panorama change/remove) |
| `removeNodeImage()` | Clear node.image + node.thumbUrl; shows no-panorama overlay |
| `confirmRenameNode()` | Save name/desc edits from Edit Node modal |
| `deleteNode(nodeIdx)` | Remove node, reassign IDs, update connections on other nodes |
| `getThumbnail(node)` | Lazy-generate 96×60 center-crop thumbnail; cached as `node.thumbUrl` |
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
| `duplicateRoute()` | Copy route with new ID; shares Image/thumbUrl object references; copies floors[] |
| `showLoader(msg)` / `hideLoader()` | Show/hide full-screen loading overlay |
| `init()` | App entry point: openDB → loadRoutes → loadDemo (if empty) |

---

## State Variables (JS globals)

```js
// Core data
routes[]                // all route data
currentRouteIdx         // index into routes[]
currentNodeIdx          // index into currentRoute().nodes

// Viewer state
yaw, pitch, fov         // viewer orientation (radians / degrees)
img                     // current panorama Image object (null if none)
isDragging              // true while mouse/touch dragging
lastX, lastY            // last drag position for delta calculation
mouseDownX, mouseDownY  // drag start (used to distinguish click vs drag)
renderPending           // true if a rAF render is already queued
isFading, fadeTimeout   // crossfade animation state

// Node editing
pendingNodeImage        // Image staged in Add Node modal (null after confirm)
renameTargetIdx         // node index being edited in Edit Node modal

// Map editor
mapTool                 // 'place' | 'move' | 'connect'
mapSelectedNodeIdx      // selected node in editor (-1 = none)
mapDraggingNodeIdx      // node being dragged in editor (-1 = none)
mapConnectFirstNodeIdx  // first node clicked in connect tool (-1 = none)
mapDragOffX, mapDragOffY // drag offset within node circle
mapCurrentFloorId       // string ID of floor being viewed/edited (null = none)
mapEditorOpen           // true when map editor overlay is visible
mapUndoStack            // array of position/connection snapshots (capped at 50)
mapRedoStack            // array of redoable snapshots

// Hotspot editing
hotspotEditMode         // true when placing a new hotspot (crosshair cursor)
pendingHotspotYaw/Pitch // coords captured on canvas click for new hotspot
editingHotspotId        // null = new hotspot; string = editing existing
repositioningHotspotId  // null = normal; string = reposition click in progress

// Settings & inertia
sensitivityLevel        // 1–10 (default 3); scales drag → yaw/pitch delta
inertiaEnabled          // boolean toggle
velX, velY              // current inertia velocity (rad/frame)
inertiaId               // rAF handle for inertia loop
settingsOpen            // true when settings panel is visible

// Pinch-to-zoom (touch)
pinchStartDist          // pixel distance between fingers at pinch start
pinchStartFov           // fov value at pinch start

// WebGL
gl, ctx                 // WebGL context (preferred) / 2D fallback context
useWebGL                // true if WebGL initialized successfully
glProgram, glTexture    // compiled shader program and texture handle
glYawLoc, glPitchLoc, glFovLoc, glResLoc  // uniform locations

// Other
db                      // IndexedDB handle
sidebarOpen             // true when sidebar is expanded
```

---

## UI Structure

```
header
  .header-left    — logo, sidebar toggle (#sidebarToggle), route selector (#routeSelect), New Route button
  .header-right   — Add Node, Add Hotspot (#btnAddHotspot), Settings gear, SAVED indicator (#savedIndicator)

.main
  .sidebar (#sidebar)   — collapsible; node list (#locationList) + upload buttons + #nodeCount
  .viewer-wrap (#viewerWrap)
    #panoramaCanvas       — main render target (WebGL or 2D)
    #fadeCanvas           — crossfade overlay (reads WebGL frame via preserveDrawingBuffer)
    #noPanoramaMsg        — shown when current node has no panorama image
    #hotspots             — container for nav arrow + custom hotspot DOM elements
    #minimapCanvas        — 2D position map (bottom-right, inside .minimap#minimapWidget)
    #hotspotInfoPopup     — floating info panel for info-type hotspots
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
- **`connections[]` is additive** — linear prev/next arrows always show; explicit connections add extras. They are NOT mutually exclusive.
- **Node IDs reassign on reorder/delete** — connections[] on other nodes are remapped by `reorderNode()` and `deleteNode()`. Hotspot `content` field (link type) references node IDs and may need manual fix after reorder (known limitation).
- **WebGL crossfade** — requires `preserveDrawingBuffer: true` so `fadeCtx.drawImage(canvas)` can read the last WebGL frame.
- **Non-POT textures** — WebGL 1 requires `CLAMP_TO_EDGE` for non-power-of-2 textures.
- **Touch tap detection** — `mouseDownX/Y` must be set in both `mousedown` and `touchstart` handlers or tap detection breaks on mobile.
- **`image` can be null** — nodes may have no panorama. Always guard with `if (node.image)` before accessing `.src` or `.naturalWidth`.
- **`floorId` can be null** — unassigned nodes show on all floor tabs in the editor and on all floor views in the minimap. Always use `node.floorId || null` when reading.
- **Undo stack covers only map positions/connections** — does NOT undo node add/delete. Stacks reset when the map editor opens or closes.
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

## Roadmap (as of 2026-03-26)

1. Quiz / assessment mode — attach questions to hotspots or route end; score displayed
2. Training session log — record which nodes were visited, timestamps, quiz scores
3. Custom hotspot icons — choose icon/color per hotspot instead of default pin
4. Hotspot links to external URLs — open browser tab from a link-type hotspot
5. ~~Undo / redo in map editor~~ ✓ Done
6. Kiosk / presentation mode — full-screen, hide all editing UI, auto-advance option
7. ~~Multi-floor support~~ ✓ Done
8. Export Viewer Package — generate a self-contained viewer-only `viewer.html` with all editing UI stripped, route data baked in, for distribution to end users
