# 前端单页壳

## 核心思路

主要任务操作集中在一个页面中完成，以减少页面跳转和状态割裂。

## 主区域

- Hero 顶部信息卡
- `home`
- `mission`
- `collab`
- `archive`
- `achievements`
- `profile`

## 页内弹层

- 任务详情
- 创建任务
- 重构任务
- 资料编辑
- 新手引导

## 数据流

页面以完整 dashboard 为核心状态源，写入成功后整体刷新，而不是拼接多个局部更新。

## 维护规则

改前端交互时通常需要同时检查：

- `index.js`
- `index.wxml`
- `index.wxss`
- `strings.js`
