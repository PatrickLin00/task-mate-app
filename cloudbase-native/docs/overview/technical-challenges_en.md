# Technical Challenges

## Purpose

This document explains the non-trivial engineering problems in the current
Task Mate mainline and the implementation choices used to solve them.

## Challenge 1: Shared Tasks Must Open From Links Without Full Dashboard Access

### Problem

A collaborative task may be opened by a user who does not yet have that task
inside their own dashboard data.

If the frontend only looks for the task in local dashboard state, shared-link
open will fail even though the link itself is valid.

### Current Solution

- the Mini Program accepts an `openTaskId` from the launch or page query
- the home page first checks the current dashboard
- if the task is not present locally, it calls `taskGateway.getTask`
- `taskGateway` returns either:
  - a normal preview for a pending, unclaimed task
  - a locked preview for any non-pending state

## Challenge 2: Multiple Progress Updates Must Not Partially Succeed

### Problem

The detail view can submit progress changes for multiple subtasks in one user
action. If each write reuses the same stale `updatedAt`, the first write
changes the task version and later writes fail with a version conflict.

### Current Solution

- progress updates are sent sequentially
- after each successful `updateProgress` call, the frontend stores the returned
  latest `updatedAt`
- the next subtask write uses that refreshed version

## Challenge 3: Avoid Silent Overwrites In Multi-Actor Task Flows

### Problem

Task state can change between two user actions, especially in review, rework,
and collaborative execution flows.

### Current Solution

- critical writes carry the last known `updatedAt`
- `taskGateway` compares the incoming version against the latest task record
- mismatches return a conflict response plus a fresh dashboard snapshot
- the frontend immediately refreshes local state after conflict

## Challenge 4: Keep The UI Simple Without Losing Workflow Coverage

### Problem

The app supports create, accept, progress update, review, rework, archive,
profile editing, and challenge flows. A multi-page design would increase
navigation complexity and duplicated loading logic.

### Current Solution

- one main shell page hosts all tabs
- task detail, create, rework, and profile editing use modal overlays
- successful mutations trigger a dashboard refresh instead of deep page reloads

## Challenge 5: Keep AI Optional Instead Of Making It A Hard Dependency

### Problem

AI draft generation and moderation improve usability, but core task management
must still work when the provider is unavailable or not configured.

### Current Solution

- AI is isolated behind `generateTaskByAI` and `moderateContent`
- the normal create-task path remains available without AI
- moderation uses local checks first and model-backed checks second
- provider failures degrade gracefully instead of blocking the whole app

## Challenge 6: Reminders Depend On One-Shot Subscribe Permissions

### Problem

WeChat subscribe messages are not permanent opt-ins. Users often need to
re-authorize after successful sends.

### Current Solution

- subscription state is stored per user scene
- successful sends can move the scene into `pending_reauth`
- the frontend keeps a dedicated settings and authorization path
- reminder sending stays in `subscribeScheduler`, not in UI code

## What To Recheck When Editing These Areas

1. shared-link task open
2. optimistic write conflict handling
3. multi-subtask progress updates
4. modal action visibility by task state
5. subscribe authorization state after sends
6. AI fallback behavior when provider config is missing
