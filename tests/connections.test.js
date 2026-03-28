import { describe, it, expect } from 'vitest';
import { addConnection, removeConnection, removeAllConnections } from '../virtual-tour-utils.js';

function makeNodes(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: 'N' + String(i + 1).padStart(2, '0'),
    name: `Node ${i + 1}`,
    connections: []
  }));
}

// ── addConnection ─────────────────────────────────────────────────────────────

describe('addConnection', () => {
  it('adds connection to both nodes (bidirectional)', () => {
    const nodes = makeNodes(3);
    addConnection(nodes, 0, 2);
    expect(nodes[0].connections).toContain('N03');
    expect(nodes[2].connections).toContain('N01');
  });

  it('does not add duplicate connections on repeated calls', () => {
    const nodes = makeNodes(2);
    addConnection(nodes, 0, 1);
    addConnection(nodes, 0, 1);
    expect(nodes[0].connections).toEqual(['N02']);
    expect(nodes[1].connections).toEqual(['N01']);
  });

  it('is symmetric — calling (0,1) and (1,0) produce the same result', () => {
    const nodes1 = makeNodes(2);
    addConnection(nodes1, 0, 1);

    const nodes2 = makeNodes(2);
    addConnection(nodes2, 1, 0);

    expect(nodes1[0].connections).toEqual(nodes2[0].connections);
    expect(nodes1[1].connections).toEqual(nodes2[1].connections);
  });

  it('does nothing when connecting a node to itself', () => {
    const nodes = makeNodes(2);
    addConnection(nodes, 0, 0);
    expect(nodes[0].connections).toEqual([]);
  });

  it('does nothing with an out-of-range index', () => {
    const nodes = makeNodes(2);
    addConnection(nodes, 0, 99);
    expect(nodes[0].connections).toEqual([]);
  });

  it('initializes connections array if missing on either node', () => {
    const nodes = [{ id: 'N01', name: 'A' }, { id: 'N02', name: 'B' }];
    addConnection(nodes, 0, 1);
    expect(nodes[0].connections).toContain('N02');
    expect(nodes[1].connections).toContain('N01');
  });

  it('does not affect connections to other nodes', () => {
    const nodes = makeNodes(3);
    nodes[0].connections = ['N03'];
    nodes[2].connections = ['N01'];
    addConnection(nodes, 0, 1); // add N01 ↔ N02
    expect(nodes[0].connections).toContain('N03'); // existing connection preserved
    expect(nodes[2].connections).toContain('N01'); // existing back-ref preserved
  });
});

// ── removeConnection ──────────────────────────────────────────────────────────

describe('removeConnection', () => {
  it('removes connection from both nodes (bidirectional)', () => {
    const nodes = makeNodes(2);
    nodes[0].connections = ['N02'];
    nodes[1].connections = ['N01'];
    removeConnection(nodes, 0, 'N02');
    expect(nodes[0].connections).not.toContain('N02');
    expect(nodes[1].connections).not.toContain('N01');
  });

  it('does not affect other connections on either node', () => {
    const nodes = makeNodes(3);
    nodes[0].connections = ['N02', 'N03'];
    nodes[1].connections = ['N01'];
    nodes[2].connections = ['N01'];

    removeConnection(nodes, 0, 'N02');
    expect(nodes[0].connections).toContain('N03'); // N01↔N03 intact
    expect(nodes[2].connections).toContain('N01'); // back-ref intact
  });

  it('does not crash when removing a non-existent connection', () => {
    const nodes = makeNodes(2);
    expect(() => removeConnection(nodes, 0, 'N99')).not.toThrow();
    expect(nodes[0].connections).toEqual([]);
  });

  it('does not crash with an out-of-range node index', () => {
    const nodes = makeNodes(2);
    expect(() => removeConnection(nodes, 99, 'N01')).not.toThrow();
  });

  it('leaves arrays empty (not undefined) after removing the last connection', () => {
    const nodes = makeNodes(2);
    nodes[0].connections = ['N02'];
    nodes[1].connections = ['N01'];
    removeConnection(nodes, 0, 'N02');
    expect(Array.isArray(nodes[0].connections)).toBe(true);
    expect(nodes[0].connections).toHaveLength(0);
  });
});

// ── removeAllConnections ──────────────────────────────────────────────────────

describe('removeAllConnections', () => {
  it('clears all connections from the target node', () => {
    const nodes = makeNodes(4);
    nodes[0].connections = ['N02', 'N03', 'N04'];
    nodes[1].connections = ['N01'];
    nodes[2].connections = ['N01'];
    nodes[3].connections = ['N01'];

    removeAllConnections(nodes, 0);
    expect(nodes[0].connections).toEqual([]);
  });

  it('removes back-references from all previously-connected nodes', () => {
    const nodes = makeNodes(4);
    nodes[0].connections = ['N02', 'N03', 'N04'];
    nodes[1].connections = ['N01'];
    nodes[2].connections = ['N01'];
    nodes[3].connections = ['N01'];

    removeAllConnections(nodes, 0);
    expect(nodes[1].connections).not.toContain('N01');
    expect(nodes[2].connections).not.toContain('N01');
    expect(nodes[3].connections).not.toContain('N01');
  });

  it('leaves other connections on connected nodes intact', () => {
    const nodes = makeNodes(3);
    // N01 ↔ N02 ↔ N03 chain, plus N01 ↔ N02
    nodes[0].connections = ['N02'];
    nodes[1].connections = ['N01', 'N03'];
    nodes[2].connections = ['N02'];

    removeAllConnections(nodes, 0); // disconnect N01

    // N02 ↔ N03 should still be connected
    expect(nodes[1].connections).toContain('N03');
    expect(nodes[2].connections).toContain('N02');
  });

  it('is a no-op on a node with no connections', () => {
    const nodes = makeNodes(2);
    expect(() => removeAllConnections(nodes, 0)).not.toThrow();
    expect(nodes[0].connections).toEqual([]);
    expect(nodes[1].connections).toEqual([]);
  });

  it('does not crash with an out-of-range index', () => {
    const nodes = makeNodes(2);
    expect(() => removeAllConnections(nodes, 99)).not.toThrow();
  });

  it('sets connections to [] not undefined/null', () => {
    const nodes = makeNodes(2);
    nodes[0].connections = ['N02'];
    nodes[1].connections = ['N01'];
    removeAllConnections(nodes, 0);
    expect(nodes[0].connections).toEqual([]);
    expect(Array.isArray(nodes[0].connections)).toBe(true);
  });
});
