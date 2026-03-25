# Legacy Overview

## Position

This branch preserves the pre-CloudBase Task Mate implementation.

It used a split architecture:

- Taro + React client
- Express backend
- MongoDB via Mongoose
- WebSocket-driven dashboard refresh

## Why It Was Good At The Time

- one backend could support multiple client targets
- task mutations and AI calls were centralized in a traditional server
- WebSocket refresh reduced the need for full polling after changes
- MongoDB gave flexible document modeling during early product iteration

## Why It Was Archived

The newer CloudBase-native version was chosen because:

1. it is cheaper to run and maintain for the actual production scope
2. it matches the WeChat Mini Program runtime directly
3. it removes the need for a separately hosted API service
4. it avoids maintaining a second real-time channel through WebSocket
5. the product is currently WeChat-specific, so multi-end web support is not a
   near-term priority

## Legacy Stack Summary

### Client

- Taro 4
- React 18
- Sass
- REST API calls for task actions
- WebSocket subscription for dashboard refresh

### Server

- Express 5
- Mongoose + MongoDB
- JWT-style auth flow around WeChat login
- optional OpenAI-backed AI helpers
- scheduled subscribe-message helpers

## What Is Still Useful Here

- older task controller behavior
- WebSocket refresh design
- earlier split of client/server responsibilities
- historical data migration assumptions
- previous API contracts and routing structure

## What Is Not The Mainline Anymore

- this branch is not the deployment target
- it should not be used as the current architecture reference
- new feature work should happen on the CloudBase-native mainline unless there
  is a specific archival reason
