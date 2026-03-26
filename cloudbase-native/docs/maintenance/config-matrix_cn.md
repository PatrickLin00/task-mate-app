# 配置矩阵

## 小程序侧

- `miniprogram/app.json`
- `miniprogram/app.js`
- `miniprogram/config/cloud.js`
  - 公共云初始化包装层，从私有配置读取真实环境
- `miniprogram/config/private.js`
  - 真实私有 `envId`，不提交到仓库
- `miniprogram/config/private.template.js`
  - 私有配置模板
- `project.private.config.json`
  - 可选的微信开发者工具私有配置，不提交到仓库
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

## 本地辅助脚本

- `scripts/set-cloud-env.js`
  - 更新 `miniprogram/config/private.js`
- `../build-private-package.js`
  - 生成可在仓库根目录直接解压恢复的私有 zip 包

## 排查顺序

运行环境切换后如果行为异常，优先检查：

1. `miniprogram/config/private.js`
2. 云函数环境变量
3. 模板 ID
4. 集合结构
5. 索引
