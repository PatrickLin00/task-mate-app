# 维护指南

## 建议阅读顺序

1. `../overview/system-reference_cn.md`
2. `../overview/tech-stack_cn.md`
3. `../overview/technical-challenges_cn.md`
4. `../architecture/task-state-machine_cn.md`
5. `../architecture/cloud-functions_cn.md`
6. `config-matrix_cn.md`

## 重要文件

### 前端

- `miniprogram/pages/home/index.js`
- `miniprogram/pages/home/index.wxml`
- `miniprogram/pages/home/index.wxss`
- `miniprogram/utils/api.js`

### 后端

- `cloudfunctions/taskGateway/index.js`
- `cloudfunctions/generateTaskByAI/index.js`
- `cloudfunctions/moderateContent/index.js`
- `cloudfunctions/subscribeScheduler/index.js`
- `cloudfunctions/adminMaintenance/index.js`

## 相关文档

- `../architecture/data-model_cn.md`
- `../product/glossary-and-rules_cn.md`
- `change-playbook_cn.md`
- `development-workflows_cn.md`
- `backend-maintenance_cn.md`

## 安全变更清单

变更任务逻辑前应检查：

1. 前端按钮显隐
2. `taskGateway` 状态校验
3. dashboard 分组
4. archive 副作用
5. 提醒副作用

变更字段结构前应检查：

1. `data-model_cn.md`
2. 云函数读写
3. 样例数据说明

## 主线分支规则

- 不再把旧版源码重新放回本分支
- 不提交私有导出数据、密钥、日志
- 文档应围绕当前运行时，而不是一次性迁移历史
