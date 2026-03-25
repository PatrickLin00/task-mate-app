# 系统总览

## 作用

这份文档用于快速说明当前 Task Mate 的运行方式、主要代码位置以及变更时必须注意的约束。

## 项目概述

Task Mate 是一个用于轻量协作任务管理的微信小程序，带有少量成长与奖励元素。

## 当前运行时

### 前端

- 微信原生小程序
- 主页面为 `miniprogram/pages/home`
- 任务详情、创建、重构、资料编辑均在页内弹层完成

### 后端

- CloudBase 云函数
- CloudBase 数据库
- 订阅消息由云侧统一发送

### AI

- `generateTaskByAI`
- `moderateContent`

## 关键目录

- `miniprogram/`
- `cloudfunctions/`
- `docs/`
- `scripts/`

## 核心设计

- 单页壳而不是多页面任务流
- 不使用 WebSocket
- 任务写入依赖 `updatedAt` 冲突保护
- 业务规则统一收敛在云函数

## 变更前必须检查

1. 前端按钮显隐
2. `taskGateway` 权限和状态校验
3. dashboard 分组逻辑
4. archive 副作用
5. 订阅消息副作用

## 相关文档

- `tech-stack_cn.md`
- `technical-challenges_cn.md`
- `../architecture/architecture_cn.md`
- `../architecture/task-state-machine_cn.md`
- `../maintenance/maintainer-guide_cn.md`
