import { describe, it, expect } from 'vitest';
import { serializeRoutes, migrateConnections } from '../virtual-tour-utils.js';

function makeNode(overrides = {}) {
  return {
    id: 'N01', name: 'Test Node', desc: '',
    image: null, mapX: null, mapY: null,
    floorId: null, connections: [], hotspots: [],
    navArrowColor: null, quiz: null, thumbUrl: null,
    ...overrides
  };
}

function makeRoute(overrides = {}) {
  return {
    id: 'R001', name: 'Test Route', desc: '',
    floors: [{ id: 'F0', name: 'Floor 1', image: null }],
    nodes: [],
    ...overrides
  };
}

// ── serializeRoutes ────────────────────────────────────────────────────────────

describe('serializeRoutes', () => {
  it('returns version 1 with an ISO timestamp and empty routes', () => {
    const result = serializeRoutes([]);
    expect(result.version).toBe(1);
    expect(typeof result.exported).toBe('string');
    expect(result.exported).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.routes).toEqual([]);
  });

  it('serializes all node scalar fields', () => {
    const node = makeNode({
      id: 'N01', name: 'Lobby', desc: 'Main lobby',
      mapX: 10, mapY: 20, floorId: 'F1',
      connections: ['N02'],
      navArrowColor: '#ff0000',
    });
    const result = serializeRoutes([makeRoute({ nodes: [node] })]);
    const sn = result.routes[0].nodes[0];
    expect(sn.id).toBe('N01');
    expect(sn.name).toBe('Lobby');
    expect(sn.desc).toBe('Main lobby');
    expect(sn.mapX).toBe(10);
    expect(sn.mapY).toBe(20);
    expect(sn.floorId).toBe('F1');
    expect(sn.connections).toEqual(['N02']);
    expect(sn.navArrowColor).toBe('#ff0000');
  });

  it('serializes image.src when an image object is present', () => {
    const image = { src: 'data:image/jpeg;base64,xyz' };
    const node = makeNode({ image });
    const result = serializeRoutes([makeRoute({ nodes: [node] })]);
    expect(result.routes[0].nodes[0].imageSrc).toBe('data:image/jpeg;base64,xyz');
  });

  it('serializes null image as imageSrc: null', () => {
    const node = makeNode({ image: null });
    const result = serializeRoutes([makeRoute({ nodes: [node] })]);
    expect(result.routes[0].nodes[0].imageSrc).toBeNull();
  });

  it('always sets thumbUrl to null in export (strips cached thumbnails)', () => {
    const node = makeNode({ thumbUrl: 'data:image/jpeg;base64,cached' });
    const result = serializeRoutes([makeRoute({ nodes: [node] })]);
    expect(result.routes[0].nodes[0].thumbUrl).toBeNull();
  });

  it('serializes quiz object with all fields', () => {
    const quiz = { question: 'Q?', options: ['A', 'B', 'C', 'D'], correctIndex: 2, explanation: 'Because' };
    const node = makeNode({ quiz });
    const result = serializeRoutes([makeRoute({ nodes: [node] })]);
    expect(result.routes[0].nodes[0].quiz).toEqual(quiz);
  });

  it('serializes null quiz as null', () => {
    const node = makeNode({ quiz: null });
    const result = serializeRoutes([makeRoute({ nodes: [node] })]);
    expect(result.routes[0].nodes[0].quiz).toBeNull();
  });

  it('serializes hotspots array', () => {
    const hotspots = [{ id: 'HS1', type: 'info', label: 'Info', yaw: 0.5, pitch: 0 }];
    const node = makeNode({ hotspots });
    const result = serializeRoutes([makeRoute({ nodes: [node] })]);
    expect(result.routes[0].nodes[0].hotspots).toEqual(hotspots);
  });

  it('serializes floors array with imageSrc from image.src', () => {
    const floorImage = { src: 'data:image/jpeg;base64,floorplan' };
    const route = makeRoute({ floors: [{ id: 'F0', name: 'Ground Floor', image: floorImage }] });
    const result = serializeRoutes([route]);
    const sf = result.routes[0].floors[0];
    expect(sf.id).toBe('F0');
    expect(sf.name).toBe('Ground Floor');
    expect(sf.imageSrc).toBe('data:image/jpeg;base64,floorplan');
  });

  it('serializes null floor image as imageSrc: null', () => {
    const route = makeRoute({ floors: [{ id: 'F0', name: 'Floor 1', image: null }] });
    const result = serializeRoutes([route]);
    expect(result.routes[0].floors[0].imageSrc).toBeNull();
  });

  it('handles multiple routes', () => {
    const routes = [
      makeRoute({ id: 'R1', name: 'Route 1' }),
      makeRoute({ id: 'R2', name: 'Route 2' })
    ];
    const result = serializeRoutes(routes);
    expect(result.routes).toHaveLength(2);
    expect(result.routes[0].name).toBe('Route 1');
    expect(result.routes[1].name).toBe('Route 2');
  });

  it('handles missing optional fields gracefully (connections/hotspots/floors)', () => {
    const route = {
      id: 'R1', name: 'Route', desc: '',
      nodes: [{ id: 'N01', name: 'A', desc: '', image: null, mapX: null, mapY: null }]
    };
    const result = serializeRoutes([route]);
    const sn = result.routes[0].nodes[0];
    expect(sn.connections).toEqual([]);
    expect(sn.hotspots).toEqual([]);
    expect(sn.floorId).toBeNull();
    expect(sn.navArrowColor).toBeNull();
    expect(sn.quiz).toBeNull();
  });

  it('round-trips: serialized node data matches original node data', () => {
    const quiz = { question: 'Q?', options: ['A', 'B', 'C', 'D'], correctIndex: 1, explanation: '' };
    const node = makeNode({
      id: 'N01', name: 'Server Room', desc: 'Cold aisle',
      mapX: 50, mapY: 75, floorId: 'F1',
      connections: ['N02', 'N03'],
      navArrowColor: '#00ff00',
      quiz,
      hotspots: [{ id: 'H1', type: 'info', label: 'Panel', yaw: 1.0, pitch: -0.2 }]
    });
    const route = makeRoute({ id: 'R1', name: 'Data Center', desc: 'Tour', nodes: [node] });
    const serialized = serializeRoutes([route]);
    const sn = serialized.routes[0].nodes[0];
    expect(sn.id).toBe(node.id);
    expect(sn.name).toBe(node.name);
    expect(sn.desc).toBe(node.desc);
    expect(sn.mapX).toBe(node.mapX);
    expect(sn.mapY).toBe(node.mapY);
    expect(sn.floorId).toBe(node.floorId);
    expect(sn.connections).toEqual(node.connections);
    expect(sn.navArrowColor).toBe(node.navArrowColor);
    expect(sn.quiz).toEqual(node.quiz);
    expect(sn.hotspots).toEqual(node.hotspots);
  });
});

