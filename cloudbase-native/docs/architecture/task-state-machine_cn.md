# 任务状态机

## 状态列表

- `pending`
- `in_progress`
- `review_pending`
- `pending_confirmation`
- `completed`
- `closed`
- `refactored`

## 含义

### `pending`

已创建但未接取。

### `in_progress`

已接取并执行中。

### `review_pending`

已提交，等待确认或退回继续。

### `pending_confirmation`

用于重构后的确认流程。

### `completed`

任务已完成，并应当生成归档快照。

### `closed`

由创建者关闭，但不是完成归档。

### `refactored`

旧版本任务，保留在链路历史中。

## 维护提醒

任务规则变更不能只改后端，还要同步检查：

- 详情按钮显隐
- 列表分组展示
- archive 生成逻辑
- onboarding mock 流程
