import { describe, it, expect } from 'vitest';
import { mapSnapshot, applySnapshot, pushUndo, applyUndo, applyRedo } from '../virtual-tour-utils.js';

function makeNodes(specs) {
  return specs.map((s, i) => ({
    id: 'N' + String(i + 1).padStart(2, '0'),
    mapX: s.mapX !== undefined ? s.mapX : i * 10,
    mapY: s.mapY !== undefined ? s.mapY : i * 10,
    connections: s.connections ? [...s.connections] : []
  }));
}

// ── mapSnapshot ───────────────────────────────────────────────────────────────

describe('mapSnapshot', () => {
  it('captures node id, mapX, mapY, connections', () => {
    const nodes = makeNodes([{ mapX: 10, mapY: 20, connections: ['N02'] }]);
    const snap = mapSnapshot(nodes);
    expect(snap).toHaveLength(1);
    expect(snap[0].id).toBe('N01');
    expect(snap[0].mapX).toBe(10);
    expect(snap[0].mapY).toBe(20);
    expect(snap[0].connections).toEqual(['N02']);
  });

  it('connections array is a copy, not a reference', () => {
    const nodes = makeNodes([{ connections: ['N02'] }]);
    const snap = mapSnapshot(nodes);
    snap[0].connections.push('N03');
    // Original node's connections should be unaffected
    expect(nodes[0].connections).toEqual(['N02']);
  });

  it('nodes with null mapX/mapY are captured as null', () => {
    const nodes = [{ id: 'N01', mapX: null, mapY: null, connections: [] }];
    const snap = mapSnapshot(nodes);
    expect(snap[0].mapX).toBeNull();
    expect(snap[0].mapY).toBeNull();
  });
});

// ── applySnapshot ─────────────────────────────────────────────────────────────

describe('applySnapshot', () => {
  it('restores mapX, mapY from snapshot matched by id', () => {
    const nodes = makeNodes([{ mapX: 0, mapY: 0 }, { mapX: 0, mapY: 0 }]);
    const snap = [
      { id: 'N01', mapX: 100, mapY: 200, connections: [] },
      { id: 'N02', mapX: 300, mapY: 400, connections: [] }
    ];
    applySnapshot(nodes, snap);
    expect(nodes[0].mapX).toBe(100);
    expect(nodes[0].mapY).toBe(200);
    expect(nodes[1].mapX).toBe(300);
    expect(nodes[1].mapY).toBe(400);
  });

  it('restores connections from snapshot', () => {
    const nodes = makeNodes([{ connections: [] }, { connections: [] }]);
    const snap = [
      { id: 'N01', mapX: 0, mapY: 0, connections: ['N02'] },
      { id: 'N02', mapX: 0, mapY: 0, connections: ['N01'] }
    ];
    applySnapshot(nodes, snap);
    expect(nodes[0].connections).toEqual(['N02']);
    expect(nodes[1].connections).toEqual(['N01']);
  });

  it('nodes not in snapshot are unaffected', () => {
    const nodes = makeNodes([
      { mapX: 5, mapY: 5, connections: ['N02'] },
      { mapX: 15, mapY: 15, connections: ['N01'] }
    ]);
    // Snapshot only contains N01
    const snap = [{ id: 'N01', mapX: 99, mapY: 99, connections: [] }];
    applySnapshot(nodes, snap);
    expect(nodes[0].mapX).toBe(99);
    // N02 is untouched
    expect(nodes[1].mapX).toBe(15);
    expect(nodes[1].mapY).toBe(15);
    expect(nodes[1].connections).toEqual(['N01']);
  });

  it('connections array on node is a copy not the snapshot reference', () => {
    const nodes = makeNodes([{ connections: [] }, { connections: [] }]);
    const snap = [
      { id: 'N01', mapX: 0, mapY: 0, connections: ['N02'] },
      { id: 'N02', mapX: 0, mapY: 0, connections: ['N01'] }
    ];
    applySnapshot(nodes, snap);
    // Mutate the snapshot entry after apply
    snap[0].connections.push('N03');
    // Node's connections should be unaffected
    expect(nodes[0].connections).toEqual(['N02']);
  });

  it('filters out stale connection IDs not present in current nodes', () => {
    // Snapshot references N03, but current nodes only have N01 and N02
    const nodes = makeNodes([
      { mapX: 0, mapY: 0, connections: [] },
      { mapX: 0, mapY: 0, connections: [] }
    ]);
    const snap = [
      { id: 'N01', mapX: 10, mapY: 10, connections: ['N02', 'N03'] },
      { id: 'N02', mapX: 20, mapY: 20, connections: ['N01', 'N03'] }
    ];
    applySnapshot(nodes, snap);
    expect(nodes[0].connections).toEqual(['N02']);
    expect(nodes[1].connections).toEqual(['N01']);
  });

  it('preserves all connections when all referenced IDs exist', () => {
    const nodes = makeNodes([
      { mapX: 0, mapY: 0, connections: [] },
      { mapX: 0, mapY: 0, connections: [] },
      { mapX: 0, mapY: 0, connections: [] }
    ]);
    const snap = [
      { id: 'N01', mapX: 5, mapY: 5, connections: ['N02', 'N03'] },
      { id: 'N02', mapX: 15, mapY: 15, connections: ['N01'] },
      { id: 'N03', mapX: 25, mapY: 25, connections: ['N01'] }
    ];
    applySnapshot(nodes, snap);
    expect(nodes[0].connections).toEqual(['N02', 'N03']);
    expect(nodes[1].connections).toEqual(['N01']);
    expect(nodes[2].connections).toEqual(['N01']);
  });
});

