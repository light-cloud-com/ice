#!/usr/bin/env npx tsx
/**
 * Graph Visualization Tool
 *
 * Exports the ICE schema knowledge graph to various formats for visualization.
 * Supports: JSON, DOT (Graphviz), GEXF (Gephi), and interactive HTML.
 *
 * Usage:
 *   npx tsx tools/visualize-graph.ts [options]
 *
 * Options:
 *   --format <type>    Output format: json, dot, gexf, html (default: html)
 *   --output <file>    Output file path
 *   --category <name>  Filter by category (e.g., ec2, s3, compute)
 *   --provider <name>  Filter by provider (e.g., aws, gcp, azure)
 *   --max-nodes <n>    Limit number of nodes (default: all)
 *   --include-props    Include properties as node attributes
 */

import * as fs from 'fs';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =============================================================================
// Types
// =============================================================================

interface GraphNode {
  id: string;
  label: string;
  category: string;
  source: string;
  properties?: number;
  implementations?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
  property?: string;
  confidence: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    totalNodes: number;
    totalEdges: number;
    categories: string[];
    providers: string[];
    generatedAt: string;
  };
}

interface VisualizationOptions {
  format: 'json' | 'dot' | 'gexf' | 'html';
  output: string;
  category?: string;
  provider?: string;
  maxNodes?: number;
  includeProps: boolean;
}

// =============================================================================
// Database Queries
// =============================================================================

function loadGraphData(dbPath: string, options: VisualizationOptions): GraphData {
  const db = new Database(dbPath, { readonly: true });

  // Build WHERE clauses
  const whereClauses: string[] = [];
  const params: unknown[] = [];

  if (options.category) {
    whereClauses.push('rt.category = ?');
    params.push(options.category);
  }

  if (options.provider) {
    whereClauses.push(`EXISTS (
      SELECT 1 FROM implementations i
      WHERE i.resource_type_id = rt.id AND i.provider_name LIKE ?
    )`);
    params.push(`%${options.provider}%`);
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const limitClause = options.maxNodes ? `LIMIT ${options.maxNodes}` : '';

  // Load nodes
  const nodesSql = `
    SELECT
      rt.ice_type as id,
      rt.display_name as label,
      rt.category,
      rt.source,
      (SELECT COUNT(*) FROM properties p WHERE p.resource_type_id = rt.id AND p.parent_property_id IS NULL) as properties,
      (SELECT COUNT(*) FROM implementations i WHERE i.resource_type_id = rt.id) as implementations
    FROM resource_types rt
    ${whereClause}
    ORDER BY rt.category, rt.ice_type
    ${limitClause}
  `;

  const nodes = db.prepare(nodesSql).all(...params) as GraphNode[];
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Load edges (only between included nodes)
  let edges: GraphEdge[] = [];

  if (nodes.length > 0) {
    const edgesSql = `
      SELECT
        src.ice_type as source,
        tgt.ice_type as target,
        rr.relationship_type as type,
        rr.property_name as property,
        rr.confidence
      FROM resource_relationships rr
      JOIN resource_types src ON rr.source_type_id = src.id
      JOIN resource_types tgt ON rr.target_type_id = tgt.id
    `;

    const allEdges = db.prepare(edgesSql).all() as GraphEdge[];
    edges = allEdges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  }

  // Load metadata
  const categories = [...new Set(nodes.map((n) => n.category))].sort();
  const providersSql = `SELECT DISTINCT provider_name FROM implementations ORDER BY provider_name`;
  const providers = (db.prepare(providersSql).all() as { provider_name: string }[]).map((p) => p.provider_name);

  db.close();

  return {
    nodes,
    edges,
    metadata: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      categories,
      providers,
      generatedAt: new Date().toISOString(),
    },
  };
}

// =============================================================================
// Export Formats
// =============================================================================

function exportJson(data: GraphData): string {
  return JSON.stringify(data, null, 2);
}

