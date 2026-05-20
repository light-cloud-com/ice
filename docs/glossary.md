# Glossary

The terms ICE uses across docs, source, and UI. Linked from other docs so you can dive in without re-reading the architecture page.

## <a id="block"></a>Block

The unit a user drags onto the canvas. A block represents one logical piece of infrastructure (a database, a queue, a web service, a static site, a custom domain). Blocks are provider-agnostic in the UI - the same "Database" block can compile to Cloud SQL on GCP, RDS on AWS, or Azure SQL on Azure depending on the connected provider.

## <a id="blueprint"></a>Blueprint

The static, machine-readable definition of a block type. Lives in `packages/blocks/src/`. A blueprint declares: the block's name, category, configurable properties, required edges, validation rules, and which provider handlers it maps to. Blueprints are the source of truth for the palette.

## <a id="concept"></a>Concept

A user-facing grouping above blueprints. Concepts are the higher-level vocabulary in the palette ("Web Service", "Auth", "Data Warehouse") that hide the raw blueprint inventory from new users. A single concept may resolve to one of several blueprints depending on context.

## <a id="canvas"></a>Canvas

The 2D editing surface. SVG-based, draggable, connectable. The canvas state is held in Redux (`packages/ui/src/store/slices/cards-slice.ts`) and persisted as a [card](#card).

## <a id="card"></a>Card

A persisted canvas - one document containing the blocks, edges, and layout for one project. Stored in the DB; users see them as "projects" in the UI. Renamed historically from "canvas" to "card" in the codebase; both terms still appear.

## <a id="graph"></a>Graph

The compiled, provider-flavoured representation of a canvas. The translation pipeline (`packages/core/src/translate/`) turns the user-friendly [card](#card) into a normalised graph of typed nodes and edges that the deploy engine can plan and apply.

## <a id="handler"></a>Handler

A provider-specific module that knows how to `create`, `update`, and `delete` one kind of cloud resource. Lives in `packages/providers/<provider>/src/handlers/`. The handler is what actually calls the cloud SDK.

## <a id="provider"></a>Provider

The cloud target. ICE has providers for GCP (stable), AWS (experimental), Azure (experimental), and design-only stubs for several others. A provider is the combination of: an auth adapter, a set of [handlers](#handler), an [importer](#importer), and a cost-estimation table.

## <a id="importer"></a>Importer

The read-only inverse of deploy: walks a cloud account and produces a canvas representing what it found. Used by **Import → From GCP** in the UI. Currently GCP-only.

## <a id="deploy-state"></a>Deploy state

The persisted record of what ICE has actually applied to a cloud account, per environment. Used by `plan` to compute create/update/delete diffs without round-tripping the cloud. Lives in the DB; reset under **Settings → Reset** if it drifts from reality.

## <a id="environment"></a>Environment

A named target (e.g., `dev`, `staging`, `prod`) within a project. Each environment has its own deploy state and credentials, so the same canvas can be deployed multiple times against different cloud projects or regions.

## <a id="pipeline"></a>Pipeline

A wiring between a GitHub repository branch and a canvas. When a push lands on a watched branch, the webhook (`services/deploy/src/routes/webhooks.ts`) triggers a deploy on the configured environment. HMAC-verified.

## <a id="plan"></a>Plan

A read-only pass that compares a canvas's compiled [graph](#graph) against the [deploy state](#deploy-state) and produces a list of `CREATE`, `UPDATE`, `DELETE`, `NO_OP` operations per resource. The output is displayed to the user in the Plan modal before they confirm.

## <a id="apply"></a>Apply

The mutation step: executes the [plan](#plan) in topological order (dependencies before dependents), streaming progress over Socket.IO. On partial failure, stops at the failing handler and returns the state-so-far so the next plan can resume.

## <a id="template"></a>Template

A pre-built canvas the user can clone as a starting point (SaaS Starter, RAG Chatbot, Full-Stack Web App, etc.). Defined in `packages/templates/src/`.

## <a id="ai-assistant"></a>AI assistant

The Claude integration that can read and propose edits to a canvas in plain English. Off unless `ANTHROPIC_API_KEY` is set; never applies changes without user confirmation. See [ai-assistant](architecture/ai-assistant.md).

## <a id="gateway"></a>Gateway

The single Express process that composes all backend service routers into one API. `apps/gateway/`. In desktop mode it runs in-process with the Electron app; in web mode it runs standalone.

## <a id="ice-cloud"></a>ICE Cloud

The managed, hosted version of ICE (operated by the project maintainers as a commercial service). Same open-source code as this repo plus operational and multi-tenant layers that only make sense in a hosted context.
