# Getting Help

ICE is maintained by a small team. We don't run a 24/7 support desk, but we do read every issue and discussion. This page tells you where to go for what.

## Quick router

| You want to… | Go to |
|---|---|
| Report a bug | [Open a bug issue](https://github.com/light-cloud-com/ice/issues/new?template=bug.yml) |
| Suggest a feature | [Open a feature issue](https://github.com/light-cloud-com/ice/issues/new?template=feature.yml) |
| Ask "how do I…" or "is this normal?" | [GitHub Discussions](https://github.com/light-cloud-com/ice/discussions) |
| Report a security vulnerability | **Do not open an issue.** See [SECURITY.md](SECURITY.md) |
| Ask about ICE Cloud (hosted) or commercial support | Email **julia@light-cloud.com** |
| Read the docs | [docs/](docs/) (start at [docs/README.md](docs/README.md)) |
| Check what's planned | [ROADMAP.md](ROADMAP.md) |

## Before you file an issue

A small amount of homework makes the difference between an issue that gets fixed in days and one that bounces back asking for more info.

1. **Search first.** [Open and closed issues](https://github.com/light-cloud-com/ice/issues?q=is%3Aissue). Someone may already have hit your problem.
2. **Reproduce on a clean checkout** if you can. Bugs that only appear in a heavily customised setup are hard for us to act on.
3. **Capture the basics:** ICE version, Node version, OS, web vs desktop, exact command run, full error output.
4. **Use the templates.** The [bug template](.github/ISSUE_TEMPLATE/bug.yml) and [feature template](.github/ISSUE_TEMPLATE/feature.yml) ask the questions we need answered anyway.

## What we can and can't help with

**In scope:**

- Bugs in the code in this repository.
- Onboarding friction (install fails, dev server won't start, deploy fails with an unclear error).
- Feature requests that fit ICE's direction - see [ROADMAP.md](ROADMAP.md) for the shape of that.
- Documentation gaps or mistakes.

**Out of scope (we'll still try to point you somewhere helpful):**

- Generic GCP / AWS / Azure questions unrelated to ICE - try the cloud provider's docs or community forums.
- "Why is my GCP bill high?" - ICE doesn't bill you; Google does. Check the GCP billing console.
- Custom integrations or one-off consulting - email us about commercial support.
- Issues against forks of ICE - we can only support `light-cloud-com/ice`.

## Response expectations

We aim to **acknowledge** issues within a few working days. Triage and fixes are best-effort and prioritised by severity and reach. If something is silent for more than a week, a polite `@mention` on the issue is welcome - it's almost certainly fallen through, not been ignored on purpose.

Security reports follow their own timeline - see [SECURITY.md](SECURITY.md).

## Commercial support

If you need a guaranteed response SLA, custom integration work, or hands-on help running ICE in production, email **julia@light-cloud.com**. Self-hosting will always be fully supported in the free open-source sense - paid support is opt-in, not gating.
