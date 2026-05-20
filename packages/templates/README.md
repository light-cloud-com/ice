# @ice/templates

Pre-built canvases users can clone as starting points. SaaS Starter, RAG Chatbot, Full-Stack Web App, Budget Web App, Microservices, Secure API, etc.

Where to start reading:

- `src/index.ts` — registry of all templates.
- `src/<template>/template.ts` — canvas JSON (blocks, edges, layout, default properties).
- `src/<template>/manifest.ts` — name, description, difficulty, provider compatibility.

Provider compatibility is computed from the resource types each template uses, matched against `PROVIDER_READINESS` in `packages/constants/src/providers.ts`.
