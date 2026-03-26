# FacilityView — CLAUDE.md

## Project Overview
FacilityView is a single-file HTML/CSS/JS virtual tour simulator for facility worker training. Users upload equirectangular panorama images, link them into named routes, and navigate between them in a Google Street View-style viewer.

**The entire app lives in one file:** `virtual-tour.html` (~2,450 lines)

---

## File Layout (approximate — update when sections shift significantly)

| Lines | Content |
|---|---|
| 1–302 | `<head>`: CSS styles |
| 303–551 | HTML: header, sidebar, viewer, map editor overlay |
| 552–708 | HTML: modals (add route, add node, edit node, hotspots, manage hotspots) |
| 661–708 | `<script>` open + all JS global state declarations |
| 722–740 | Helper functions: `currentRoute()`, `currentNodes()` |
| 741–815 | Route management: `openNewRouteModal`, `confirmNewRoute`, `duplicateRoute`, `rebuildRouteSelect`, `selectRoute` |
| 816–960 | Node management: `triggerAddNode`, `confirmAddNode`, `openRenameModal`, `removeNodeImage`, `confirmRenameNode`, `deleteNode`, `getThumbnail`, `buildSidebar`, `reorderNode` |
| 1039–1115 | Navigation: `navigateTo`, `navigatePrev/Next`, `updateHeaders`, `updateRouteProgress` |
| 1111–1200 | Canvas/rendering utils: `resizeCanvas`, `clearViewer`, `renderFrame`, `scheduleRender`, `updateHUD` |
| 1203–1310 | Hotspot DOM: `buildHotspots`, `updateHotspotPositions` |
| 1303–1430 | Minimap: `toggleMinimapMinimize`, `drawMinimap` |
| 1430–1755 | Map editor: `openMapEditor`, `closeMapEditor`, `setTool`, `buildEditorNodeList`, `drawMapEditor`, mouse/click handlers |
| 1755–1890 | Floorplan upload: `clearFloorplan` |
| 1889–1903 | View controls: `adjustFov`, `resetView`, `toggleFullscreen`, `openModal`, `closeModal` |
| 1913–1975 | Demo panoramas: `makeSyntheticPanorama`, `loadDemo` |
| 1976–2043 | IndexedDB: `openDB`, `saveRoutes`, `loadRoutes`, `flashSavedIndicator` |
| 2044–2117 | Export/Import: `exportRoutes`, `importRoutes` |
| 2118–2150 | Settings & inertia: `toggleSettings`, `updateSensitivity`, `startInertia` |
| 2151–2330 | Custom hotspot CRUD: `toggleHotspotEditMode`, `canvasClickToYawPitch`, `openAddHotspotModal`, `confirmAddHotspot`, `deleteHotspot`, `openManageHotspotsModal`, `buildHotspotManageList`, `openEditHotspotModal`, `startRepositionHotspot`, `showHotspotInfo` |
| 2329–2428 | WebGL init: `initWebGL` (shaders, texture setup, fallback) |
| 2428–2453 | App init: `showLoader`, `hideLoader`, `init` |

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
- **Bearing formula** (current→target): `Math.atan2(target.mapX - current.mapX, target.mapY - current.mapY)`

### Data Model
```js
routes[] = [{
  id, name, desc,
  floorplan: Image | null,
  nodes: [{
    id,              // e.g. "N01" — reassigned after reorder/delete
    name, desc,
    image: Image | null,  // panorama; null = not yet assigned
    thumbUrl,        // lazy-generated 96×60 thumbnail data URL (null if no image)
    mapX, mapY,      // 2D map position (null if unplaced)
    connections: [], // array of node IDs for explicit (non-linear) nav links
    hotspots: [{ id, type: 'info'|'link', yaw, pitch, label, content }]
  }]
}]
```
- `connections[]` — set via Map Editor "Connect" tool. `buildHotspots()` always shows linear prev/next AND adds connection arrows for any target not already covered.
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
| `drawMinimap()` | Render 2D position map; `toMM(nx,ny)` maps coords to canvas px |
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
| `drawMapEditor()` | Render full-screen map editor canvas |
| `buildEditorNodeList()` | Rebuild node list panel inside map editor |
| `setTool(tool)` | Switch map editor tool: `'place'` \| `'move'` \| `'connect'` |
| `duplicateRoute()` | Copy route with new ID; shares Image/thumbUrl object references |
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
floorplanImg            // optional background Image for map editor
mapEditorOpen           // true when map editor overlay is visible

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

## Roadmap (as of 2026-03-26)

1. Quiz / assessment mode — attach questions to hotspots or route end; score displayed
2. Training session log — record which nodes were visited, timestamps, quiz scores
3. Custom hotspot icons — choose icon/color per hotspot instead of default pin
4. Hotspot links to external URLs — open browser tab from a link-type hotspot
5. Undo / redo in map editor — Ctrl+Z / Ctrl+Y for node placement and connection changes
6. Kiosk / presentation mode — full-screen, hide all editing UI, auto-advance option
7. Multi-floor support — stack multiple floorplans per route with floor-switcher UI
8. Export Viewer Package — generate a self-contained viewer-only `viewer.html` with all editing UI stripped, route data baked in, for distribution to end users
