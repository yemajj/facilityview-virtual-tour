import { describe, it, expect } from 'vitest';
import { addFloorPure, deleteFloorPure, assignNodeFloorPure } from '../virtual-tour-utils.js';

function makeRoute(overrides = {}) {
  return {
    id: 'R001',
    name: 'Test Route',
    desc: '',
    floors: [{ id: 'F0', name: 'Ground', image: null }],
    nodes: [],
    ...overrides
  };
}

function makeNode(overrides = {}) {
  return {
    id: 'N01',
    name: 'Test Node',
    floorId: null,
    connections: [],
    ...overrides
  };
}

// ── addFloorPure ──────────────────────────────────────────────────────────────

describe('addFloorPure', () => {
  it('adds a floor to route.floors', () => {
    const route = makeRoute();
    addFloorPure(route, 'Second Floor', () => 'F1');
    expect(route.floors).toHaveLength(2);
    expect(route.floors[1].name).toBe('Second Floor');
  });

  it('returned floor has the provided name and null image', () => {
    const route = makeRoute();
    const floor = addFloorPure(route, 'Basement', () => 'FB');
    expect(floor.name).toBe('Basement');
    expect(floor.image).toBeNull();
  });

  it('uses the provided idGen for the floor id', () => {
    const route = makeRoute();
    const floor = addFloorPure(route, 'Mezzanine', () => 'FMEZ');
    expect(floor.id).toBe('FMEZ');
    expect(route.floors[1].id).toBe('FMEZ');
  });

  it('floor id is unique per call when using a counter-based generator', () => {
    const route = makeRoute();
    let counter = 0;
    const idGen = () => 'F' + (++counter);
    const floorA = addFloorPure(route, 'Floor A', idGen);
    const floorB = addFloorPure(route, 'Floor B', idGen);
    expect(floorA.id).not.toBe(floorB.id);
  });
});

// ── deleteFloorPure ───────────────────────────────────────────────────────────

describe('deleteFloorPure', () => {
  it('removes the floor from route.floors', () => {
    const route = makeRoute({
      floors: [
        { id: 'F0', name: 'Ground', image: null },
        { id: 'F1', name: 'First', image: null }
      ]
    });
    deleteFloorPure(route, 'F1');
    expect(route.floors).toHaveLength(1);
    expect(route.floors[0].id).toBe('F0');
  });

  it('returns true when floor is deleted', () => {
    const route = makeRoute({
      floors: [
        { id: 'F0', name: 'Ground', image: null },
        { id: 'F1', name: 'First', image: null }
      ]
    });
    const result = deleteFloorPure(route, 'F1');
    expect(result).toBe(true);
  });

  it('returns false and does not delete when only one floor exists', () => {
    const route = makeRoute();
    const result = deleteFloorPure(route, 'F0');
    expect(result).toBe(false);
    expect(route.floors).toHaveLength(1);
  });

  it('unassigns nodes that were on the deleted floor (sets floorId to null)', () => {
    const route = makeRoute({
      floors: [
        { id: 'F0', name: 'Ground', image: null },
        { id: 'F1', name: 'First', image: null }
      ],
      nodes: [
        makeNode({ id: 'N01', floorId: 'F1' }),
        makeNode({ id: 'N02', floorId: 'F1' })
      ]
    });
    deleteFloorPure(route, 'F1');
    expect(route.nodes[0].floorId).toBeNull();
    expect(route.nodes[1].floorId).toBeNull();
  });

  it('does not affect nodes on other floors', () => {
    const route = makeRoute({
      floors: [
        { id: 'F0', name: 'Ground', image: null },
        { id: 'F1', name: 'First', image: null }
      ],
      nodes: [
        makeNode({ id: 'N01', floorId: 'F0' }),
        makeNode({ id: 'N02', floorId: 'F1' })
      ]
    });
    deleteFloorPure(route, 'F1');
    expect(route.nodes[0].floorId).toBe('F0');
  });

  it('does not affect nodes with floorId: null', () => {
    const route = makeRoute({
      floors: [
        { id: 'F0', name: 'Ground', image: null },
        { id: 'F1', name: 'First', image: null }
      ],
      nodes: [
        makeNode({ id: 'N01', floorId: null }),
        makeNode({ id: 'N02', floorId: 'F1' })
      ]
    });
    deleteFloorPure(route, 'F1');
    expect(route.nodes[0].floorId).toBeNull();
  });
});

// ── assignNodeFloorPure ───────────────────────────────────────────────────────

describe('assignNodeFloorPure', () => {
  it('sets node.floorId to the given floor id', () => {
    const node = makeNode({ floorId: null });
    assignNodeFloorPure(node, 'F2');
    expect(node.floorId).toBe('F2');
  });

  it('sets node.floorId to null when passed null (unassign)', () => {
    const node = makeNode({ floorId: 'F1' });
    assignNodeFloorPure(node, null);
    expect(node.floorId).toBeNull();
  });
});
