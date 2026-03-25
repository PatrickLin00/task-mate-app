# 故障排查

## 1. 用户资料为空或异常

检查：

- `users` 中当前 `userId` 是否唯一
- 当前环境是否正确
- 如怀疑存在迁移遗留脏数据，执行 `scripts/check-cloud-data-integrity.js <envId>`

## 2. 某个状态下按钮不对

同时检查：

- `pages/home/index.js` 和 `index.wxml`
- `cloudfunctions/taskGateway/index.js`

## 3. 关闭任务意外消失

检查：

- collab 过滤逻辑
- close / delete 规则
- 是否有清理逻辑误伤

## 4. AI 草稿失败

检查：

- 函数是否已上传
- 环境变量是否完整
- provider 返回格式是否仍兼容

## 5. 订阅消息未到达

检查：

- 模板 ID
- 环境变量
- 用户授权状态
- 定时器和发送标记

## 6. 云函数提示资源不存在

通常是：

- 函数未上传
- 环境错误
- 小程序绑定了错误的 CloudBase 环境
