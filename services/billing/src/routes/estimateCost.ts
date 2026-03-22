/**
 * Estimate Cost
 *
 * Returns cost estimate for a new resource before creation
 */

import { Request, Response } from 'express';
import { User } from '@prisma/client';
import { estimateResourceCost } from '../../services/billingService';
import { errorHandler } from '../../errorHandler';

interface AuthenticatedRequest extends Request {
  user: User;
  body: {
    resourceType: 'container' | 'database' | 'static_site';
    size?: string;
    tier?: string;
    region?: string;
    ha_enabled?: boolean;
  };
}

/**
 * @swagger
 * /api/billing/estimate:
 *   post:
 *     summary: Estimate cost for a new resource
 *     security:
 *       - bearerAuth: []
 *     tags: [Billing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               resourceType:
 *                 type: string
 *                 enum: [container, database, static_site]
 *               size:
 *                 type: string
 *                 description: Memory size for containers (e.g., "512Mi", "1Gi")
 *               tier:
 *                 type: string
 *                 description: Database tier (e.g., "db-f1-micro")
 *               region:
 *                 type: string
 *                 description: GCP region
 *               ha_enabled:
 *                 type: boolean
 *                 description: High availability for databases
 *             required:
 *               - resourceType
 *     responses:
 *       200:
 *         description: Cost estimate
 *       400:
 *         description: Invalid request
 */
export const estimateCost = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { resourceType, size, tier, region, ha_enabled } = req.body;

    if (!resourceType) {
      errorHandler({ res, message: 'Resource type is required' });
      return;
    }

    if (!['container', 'database', 'static_site'].includes(resourceType)) {
      errorHandler({ res, message: 'Invalid resource type' });
      return;
    }

    const estimate = await estimateResourceCost(resourceType, {
      size,
      tier,
      region,
      ha_enabled,
    });

    res.status(200).json({
      success: true,
      data: estimate,
    });
  } catch (error) {
    console.error('Error estimating cost:', error);
    errorHandler({
      res,
      message: 'Failed to estimate cost',
      error,
    });
  }
};
