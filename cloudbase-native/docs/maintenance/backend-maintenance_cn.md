# 后台维护函数

这份文档说明当前主线项目里所有“直接读写数据库做扫描 / 修复”的后台脚本入口。

原则：

- 不再把这类修复逻辑散落到临时本地脚本
- 统一放在 `cloudfunctions/adminMaintenance`
- 优先通过云开发控制台的“云测试”传参执行

## 当前函数

- `cloudfunctions/adminMaintenance`

## 用途

当前已内置的维护动作：

1. 扫描 `refactored` 历史链是否存在孤儿任务
2. 修复“完成任务后仍残留 previousTaskId / 已重构链未被删除”的历史数据
3. 清理“指向不存在 previousTaskId 的任务”上的悬空关联

## 云测试参数

### 只扫描，不改数据

```json
{
  "action": "scanRefactoredIntegrity"
}
```

返回重点：

- `completedWithHistoryCount`
- `danglingPreviousReferenceCount`
- `orphanRefactoredRootCount`
- `details`

### 执行修复

```json
{
  "action": "repairRefactoredIntegrity"
}
```

返回重点：

- `before`
- `repaired.deletedRefactoredTaskIds`
- `repaired.clearedPreviousTaskIds`
- `after`

## 可选安全控制

如果要限制后台调用，可以给云函数配置环境变量：

- `MAINTENANCE_TOKEN`

配置后，云测试参数需要额外带：

```json
{
  "action": "scanRefactoredIntegrity",
  "adminToken": "你的维护口令"
}
```

## 当前修复范围

### 1. 已完成任务残留历史链

如果任务已经是 `completed`，但仍保留 `previousTaskId`，说明旧重构链没有被清干净。

修复动作：

- 清空当前任务的 `previousTaskId`
- 反向删除它挂着的 `refactored` 历史链

### 2. 悬空 previousTaskId

如果一个任务的 `previousTaskId` 指向的任务已经不存在，就属于悬空引用。

修复动作：

- 清空当前任务的 `previousTaskId`

### 3. 孤儿 refactored 任务

如果一个 `refactored` 任务没有任何“当前任务”再指向它，就会成为孤儿链根。

修复动作：

- 从这个根开始，沿 `previousTaskId` 反向删除整条 `refactored` 历史链

## 维护约定

后续凡是：

- 扫描脏数据
- 批量修复任务关系
- 回填缺失字段
- 清理错误迁移残留

都优先继续收进 `adminMaintenance`，不要再新建一次性脚本到仓库根目录。
