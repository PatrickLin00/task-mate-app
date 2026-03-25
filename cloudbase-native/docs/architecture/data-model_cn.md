# 数据模型

## 集合

### `users`

核心字段：

- `userId`
- `nickname`
- `avatar`
- `wisdom`
- `strength`
- `agility`
- `subscribePreferences`
- `onboarding`

### `tasks`

核心字段：

- `title`
- `detail`
- `status`
- `category`
- `creatorId`
- `assigneeId`
- `subtasks`
- `attributeReward`
- `offlineRewardPromise`
- `dueAt`
- `previousTaskId`
- `seedKey`
- `updatedAt`

### `task_archives`

核心字段：

- `ownerId`
- `sourceTaskId`
- `status`
- `snapshot`
- `completedAt`
- `submittedAt`
- `updatedAt`

## 状态集合

- `pending`
- `in_progress`
- `review_pending`
- `pending_confirmation`
- `completed`
- `closed`
- `refactored`

## 当前约束

- `userId` 不应再带旧前缀
- `closed` 任务保留在 `tasks`
- `review_pending` 和 `completed` 快照进入 `task_archives`
- `offlineRewardPromise` 为可选文本字段
