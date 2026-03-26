# Task Mate CloudBase 原生版

这是 Task Mate 当前的主线项目目录，面向公开仓库与后续主分支维护。

## 最终技术路线

- 微信原生小程序
- CloudBase 云函数
- CloudBase 数据库
- 通过全量刷新和冲突校验保证一致性
- AI 生成与审核仅在服务端执行

## 当前功能范围

- 个人任务创建与执行
- 协作任务分享与接取
- 子任务进度更新
- 提交检视、退回继续、完成任务
- 重构任务链路
- 每日挑战
- 归档与个人属性成长
- 订阅消息授权与提醒

## 目录说明

- `miniprogram/`：小程序端代码
- `cloudfunctions/`：云函数代码
- `docs/`：项目文档
- `scripts/`：当前仍有价值的本地辅助脚本

## 私有运行配置恢复

公开仓库不会直接包含真实私有运行配置。

必须恢复的私有文件：

- `miniprogram/config/private.js`

可选恢复文件：

- `project.private.config.json`

推荐恢复流程：

1. 将私有 zip 保存在 Git 之外
2. 在仓库根目录直接解压
3. 确认 `miniprogram/config/private.js` 已恢复
4. 后续继续按原来的 DevTools 和本地脚本流程开发测试

这套恢复方式的目标就是：只要 zip 在仓库根目录解压成功，后续开发和测试习惯与保密改造前保持一致。

## 推荐阅读

1. `docs/README_cn.md`
2. `docs/overview/system-reference_cn.md`
3. `docs/overview/tech-stack_cn.md`
4. `docs/overview/technical-challenges_cn.md`
5. `docs/maintenance/maintainer-guide_cn.md`

## 说明

旧版 Taro + Express + MongoDB 已存档在 `archive/legacy-express-taro` 分支，不再属于本分支内容。
