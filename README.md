<h1 align="center">
  <img src="docs/assets/light-cloud-logo.png" alt="" height="40" align="absmiddle" />
  &nbsp;Integrated Cloud Environment
</h1>

<p align="center"><strong>A <a href="https://light-cloud.com">Light Cloud</a> project · Figma for cloud infrastructure, with a deploy button.</strong></p>

<p align="center">
  <a href="https://github.com/light-cloud-com/ice/actions/workflows/ci.yml"><img src="https://github.com/light-cloud-com/ice/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://github.com/light-cloud-com/ice/releases/latest"><img src="https://img.shields.io/github/v/release/light-cloud-com/ice?include_prereleases&label=release" alt="Latest release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License: Apache 2.0" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen" alt="Node >= 22" /></a>
  <a href="package.json"><img src="https://img.shields.io/github/package-json/v/light-cloud-com/ice?label=version&color=5b21b6" alt="Version" /></a>
</p>

<p align="center">
  <a href="docs/provider-status.md"><img src="docs/assets/cloud-providers.svg" alt="Cloud provider support - AWS experimental, Azure experimental, GCP stable, DigitalOcean / Oracle / Kubernetes design-only, GitHub integration" /></a>
</p>

<p align="center">
  <img src="docs/assets/placeholder.png" alt="ICE canvas: drag blocks, connect them, deploy" style="max-height: 720px; object-fit: cover; border-radius: 8px;" />
</p>

## The loop

```mermaid
flowchart LR
    A([🎨 Design<br/>on canvas]) --> B([📋 Plan<br/>+ cost preview])
    B --> C([🚀 Apply])
    C --> D[(☁️ Your cloud<br/>GCP · AWS · Azure)]
    D --> E([📊 Live metrics<br/>on the canvas])
    E -.iterate.-> A

    AI{{🤖 AI assistant}}
    AI -. edits .-> A
    AI -. diagnoses failures .-> C

    style A  fill:#dbeafe,stroke:#3b82f6,stroke-width:2px,color:#1e3a8a
    style B  fill:#fef3c7,stroke:#f59e0b,stroke-width:2px,color:#78350f
    style C  fill:#dcfce7,stroke:#22c55e,stroke-width:2px,color:#14532d
    style D  fill:#f4f4f5,stroke:#6b7280,stroke-width:2px,color:#1f2937
    style E  fill:#e0e7ff,stroke:#6366f1,stroke-width:2px,color:#312e81
    style AI fill:#fde68a,stroke:#f59e0b,stroke-width:2px,color:#78350f
```

## Getting Started

```bash
# Node 22+, pnpm 10+
git clone https://github.com/light-cloud-com/ice.git && cd ice
pnpm install
pnpm schemas:build      # one-time, ~10-15 min, cached after
pnpm dev:all            # then open http://localhost:5173
```

Full guide: [docs/getting-started.md](docs/getting-started.md).

## Main features

<p align="center">
  <img src="docs/assets/main-features.svg" alt="ICE main features - nine capabilities bundled into one Integrated Cloud Environment" />
</p>

## Providers at a glance

| Provider | Readiness | Details |
|---|---|---|
| 🟢 **Google Cloud** | **stable** | 20 service handlers, 45+ importers, full create / update / destroy |
| 🟡 **AWS** | experimental | Major primitives deploy; parity with GCP in progress |
| 🟡 **Azure** | experimental | Major primitives deploy; parity with GCP in progress |
| ⚪ Kubernetes, Alibaba, Oracle, DigitalOcean, Tencent | design-only | Blocks render; deployers next |
| 🟢 **GitHub** | integration | PAT or device flow - drives the pipeline triggers |

Source of truth: [docs/provider-status.md](docs/provider-status.md) (mirrors `PROVIDER_READINESS` in [`packages/constants/src/providers.ts`](packages/constants/src/providers.ts)).

## Docs

|   |   |
|---|---|
| 🚀 [Getting Started](docs/getting-started.md) | Install, first run, troubleshooting |
| 🏗 [Architecture](docs/architecture.md) | How the pieces fit |
| ☁️ [Deploying to GCP](docs/deploying-to-gcp.md) | End-to-end tutorial · [AWS](docs/deploying-to-aws.md) · [Azure](docs/deploying-to-azure.md) |
| 📊 [Provider status](docs/provider-status.md) | Per-provider readiness matrix |
| 🤖 [AI assistant](docs/ai-assistant.md) | Claude integration, OpenAI-compat backends |
| 🔌 [Extending providers](docs/extending-providers.md) | Add a new cloud |
| 🧪 [Testing](docs/testing.md) | Unit · integration · GCP scenario dashboard |
| 🆘 [Troubleshooting](docs/troubleshooting.md) | Common issues |
| 📖 [Glossary](docs/glossary.md) | Block, blueprint, handler, importer, … |
| 🗺 [Roadmap](ROADMAP.md) | What's shipped, in progress, planned |

## Help

| | |
|---|---|
| 🐞 Bug or feature | [Open an issue](https://github.com/light-cloud-com/ice/issues/new/choose) |
| 💬 Question | [GitHub Discussions](https://github.com/light-cloud-com/ice/discussions) |
| 🔐 Security | [SECURITY.md](SECURITY.md) - please don't open a public issue |
| 🤝 Contributing | [CONTRIBUTING.md](CONTRIBUTING.md) |
| 📜 License | [Apache 2.0](LICENSE) · [NOTICE](NOTICE) |