function exportDot(data: GraphData): string {
  const lines: string[] = [];
  lines.push('digraph ICE_Schema_Graph {');
  lines.push('  rankdir=LR;');
  lines.push('  node [shape=box, style=filled];');
  lines.push('');

  // Color map for categories
  const categoryColors: Record<string, string> = {
    ec2: '#FF9999',
    s3: '#99FF99',
    iam: '#9999FF',
    vpc: '#FFFF99',
    rds: '#FF99FF',
    lambda: '#99FFFF',
    compute: '#FFB366',
    storage: '#66FFB3',
    network: '#B366FF',
  };

  // Group nodes by category
  const byCategory = new Map<string, GraphNode[]>();
  for (const node of data.nodes) {
    const cat = node.category || 'other';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(node);
  }

  for (const [category, nodes] of byCategory) {
    lines.push(`  subgraph cluster_${category.replace(/[^a-zA-Z0-9]/g, '_')} {`);
    lines.push(`    label="${category}";`);
    const color = categoryColors[category] || '#CCCCCC';
    lines.push(`    style=filled;`);
    lines.push(`    color="${color}40";`);

    for (const node of nodes) {
      const nodeId = node.id.replace(/[^a-zA-Z0-9]/g, '_');
      const nodeColor = categoryColors[category] || '#CCCCCC';
      lines.push(`    "${nodeId}" [label="${node.label}", fillcolor="${nodeColor}"];`);
    }
    lines.push('  }');
    lines.push('');
  }

  // Edges
  const edgeColors: Record<string, string> = {
    depends_on: '#FF0000',
    references: '#0000FF',
    contains: '#00FF00',
    equivalent_to: '#FF00FF',
    connects_to: '#00FFFF',
  };

  for (const edge of data.edges) {
    const sourceId = edge.source.replace(/[^a-zA-Z0-9]/g, '_');
    const targetId = edge.target.replace(/[^a-zA-Z0-9]/g, '_');
    const color = edgeColors[edge.type] || '#000000';
    lines.push(`  "${sourceId}" -> "${targetId}" [color="${color}", label="${edge.type}"];`);
  }

  lines.push('}');
  return lines.join('\n');
}

