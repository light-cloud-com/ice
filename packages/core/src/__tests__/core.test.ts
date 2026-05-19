/**
 * Core Package Tests
 *
 * Basic tests to verify the core functionality works.
 */

import {
  // Result pattern
  success,
  failure,
  is_success,
  is_failure,
  map,
  unwrap_or,

  // Errors
  IceError,
  ValidationError,
  ProviderError,

  // Graph
  create_mutable_graph,
  topological_sort,
  has_cycle,
  find_cycles,
  get_execution_layers,

  // Parser
  tokenize,
  parse,

  // Validator
  create_graph_validator,
  CycleValidator,
  ReferenceValidator,
} from '..';

describe('Result Pattern', () => {
  it('should create success result', () => {
    const result = success(42);
    expect(is_success(result)).toBe(true);
    expect(is_failure(result)).toBe(false);
    expect(result.value).toBe(42);
  });

  it('should create failure result', () => {
    const error = new Error('test error');
    const result = failure(error);
    expect(is_success(result)).toBe(false);
    expect(is_failure(result)).toBe(true);
    expect(result.error).toBe(error);
  });

  it('should map success values', () => {
    const result = success(10);
    const mapped = map(result, (x) => x * 2);
    expect(is_success(mapped)).toBe(true);
    if (is_success(mapped)) {
      expect(mapped.value).toBe(20);
    }
  });

  it('should unwrap with default', () => {
    const successResult = success(42);
    const failureResult = failure(new Error('error'));

    expect(unwrap_or(successResult, 0)).toBe(42);
    expect(unwrap_or(failureResult, 0)).toBe(0);
  });
});

describe('Error Hierarchy', () => {
  it('should create ValidationError', () => {
    const error = new ValidationError(
      'Invalid input',
      [{ path: 'name', message: 'Required field' }],
      'VALIDATION_FAILED',
    );

    expect(error).toBeInstanceOf(IceError);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.violations).toHaveLength(1);
  });

  it('should create ProviderError', () => {
    const error = new ProviderError('API failed', 'aws', 'API_ERROR');

    expect(error).toBeInstanceOf(IceError);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.provider).toBe('aws');
  });
});

describe('MutableGraph', () => {
  it('should create empty graph', () => {
    const graph = create_mutable_graph('test');
    expect(graph.node_count).toBe(0);
    expect(graph.edge_count).toBe(0);
  });

  it('should add nodes', () => {
    const graph = create_mutable_graph('test');

    const result = graph.add_node({
      type: 'aws.ec2.vpc',
      name: 'main_vpc',
      properties: { cidr_block: '10.0.0.0/16' },
    });

    expect(result.success).toBe(true);
    expect(graph.node_count).toBe(1);
  });

  it('should add edges between nodes', () => {
    const graph = create_mutable_graph('test');

    graph.add_node({
      type: 'aws.ec2.vpc',
      name: 'main_vpc',
      properties: {},
    });

    graph.add_node({
      type: 'aws.ec2.subnet',
      name: 'main_subnet',
      properties: {},
    });

    // Get the actual node IDs (they are generated as type:name)
    const nodes = Array.from(graph.nodes.values());
    const vpcNode = nodes.find((n) => n.name === 'main_vpc');
    const subnetNode = nodes.find((n) => n.name === 'main_subnet');

    expect(vpcNode).toBeDefined();
    expect(subnetNode).toBeDefined();

    if (vpcNode && subnetNode) {
      const result = graph.add_edge({
        source: subnetNode.id,
        target: vpcNode.id,
        relationship: 'depends_on',
      });

      expect(result.success).toBe(true);
      expect(graph.edge_count).toBe(1);
    }
  });

  it('should get dependencies', () => {
    const graph = create_mutable_graph('test');

    graph.add_node({
      type: 'aws.ec2.vpc',
      name: 'vpc',
      properties: {},
    });

    graph.add_node({
      type: 'aws.ec2.subnet',
      name: 'subnet',
      properties: {},
    });

    const nodes = Array.from(graph.nodes.values());
    const vpcNode = nodes.find((n) => n.name === 'vpc');
    const subnetNode = nodes.find((n) => n.name === 'subnet');

    if (vpcNode && subnetNode) {
      graph.add_edge({
        source: subnetNode.id,
        target: vpcNode.id,
        relationship: 'depends_on',
      });

      const deps = graph.get_dependencies(subnetNode.id);
      expect(deps).toHaveLength(1);
      expect(deps[0]?.name).toBe('vpc');
    }
  });
});

