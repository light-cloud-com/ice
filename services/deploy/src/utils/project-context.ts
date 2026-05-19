import prisma from '@ice/db';

/**
 * Resolve the owning project's id, name, and environment type from a
 * cardId. Generated resource names use these to make ownership obvious
 * in the GCP console (e.g. `ice-fullstack-webapp-production-instance-…`
 * instead of `ice-untitled-development-…`).
 *
 * Each card is 1:1 with an Environment row, so the env type is fully
 * determined by cardId. Trusting `options.environment` from the frontend
 * meant the deploy panel's default ('development') overrode the card's
 * actual environment ('production'/'staging') and produced wrongly-named
 * resources. The DB is the source of truth.
 *
 * Falls back to a cardId-derived stub when the lookup fails so a deploy
 * can still proceed against a stale or detached card.
 */
export async function resolveProjectContext(
  cardId: string,
): Promise<{ projectId: string; projectName: string; environmentType: string }> {
  try {
    const card = await prisma.canvasCard.findUnique({
      where: { id: cardId },
      include: {
        project: { select: { id: true, name: true } },
        environment: { select: { type: true, name: true } },
      },
    });
    if (card?.project) {
      return {
        projectId: card.project.id,
        projectName: card.project.name,
        environmentType: card.environment?.type || 'development',
      };
    }
  } catch {
    /* fall through to stub */
  }
  return { projectId: cardId, projectName: cardId.slice(0, 12), environmentType: 'development' };
}
