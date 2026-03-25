# Cloud Functions

## Overview

The current runtime keeps the backend surface small and explicit.

Production functions:

- `taskGateway`
- `generateTaskByAI`
- `moderateContent`
- `subscribeScheduler`

## taskGateway

### Role

Main business gateway for profile, dashboard, task detail, and task mutations.

### Why One Gateway

- fewer deployment units
- shared validation helpers
- easier consistency across state transitions
- simpler Mini Program API usage

### Main Responsibilities

- bootstrap
- get task detail
- create task
- accept task
- update progress
- submit and continue review
- complete, abandon, close, restart
- rework flow
- archive delete
- subscribe settings
- onboarding completion

## generateTaskByAI

### Role

Converts short user prompts into structured task drafts.

### Notes

- server-side only
- fallback remains usable if the provider fails

## moderateContent

### Role

Moderates nickname and task text.

### Pattern

- local blocklist first
- model-backed moderation second
- safe fallback if provider is unavailable

## subscribeScheduler

### Role

Handles timed reminder delivery.

Current reminder types:

- due soon
- overdue
- expired daily challenge cleanup

## Shared Runtime Rules

- functions return `ok: true, data: ...` or `ok: false, error: ...`
- provider secrets stay inside cloud functions
- business rules are enforced server-side, not only in UI conditions

