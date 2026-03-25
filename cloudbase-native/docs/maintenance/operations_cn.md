# 运维说明

## 日常关注点

- 当前云环境是否正确
- 生产函数是否已更新到目标版本
- 订阅模板 ID 是否前后端一致
- 数据库索引是否齐全

## 例行操作

### 切换环境

- 修改 `miniprogram/config/cloud.js`
- 或使用 `scripts/set-cloud-env.js <envId>`

### 发布函数

按顺序上传：

1. `taskGateway`
2. `generateTaskByAI`
3. `moderateContent`
4. `subscribeScheduler`

### 验证后观察

- bootstrap 是否正常
- 任务流是否正常
- AI 与审核函数是否超时
- 订阅消息是否正确落地
