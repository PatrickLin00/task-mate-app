# 修改指引

## 改按钮显隐或详情动作

改：

- `miniprogram/pages/home/index.js`
- `miniprogram/pages/home/index.wxml`
- `miniprogram/pages/home/index.wxss`
- `cloudfunctions/taskGateway/index.js`

## 改状态机逻辑

改：

- `cloudfunctions/taskGateway/index.js`
- `miniprogram/pages/home/index.js`
- `../architecture/task-state-machine_cn.md`
- `../product/glossary-and-rules_cn.md`

## 改创建表单或 AI 草稿

改：

- `miniprogram/pages/home/index.js`
- `miniprogram/pages/home/index.wxml`
- `cloudfunctions/taskGateway/index.js`
- `cloudfunctions/generateTaskByAI/index.js`
- `../architecture/data-model_cn.md`

## 改环境配置或上线方式

改：

- `miniprogram/config/cloud.js`
- `scripts/set-cloud-env.js`
- `project.config.json`
- `config-matrix_cn.md`
- `release-and-rollback_cn.md`

## 经验规则

如果改了运行逻辑却没改文档，通常说明变更还没有收尾。
