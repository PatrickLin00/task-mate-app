# 架构说明

## 总体结构

当前系统由四部分组成：

- 微信原生小程序
- Cloud Functions
- Cloud Database
- 服务端 AI 调用

## 关键决策

1. 不再保留独立 Express 服务。
2. 不使用长连接 WebSocket。
3. 页面以 dashboard 全量刷新为主。
4. 核心业务逻辑集中在 `taskGateway`。
5. AI 生成和审核独立成专门函数。
6. 任务写入必须经过版本冲突校验。
7. 主交互停留在单页壳内完成。

## 运行流程

1. 小程序启动并初始化云环境。
2. 首页调用 `taskGateway.bootstrap`。
3. 云函数返回资料和 dashboard。
4. 用户操作通过 action 路由进入 `taskGateway`。
5. 写入成功后前端刷新 dashboard。
6. 如出现版本冲突，后端返回新 dashboard，前端立即覆盖本地状态。
