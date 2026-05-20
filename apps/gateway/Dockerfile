FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy all package.json files for dependency resolution
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
COPY packages/core/package.json packages/core/
COPY packages/blocks/package.json packages/blocks/
COPY packages/providers/gcp/package.json packages/providers/gcp/
COPY packages/providers/aws/package.json packages/providers/aws/
COPY packages/providers/azure/package.json packages/providers/azure/
COPY packages/block-registry/package.json packages/block-registry/
COPY packages/provider-registry/package.json packages/provider-registry/
COPY packages/template-registry/package.json packages/template-registry/
COPY packages/templates/package.json packages/templates/
COPY services/iam/package.json services/iam/
COPY services/canvas/package.json services/canvas/
COPY services/deploy/package.json services/deploy/
COPY services/ai/package.json services/ai/
COPY services/engine/package.json services/engine/
COPY services/credentials/package.json services/credentials/
COPY services/billing/package.json services/billing/
COPY apps/gateway/package.json apps/gateway/

# Install dependencies
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source
COPY . .

# Generate Prisma client
RUN cd packages/db && npx prisma generate

EXPOSE 5001

CMD ["node", "--import", "tsx", "apps/gateway/src/index.ts"]
