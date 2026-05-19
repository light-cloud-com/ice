<!--
Thanks for the PR. A few pointers from CONTRIBUTING.md:

- One logical change per PR. Split refactors from behaviour changes.
- Commit messages: imperative mood ("Add X", not "Added X").
- Rebase on main before opening; we merge with squash.
- Add tests for new behaviour; include a regression test for bug fixes.
- Don't weaken the Electron security model (nodeIntegration, contextIsolation, sandbox).
-->

## Summary

<!-- What does this change do, and why? 1-3 sentences. Link the issue it closes if any. -->

Closes #

## What changed

<!-- Short bullet list of the concrete edits. Mention files or areas, not line numbers. -->

-
-

## How I tested

<!-- What you ran locally. Delete rows that don't apply. -->

- [ ] `pnpm typecheck`
- [ ] `pnpm lint:check`
- [ ] `pnpm format:check`
- [ ] `pnpm test:unit`
- [ ] Manual check in `pnpm dev:all` / `pnpm dev:desktop`
- [ ] New / updated tests added

## Screenshots / recordings

<!-- Optional. Required for any visible UI change. -->

## Notes for reviewers

<!-- Anything that would help a reviewer: tricky bits, follow-ups, deliberate non-changes. -->
