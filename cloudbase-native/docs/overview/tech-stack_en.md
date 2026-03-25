# Tech Stack

## Final Choice

Task Mate uses:

- Native WeChat Mini Program for the client
- CloudBase Cloud Functions for backend logic
- CloudBase Database for persistence
- CommonJS JavaScript in both frontend utility code and cloud functions

## Why This Stack Won

### Native WeChat Mini Program

Chosen over Taro/React because:

- it matches the real deployment target directly
- it reduces build and compatibility layers
- it keeps page performance and debugging simple

### Cloud Functions

Chosen over an always-on Express server because:

- deployment is simpler
- auth stays close to the WeChat runtime
- AI and subscribe-message secrets remain server-side
- business logic still stays centralized

### Cloud Database

Chosen over MongoDB for the current mainline because:

- it reduces infrastructure moving parts
- it fits the CloudBase runtime directly
- the task model is moderate in complexity and works well with document storage

### Pull Refresh + Conflict Detection

Chosen over WebSocket push because:

- the app does not need high-frequency collaborative editing
- maintenance cost is lower
- consistency is still acceptable with full dashboard refresh after writes

## Current Framework Boundaries

### Frontend

- page shell in `miniprogram/pages/home/index.js`
- API wrapper in `miniprogram/utils/api.js`
- formatting helpers in `miniprogram/utils/format.js`

### Backend

- action routing in `cloudfunctions/taskGateway/index.js`
- isolated AI generation in `cloudfunctions/generateTaskByAI/index.js`
- isolated moderation in `cloudfunctions/moderateContent/index.js`

## Explicit Non-Choices

The current mainline intentionally does not use:

- Taro
- React
- Express
- MongoDB
- WebSocket-driven task sync

Those belong to the archived legacy branch, not the current stack.

