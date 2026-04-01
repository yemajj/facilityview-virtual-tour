import { describe, it, expect } from 'vitest';
import { duplicateRoutePure } from '../virtual-tour-utils.js';

function makeNode(overrides = {}) {
  return {
    id: 'N01',
    name: 'Test Node',
    desc: '',
    image: null,
    thumbUrl: null,
    mapX: null,
    mapY: null,
    floorId: null,
    connections: [],
    hotspots: [],
    navArrowColor: null,
    quiz: null,
    ...overrides
  };
}

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

// ── duplicateRoutePure ────────────────────────────────────────────────────────

describe('duplicateRoutePure', () => {
  it('returns a new route with a different id', () => {
    const route = makeRoute();
    const copy = duplicateRoutePure(route, () => 'R_COPY');
    expect(copy.id).toBe('R_COPY');
    expect(copy.id).not.toBe(route.id);
  });

  it("new route name is original name + ' (copy)'", () => {
    const route = makeRoute({ name: 'Warehouse Tour' });
    const copy = duplicateRoutePure(route, () => 'R2');
    expect(copy.name).toBe('Warehouse Tour (copy)');
  });

  it('nodes are deep copied (modifying a node field in copy does not affect original)', () => {
    const route = makeRoute({ nodes: [makeNode({ name: 'Lobby' })] });
    const copy = duplicateRoutePure(route, () => 'R2');
    copy.nodes[0].name = 'Changed';
    expect(route.nodes[0].name).toBe('Lobby');
  });

  it('image references are shared (copy node.image === original node.image)', () => {
    const imageObj = { src: 'data:image/jpeg;base64,abc' };
    const route = makeRoute({ nodes: [makeNode({ image: imageObj })] });
    const copy = duplicateRoutePure(route, () => 'R2');
    expect(copy.nodes[0].image).toBe(imageObj);
  });

  it('thumbUrl references are shared', () => {
    const route = makeRoute({ nodes: [makeNode({ thumbUrl: 'data:image/jpeg;base64,thumb' })] });
    const copy = duplicateRoutePure(route, () => 'R2');
    // thumbUrl is a string (primitive), so sameness is by value
    expect(copy.nodes[0].thumbUrl).toBe(route.nodes[0].thumbUrl);
  });

  it('floor image references are shared', () => {
    const floorImage = { src: 'data:image/jpeg;base64,floor' };
    const route = makeRoute({ floors: [{ id: 'F0', name: 'Ground', image: floorImage }] });
    const copy = duplicateRoutePure(route, () => 'R2');
    expect(copy.floors[0].image).toBe(floorImage);
  });

  it('connections array is deep copied (modifying copy connections does not affect original)', () => {
    const route = makeRoute({
      nodes: [
        makeNode({ id: 'N01', connections: ['N02'] }),
        makeNode({ id: 'N02', connections: ['N01'] })
      ]
    });
    const copy = duplicateRoutePure(route, () => 'R2');
    copy.nodes[0].connections.push('N03');
    expect(route.nodes[0].connections).toEqual(['N02']);
  });

  it('quiz data is deep copied (modifying copy quiz does not affect original)', () => {
    const quiz = { question: 'Q?', options: ['A', 'B', 'C', 'D'], correctIndex: 0, explanation: '' };
    const route = makeRoute({ nodes: [makeNode({ quiz: { ...quiz } })] });
    const copy = duplicateRoutePure(route, () => 'R2');
    copy.nodes[0].quiz.question = 'Modified?';
    expect(route.nodes[0].quiz.question).toBe('Q?');
  });

  it('hotspots are deep copied (modifying copy hotspots array does not affect original)', () => {
    const hotspot = { id: 'hs1', type: 'info', icon: 'info', color: null, yaw: 0, pitch: 0, label: 'A', content: 'B' };
    const route = makeRoute({ nodes: [makeNode({ hotspots: [{ ...hotspot }] })] });
    const copy = duplicateRoutePure(route, () => 'R2');
    copy.nodes[0].hotspots[0].label = 'Changed';
    expect(route.nodes[0].hotspots[0].label).toBe('A');
  });

  it('route with no nodes duplicates correctly', () => {
    const route = makeRoute({ nodes: [] });
    const copy = duplicateRoutePure(route, () => 'R2');
    expect(copy.nodes).toEqual([]);
    expect(copy.id).toBe('R2');
    expect(copy.name).toBe('Test Route (copy)');
  });
});
