/**
 * Queue Service — BullMQ for async deployments
 *
 * Deployments run in background workers so the API responds immediately.
 * Job status is tracked in the DeployJob table for UI polling.
 */

import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import prisma from '@ice-saas/db';
import { applyDeployment } from './deploy.service';
import { updateEventProgress, failEvent, type DeployStep } from './pipeline.service';
import { buildFromSource, cleanupBuild } from './build.service';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let connection: IORedis | null = null;
let deployQueue: Queue | null = null;

function getConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null, // required by BullMQ
      retryStrategy(times: number) {
        if (times > 3) {
          console.warn('Redis not available — deploy queue disabled');
          return null; // stop retrying
        }
        return Math.min(times * 500, 3000);
      },
    });
    connection.on('error', () => {}); // suppress connection errors after max retries
  }
  return connection;
}

export function getDeployQueue(): Queue {
  if (!deployQueue) {
    deployQueue = new Queue('deploy', { connection: getConnection() as any });
  }
  return deployQueue;
}

export async function queueDeployment(
  cardId: string,
  nodes: any[],
  edges: any[],
  options: any,
  orgId: string,
  userId?: string,
) {
  // Create deployment record
  const deployment = await prisma.canvasDeployment.create({
    data: {
      card_id: cardId,
      user_id: userId,
      status: 'queued',
      provider: options.provider || 'gcp',
      region: options.region || 'us-central1',
      environment: options.environment || 'development',
    },
  });

  // Create job tracking record
  const deployJob = await prisma.deployJob.create({
    data: { deployment_id: deployment.id, status: 'queued' },
  });

  // Add to queue
  const queue = getDeployQueue();
  await queue.add('deploy', {
    cardId,
    nodes,
    edges,
    options,
    orgId,
    userId,
    jobId: deployJob.id,
    deploymentId: deployment.id,
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });

  return { success: true, deploymentId: deployment.id, jobId: deployJob.id };
}

export function startDeployWorker() {
  try {
    const worker = new Worker('deploy', async (job: Job) => {
      const data = job.data as any;

      // Route to pipeline worker or deploy worker based on job type
      if (data.type === 'pipeline') {
        await processPipelineJob(data);
        return;
      }

      // Original deploy job processing
      const { cardId, nodes, edges, options, orgId, userId, jobId, deploymentId } = data;

      // Update job status
      await prisma.deployJob.update({
        where: { id: jobId },
        data: { status: 'processing', started_at: new Date(), attempts: job.attemptsMade + 1 },
      });

      // Update deployment status
      await prisma.canvasDeployment.update({
        where: { id: deploymentId },
        data: { status: 'deploying' },
      });

      // Run the actual deployment
      await applyDeployment(cardId, nodes, edges, options, orgId, userId);
    }, {
      connection: getConnection() as any,
      concurrency: 3,
    });

    worker.on('completed', async (job: Job) => {
      const data = job.data as any;
      if (data.type === 'pipeline') return; // Pipeline jobs handle their own completion
      const { jobId } = data;
      await prisma.deployJob.update({
        where: { id: jobId },
        data: { status: 'completed', completed_at: new Date() },
      }).catch(() => {});
    });

    worker.on('failed', async (job: Job | undefined, err: Error) => {
      if (!job) return;
      const data = job.data as any;
      if (data.type === 'pipeline') {
        await failEvent(data.eventId, err.message).catch(() => {});
        return;
      }
      const { jobId } = data;
      await prisma.deployJob.update({
        where: { id: jobId },
        data: { status: 'failed', error: err.message },
      }).catch(() => {});
    });

    console.log('Deploy worker started (concurrency: 3)');
    return worker;
  } catch (err: any) {
    console.warn('Deploy worker not started (Redis may not be available):', err.message);
    return null;
  }
}

// ─── Pipeline Job Processor ─────────────────────────────────────────────────

