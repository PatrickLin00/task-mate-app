# 开发工作流

## 目的

本文说明当前 CloudBase 原生项目真实可用的开发、调试、测试和部署方式。

## 开发模式

### 1. 前端界面迭代

适用于页面布局、文案、弹窗交互、按钮显示逻辑等修改。

步骤：

1. 用微信开发者工具打开 `cloudbase-native`
2. 确认 AppID 和云开发环境
3. 修改 `miniprogram/` 下代码
4. 在开发者工具中预览或重新编译
5. 手动验证对应 tab 或弹窗流程

### 2. 云函数逻辑迭代

适用于任务规则、权限、AI、审核、订阅提醒等后端逻辑修改。

步骤：

1. 修改 `cloudfunctions/` 下对应函数
2. 本地做基础语法校验
3. 在微信开发者工具中上传并部署该函数
4. 回归依赖该函数的真实用户流程

### 3. 环境切换

适用于测试环境和正式环境之间切换。

步骤：

1. 在 `cloudbase-native/` 下执行 `node scripts/set-cloud-env.js <envId>`
2. 检查 `miniprogram/config/private.js`
3. 确认开发者工具当前选择的也是同一个环境
4. 将云函数部署到这个准确环境

### 3.2. 私有配置恢复

公开仓库不会直接包含真实私有配置文件。

当前必须恢复的私有文件：

- `miniprogram/config/private.js`

可选恢复文件：

- `project.private.config.json`

推荐恢复流程：

1. 生成或取得 `cloudbase-native/private-package/task-mate-private-package.zip`
2. 在仓库根目录直接解压这个 zip
3. 确认 `cloudbase-native/miniprogram/config/private.js` 已恢复
4. 如果需要，再恢复 `cloudbase-native/project.private.config.json`
5. 后续开发与测试流程和未做保密处理前保持一致

只要 zip 是在仓库根目录解压，项目的使用方式应与原来基本一致。
这包括：

- `node scripts/set-cloud-env.js <envId>`
- 微信开发者工具预览与上传
- 云函数部署
- 双账号联调和手动烟测

### 3.3. 私有包生成

当你想把当前私有配置导出成可恢复的本地包时使用。

执行：

```bash
cd cloudbase-native
node scripts/build-private-package.js
```

输出：

- `cloudbase-native/private-package/task-mate-private-package.zip`

这个 zip 会保留原始相对路径，所以在仓库根目录解压后会直接恢复到正确位置。

如果已经持有私有 zip，实际使用方式应尽量简单：

1. clone 公开仓库
2. 在仓库根目录解压 zip
3. 后续按普通本地项目继续开发和测试

### 3.5. 云端数据完整性检查

当你怀疑存在重复用户、孤立任务归属、或迁移遗留数据时使用。

执行：

```bash
TENCENTCLOUD_SECRETID=...
TENCENTCLOUD_SECRETKEY=...
node scripts/check-cloud-data-integrity.js <envId>
```

脚本会检查：

- `users.userId` 是否重复
- `users.userId` 是否缺失
- 是否还存在旧的 `wx:` 前缀用户 ID
- `tasks` 是否引用了不存在的用户
- `task_archives` 是否引用了不存在的用户

### 4. 双账号协作联调

适用于分享链接、接取任务、检视、重构等协作流程修改。

推荐方式：

1. 准备两个微信账号
2. A 创建协作任务
3. B 打开分享任务
4. 验证接取、提交检视、继续检视、完成任务
5. 故意制造先后操作顺序，验证冲突刷新

### 5. AI 关闭场景验证

适用于某些环境没有配置 AI 密钥时的回归。

重点检查：

- 普通创建任务仍然可用
- 本地敏感词兜底仍然有效
- AI 入口失败时不会拖垮页面主流程

## 日常开发循环

1. 如果行为约定发生变化，先改文档
2. 修改前端或云函数代码
3. 对改动路径做一次小范围手动回归
4. 只部署本次修改涉及的云函数
5. 再做一次首页壳的整体检查

## 调试提示

### 界面像是新版本，但行为像旧版本

优先检查：

1. `miniprogram/config/private.js`
2. 开发者工具当前云环境
3. 对应云函数是否真的重新部署

### 第一次写入成功，后续操作失败

通常优先排查：

- `updatedAt` 版本过期
- 任务状态切换判断不一致
- 连续写入仍在使用旧任务版本

### 分享链接能打开，但任务拉不出来

优先检查：

- 页面是否收到 `openTaskId`
- 首页是否在本地找不到任务后回退调用 `taskGateway.getTask`
- 当前环境里的 `taskGateway` 是否已部署最新版本

## 部署方式

### 小型前端改动

- 修改 `miniprogram/`
- 在开发者工具预览
- 确认无误后上传小程序代码

### 云函数改动

- 修改对应函数
- 上传该函数
- 上传后再次确认环境变量仍然完整

### 发布前候选版本回归

结合 `integration-checklist_cn.md`，至少再跑：

1. 一条自接任务流程
2. 一条协作任务流程
3. 一条分享链接打开流程
4. 一条订阅提醒流程
5. 如果启用了 AI，再跑一条 AI 草稿生成流程

## 当前限制

- 目前还没有完整自动化测试体系
- 验证仍然主要依赖开发者工具和真实环境烟测
- 由于微信工具链限制，小程序和云函数发布仍有一部分是手动操作
