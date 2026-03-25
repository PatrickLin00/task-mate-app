# System Reference

## Purpose

This is the shortest high-level reference for the current Task Mate codebase.

Use it when you need to answer:

- what the app is
- where the core logic lives
- which design choices are intentional
- what to check before changing behavior

## Product Summary

Task Mate is a WeChat Mini Program for collaborative task execution with a
light reward system.

The current version is intentionally CloudBase-native.

## Runtime Stack

### Frontend

- native WeChat Mini Program
- one main shell page: `miniprogram/pages/home`
- modal-driven create, detail, rework, and profile editing

### Backend

- Cloud Functions
- Cloud Database
- subscribe-message delivery through cloud-side calls

### AI

- `generateTaskByAI`
- `moderateContent`

AI stays behind cloud-function boundaries and is never called directly from the
Mini Program client.

## Source Directories

- `miniprogram/`
- `cloudfunctions/`
- `docs/`
- `scripts/`

This branch no longer includes the old frontend/backend implementation.

## Core Functions

### taskGateway

Main action gateway for:

- bootstrap
- task detail
- profile update
- task creation
- task mutations
- onboarding completion
- subscribe settings

### generateTaskByAI

Creates structured task drafts from short prompts.

### moderateContent

Blocks unsafe nickname and task text.

### subscribeScheduler

Sends due-soon and overdue reminders.

## Collections

- `users`
- `tasks`
- `task_archives`

Details live in `../architecture/data-model_en.md`.

## Key Design Choices

### One-shell frontend

Primary task operations stay on one page. This reduces navigation churn and
keeps state refresh predictable.

### Pull refresh instead of push sync

The app does not use WebSocket. Data refresh happens on:

- app entry
- page show
- pull-to-refresh
- successful mutations
- conflict responses

### Conflict-safe writes

Task mutations carry the last known `updatedAt`. If the task has changed, the
backend rejects the write and the client refreshes from a fresh dashboard.

### Cloud-only business rules

State transitions are enforced in Cloud Functions, not only in the frontend.

## Before Changing Behavior

Check all of these:

1. detail action visibility
2. `taskGateway` permission and state assertions
3. dashboard grouping
4. archive side effects
5. subscribe side effects

## Related Docs

- `tech-stack_en.md`
- `technical-challenges_en.md`
- `../architecture/architecture_en.md`
- `../architecture/task-state-machine_en.md`
- `../maintenance/maintainer-guide_en.md`

