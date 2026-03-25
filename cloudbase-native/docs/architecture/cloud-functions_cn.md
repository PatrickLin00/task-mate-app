# 云函数说明

## 当前生产函数

- `taskGateway`
- `generateTaskByAI`
- `moderateContent`
- `subscribeScheduler`

## taskGateway

负责：

- bootstrap
- 任务详情
- 创建任务
- 接取任务
- 更新进度
- 提交检视与继续检视
- 完成、放弃、关闭、重启
- 重构链路
- 归档删除
- 订阅设置
- 新手引导完成

## generateTaskByAI

把短提示语转换为结构化任务草稿。

## moderateContent

负责昵称和任务文本审核。

## subscribeScheduler

负责定时提醒：

- 即将到期
- 已逾期
- 每日挑战过期清理

## 共通规则

- 返回结构统一为 `ok/data` 或 `ok/error`
- 外部服务密钥只存在于云函数
- 最终业务规则以后端为准
