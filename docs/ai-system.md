# AI System

ICE integrates Claude (Anthropic) as an AI assistant that can modify canvas infrastructure via natural language. The system converts user intents into structured canvas operations streamed in real-time.

## Pipeline

```
User types intent
       │
       ▼
┌──────────────────┐
│  Frontend        │
│  Serialize canvas│ ──► POST /api/ai/intent (SSE)
│  state to JSON   │
└──────────────────┘
       │
       ▼
┌──────────────────┐
│  AI Service      │
│  1. Build system │
│     prompt with  │
│     schema ctx   │
│  2. Call Claude  │
│     API (stream) │
│  3. Parse JSON   │
│     response     │
│  4. Validate ops │
└──────────────────┘
       │
       ▼ SSE stream of AiStreamEvent
┌──────────────────┐
│  Frontend        │
│  operation-      │
│  executor.ts     │
│  Dispatches ops  │
│  to Redux store  │
└──────────────────┘
       │
       ▼
  Canvas updates in real-time
```

## Operation Schema

The `AiCanvasOp` is a discriminated union of 11 operation types:

| Operation | Description |
|---|---|
| `addNode` | Add a new resource block to the canvas |
| `addEdge` | Connect two nodes |
| `deleteNode` | Remove a node |
| `deleteEdge` | Remove an edge |
| `updateNodeData` | Modify node properties (name, config) |
| `updateNodePosition` | Move a node on canvas |
| `resizeNode` | Change node dimensions |
| `reparentNode` | Move node into/out of a group |
| `updateEdgeData` | Modify edge properties |
| `autoOrganize` | Auto-layout all nodes |
| `addBlueprint` | Add a pre-defined blueprint (multi-node template) |

Defined in `packages/types/src/ai.ts`.

## SSE Stream Events

The AI endpoint streams `AiStreamEvent` messages:

| Event Type | Payload | Description |
|---|---|---|
| `thinking` | `{ content: string }` | Claude's reasoning (displayed in chat) |
| `operation` | `AiCanvasOp` | Single canvas operation to execute |
| `operations` | `AiCanvasOp[]` | Batch of operations |
| `message` | `{ content: string }` | Text response to user |
| `suggestion` | `{ suggestions: string[] }` | Follow-up suggestions |
| `error` | `{ message: string }` | Error message |
| `done` | `{}` | Stream complete |

## Schema Context

The `ai-schema-context.service.ts` builds context for Claude's system prompt:

1. **Available block types** — all registered blocks with their properties and connection rules
2. **Connection rules** — which block types can connect to which
3. **Current canvas state** — serialized nodes, edges, and their configurations

This gives Claude full awareness of what blocks exist and how they can be connected, enabling it to generate valid operations.

## Skill Detection

The AI service routes intents to specialized Claude configurations:

- **Cloud architect** — for infrastructure design questions
- **Default** — for general canvas manipulation

## Audit Logging

Every Claude API call is logged to `AiAuditLog`:

- Canvas state before operations
- Parsed operations
- Whether parsing succeeded
- Dry-run validation result (if enabled)
- Call duration in milliseconds

## Frontend Integration

### Operation Executor (`@ice-saas/ui/ai`)

The `operation-executor.ts` receives `AiCanvasOp[]` and dispatches Redux actions:

```typescript
// For each operation:
switch (op.type) {
  case 'addNode':     dispatch(addNode(op.data))
  case 'addEdge':     dispatch(addEdge(op.data))
  case 'deleteNode':  dispatch(deleteNode(op.nodeId))
  case 'updateNodeData': dispatch(updateNodeData(op))
  // ...
}
```

### Canvas Serialization

`serialize-canvas.ts` converts Redux canvas state into a compact JSON format for the AI request:

```typescript
interface SerializedCanvas {
  nodes: { id, type, name, position, data }[]
  edges: { id, source, target, data }[]
}
```

### AI Chat Panel

`AiChatPanel` provides the chat interface:
- Message history display
- Intent input with streaming response
- Operation preview (shows what the AI is doing)
- Follow-up suggestions
- Conversation management (create, switch, delete)

## Conversation Persistence

- **`AiConversation`** — one per project/card, stores title
- **`AiMessage`** — individual messages with role (user/assistant), content, operations, and suggestions as JSON

## Rate Limiting

AI endpoints are rate-limited via `express-rate-limit` to prevent abuse.