// ── migrateConnections ────────────────────────────────────────────────────────

describe('migrateConnections', () => {
  it('auto-populates sequential bidirectional connections when all are empty', () => {
    const nodes = [
      { id: 'N01', connections: [] },
      { id: 'N02', connections: [] },
      { id: 'N03', connections: [] }
    ];
    migrateConnections(nodes);
    expect(nodes[0].connections).toEqual(['N02']);
    expect(nodes[1].connections).toEqual(['N01', 'N03']);
    expect(nodes[2].connections).toEqual(['N02']);
  });

  it('does NOT overwrite when any node already has connections', () => {
    const nodes = [
      { id: 'N01', connections: ['N03'] },
      { id: 'N02', connections: [] },
      { id: 'N03', connections: ['N01'] }
    ];
    migrateConnections(nodes);
    expect(nodes[0].connections).toEqual(['N03']);
    expect(nodes[1].connections).toEqual([]);
  });

  it('does not migrate a single-node route', () => {
    const nodes = [{ id: 'N01', connections: [] }];
    migrateConnections(nodes);
    expect(nodes[0].connections).toEqual([]);
  });

  it('handles empty array without throwing', () => {
    expect(() => migrateConnections([])).not.toThrow();
  });

  it('creates connections property if missing', () => {
    const nodes = [{ id: 'N01' }, { id: 'N02' }];
    migrateConnections(nodes);
    expect(nodes[0].connections).toContain('N02');
    expect(nodes[1].connections).toContain('N01');
  });

  it('produces connections that are bidirectional (both directions present)', () => {
    const nodes = [
      { id: 'N01', connections: [] },
      { id: 'N02', connections: [] }
    ];
    migrateConnections(nodes);
    expect(nodes[0].connections).toContain('N02');
    expect(nodes[1].connections).toContain('N01');
  });
});
