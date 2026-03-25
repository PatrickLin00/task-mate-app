# Task Mate CloudBase Native

This directory contains the current production-facing codebase for Task Mate.

## Final Technical Direction

- Native WeChat Mini Program
- CloudBase Cloud Functions
- CloudBase Database
- Pull-based refresh instead of WebSocket push
- Server-side AI generation and moderation boundaries

The older Taro + Express + MongoDB implementation is archived in the Git
branch `archive/legacy-express-taro` and is no longer part of this branch.

## Why This Version Exists

The project intentionally favors:

- low deployment complexity inside the WeChat ecosystem
- one-shell interaction flow for fast task actions
- simpler data consistency through full dashboard refresh
- clear backend boundaries for AI and subscribe messaging

## Current Runtime Layout

- `miniprogram/`
  - native Mini Program source
- `cloudfunctions/`
  - task, AI, moderation, and scheduler functions
- `docs/`
  - grouped bilingual project documentation
- `scripts/`
  - lightweight maintenance helpers still relevant to the current runtime

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

