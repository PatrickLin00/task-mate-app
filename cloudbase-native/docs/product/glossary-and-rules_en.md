# Glossary And Rules

## Purpose

This file records product terms and rules that are easy to confuse during
maintenance.

## Product Terms

### Home

The shell tab that shows:

- top status card
- today focus
- daily challenges

### Mission

Tasks the current user is actively executing.

### Collab

Tasks created by the current user that still need creator-side attention.

Expected grouping order:

1. `review pending`
2. `pending confirmation`
3. `waiting accept`
4. `in progress`
5. `history versions`

### Archive

Snapshot records for:

- completed tasks
- review-pending records

Closed tasks are not archives.

### Closed

Task stopped by creator.

- stays in `tasks`
- can later be restarted or deleted

### Refactored / History Version

Older superseded task version kept for history-chain behavior.

### Offline Reward Promise

Plain-text creator promise such as:

- `Buy milk tea`
- `Buy dinner`
- `Go to an arcade together`

It is separate from attribute reward and should be shown below the attribute
reward line in task detail.

## Important UX Rules

### Refresh

The app does not rely on WebSocket.

Refresh happens:

- when entering the mini program
- on page show
- on pull-down refresh
- after successful task actions
- after conflict rejection returns a fresh dashboard

### Self-Created Self-Assigned Tasks

These need special care. They may appear in:

- `mission` while in progress
- `collab` when creator-side review or confirmation is needed
- `archive` as a review/completion snapshot

### Review Pending

`review_pending` means the work is already submitted and should now be decided
by review actions.

Expected detail buttons:

- `Complete task`
- `Return for further edits`

No:

- `Abandon task`
- `Rework task`
- `Close task`

### Today Focus

Rules:

- overdue tasks: all included
- tasks due today: all included
- future tasks: include nearest-by-due-date tasks, at most 5
- final order is due date ascending

### Progress Controls

Subtask progress is changed through the custom draggable progress bar, not
`-1 / +1` buttons.

### Legal Pages

Agreement entry lives at the bottom of `璁剧疆 / 浣跨敤璇存槑`.

- `Terms of Service`
- `Privacy Policy`

Privacy page should expose the WeChat privacy-contract entry link.

