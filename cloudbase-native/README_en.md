# Task Mate CloudBase Native

This directory contains the current production-facing codebase for Task Mate.

## Final Technical Direction

- Native WeChat Mini Program
- CloudBase Cloud Functions
- CloudBase Database
- Pull-based refresh instead of WebSocket push
- Server-side AI generation and moderation boundaries

## Product Evolution

The project started from a broader architecture with a separate frontend,
standalone backend, and socket-driven refresh flow.

As the product became more clearly WeChat-first, the implementation was
simplified around that delivery target:

- lower deployment complexity inside the WeChat ecosystem
- one-shell interaction flow for fast task actions
- simpler data consistency through full dashboard refresh
- clear backend boundaries for AI and subscribe messaging

The older Taro + Express + MongoDB implementation remains available in the Git
branch `archive/legacy-express-taro` for historical reference.

## Current Runtime Layout

- `miniprogram/`
  - native Mini Program source
- `cloudfunctions/`
  - task, AI, moderation, and scheduler functions
- `docs/`
  - grouped bilingual project documentation
- `scripts/`
  - lightweight maintenance helpers still relevant to the current runtime

## Private Runtime Restore

The public repository does not ship with the real private Mini Program runtime
config.

Required private file:

- `miniprogram/config/private.js`

Optional private file:

- `project.private.config.json`

Normal restore flow:

1. keep your generated private zip outside Git
2. extract it at the repository root
3. confirm `miniprogram/config/private.js` exists again
4. continue working in DevTools and local scripts as usual

The restore path is intentionally designed so that, once the zip is extracted
at the repository root, development and testing behave the same way as before
the public redaction.

## Core Cloud Functions

- `taskGateway`
  - profile, dashboard, task detail, and task mutations
- `generateTaskByAI`
  - turns short prompts into task drafts
- `moderateContent`
  - local plus model-backed moderation
- `subscribeScheduler`
  - timed reminders for due soon and overdue tasks

## Key Product Flows

- bootstrap profile and dashboard
- create task
- open shared task
- accept task
- update progress
- submit review
- continue review
- complete task
- abandon task
- close and restart task
- daily challenge preview and acceptance
- rework flow
- subscribe-message consent capture and delivery

## Docs Map

Read in this order if you are new here:

1. `docs/README_en.md`
2. `docs/overview/system-reference_en.md`
3. `docs/overview/tech-stack_en.md`
4. `docs/overview/technical-challenges_en.md`
5. `docs/maintenance/maintainer-guide_en.md`

Chinese documentation is available in the corresponding `_cn.md` files.
