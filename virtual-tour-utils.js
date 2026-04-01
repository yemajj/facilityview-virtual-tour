/**
 * virtual-tour-utils.js
 *
 * Pure utility functions extracted from virtual-tour.html for testability.
 * These functions contain no side effects (no DOM, no IndexedDB, no canvas).
 * The main HTML file uses these same algorithms inline; this module exposes
 * them as ES module exports so the test suite can import and verify them.
 */

// ──────────────────────────────────────────────────────────────────────────────
// SERIALIZATION
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Serialize a routes array to a plain object suitable for JSON export.
 * Equivalent to the body of serializeRoutesForExport() in the app,
 * but parameterized instead of reading the global `routes`.
 *
 * @param {Array} routes
 * @returns {{ version: number, exported: string, routes: Array }}
 */
export function serializeRoutes(routes) {
  return {
    version: 1,
    exported: new Date().toISOString(),
    routes: routes.map(r => ({
      id: r.id, name: r.name, desc: r.desc,
      floors: (r.floors || []).map(f => ({
        id: f.id, name: f.name,
        imageSrc: f.image ? f.image.src : null
      })),
      nodes: r.nodes.map(n => ({
        id: n.id, name: n.name, desc: n.desc,
        imageSrc: n.image ? n.image.src : null,
        mapX: n.mapX, mapY: n.mapY,
        floorId: n.floorId || null,
        connections: n.connections || [],
        hotspots: n.hotspots || [],
        navArrowColor: n.navArrowColor || null,
        quiz: n.quiz || null,
        thumbUrl: null  // always omitted — regenerated on demand
      }))
    }))
  };
}

/**
 * Migrate a nodes array in place: if ALL nodes have empty connections[],
 * auto-populate sequential bidirectional links.
 * This matches the pre-v2 save migration in loadRoutes().
 *
 * @param {Array} nodes - array of node objects (mutated in place)
 * @returns {Array} the same nodes array
 */
export function migrateConnections(nodes) {
  const allEmpty = nodes.every(n => !n.connections || n.connections.length === 0);
  if (allEmpty && nodes.length > 1) {
    for (let i = 0; i < nodes.length - 1; i++) {
      nodes[i].connections = nodes[i].connections || [];
      nodes[i + 1].connections = nodes[i + 1].connections || [];
      nodes[i].connections.push(nodes[i + 1].id);
      nodes[i + 1].connections.push(nodes[i].id);
    }
  }
  return nodes;
}

// ──────────────────────────────────────────────────────────────────────────────
// NODE MANAGEMENT
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Reorder a node: move fromIdx → toIdx, reassign all sequential IDs,
 * and remap connection references on every node.
 *
 * Returns a new array (the original element order is changed, but the node
 * objects themselves are mutated: .id and .connections are updated).
 *
 * @param {Array}  nodes         - array of node objects
 * @param {number} fromIdx       - source position
 * @param {number} toIdx         - destination position
 * @param {number} activeNodeIdx - index of the currently-viewed node (-1 = none)
 * @returns {{ nodes: Array, activeNodeNewIdx: number }}
 */
export function reorderNodePure(nodes, fromIdx, toIdx, activeNodeIdx = -1) {
  const arr = [...nodes];
  const activeNode = activeNodeIdx >= 0 ? arr[activeNodeIdx] : null;

  // Move the node
  const [moved] = arr.splice(fromIdx, 1);
  arr.splice(toIdx, 0, moved);

  // Build old-ID → new-ID map before mutating
  const idMap = {};
  arr.forEach((n, i) => {
    idMap[n.id] = 'N' + String(i + 1).padStart(2, '0');
  });

  // Assign new IDs
  arr.forEach(n => { n.id = idMap[n.id]; });

  // Remap connection references on every node
  arr.forEach(n => {
    if (n.connections) {
      n.connections = n.connections.map(cid => idMap[cid] || cid);
    }
  });

  const newActiveIdx = activeNode ? arr.indexOf(activeNode) : -1;
  return { nodes: arr, activeNodeNewIdx: newActiveIdx };
}

/**
 * Delete the node at nodeIdx from the array, then reassign sequential IDs.
 *
 * NOTE: This matches the current deleteNode() behavior in the app — it does
 * NOT remove back-references from connected nodes. Connection arrays on
 * remaining nodes may contain stale or redirected IDs after deletion.
 *
 * @param {Array}  nodes    - array of node objects (mutated in place)
 * @param {number} nodeIdx  - index of node to remove
 * @returns {Array} the same nodes array
 */
export function deleteNodePure(nodes, nodeIdx) {
  nodes.splice(nodeIdx, 1);
  nodes.forEach((n, i) => { n.id = 'N' + String(i + 1).padStart(2, '0'); });
  return nodes;
}

