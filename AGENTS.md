# Flow4Gold working agreement

- Read `PROJECT_BRIEF.md` when domain context is needed. The state machine owns the process; n8n performs tasks; AI makes bounded decisions.
- Follow KISS: focus on essentials, make small reviewable changes, and stop at agreed review breakpoints.
- Delegate bounded implementation or research to sub-agents with explicit file ownership. Do not revert others' work. Keep the main conversation focused on decisions and results.
- Keep this file limited to durable instructions. Put progress and temporary findings in task notes or `README.md`. Do not run `update-ai` automatically; it expands this deliberately concise file.

## Workspace

- Run commands from the project directory containing `package.json` and `n8nac-config.json`.
- Install with `npm ci`. Use the pinned CLI through `npm run n8n -- ...`, not a global installation or unpinned `npx`.
- Resolve the active environment with `npm run n8n -- env status --json` before workflow work. Use its `workflowsPath`; manage configuration through the CLI, not by hand or from snapshots in this file.
- Within that workflow directory, put the core runtime in `flow4gold/` and task workflows in `flow4gold/tasks/`. Folder sync mirrors this layout in n8n.
- Once a machine version has recorded events, keep its definition immutable; change the version for lifecycle changes. Replay reconstructs state and must never execute tasks.
- Runtime definitions come from `machine_definitions`; local machine JSON files are seed/reference examples. Save new immutable versions through the editor/API, not by overwriting a recorded definition.
- Preserve user canvas edits: pull the core, then explicitly run `npm run core:layout` to capture an intended alignment before rebuilding. Core positions live in `runtime/core-layout.json`; `npm run format:core:check` verifies readable Code nodes and generated content.
- Keep credentials in environment variables or the local secret store, out of source control and tool output. Never print `.env` or secret-store contents.

## Workflow changes

1. Before editing an existing remote workflow, pull it with `npm run n8n -- pull <workflow-id>`. Preserve unpushed local changes before pulling.
2. Edit the project's workflow sources. Look up node schemas with `npm run n8n -- skills ...` when needed.
3. Run `npm run validate`; keep that script aligned with the project workflows. Fix validation failures rather than bypassing them.
4. Push only the intended project source with `npm run n8n -- push <path-to-workflow.workflow.ts> --verify`. Updating a published workflow may publish changes; add `--draft` when publication is not intended.
5. Keep scaffolds inactive. Confirm remote folder placement after creating workflows; a flat-placement warning means folder setup is incomplete.
