# Data Model

## Collections

### `users`

- `_id`
- `userId`: normalized bare OpenID used by business logic
- `nickname`
- `avatar`
- `stars`
- `wisdom`
- `strength`
- `agility`
- `subscribePreferences`
- `onboarding`
- `createdAt`
- `updatedAt`

### `tasks`

- `_id`
- `title`
- `detail`
- `icon`
- `status`
- `category`
- `creatorId`
- `creatorName`
- `assigneeId`
- `assigneeName`
- `ownerScope`
- `dueAt`
- `startAt`
- `submittedAt`
- `completedAt`
- `closedAt`
- `deleteAt`
- `originalDueAt`
- `originalStartAt`
- `originalStatus`
- `previousTaskId`
- `seedKey`
- `dueSoonNotifiedAt`
- `overdueNotifiedAt`
- `challengeExpiredNotifiedAt`
- `subtasks`
- `attributeReward`
- `offlineRewardPromise`
- `createdAt`
- `updatedAt`

### `task_archives`

- `_id`
- `ownerId`
- `sourceTaskId`
- `status`
- `snapshot`
- `completedAt`
- `submittedAt`
- `deleteAt`
- `createdAt`
- `updatedAt`

## Statuses

- `pending`
- `in_progress`
- `review_pending`
- `pending_confirmation`
- `completed`
- `closed`
- `refactored`

The current runtime keeps the full task-state vocabulary so interaction rules
stay stable and explicit.

## Task Categories

- `normal`
- `challenge`
- `system`

## Subtask Shape

```json
{
  "title": "Write outline",
  "current": 0,
  "total": 1
}
```

## Reward Shape

```json
{
  "type": "wisdom",
  "value": 1
}
```

## Offline Reward Promise

`tasks.offlineRewardPromise` is optional plain text.

Purpose:

- record creator-promised offline reward or exchange
- display clearly in task detail
- require creator confirmation before create when non-empty

Examples:

- `璇峰枬濂惰尪`
- `璇峰悆楗璥
- `涓€璧峰幓缃戝惂`

## Subscribe Preference Shape

`users.subscribePreferences` is keyed by scene:

```json
{
  "todo": {
    "templateId": "TEMPLATE_ID",
    "status": "accepted",
    "updatedAt": "2026-03-14T10:00:00.000Z",
    "authorizedAt": "2026-03-14T10:00:00.000Z",
    "lastSentAt": ""
  },
  "taskUpdate": {
    "templateId": "TEMPLATE_ID",
    "status": "pending_reauth",
    "updatedAt": "2026-03-14T10:00:00.000Z",
    "authorizedAt": "2026-03-14T09:58:00.000Z",
    "lastSentAt": "2026-03-14T10:00:00.000Z"
  }
}
```

Supported scenes:

- `todo`
- `taskUpdate`
- `review`
- `work`

## Important Normalization Rules

- `userId` must not use the old `wx:` prefix
- system identities may still use `sys:` prefixes where semantically intended
- `closed` tasks stay in `tasks`
- `review_pending` and `completed` records should exist in `task_archives`

