# 配置矩阵

## 小程序侧

- `miniprogram/app.json`
- `miniprogram/app.js`
- `miniprogram/config/cloud.js`
- `miniprogram/config/strings.js`
- `miniprogram/config/legal-strings.js`
- `miniprogram/config/subscribe.js`

## 云函数环境变量

### taskGateway

- `WEAPP_APPID`
- `WEAPP_SECRET`
- `SUBSCRIBE_TPL_TODO`
- `SUBSCRIBE_TPL_TASK_UPDATE`
- `SUBSCRIBE_TPL_REVIEW`
- `SUBSCRIBE_TPL_WORK`

### generateTaskByAI / moderateContent

- `HUNYUAN_API_KEY`
- `HUNYUAN_BASE_URL` 可选
- `HUNYUAN_MODEL` 可选

### subscribeScheduler

- 与 `taskGateway` 相同的订阅消息配置
- 定时器配置见 `cloudfunctions/subscribeScheduler/config.json`

## 数据库

集合：

- `users`
- `tasks`
- `task_archives`

推荐索引：

- `tasks.creatorId + updatedAt`
- `tasks.assigneeId + updatedAt`
- `tasks.seedKey`
- `tasks.status + dueAt`
- `task_archives.ownerId + updatedAt`
- `task_archives.sourceTaskId`
