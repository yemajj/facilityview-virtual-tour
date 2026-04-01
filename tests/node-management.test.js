import { describe, it, expect } from 'vitest';
import { reorderNodePure, deleteNodePure } from '../virtual-tour-utils.js';

function makeNodes(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: 'N' + String(i + 1).padStart(2, '0'),
    name: `Node ${i + 1}`,
    connections: []
  }));
}

// ── reorderNodePure ───────────────────────────────────────────────────────────

describe('reorderNodePure', () => {
  it('moves node from index 0 to index 2', () => {
    const nodes = makeNodes(3);
    const { nodes: result } = reorderNodePure(nodes, 0, 2);
    expect(result.map(n => n.name)).toEqual(['Node 2', 'Node 3', 'Node 1']);
  });

  it('moves node from last to first position', () => {
    const nodes = makeNodes(3);
    const { nodes: result } = reorderNodePure(nodes, 2, 0);
    expect(result.map(n => n.name)).toEqual(['Node 3', 'Node 1', 'Node 2']);
  });

  it('reassigns sequential IDs N01/N02/N03 after reorder', () => {
    const nodes = makeNodes(3);
    const { nodes: result } = reorderNodePure(nodes, 0, 2);
    expect(result.map(n => n.id)).toEqual(['N01', 'N02', 'N03']);
  });

  it('remaps connection IDs on all nodes after reorder', () => {
    // Chain: N01 ↔ N02 ↔ N03
    const nodes = makeNodes(3);
    nodes[0].connections = ['N02'];
    nodes[1].connections = ['N01', 'N03'];
    nodes[2].connections = ['N02'];

    // Move N01 (idx 0) to position 2 → new order: [N02, N03, N01]
    // Rename map: old N02→N01, old N03→N02, old N01→N03
    const { nodes: result } = reorderNodePure(nodes, 0, 2);
    const [newN01, newN02, newN03] = result;

    // old N02 (now N01) was connected to old N01 and old N03
    expect(newN01.connections).toContain(newN03.id); // old N02 ↔ old N01
    expect(newN01.connections).toContain(newN02.id); // old N02 ↔ old N03

    // old N03 (now N02) was connected to old N02
    expect(newN02.connections).toContain(newN01.id); // old N03 ↔ old N02

    // old N01 (now N03) was connected to old N02
    expect(newN03.connections).toContain(newN01.id); // old N01 ↔ old N02
  });

  it('no-op when moving to the same index', () => {
    const nodes = makeNodes(3);
    const { nodes: result } = reorderNodePure(nodes, 1, 1);
    expect(result.map(n => n.name)).toEqual(['Node 1', 'Node 2', 'Node 3']);
    expect(result.map(n => n.id)).toEqual(['N01', 'N02', 'N03']);
  });

  it('tracks activeNodeIdx when the active node is the one being moved', () => {
    const nodes = makeNodes(3);
    const { activeNodeNewIdx } = reorderNodePure(nodes, 0, 2, 0);
    expect(activeNodeNewIdx).toBe(2);
  });

  it('tracks activeNodeIdx when a different node is moved', () => {
    const nodes = makeNodes(3);
    // Active is node 1, move node 2 to position 0 → active node shifts to idx 2
    const { activeNodeNewIdx } = reorderNodePure(nodes, 2, 0, 1);
    expect(activeNodeNewIdx).toBe(2);
  });

  it('returns activeNodeNewIdx -1 when no active node is given', () => {
    const nodes = makeNodes(3);
    const { activeNodeNewIdx } = reorderNodePure(nodes, 0, 2);
    expect(activeNodeNewIdx).toBe(-1);
  });

  it('does not remove any nodes — length is preserved', () => {
    const nodes = makeNodes(5);
    const { nodes: result } = reorderNodePure(nodes, 1, 3);
    expect(result).toHaveLength(5);
  });

  it('works for a 2-node swap', () => {
    const nodes = makeNodes(2);
    nodes[0].connections = ['N02'];
    nodes[1].connections = ['N01'];
    const { nodes: result } = reorderNodePure(nodes, 0, 1);
    expect(result.map(n => n.name)).toEqual(['Node 2', 'Node 1']);
    expect(result[0].connections).toContain('N02'); // still connected to the other
    expect(result[1].connections).toContain('N01');
  });
});