// ──────────────────────────────────────────────────────────────────────────────
// CONNECTION GRAPH
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Add a bidirectional connection between nodes[nodeAIdx] and nodes[nodeBIdx].
 * No-op if already connected, indices are equal, or indices are out of range.
 *
 * @param {Array}  nodes
 * @param {number} nodeAIdx
 * @param {number} nodeBIdx
 */
export function addConnection(nodes, nodeAIdx, nodeBIdx) {
  const a = nodes[nodeAIdx];
  const b = nodes[nodeBIdx];
  if (!a || !b || a === b) return;
  a.connections = a.connections || [];
  b.connections = b.connections || [];
  if (!a.connections.includes(b.id)) a.connections.push(b.id);
  if (!b.connections.includes(a.id)) b.connections.push(a.id);
}

/**
 * Remove the bidirectional connection between nodes[nodeIdx] and the node
 * whose id === targetId. No-op if connection does not exist.
 *
 * @param {Array}  nodes
 * @param {number} nodeIdx
 * @param {string} targetId
 */
export function removeConnection(nodes, nodeIdx, targetId) {
  const node = nodes[nodeIdx];
  if (!node) return;
  const target = nodes.find(n => n.id === targetId);
  node.connections = (node.connections || []).filter(id => id !== targetId);
  if (target) {
    target.connections = (target.connections || []).filter(id => id !== node.id);
  }
}

/**
 * Remove ALL connections from nodes[nodeIdx], cleaning up back-references
 * on every previously-connected node.
 *
 * @param {Array}  nodes
 * @param {number} nodeIdx
 */
export function removeAllConnections(nodes, nodeIdx) {
  const node = nodes[nodeIdx];
  if (!node) return;
  (node.connections || []).forEach(cid => {
    const t = nodes.find(n => n.id === cid);
    if (t) t.connections = (t.connections || []).filter(id => id !== node.id);
  });
  node.connections = [];
}

// ──────────────────────────────────────────────────────────────────────────────
// QUIZ LOGIC
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Decide what to show when arriving at a node index.
 * Mirrors the decision tree in checkNodeQuiz() without the setTimeout/DOM side effects.
 *
 * @param {Array}   nodes
 * @param {number}  index
 * @param {Object}  quizAnswered      - map of nodeId → answer record
 * @param {boolean} quizResultsShown  - true if score modal was already auto-shown
 * @returns {'show_quiz' | 'show_score' | 'nothing'}
 */
export function checkNodeQuizDecision(nodes, index, quizAnswered, quizResultsShown) {
  const node = nodes[index];
  const isLast = index === nodes.length - 1;
  const hasAnswers = Object.keys(quizAnswered).length > 0;

  if (!node || !node.quiz) {
    if (isLast && hasAnswers && !quizResultsShown) return 'show_score';
    return 'nothing';
  }

  if (quizAnswered[node.id]) {
    if (isLast && !quizResultsShown) return 'show_score';
    return 'nothing';
  }

  return 'show_quiz';
}

/**
 * Calculate quiz score from nodes and the current quizAnswered session state.
 *
 * @param {Array}  nodes
 * @param {Object} quizAnswered - map of nodeId → { correct: boolean, ... }
 * @returns {{ correct: number, total: number, pct: number }}
 */
export function calcQuizScore(nodes, quizAnswered) {
  const quizNodes = nodes.filter(n => n.quiz);
  const total = quizNodes.length;
  const correct = Object.values(quizAnswered).filter(a => a.correct).length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { correct, total, pct };
}

// ──────────────────────────────────────────────────────────────────────────────
// COORDINATE MATH
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Convert a canvas pixel position to yaw/pitch viewer coordinates.
 * Mirrors canvasClickToYawPitch() in the app but takes all inputs as parameters.
 *
 * @param {number} px     - pixel x from left of canvas display area
 * @param {number} py     - pixel y from top of canvas display area
 * @param {number} W      - canvas display width (pixels)
 * @param {number} H      - canvas display height (pixels)
 * @param {number} yaw    - current viewer yaw (radians)
 * @param {number} pitch  - current viewer pitch (radians)
 * @param {number} fovDeg - horizontal field of view (degrees)
 * @returns {{ yaw: number, pitch: number }}
 */
export function canvasClickToYawPitch(px, py, W, H, yaw, pitch, fovDeg) {
  const halfFovH = (fovDeg * Math.PI / 180) / 2;
  const halfFovV = halfFovH / (W / H);
  return {
    yaw: yaw + (px / W - 0.5) * 2 * halfFovH,
    pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2,
      pitch - (py / H - 0.5) * 2 * halfFovV
    ))
  };
}

/**
 * Compute the arrival bearing (yaw in radians) when traveling from one map
 * node to another. Mirrors the bearing formula in navigateTo().
 *
 * Coordinate system: mapX increases east, mapY increases south (Y-down canvas).
 * Yaw 0 = north, increases clockwise.
 *
 * @param {{ mapX: number|null, mapY: number|null }} fromNode
 * @param {{ mapX: number|null, mapY: number|null }} toNode
 * @returns {number|null} yaw in radians, or null if either node is unplaced
 */