describe('Graph Algorithms', () => {
  it('should perform topological sort', () => {
    const graph = create_mutable_graph('test');

    graph.add_node({ type: 't', name: 'a', properties: {} });
    graph.add_node({ type: 't', name: 'b', properties: {} });
    graph.add_node({ type: 't', name: 'c', properties: {} });

    const nodes = Array.from(graph.nodes.values());
    const nodeA = nodes.find((n) => n.name === 'a')!;
    const nodeB = nodes.find((n) => n.name === 'b')!;
    const nodeC = nodes.find((n) => n.name === 'c')!;

    graph.add_edge({ source: nodeB.id, target: nodeA.id, relationship: 'depends_on' });
    graph.add_edge({ source: nodeC.id, target: nodeB.id, relationship: 'depends_on' });

    const result = topological_sort(graph);
    expect(result.success).toBe(true);
    if (result.success && result.order) {
      expect(result.order).toHaveLength(3);
      // 'a' should come before 'b', and 'b' before 'c'
      const aIdx = result.order.indexOf(nodeA.id);
      const bIdx = result.order.indexOf(nodeB.id);
      const cIdx = result.order.indexOf(nodeC.id);
      expect(aIdx).toBeLessThan(bIdx);
      expect(bIdx).toBeLessThan(cIdx);
    }
  });

  it('should detect cycles', () => {
    const graph = create_mutable_graph('test');

    graph.add_node({ type: 't', name: 'a', properties: {} });
    graph.add_node({ type: 't', name: 'b', properties: {} });

    const nodes = Array.from(graph.nodes.values());
    const nodeA = nodes.find((n) => n.name === 'a')!;
    const nodeB = nodes.find((n) => n.name === 'b')!;

    graph.add_edge({ source: nodeA.id, target: nodeB.id, relationship: 'depends_on' });
    graph.add_edge({ source: nodeB.id, target: nodeA.id, relationship: 'depends_on' });

    expect(has_cycle(graph)).toBe(true);

    const cycles = find_cycles(graph);
    expect(cycles.length).toBeGreaterThan(0);
  });

  it('should compute execution layers', () => {
    const graph = create_mutable_graph('test');

    graph.add_node({ type: 't', name: 'a', properties: {} });
    graph.add_node({ type: 't', name: 'b', properties: {} });
    graph.add_node({ type: 't', name: 'c', properties: {} });

    const nodes = Array.from(graph.nodes.values());
    const nodeA = nodes.find((n) => n.name === 'a')!;
    const nodeB = nodes.find((n) => n.name === 'b')!;
    const nodeC = nodes.find((n) => n.name === 'c')!;

    graph.add_edge({ source: nodeB.id, target: nodeA.id, relationship: 'depends_on' });
    graph.add_edge({ source: nodeC.id, target: nodeA.id, relationship: 'depends_on' });

    const layers = get_execution_layers(graph);
    expect(layers).toHaveLength(2);
    // First layer should have 'a', second should have 'b' and 'c'
    expect(layers[0]).toContain(nodeA.id);
    expect(layers[1]).toContain(nodeB.id);
    expect(layers[1]).toContain(nodeC.id);
  });
});

describe('Lexer', () => {
  it('should tokenize simple resource', () => {
    const source = `resource "aws.ec2.vpc" main {}`;
    const result = tokenize(source);

    expect(result.errors).toHaveLength(0);
    expect(result.tokens.length).toBeGreaterThan(0);

    const types = result.tokens.map((t) => t.type);
    expect(types).toContain('RESOURCE');
    expect(types).toContain('STRING');
    expect(types).toContain('IDENTIFIER');
    expect(types).toContain('LEFT_BRACE');
    expect(types).toContain('RIGHT_BRACE');
  });

  it('should tokenize numbers', () => {
    const source = `count = 42`;
    const result = tokenize(source);

    expect(result.errors).toHaveLength(0);
    const numToken = result.tokens.find((t) => t.type === 'NUMBER');
    expect(numToken).toBeDefined();
    expect(numToken?.literal).toBe(42);
  });

  it('should tokenize booleans', () => {
    const source = `enabled = true`;
    const result = tokenize(source);

    expect(result.errors).toHaveLength(0);
    const boolToken = result.tokens.find((t) => t.type === 'BOOLEAN');
    expect(boolToken).toBeDefined();
    expect(boolToken?.literal).toBe(true);
  });
});

describe('Parser', () => {
  it('should parse resource block', () => {
    const source = `
      resource "aws.ec2.vpc" main {
        cidr_block = "10.0.0.0/16"
      }
    `;
    const lexResult = tokenize(source);
    expect(lexResult.errors).toHaveLength(0);

    const parseResult = parse(lexResult.tokens);

    expect(parseResult.errors).toHaveLength(0);
    expect(parseResult.program).not.toBeNull();
    expect(parseResult.program?.statements).toHaveLength(1);

    const stmt = parseResult.program?.statements[0];
    expect(stmt?.kind).toBe('ResourceBlock');
  });

  it('should parse variable block', () => {
    const source = `
      variable environment {
        default = "dev"
      }
    `;
    const lexResult = tokenize(source);
    expect(lexResult.errors).toHaveLength(0);

    const parseResult = parse(lexResult.tokens);

    expect(parseResult.errors).toHaveLength(0);
    expect(parseResult.program?.statements).toHaveLength(1);
    expect(parseResult.program?.statements[0]?.kind).toBe('VariableBlock');
  });
});

describe('Graph Validator', () => {
  it('should validate graph without cycles', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'a', properties: {} });
    graph.add_node({ type: 't', name: 'b', properties: {} });

    const nodes = Array.from(graph.nodes.values());
    const nodeA = nodes.find((n) => n.name === 'a')!;
    const nodeB = nodes.find((n) => n.name === 'b')!;

    graph.add_edge({ source: nodeB.id, target: nodeA.id, relationship: 'depends_on' });

    const validator = create_graph_validator();
    validator.register(new CycleValidator());

    const result = validator.validate(graph);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect cycle in validation', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'a', properties: {} });
    graph.add_node({ type: 't', name: 'b', properties: {} });

    const nodes = Array.from(graph.nodes.values());
    const nodeA = nodes.find((n) => n.name === 'a')!;
    const nodeB = nodes.find((n) => n.name === 'b')!;

    graph.add_edge({ source: nodeA.id, target: nodeB.id, relationship: 'depends_on' });
    graph.add_edge({ source: nodeB.id, target: nodeA.id, relationship: 'depends_on' });

    const validator = create_graph_validator();
    validator.register(new CycleValidator());

    const result = validator.validate(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'CYCLE_DETECTED')).toBe(true);
  });

  it('should validate references', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'a', properties: {} });

    const validator = create_graph_validator();
    validator.register(new ReferenceValidator());

    const result = validator.validate(graph);
    expect(result.valid).toBe(true);
  });
});