// ── pushUndo ──────────────────────────────────────────────────────────────────

describe('pushUndo', () => {
  it('adds snapshot to undoStack', () => {
    const snap = [{ id: 'N01', mapX: 10, mapY: 10, connections: [] }];
    const { undoStack } = pushUndo([], [], snap);
    expect(undoStack).toHaveLength(1);
    expect(undoStack[0]).toBe(snap);
  });

  it('clears redoStack', () => {
    const existingRedo = [[{ id: 'N01', mapX: 5, mapY: 5, connections: [] }]];
    const snap = [{ id: 'N01', mapX: 10, mapY: 10, connections: [] }];
    const { redoStack } = pushUndo([], existingRedo, snap);
    expect(redoStack).toHaveLength(0);
  });

  it('caps stack at default maxSize of 50', () => {
    // Create a stack already at 50 entries
    const full = Array.from({ length: 50 }, (_, i) => [{ id: 'N01', mapX: i, mapY: 0, connections: [] }]);
    const newSnap = [{ id: 'N01', mapX: 99, mapY: 0, connections: [] }];
    const { undoStack } = pushUndo(full, [], newSnap);
    expect(undoStack).toHaveLength(50);
    // Oldest entry should have been dropped; newest should be at the end
    expect(undoStack[undoStack.length - 1]).toBe(newSnap);
  });

  it('caps stack at custom maxSize', () => {
    const existing = Array.from({ length: 5 }, (_, i) => [{ id: 'N01', mapX: i, mapY: 0, connections: [] }]);
    const newSnap = [{ id: 'N01', mapX: 99, mapY: 0, connections: [] }];
    const { undoStack } = pushUndo(existing, [], newSnap, 5);
    expect(undoStack).toHaveLength(5);
    expect(undoStack[undoStack.length - 1]).toBe(newSnap);
  });
});

// ── applyUndo ─────────────────────────────────────────────────────────────────

describe('applyUndo', () => {
  it('returns null when undoStack is empty', () => {
    const result = applyUndo([], [], []);
    expect(result).toBeNull();
  });

  it('pops last snapshot from undoStack as the restore target', () => {
    const snap1 = [{ id: 'N01', mapX: 1, mapY: 1, connections: [] }];
    const snap2 = [{ id: 'N01', mapX: 2, mapY: 2, connections: [] }];
    const result = applyUndo([snap1, snap2], [], []);
    expect(result.snapshot).toBe(snap2);
    expect(result.undoStack).toHaveLength(1);
    expect(result.undoStack[0]).toBe(snap1);
  });

  it('pushes currentSnapshot onto redoStack', () => {
    const snap = [{ id: 'N01', mapX: 10, mapY: 10, connections: [] }];
    const current = [{ id: 'N01', mapX: 50, mapY: 50, connections: [] }];
    const result = applyUndo([snap], [], current);
    expect(result.redoStack).toHaveLength(1);
    expect(result.redoStack[0]).toBe(current);
  });
});

// ── applyRedo ─────────────────────────────────────────────────────────────────

describe('applyRedo', () => {
  it('returns null when redoStack is empty', () => {
    const result = applyRedo([], [], []);
    expect(result).toBeNull();
  });

  it('pops last snapshot from redoStack as the restore target', () => {
    const snap1 = [{ id: 'N01', mapX: 1, mapY: 1, connections: [] }];
    const snap2 = [{ id: 'N01', mapX: 2, mapY: 2, connections: [] }];
    const result = applyRedo([], [snap1, snap2], []);
    expect(result.snapshot).toBe(snap2);
    expect(result.redoStack).toHaveLength(1);
    expect(result.redoStack[0]).toBe(snap1);
  });

  it('pushes currentSnapshot onto undoStack', () => {
    const snap = [{ id: 'N01', mapX: 10, mapY: 10, connections: [] }];
    const current = [{ id: 'N01', mapX: 50, mapY: 50, connections: [] }];
    const result = applyRedo([], [snap], current);
    expect(result.undoStack).toHaveLength(1);
    expect(result.undoStack[0]).toBe(current);
  });
});

// ── Round-trip ────────────────────────────────────────────────────────────────

describe('undo/redo round-trip', () => {
  it('undo then redo returns to original state', () => {
    const nodes = makeNodes([
      { mapX: 10, mapY: 20, connections: ['N02'] },
      { mapX: 30, mapY: 40, connections: ['N01'] }
    ]);

    // Capture state A
    const snapA = mapSnapshot(nodes);

    // Move a node (state B)
    nodes[0].mapX = 99;
    nodes[0].mapY = 99;
    const snapB = mapSnapshot(nodes);

    // Push state A onto undo stack before making the change
    const { undoStack: undoAfterPush, redoStack: redoAfterPush } = pushUndo([], [], snapA);

    // Perform undo: restore snapA, push snapB onto redo
    const undoResult = applyUndo(undoAfterPush, redoAfterPush, snapB);
    expect(undoResult).not.toBeNull();
    applySnapshot(nodes, undoResult.snapshot);
    expect(nodes[0].mapX).toBe(10);
    expect(nodes[0].mapY).toBe(20);

    // Perform redo: restore snapB, push snapA back onto undo
    const redoResult = applyRedo(undoResult.undoStack, undoResult.redoStack, undoResult.snapshot);
    expect(redoResult).not.toBeNull();
    applySnapshot(nodes, redoResult.snapshot);
    expect(nodes[0].mapX).toBe(99);
    expect(nodes[0].mapY).toBe(99);
  });
});