async function processPipelineJob(data: any) {
  const { eventId, ruleId, cardId, nodeId, repository, branch, commitSha,
    environment, buildCommand, installCommand, outputDir, framework } = data;

  const mkStep = (name: string, status: 'started' | 'completed' | 'failed', message: string): DeployStep => ({
    step: name,
    status,
    message,
    timestamp: new Date().toISOString(),
  });

  let buildDir: string | null = null;
  const buildLogBuffer: string[] = [];

  try {
    // ── Step 1: Build from source (real clone + install + build) ──
    await updateEventProgress(eventId, 'building', 'Downloading source...', mkStep('clone', 'started', `Cloning ${repository}@${branch}`));

    // Find a user who created this card's project (for GitHub token)
    const project = await prisma.canvasProject.findFirst({
      where: { cards: { some: { id: cardId } } },
    });
    if (!project) throw new Error(`Project not found for card ${cardId}`);

    const buildResult = await buildFromSource(
      {
        repository,
        branch,
        commitSha: commitSha || 'HEAD',
        installCommand: installCommand || null,
        buildCommand: buildCommand || null,
        outputDir: outputDir || null,
        framework: framework || null,
      },
      project.created_by,
      async (step, status, message) => {
        const phase = (step === 'clone' || step === 'install' || step === 'build') ? 'building' : 'building';
        const stageLabel =
          step === 'clone' ? 'Downloading source...' :
          step === 'install' ? 'Installing dependencies...' :
          step === 'build' ? 'Building application...' :
          'Building...';
        await updateEventProgress(eventId, phase, stageLabel, mkStep(step, status, message));
      },
      // Stream individual build lines via Socket.IO + persist to DB
      (line: string) => {
        const { emitPipelineUpdate } = require('@ice-saas/shared');
        emitPipelineUpdate(nodeId, {
          nodeId,
          cardId,
          status: 'building',
          deployment_stage: line,
          progress: 33,
        });
        // Persist build line as a log step (throttled — batch every 10 lines)
        buildLogBuffer.push(line);
        if (buildLogBuffer.length >= 10) {
          const batch = buildLogBuffer.splice(0);
          updateEventProgress(eventId, 'building', line, mkStep('output', 'started', batch.join('\n'))).catch(() => {});
        }
      },
    );

    buildDir = buildResult.buildDir;

    // Flush remaining build log buffer
    if (buildLogBuffer.length > 0) {
      const batch = buildLogBuffer.splice(0);
      await updateEventProgress(eventId, 'building', 'Build output', mkStep('output', 'completed', batch.join('\n')));
    }

    if (!buildResult.success) {
      throw new Error(buildResult.error || 'Build failed');
    }

    // ── Step 2: Deploy infrastructure ──
    await updateEventProgress(eventId, 'deploying', 'Deploying infrastructure...', mkStep('deploy', 'started', `Deploying to ${environment}`));

    // Resolve the correct environment card (Canvas Branching)
    const { resolveEnvironmentCardId } = await import('./pipeline.service');
    const targetCardId = await resolveEnvironmentCardId(cardId, environment);
    const card = await prisma.canvasCard.findFirst({ where: { id: targetCardId } });
    if (!card) throw new Error(`Card ${cardId} not found`);

    const nodes = card.nodes as any[];
    const edges = card.edges as any[];
    const targetNode = nodes.find((n: any) => n.id === nodeId);
    const provider = targetNode?.data?.provider || 'gcp';

    // Collect env vars from connected Config.EnvVars blocks
    const envVars: Record<string, string> = {};
    const connectedEdges = edges.filter((e: any) => e.source === nodeId || e.target === nodeId);
    for (const edge of connectedEdges) {
      const otherId = edge.source === nodeId ? edge.target : edge.source;
      const otherNode = nodes.find((n: any) => n.id === otherId);
      if (otherNode?.data?.iceType === 'Config.EnvVars' && Array.isArray(otherNode.data.variables)) {
        for (const v of otherNode.data.variables) {
          if (v.name && v.value) envVars[v.name] = v.value;
        }
      }
    }

    // Collect domain from connected Networking.Domain blocks
    let customDomain: string | undefined;
    for (const edge of connectedEdges) {
      const otherId = edge.source === nodeId ? edge.target : edge.source;
      const otherNode = nodes.find((n: any) => n.id === otherId);
      if (otherNode?.data?.iceType === 'Networking.Domain') {
        const hostname = otherNode.data.hostname || otherNode.data.subdomain;
        if (hostname) customDomain = hostname as string;
      }
    }

    await applyDeployment(
      targetCardId,
      card.nodes as any[],
      card.edges as any[],
      {
        provider,
        region: targetNode?.data?.region || 'us-central1',
        environment,
        envVars: Object.keys(envVars).length > 0 ? envVars : undefined,
        customDomain,
      },
      project.organisation_id,
      project.created_by,
    );

    // ── Step 3: Complete ──
    await updateEventProgress(eventId, 'success', 'Deployment complete', mkStep('deploy', 'completed', `Deployed to ${environment} in ${Math.round(buildResult.duration_ms / 1000)}s`));

  } catch (err: any) {
    await updateEventProgress(eventId, 'failed', `Failed: ${err.message}`, mkStep('error', 'failed', err.message));
    throw err;
  } finally {
    // Clean up build directory
    if (buildDir) cleanupBuild(buildDir);
  }
}
