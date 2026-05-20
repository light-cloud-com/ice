/**
 * Import Routes — Terraform & Pulumi state import endpoints
 *
 * POST /api/engine/import/terraform   — import Terraform state JSON
 * POST /api/engine/import/pulumi      — import Pulumi state JSON
 */

import {
  import_terraform_state_json,
  terraform_result_to_graph,
  import_pulumi_state_json,
  pulumi_result_to_graph,
} from '@ice/core';
import { requireAuth, type AuthRequest } from '@ice/shared';
import { Router, type Response, type Router as RouterType } from 'express';

const router: RouterType = Router();

router.use(requireAuth);

/**
 * Convert a MutableGraph's nodes and edges Maps into plain arrays
 * suitable for JSON serialisation.
 */
function serialise_graph(graph: { nodes: ReadonlyMap<string, unknown>; edges: ReadonlyMap<string, unknown> }) {
  return {
    nodes: Array.from(graph.nodes.values()),
    edges: Array.from(graph.edges.values()),
  };
}

// ---------------------------------------------------------------------------
// POST /terraform
// ---------------------------------------------------------------------------
router.post('/terraform', (req: AuthRequest, res: Response) => {
  try {
    const { stateJson } = req.body as { stateJson?: string };

    if (!stateJson || typeof stateJson !== 'string') {
      return res.status(400).json({ error: 'Request body must include a "stateJson" string field' });
    }

    const result = import_terraform_state_json(stateJson);

    if (!result.success) {
      return res.status(422).json({
        errors: result.errors,
        warnings: result.warnings,
      });
    }

    const graph = terraform_result_to_graph(result);
    const { nodes, edges } = serialise_graph(graph);

    return res.json({ nodes, edges, warnings: result.warnings });
  } catch (err: any) {
    console.error('Terraform import error:', err.message);
    return res.status(500).json({ error: 'Internal server error during Terraform import' });
  }
});

// ---------------------------------------------------------------------------
// POST /pulumi
// ---------------------------------------------------------------------------
router.post('/pulumi', (req: AuthRequest, res: Response) => {
  try {
    const { stateJson } = req.body as { stateJson?: string };

    if (!stateJson || typeof stateJson !== 'string') {
      return res.status(400).json({ error: 'Request body must include a "stateJson" string field' });
    }

    const result = import_pulumi_state_json(stateJson);

    if (!result.success) {
      return res.status(422).json({
        errors: result.errors,
        warnings: result.warnings,
      });
    }

    const graph = pulumi_result_to_graph(result);
    const { nodes, edges } = serialise_graph(graph);

    return res.json({ nodes, edges, warnings: result.warnings });
  } catch (err: any) {
    console.error('Pulumi import error:', err.message);
    return res.status(500).json({ error: 'Internal server error during Pulumi import' });
  }
});

export default router;
