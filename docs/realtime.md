# Real-time & Sockets

ICE uses Socket.IO for real-time communication between the gateway and web frontend.

## Setup

Socket.IO is initialized in the gateway and configured via `@ice-saas/shared/socket`:

```typescript
import { setupSocketService } from '@ice-saas/shared/socket'

const io = new Server(httpServer, { cors: { origin: FRONTEND_URL } })
setupSocketService(io)
```

## Room Types

| Room Pattern | Purpose | Producer |
|---|---|---|
| `deploy:{cardId}` | Deploy progress events | Deploy service |
| `canvas:{projectId}` | Canvas collaboration (future) | Canvas service |
| `pipeline:{nodeId}` | Full CI/CD build/deploy logs | Pipeline service |
| `card-pipeline:{cardId}` | Lightweight status badges | Pipeline service |

## Events

### Deploy Progress

Room: `deploy:{cardId}`

```typescript
// Emitted during deployment
emitDeployProgress(cardId, {
  resourceId: string,
  resourceName: string,
  status: 'pending' | 'creating' | 'updating' | 'deleting' | 'completed' | 'failed',
  message: string,
  progress: number,  // 0-100
})
```

### Canvas Updates

Room: `canvas:{projectId}`

```typescript
emitCanvasUpdate(projectId, {
  cardId: string,
  nodes: Node[],
  edges: Edge[],
  updatedBy: string,
})
```

### Pipeline Updates

Room: `pipeline:{nodeId}`

```typescript
// Full pipeline event updates (logs, status changes)
emitPipelineUpdate(nodeId, {
  eventId: string,
  status: 'pending' | 'building' | 'deploying' | 'completed' | 'failed',
  logs: string[],
  progress: number,
})
```

Room: `card-pipeline:{cardId}`

```typescript
// Lightweight status for canvas node badges
emitCardPipelineUpdate(cardId, {
  nodeId: string,
  status: 'idle' | 'building' | 'deploying' | 'completed' | 'failed',
  lastDeployedAt: string,
})
```

## Frontend Usage

The web app connects to Socket.IO on startup and joins relevant rooms:

```typescript
const socket = io('http://localhost:5001')

// Join deploy room when viewing a card
socket.emit('join', `deploy:${cardId}`)

// Listen for progress
socket.on('deploy:progress', (data) => {
  dispatch(updateDeployProgress(data))
})
```
