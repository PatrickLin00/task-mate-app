## Server

Express + Mongoose 服务。

### 本地运行

1. 复制环境变量示例

   cp .env.example .env

   按需填写：
   - MONGODB_URI
   - CORS_ORIGIN（开发可留空，生产需收敛）
   - PORT（可选）
   - OPENAI_API_KEY（若启用 OpenAI 功能）

2. 安装依赖并启动

   npm install
   npm start

### 结构

- app.js：应用入口，包含 CORS、JSON 解析、路由、错误处理
- routes/：路由定义
- controllers/：控制器逻辑
- models/：数据模型
- utils/gpt.js：OpenAI 工具（可选）

### TODO（待产品/设计确定）

- 鉴权与用户体系（小程序登录 / JWT）
- 请求体验证（Joi/Zod）与统一错误码
- 任务的详情/更新/删除/状态流转路由
- 数据库字段 required/长度/索引策略
