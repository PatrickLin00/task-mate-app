# Config Matrix

## Mini Program

- `miniprogram/app.json`
  - page registration and window config
- `miniprogram/app.js`
  - cloud initialization
- `miniprogram/config/cloud.js`
  - active CloudBase `envId`
- `miniprogram/config/strings.js`
  - main product copy
- `miniprogram/config/legal-strings.js`
  - legal copy
- `miniprogram/config/subscribe.js`
  - frontend template IDs

## Cloud Functions

### taskGateway

Env vars:

- `WEAPP_APPID`
- `WEAPP_SECRET`
- `SUBSCRIBE_TPL_TODO`
- `SUBSCRIBE_TPL_TASK_UPDATE`
- `SUBSCRIBE_TPL_REVIEW`
- `SUBSCRIBE_TPL_WORK`

### generateTaskByAI

Env vars:

- `HUNYUAN_API_KEY`
- `HUNYUAN_BASE_URL` optional
- `HUNYUAN_MODEL` optional

### moderateContent

Env vars:

- `HUNYUAN_API_KEY`
- `HUNYUAN_BASE_URL` optional
- `HUNYUAN_MODEL` optional

### subscribeScheduler

Env vars:

- `WEAPP_APPID`
- `WEAPP_SECRET`
- `SUBSCRIBE_TPL_TODO`
- `SUBSCRIBE_TPL_TASK_UPDATE`
- `SUBSCRIBE_TPL_REVIEW`
- `SUBSCRIBE_TPL_WORK`

Trigger config:

- `cloudfunctions/subscribeScheduler/config.json`

## Database

Collections:

- `users`
- `tasks`
- `task_archives`

Recommended indexes:

### tasks

- `creatorId` asc + `updatedAt` desc
- `assigneeId` asc + `updatedAt` desc
- `seedKey` asc
- `status` asc + `dueAt` asc

### task_archives

- `ownerId` asc + `updatedAt` desc
- `sourceTaskId` asc

## Local Helper Script

- `scripts/set-cloud-env.js`
  - updates `miniprogram/config/cloud.js`

## Troubleshooting Order

When runtime behavior looks wrong after an environment switch, check:

1. `miniprogram/config/cloud.js`
2. deployed function env vars
3. subscribe template IDs
4. collection shape
5. indexes