function exportGexf(data: GraphData): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<gexf xmlns="http://www.gexf.net/1.2draft" version="1.2">');
  lines.push('  <meta>');
  lines.push(`    <creator>ICE Schema Visualizer</creator>`);
  lines.push(
    `    <description>ICE Knowledge Graph - ${data.metadata.totalNodes} nodes, ${data.metadata.totalEdges} edges</description>`,
  );
  lines.push('  </meta>');
  lines.push('  <graph mode="static" defaultedgetype="directed">');

  // Node attributes
  lines.push('    <attributes class="node">');
  lines.push('      <attribute id="0" title="category" type="string"/>');
  lines.push('      <attribute id="1" title="source" type="string"/>');
  lines.push('      <attribute id="2" title="properties" type="integer"/>');
  lines.push('      <attribute id="3" title="implementations" type="integer"/>');
  lines.push('    </attributes>');

  // Edge attributes
  lines.push('    <attributes class="edge">');
  lines.push('      <attribute id="0" title="type" type="string"/>');
  lines.push('      <attribute id="1" title="confidence" type="float"/>');
  lines.push('    </attributes>');

  // Nodes
  lines.push('    <nodes>');
  for (const node of data.nodes) {
    lines.push(`      <node id="${escapeXml(node.id)}" label="${escapeXml(node.label)}">`);
    lines.push('        <attvalues>');
    lines.push(`          <attvalue for="0" value="${escapeXml(node.category)}"/>`);
    lines.push(`          <attvalue for="1" value="${escapeXml(node.source)}"/>`);
    lines.push(`          <attvalue for="2" value="${node.properties || 0}"/>`);
    lines.push(`          <attvalue for="3" value="${node.implementations || 0}"/>`);
    lines.push('        </attvalues>');
    lines.push('      </node>');
  }
  lines.push('    </nodes>');

  // Edges
  lines.push('    <edges>');
  let edgeId = 0;
  for (const edge of data.edges) {
    lines.push(`      <edge id="${edgeId++}" source="${escapeXml(edge.source)}" target="${escapeXml(edge.target)}">`);
    lines.push('        <attvalues>');
    lines.push(`          <attvalue for="0" value="${escapeXml(edge.type)}"/>`);
    lines.push(`          <attvalue for="1" value="${edge.confidence}"/>`);
    lines.push('        </attvalues>');
    lines.push('      </edge>');
  }
  lines.push('    </edges>');

  lines.push('  </graph>');
  lines.push('</gexf>');
  return lines.join('\n');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function exportHtml(data: GraphData): string {
  // Generate interactive visualization using Cytoscape.js
  const cytoscapeElements = {
    nodes: data.nodes.map((n) => ({
      data: {
        id: n.id,
        label: n.label,
        category: n.category,
        source: n.source,
        properties: n.properties,
        implementations: n.implementations,
      },
    })),
    edges: data.edges.map((e, i) => ({
      data: {
        id: `e${i}`,
        source: e.source,
        target: e.target,
        type: e.type,
        confidence: e.confidence,
      },
    })),
  };

  return `<!DOCTYPE html>
<html>
<head>
  <title>ICE Schema Knowledge Graph</title>
  <meta charset="UTF-8">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.28.1/cytoscape.min.js"></script>
  <script src="https://unpkg.com/layout-base/layout-base.js"></script>
  <script src="https://unpkg.com/cose-base/cose-base.js"></script>
  <script src="https://unpkg.com/cytoscape-fcose/cytoscape-fcose.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    #cy { width: 100vw; height: 100vh; }
    #controls {
      position: absolute;
      top: 10px;
      left: 10px;
      background: white;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      z-index: 1000;
      max-width: 300px;
    }
    #controls h2 { margin-bottom: 10px; font-size: 16px; }
    #controls .stat { font-size: 12px; color: #666; margin-bottom: 5px; }
    #controls input, #controls select {
      width: 100%;
      padding: 5px;
      margin: 5px 0;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    #controls button {
      width: 100%;
      padding: 8px;
      margin: 5px 0;
      background: #4CAF50;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    #controls button:hover { background: #45a049; }
    #info {
      position: absolute;
      bottom: 10px;
      right: 10px;
      background: white;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      z-index: 1000;
      max-width: 400px;
      max-height: 300px;
      overflow-y: auto;
      display: none;
    }
    #info h3 { margin-bottom: 10px; }
    #info .prop { font-size: 12px; margin: 3px 0; }
    #info .prop span { color: #666; }
    .legend { margin-top: 10px; font-size: 11px; }
    .legend-item { display: flex; align-items: center; margin: 3px 0; }
    .legend-color { width: 12px; height: 12px; border-radius: 2px; margin-right: 5px; }
  </style>
</head>
<body>
  <div id="cy"></div>
  <div id="controls">
    <h2>ICE Knowledge Graph</h2>
    <div class="stat">Nodes: ${data.metadata.totalNodes.toLocaleString()}</div>
    <div class="stat">Edges: ${data.metadata.totalEdges.toLocaleString()}</div>
    <div class="stat">Categories: ${data.metadata.categories.length}</div>
    <input type="text" id="search" placeholder="Search resources...">
    <select id="category-filter">
      <option value="">All Categories</option>
      ${data.metadata.categories.map((c) => `<option value="${c}">${c}</option>`).join('\n      ')}
    </select>
    <select id="edge-filter">
      <option value="">All Relationships</option>
      <option value="depends_on">depends_on</option>
      <option value="references">references</option>
      <option value="contains">contains</option>
      <option value="equivalent_to">equivalent_to</option>
      <option value="connects_to">connects_to</option>
    </select>
    <button onclick="resetView()">Reset View</button>
    <button onclick="runLayout()">Re-layout</button>
    <div class="legend">
      <strong>Edge Types:</strong>
      <div class="legend-item"><div class="legend-color" style="background:#e74c3c"></div>depends_on</div>
      <div class="legend-item"><div class="legend-color" style="background:#3498db"></div>references</div>
      <div class="legend-item"><div class="legend-color" style="background:#2ecc71"></div>contains</div>
      <div class="legend-item"><div class="legend-color" style="background:#9b59b6"></div>equivalent_to</div>
      <div class="legend-item"><div class="legend-color" style="background:#1abc9c"></div>connects_to</div>
    </div>
  </div>
  <div id="info"></div>

  <script>
    const elements = ${JSON.stringify(cytoscapeElements)};

    // Category colors
    const categoryColors = {};
    const hueStep = 360 / ${data.metadata.categories.length};
    ${JSON.stringify(data.metadata.categories)}.forEach((cat, i) => {
      categoryColors[cat] = \`hsl(\${i * hueStep}, 70%, 60%)\`;
    });

    const edgeColors = {
      depends_on: '#e74c3c',
      references: '#3498db',
      contains: '#2ecc71',
      equivalent_to: '#9b59b6',
      connects_to: '#1abc9c',
    };

    const cy = cytoscape({
      container: document.getElementById('cy'),
      elements: elements,
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'background-color': (ele) => categoryColors[ele.data('category')] || '#999',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '8px',
            'width': 30,
            'height': 30,
            'text-wrap': 'ellipsis',
            'text-max-width': '80px',
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 1,
            'line-color': (ele) => edgeColors[ele.data('type')] || '#999',
            'target-arrow-color': (ele) => edgeColors[ele.data('type')] || '#999',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'opacity': 0.6,
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 3,
            'border-color': '#000',
          }
        },
        {
          selector: '.highlighted',
          style: {
            'background-color': '#ff0',
            'line-color': '#ff0',
            'target-arrow-color': '#ff0',
            'opacity': 1,
          }
        },
        {
          selector: '.faded',
          style: {
            'opacity': 0.1,
          }
        }
      ],
      layout: {
        name: 'fcose',
        quality: 'proof',
        randomize: true,
        animate: false,
        nodeDimensionsIncludeLabels: true,
        nodeRepulsion: 10000,
        idealEdgeLength: 100,
      },
      minZoom: 0.05,
      maxZoom: 3,
    });

    // Node click handler
    cy.on('tap', 'node', function(evt) {
      const node = evt.target;
      const data = node.data();
      const info = document.getElementById('info');
      info.style.display = 'block';
      info.innerHTML = \`
        <h3>\${data.label}</h3>
        <div class="prop"><span>ICE Type:</span> \${data.id}</div>
        <div class="prop"><span>Category:</span> \${data.category}</div>
        <div class="prop"><span>Source:</span> \${data.source}</div>
        <div class="prop"><span>Properties:</span> \${data.properties || 0}</div>
        <div class="prop"><span>Implementations:</span> \${data.implementations || 0}</div>
        <div class="prop"><span>Connections:</span> \${node.connectedEdges().length}</div>
      \`;

      // Highlight connected nodes
      cy.elements().removeClass('highlighted faded');
      const connected = node.closedNeighborhood();
      connected.addClass('highlighted');
      cy.elements().not(connected).addClass('faded');
    });

    cy.on('tap', function(evt) {
      if (evt.target === cy) {
        document.getElementById('info').style.display = 'none';
        cy.elements().removeClass('highlighted faded');
      }
    });

    // Search
    document.getElementById('search').addEventListener('input', function(e) {
      const query = e.target.value.toLowerCase();
      cy.elements().removeClass('highlighted faded');
      if (query) {
        const matching = cy.nodes().filter(n =>
          n.data('id').toLowerCase().includes(query) ||
          n.data('label').toLowerCase().includes(query)
        );
        matching.addClass('highlighted');
        cy.elements().not(matching).not(matching.connectedEdges()).addClass('faded');
      }
    });

    // Category filter
    document.getElementById('category-filter').addEventListener('change', function(e) {
      const category = e.target.value;
      cy.elements().removeClass('highlighted faded');
      if (category) {
        const matching = cy.nodes().filter(n => n.data('category') === category);
        matching.addClass('highlighted');
        cy.elements().not(matching).not(matching.connectedEdges()).addClass('faded');
      }
    });

    // Edge type filter
    document.getElementById('edge-filter').addEventListener('change', function(e) {
      const type = e.target.value;
      cy.elements().removeClass('highlighted faded');
      if (type) {
        const matching = cy.edges().filter(e => e.data('type') === type);
        matching.addClass('highlighted');
        const connectedNodes = matching.connectedNodes();
        connectedNodes.addClass('highlighted');
        cy.elements().not(matching).not(connectedNodes).addClass('faded');
      }
    });

    function resetView() {
      cy.elements().removeClass('highlighted faded');
      cy.fit();
      document.getElementById('search').value = '';
      document.getElementById('category-filter').value = '';
      document.getElementById('edge-filter').value = '';
      document.getElementById('info').style.display = 'none';
    }

    function runLayout() {
      cy.layout({
        name: 'fcose',
        quality: 'default',
        randomize: false,
        animate: true,
        animationDuration: 1000,
      }).run();
    }
  </script>
</body>
</html>`;
}

