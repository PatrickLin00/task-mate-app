# Legacy Runbook

## Purpose

This file explains how the archived Express + Taro version was intended to be
run locally and what moving parts existed.

## Client

Directory:

- `client/`

Detected stack from `client/package.json`:

- Taro 4
- React 18
- TypeScript
- Sass

Typical commands:

```bash
cd client
npm install
npm run dev:weapp
```

Other Taro targets also existed in the scripts, including `h5`, `alipay`,
`tt`, `qq`, and others, but they are archived capability rather than an active
product commitment now.

## Server

Directory:

- `server/`

Detected stack from `server/package.json` and `server/app.js`:

- Express 5
- MongoDB via Mongoose
- WebSocket via `ws`
- dotenv-based local config

Typical commands:

```bash
cd server
cp .env.example .env
npm install
npm start
```

## Important Legacy Environment Inputs

Server-side examples visible in the old code:

- `MONGODB_URI`
- `CORS_ORIGIN`
- `PORT`
- `OPENAI_API_KEY`
- development toggles for seeding and cleanup

Client-side examples visible in the old code:

- `API_BASE_URL`
- `TARO_APP_API_BASE_URL`
- `TARO_APP_WS_URL`

## Key Legacy Runtime Characteristics

- REST API for task mutations and reads
- a WebSocket channel used to trigger dashboard refresh
- server-side startup tasks for migration, cleanup, and seed data
- MongoDB as the source of truth

## Archive Artifact

This branch also includes an encrypted snapshot artifact:

- `archive/legacy-express-taro-snapshot-encrypted.zip`

It is stored only as an archival convenience layer, not as the main way to
read the branch.
