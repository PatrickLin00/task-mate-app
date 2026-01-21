# API Usage Guide

This file documents backend endpoints and how the current client uses them.
Status legend:
- active: used by the current client flow
- legacy: still available but not used after dashboard aggregation
- dev-only: available only when NODE_ENV != production

## Auth
- POST `/api/auth/weapp/login` (active)
  - Purpose: exchange weapp code for token/userId.
  - Trigger: ensureWeappLogin when no token.
- POST `/api/auth/dev/login` (dev-only)
  - Purpose: dev login with a userId.
  - Trigger: ensureWeappLogin when DEV_AUTH_ENABLED=true.
- GET `/api/auth/weapp/profile` (active)
  - Purpose: fetch user profile (nickname, stats).
  - Trigger: app init on index page.
- POST `/api/auth/weapp/profile` (active)
  - Purpose: update nickname/avatar.
  - Trigger: nickname update flow.

## Tasks - Aggregation
- GET `/api/tasks/dashboard` (active)
  - Purpose: aggregated tasks for Home + Tasks panes.
  - Trigger: HomePane/TasksPane initial load and refresh.
  - Returns: creator/assignee/completed/history/today/challenge.

## Tasks - Lists (legacy)
- GET `/api/tasks/mission` (legacy)
  - Purpose: assignee tasks list.
  - Trigger: older TasksPane flow.
- GET `/api/tasks/collab` (legacy)
  - Purpose: creator tasks list.
  - Trigger: older TasksPane flow.
- GET `/api/tasks/archive` (legacy)
  - Purpose: archived/completed list.
  - Trigger: older TasksPane flow.
- GET `/api/tasks/today` (legacy)
  - Purpose: due-today list.
  - Trigger: older HomePane flow.
- GET `/api/tasks/challenge` (legacy)
  - Purpose: challenge list.
  - Trigger: older HomePane flow.
- GET `/api/tasks` (legacy)
  - Purpose: list by status.
  - Trigger: not used by current UI.

## Tasks - Single task
- GET `/api/tasks/:id` (active)
  - Purpose: fetch one task by id.
  - Trigger: task detail cache-miss; share-link modal; refreshModalTask fallback.

## Tasks - Actions (active)
- POST `/api/tasks` (active)
  - Purpose: create task.
  - Trigger: create task/one-line adventure flow.
- POST `/api/tasks/:id/accept` (active)
  - Purpose: accept a task.
  - Trigger: accept task from share or list.
- POST `/api/tasks/challenge/:id/accept` (active)
  - Purpose: accept a challenge task.
  - Trigger: challenge accept button.
- PATCH `/api/tasks/:id/progress` (active)
  - Purpose: update subtask progress.
  - Trigger: slider/stepper change in task modal.
- PATCH `/api/tasks/:id/review` (active)
  - Purpose: submit review.
  - Trigger: assignee submits for review.
- PATCH `/api/tasks/:id/review/continue` (active)
  - Purpose: continue after review rejection.
  - Trigger: continue review action.
- PATCH `/api/tasks/:id/complete` (active)
  - Purpose: complete task.
  - Trigger: assignee or creator completes.
- PATCH `/api/tasks/:id/abandon` (active)
  - Purpose: abandon task.
  - Trigger: assignee abandons.
- PATCH `/api/tasks/:id/close` (active)
  - Purpose: close task.
  - Trigger: creator closes.
- PATCH `/api/tasks/:id/restart` (active)
  - Purpose: restart task.
  - Trigger: creator restarts after close/abandon.
- PATCH `/api/tasks/:id/refresh` (active)
  - Purpose: refresh task schedule.
  - Trigger: task reschedule flow.
- DELETE `/api/tasks/:id` (active)
  - Purpose: delete task.
  - Trigger: delete action on task card.
- POST `/api/tasks/:id/rework` (active)
  - Purpose: rework task.
  - Trigger: creator rework flow.
- POST `/api/tasks/:id/rework/accept` (active)
  - Purpose: accept rework.
  - Trigger: assignee accepts.
- POST `/api/tasks/:id/rework/reject` (active)
  - Purpose: reject rework.
  - Trigger: assignee rejects.
- POST `/api/tasks/:id/rework/cancel` (active)
  - Purpose: cancel rework.
  - Trigger: creator cancels.

## Tasks - Debug (dev-only)
- GET `/api/tasks/debug` (dev-only)
  - Purpose: read task debug flag.
  - Trigger: manual or tooling.
- POST `/api/tasks/debug` (dev-only)
  - Purpose: toggle task debug flag.
  - Trigger: manual or tooling.

## AI
- POST `/api/ai/generate-task` (active)
  - Purpose: generate task suggestion text.
  - Trigger: "starwish generate" flow.
