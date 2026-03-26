# FacilityView — CLAUDE.md

## Project Overview
FacilityView is a single-file HTML/CSS/JS virtual tour simulator for facility worker training. Users upload equirectangular panorama images, link them into named routes, and navigate between them in a Google Street View-style viewer.

**The entire app lives in one file:** `virtual-tour.html`

---

## Architecture

### Rendering
- Panoramas are rendered **pixel-by-pixel on an HTML5 Canvas** (`#panoramaCanvas`) using an equirectangular projection — no WebGL, no libraries.
- A second overlay canvas (`#fadeCanvas`) handles **crossfade transitions** between nodes.
- Rendering is triggered by `scheduleRender()` → `renderFrame()`.

### Coordinate System
- **Yaw**: radians, `0 = north/forward`. Increases clockwise (drag right = yaw increases).
- **Pitch**: radians, `0 = horizon`, clamped to `±Math.PI/2.2`.
- **FOV**: degrees, default 75.
- **Minimap**: north = up. Y-axis flipped: larger stored `mapY` = further north on screen.
- **Bearing formula** (current→target): `Math.atan2(target.mapX - current.mapX, target.mapY - current.mapY)`

### Data Model
```js
routes[] = [{
  id, name, desc,
  floorplan: Image | null,
  nodes: [{
    id,           // e.g. "N01"
    name, desc,
    image: Image, // panorama
    mapX, mapY,   // 2D map position (null if unplaced)
    hotspots: [{ id, type: 'info'|'link', yaw, pitch, label, content }]
  }]
}]
```

### Persistence
- **IndexedDB** (`facilityview_db`, store: `tours`, key: `'main'`).
- Images stored as data URLs (too large for localStorage).
- `saveRoutes()` must be called after every mutation.
- `loadRoutes()` reconstructs `Image` objects via `Promise.all`.

---

## Key Functions

| Function | Purpose |
|---|---|
| `renderFrame()` | Draw current panorama to canvas |
| `navigateTo(index)` | Switch nodes — handles crossfade + arrival yaw |
| `buildHotspots(index)` | Create nav + custom hotspot DOM elements |
| `updateHotspotPositions()` | Reposition hotspot overlays each frame |
| `drawMinimap()` | Render 2D position map with north-up orientation |
| `resizeCanvas()` | Sync canvas pixel dimensions to layout size |
| `saveRoutes()` | Serialize routes[] → IndexedDB |
| `loadRoutes()` | Deserialize IndexedDB → routes[] |
| `startInertia()` | rAF loop that decays velX/velY at 0.88/frame |
| `buildSidebar()` | Rebuild node list in left panel |
| `rebuildRouteSelect()` | Rebuild route dropdown in header |
| `openModal(id)` / `closeModal(id)` | Show/hide modals |
| `toggleHotspotEditMode()` | Toggle crosshair cursor for hotspot placement |
| `canvasClickToYawPitch(x, y)` | Convert canvas click → yaw/pitch coords |

---

## State Variables (JS globals)
```js
routes[]            // all route data
currentRouteIdx     // index into routes[]
currentNodeIdx      // index into currentRoute().nodes
yaw, pitch, fov     // viewer orientation
img                 // current panorama Image object
db                  // IndexedDB handle
isFading            // true during crossfade transition
hotspotEditMode     // true when placing a new hotspot
sensitivityLevel    // 1–10, default 3
inertiaEnabled      // boolean
velX, velY          // inertia velocity (rad/frame)
```

---

## UI Structure
```
header
  .header-left    — logo, sidebar toggle, route selector, New Route button
  .header-right   — Add Node, Add Hotspot, Settings gear, SAVED indicator

.main
  .sidebar        — collapsible node list + upload buttons
  .viewer-wrap
    #panoramaCanvas   — main render target
    #fadeCanvas       — crossfade overlay
    #minimapCanvas    — 2D position map (bottom-right)
    .hotspot          — nav arrows (DOM, positioned by updateHotspotPositions)
    .hotspot-custom   — info/link pins (DOM, positioned by updateHotspotPositions)
    #hotspotInfoPopup — floating info panel
    .compass          — yaw indicator (top-right)
    #settingsPanel    — gear menu (sensitivity slider, inertia toggle)
  #mapEditorWrap  — full-screen map editor overlay
```

---

## Adding a New Feature — Checklist
1. If the feature mutates route/node data → call `saveRoutes()` at the end.
2. If adding a new node field → also add it to `loadRoutes()` reconstruction and `saveRoutes()` serialization.
3. If adding a new hotspot element type → extend `updateHotspotPositions()` to handle its `data-pitch`.
4. If changing canvas layout → update `resizeCanvas()`.
5. Test: open in Opera GX via `/c/Users/jamey/AppData/Local/Programs/Opera\ GX/opera.exe virtual-tour.html`.

---

## Git & GitHub
- Remote: `https://github.com/yemajj/facilityview-virtual-tour`
- Branch: `main`
- **Commit and push after every logical change** — don't batch multiple features into one commit.
- Commit as soon as a feature or fix is working, before moving on to the next task.
- Use clean, descriptive commit messages that explain *what* changed and *why* (e.g. `"Fix hotspot bearing calculation to use real map coordinates"` not `"update code"`).
- Never leave working changes uncommitted at the end of a session.

---

## Roadmap (as of 2026-03-25)
1. Export / Import routes as JSON files ← **next priority**
2. Hotspot management panel (edit/reposition existing hotspots)
3. Loading indicator for large panoramas
4. Branching routes / non-linear navigation
5. Thumbnail previews in sidebar
6. Mobile pinch-to-zoom / swipe support
7. WebGL renderer (major performance upgrade)
8. Route duplication
9. Electron/Tauri desktop packaging
