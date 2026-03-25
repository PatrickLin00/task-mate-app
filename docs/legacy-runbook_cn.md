# 旧版运行说明

## 目的

本文说明归档分支中的 Express + Taro 版本原本如何本地运行，以及当时依赖了哪些运行部件。

## 客户端

目录：

- `client/`

根据 `client/package.json` 可知：

- Taro 4
- React 18
- TypeScript
- Sass

常见命令：

```bash
cd client
npm install
npm run dev:weapp
```

脚本里还保留了 `h5`、`alipay`、`tt`、`qq` 等多端目标，但这些现在只是历史能力，不再代表当前产品承诺。

## 服务端

目录：

- `server/`

根据 `server/package.json` 与 `server/app.js` 可知：

- Express 5
- MongoDB + Mongoose
- `ws` WebSocket
- 基于 dotenv 的本地配置

常见命令：

```bash
cd server
cp .env.example .env
npm install
npm start
```

## 旧版关键环境配置

从旧代码中可以直接看到的服务端变量包括：

- `MONGODB_URI`
- `CORS_ORIGIN`
- `PORT`
- `OPENAI_API_KEY`
- 若干开发环境下的清理与 seed 开关

客户端侧能看到的主要配置包括：

- `API_BASE_URL`
- `TARO_APP_API_BASE_URL`
- `TARO_APP_WS_URL`

## 旧版运行特征

- 任务读写通过 REST API 完成
- 通过 WebSocket 触发 dashboard 刷新
- 服务端启动时会做迁移、清理和种子数据逻辑
- MongoDB 是主要数据源

## 归档快照

本分支还附带一个加密归档文件：

- `archive/legacy-express-taro-snapshot-encrypted.zip`

它只是为了归档交接方便而保留，不是阅读本分支的主要方式。