export function arrivalBearing(fromNode, toNode) {
  if (fromNode.mapX === null || fromNode.mapX === undefined) return null;
  if (toNode.mapX === null || toNode.mapX === undefined) return null;
  return Math.atan2(toNode.mapX - fromNode.mapX, -(toNode.mapY - fromNode.mapY));
}

// ──────────────────────────────────────────────────────────────────────────────
// UNDO / REDO STACK
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Create a snapshot of node positions and connections for undo/redo.
 * Returns a plain object (deep-copied positions/connections, matched by node ID).
 */
export function mapSnapshot(nodes) {
  return nodes.map(n => ({ id: n.id, mapX: n.mapX, mapY: n.mapY, connections: [...(n.connections || [])] }));
}

/**
 * Apply a snapshot back onto nodes (matched by node ID, not index).
 * Mutates node.mapX, node.mapY, and node.connections in place.
 */
export function applySnapshot(nodes, snapshot) {
  const byId = {};
  for (const s of snapshot) byId[s.id] = s;
  for (const n of nodes) {
    const s = byId[n.id];
    if (!s) continue;
    n.mapX = s.mapX;
    n.mapY = s.mapY;
    n.connections = [...s.connections];
  }
}

/**
 * Push a snapshot onto the undo stack (capped at maxSize).
 * Clears the redo stack (as any new action invalidates redo history).
 * Returns new { undoStack, redoStack }.
 */
export function pushUndo(undoStack, redoStack, snapshot, maxSize = 50) {
  const newUndo = [...undoStack, snapshot];
  if (newUndo.length > maxSize) newUndo.shift();
  return { undoStack: newUndo, redoStack: [] };
}

/**
 * Perform an undo: pop from undoStack, push currentSnapshot to redoStack.
 * Returns { undoStack, redoStack, snapshot } where snapshot is what to apply,
 * or null if the undo stack is empty.
 */
export function applyUndo(undoStack, redoStack, currentSnapshot) {
  if (undoStack.length === 0) return null;
  const newUndo = [...undoStack];
  const snapshot = newUndo.pop();
  return { undoStack: newUndo, redoStack: [...redoStack, currentSnapshot], snapshot };
}

/**
 * Perform a redo: pop from redoStack, push currentSnapshot to undoStack.
 * Returns { undoStack, redoStack, snapshot } where snapshot is what to apply,
 * or null if the redo stack is empty.
 */
export function applyRedo(undoStack, redoStack, currentSnapshot) {
  if (redoStack.length === 0) return null;
  const newRedo = [...redoStack];
  const snapshot = newRedo.pop();
  return { undoStack: [...undoStack, currentSnapshot], redoStack: newRedo, snapshot };
}

// ──────────────────────────────────────────────────────────────────────────────
// FLOOR MANAGEMENT
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Add a new floor to the route and return it.
 * Generates a unique floor ID using Date.now() — for testing, an idGen function can be injected.
 */
export function addFloorPure(route, name, idGen = () => 'F' + Date.now()) {
  const floor = { id: idGen(), name, image: null };
  route.floors.push(floor);
  return floor;
}

/**
 * Delete a floor from the route. Guards against deleting the last floor.
 * Unassigns (sets floorId = null) any nodes that were on this floor.
 * Returns true if deleted, false if guarded (last floor).
 */
export function deleteFloorPure(route, floorId) {
  if (route.floors.length <= 1) return false;
  route.floors = route.floors.filter(f => f.id !== floorId);
  for (const n of route.nodes) {
    if (n.floorId === floorId) n.floorId = null;
  }
  return true;
}

/**
 * Assign a node to a floor. Pass null to unassign.
 */
export function assignNodeFloorPure(node, floorId) {
  node.floorId = floorId;
}

// ──────────────────────────────────────────────────────────────────────────────
// ROUTE MANAGEMENT
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Duplicate a route: creates a deep copy with a new ID and appended name.
 * Image and thumbUrl objects are shared by reference (not cloned) — same as the app.
 * idGen can be injected for testing.
 */
export function duplicateRoutePure(route, idGen = () => 'R' + Date.now()) {
  const newRoute = JSON.parse(JSON.stringify(route, (key, val) => {
    // JSON.stringify can't handle Image objects — they serialize as {}
    // We handle imageSrc separately after
    if (key === 'image' || key === 'thumbUrl') return null;
    return val;
  }));
  newRoute.id = idGen();
  newRoute.name = route.name + ' (copy)';

  // Re-share image and thumbUrl references from original nodes
  newRoute.nodes.forEach((n, i) => {
    n.image = route.nodes[i].image;
    n.thumbUrl = route.nodes[i].thumbUrl;
  });
  // Re-share floor image references
  newRoute.floors.forEach((f, i) => {
    f.image = route.floors[i].image;
  });

  return newRoute;
}
