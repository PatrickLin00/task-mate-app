# Sample Data Reference

## Purpose

This file gives normalized sample records for the rebuilt app.

Use it when:

- checking whether imported data shape looks right
- comparing old and new environments
- debugging missing fields

## User Example

```json
{
  "_id": "f0df711e69b52eee00173c4b600e86a5",
  "userId": "onmiD1wOdVEhwwSez4fAn5IvP-ZA",
  "nickname": "Breeze Notes",
  "avatar": "",
  "stars": 0,
  "wisdom": 12,
  "strength": 3,
  "agility": 5,
  "onboarding": {
    "seen": true,
    "seenAt": "2026-03-15T09:05:37.514Z"
  },
  "subscribePreferences": {
    "todo": {
      "templateId": "TEMPLATE_ID",
      "status": "accepted",
      "updatedAt": "2026-03-15T09:05:37.514Z",
      "authorizedAt": "2026-03-15T09:05:37.514Z",
      "lastSentAt": null
    }
  },
  "createdAt": "2026-03-15T08:13:41.252Z",
  "updatedAt": "2026-03-15T09:05:37.514Z"
}
```

## Task Example

```json
{
  "_id": "task_001",
  "title": "Run Three Kilometers",
  "detail": "Finish a light running session together and deliver the promised reward afterward.",
  "status": "pending",
  "category": "normal",
  "creatorId": "onmiD1wOdVEhwwSez4fAn5IvP-ZA",
  "creatorName": "Breeze Notes",
  "assigneeId": "",
  "assigneeName": "",
  "ownerScope": "creator",
  "dueAt": "2026-03-22T13:00:00.000Z",
  "startAt": null,
  "submittedAt": null,
  "completedAt": null,
  "closedAt": null,
  "deleteAt": null,
  "previousTaskId": "",
  "seedKey": "",
  "subtasks": [
    {
      "title": "Finish the run",
      "current": 0,
      "total": 1
    }
  ],
  "attributeReward": {
    "type": "strength",
    "value": 1
  },
  "offlineRewardPromise": "Buy dinner",
  "createdAt": "2026-03-21T05:00:00.000Z",
  "updatedAt": "2026-03-21T05:00:00.000Z"
}
```

## Review Pending Task Example

```json
{
  "_id": "task_002",
  "title": "Finish Page Integration",
  "status": "review_pending",
  "category": "normal",
  "creatorId": "creator_openid",
  "assigneeId": "assignee_openid",
  "submittedAt": "2026-03-22T11:10:00.000Z",
  "subtasks": [
    {
      "title": "Run main flow",
      "current": 1,
      "total": 1
    }
  ],
  "attributeReward": {
    "type": "wisdom",
    "value": 1
  },
  "offlineRewardPromise": "",
  "createdAt": "2026-03-21T03:00:00.000Z",
  "updatedAt": "2026-03-22T11:10:00.000Z"
}
```

## Archive Example

```json
{
  "_id": "archive_001",
  "ownerId": "onmiD1wOdVEhwwSez4fAn5IvP-ZA",
  "sourceTaskId": "task_001",
  "status": "completed",
  "completedAt": "2026-03-22T14:00:00.000Z",
  "submittedAt": "2026-03-22T13:50:00.000Z",
  "deleteAt": "2026-03-29T14:00:00.000Z",
  "createdAt": "2026-03-22T14:00:00.000Z",
  "updatedAt": "2026-03-22T14:00:00.000Z",
  "snapshot": {
    "_id": "task_001",
    "title": "Run Three Kilometers",
    "detail": "Finish a light running session together and deliver the promised reward afterward.",
    "status": "completed",
    "category": "normal",
    "creatorId": "onmiD1wOdVEhwwSez4fAn5IvP-ZA",
    "assigneeId": "onmiD1wOdVEhwwSez4fAn5IvP-ZA",
    "subtasks": [
      {
        "title": "Finish the run",
        "current": 1,
        "total": 1
      }
    ],
    "attributeReward": {
      "type": "strength",
      "value": 1
    },
    "offlineRewardPromise": "Buy dinner"
  }
}
```

## Quick Validation Rules

When inspecting exported or migrated data, these are strong signals that shape
is correct:

- `users.userId` exists and does not start with `wx:`
- `tasks.attributeReward.value` is `1`
- `tasks.offlineRewardPromise` is a plain string
- `task_archives.snapshot` contains task-like fields
- `closed` tasks live in `tasks`, not only in `task_archives`