// =============================================================================
// CLI
// =============================================================================

function parseArgs(): VisualizationOptions {
  const args = process.argv.slice(2);
  const options: VisualizationOptions = {
    format: 'html',
    output: '',
    includeProps: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--format':
        options.format = args[++i] as VisualizationOptions['format'];
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--category':
        options.category = args[++i];
        break;
      case '--provider':
        options.provider = args[++i];
        break;
      case '--max-nodes':
        options.maxNodes = parseInt(args[++i], 10);
        break;
      case '--include-props':
        options.includeProps = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Graph Visualization Tool

Usage:
  npx tsx tools/visualize-graph.ts [options]

Options:
  --format <type>    Output format: json, dot, gexf, html (default: html)
  --output <file>    Output file path
  --category <name>  Filter by category (e.g., ec2, s3, compute)
  --provider <name>  Filter by provider (e.g., aws, gcp, azure)
  --max-nodes <n>    Limit number of nodes
  --include-props    Include properties as node attributes

Examples:
  # Generate interactive HTML visualization
  npx tsx tools/visualize-graph.ts --output graph.html

  # Export to Graphviz DOT format
  npx tsx tools/visualize-graph.ts --format dot --output graph.dot

  # Export to Gephi format
  npx tsx tools/visualize-graph.ts --format gexf --output graph.gexf

  # Visualize only EC2 resources
  npx tsx tools/visualize-graph.ts --category ec2 --output ec2.html

  # Visualize only AWS resources
  npx tsx tools/visualize-graph.ts --provider aws --output aws.html
`);
        process.exit(0);
    }
  }

  // Default output filename
  if (!options.output) {
    const ext = { json: 'json', dot: 'dot', gexf: 'gexf', html: 'html' }[options.format];
    options.output = `ice-schema-graph.${ext}`;
  }

  return options;
}

async function main() {
  const options = parseArgs();
  const dbPath = path.join(__dirname, '../packages/schemas/src/data/ice-schemas.db');

  if (!fs.existsSync(dbPath)) {
    console.error('Error: Schema database not found. Run build-schemas.ts first.');
    process.exit(1);
  }

  console.log('Loading graph data...');
  const data = loadGraphData(dbPath, options);

  console.log(`  Nodes: ${data.metadata.totalNodes.toLocaleString()}`);
  console.log(`  Edges: ${data.metadata.totalEdges.toLocaleString()}`);
  console.log(`  Categories: ${data.metadata.categories.length}`);

  console.log(`\nExporting to ${options.format.toUpperCase()}...`);

  let content: string;
  switch (options.format) {
    case 'json':
      content = exportJson(data);
      break;
    case 'dot':
      content = exportDot(data);
      break;
    case 'gexf':
      content = exportGexf(data);
      break;
    case 'html':
      content = exportHtml(data);
      break;
    default:
      console.error(`Unknown format: ${options.format}`);
      process.exit(1);
  }

  fs.writeFileSync(options.output, content);
  console.log(`\nWritten to: ${options.output}`);

  if (options.format === 'html') {
    console.log(`\nOpen in browser: file://${path.resolve(options.output)}`);
  }
}

main().catch(console.error);