// ── deleteNodePure ────────────────────────────────────────────────────────────

describe('deleteNodePure', () => {
  it('removes the node at the given index', () => {
    const nodes = makeNodes(3);
    deleteNodePure(nodes, 1);
    expect(nodes).toHaveLength(2);
    expect(nodes.map(n => n.name)).toEqual(['Node 1', 'Node 3']);
  });

  it('reassigns sequential IDs after deleting the first node', () => {
    const nodes = makeNodes(3);
    deleteNodePure(nodes, 0); // delete N01
    expect(nodes[0].id).toBe('N01'); // old N02 promoted
    expect(nodes[1].id).toBe('N02'); // old N03 promoted
  });

  it('reassigns sequential IDs after deleting a middle node', () => {
    const nodes = makeNodes(4);
    deleteNodePure(nodes, 1); // delete N02
    expect(nodes.map(n => n.id)).toEqual(['N01', 'N02', 'N03']);
    expect(nodes.map(n => n.name)).toEqual(['Node 1', 'Node 3', 'Node 4']);
  });

  it('does not change IDs when deleting the last node', () => {
    const nodes = makeNodes(3);
    deleteNodePure(nodes, 2); // delete N03
    expect(nodes.map(n => n.id)).toEqual(['N01', 'N02']);
  });

  it('results in an empty array when deleting the only node', () => {
    const nodes = makeNodes(1);
    deleteNodePure(nodes, 0);
    expect(nodes).toHaveLength(0);
  });

  it('returns the mutated nodes array', () => {
    const nodes = makeNodes(2);
    const result = deleteNodePure(nodes, 0);
    expect(result).toBe(nodes); // same array reference
  });

  it('cleans up back-references from connected nodes when a node is deleted', () => {
    const nodes = makeNodes(3);
    nodes[0].connections = ['N02'];
    nodes[1].connections = ['N01', 'N03'];
    nodes[2].connections = ['N02'];

    deleteNodePure(nodes, 1); // delete N02
    // N01 was connected to N02 (deleted) — reference must be removed
    expect(nodes[0].connections).toEqual([]);
    // Old N03 (now N02) was connected to N02 (deleted) — reference must be removed
    const newN02 = nodes[1]; // was N03
    expect(newN02.connections).toEqual([]);
  });

  it('correctly reassigns IDs and remaps connections after deletion', () => {
    // 4 nodes: N01↔N02, N03↔N04. Delete N02.
    // Result: [N01, N03(→N02), N04(→N03)]
    const nodes = makeNodes(4);
    nodes[0].connections = ['N02'];  // N01 ↔ N02
    nodes[1].connections = ['N01'];  // N02 ↔ N01
    nodes[2].connections = ['N04'];  // N03 ↔ N04
    nodes[3].connections = ['N03'];  // N04 ↔ N03

    deleteNodePure(nodes, 1); // delete N02 (index 1)

    // After deletion: [N01(orig), N03(orig)→id N02, N04(orig)→id N03]
    expect(nodes).toHaveLength(3);
    expect(nodes[0].id).toBe('N01'); // original N01
    expect(nodes[1].id).toBe('N02'); // original N03, promoted
    expect(nodes[2].id).toBe('N03'); // original N04, promoted

    // N01 was connected to N02 (deleted) — connection removed
    expect(nodes[0].connections).toEqual([]);
    // Original N03 (now N02) was connected to N04 (now N03) — remapped correctly
    expect(nodes[1].connections).toEqual(['N03']);
    // Original N04 (now N03) was connected to N03 (now N02) — remapped correctly
    expect(nodes[2].connections).toEqual(['N02']);
  });
});
