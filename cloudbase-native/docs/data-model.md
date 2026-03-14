# Data Model

## Collections

### `users`

- `_openid`: WeChat user identity
- `nickname`
- `avatar`
- `stars`
- `wisdom`
- `strength`
- `agility`
- `subscribePreferences`
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

The rebuild now keeps the full legacy task-state vocabulary so the migration can
preserve existing interaction rules before any future simplification.

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
  "value": 10
}
```

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
