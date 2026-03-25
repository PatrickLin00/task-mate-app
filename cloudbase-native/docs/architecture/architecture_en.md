# Architecture

## Overview

Task Mate uses a WeChat-only architecture:

- native Mini Program for UI and interaction
- Cloud Functions for application logic
- Cloud Database for task, archive, and profile data
- AI provider calls only from Cloud Functions

## Key Design Decisions

1. No independent Express server.
2. No long-lived WebSocket connection.
3. Dashboard is refreshed on page show, on pull-down refresh, and after task mutations.
4. Core business logic is centralized in `taskGateway`.
5. AI generation is isolated in `generateTaskByAI`.
6. Task writes are optimistic from the client but validated against the latest server-side task version before commit.
7. The Mini Program uses a single-shell page rather than multi-page task navigation.

## Runtime Flow

1. Mini Program launches and initializes cloud capabilities.
2. Home page calls `taskGateway.bootstrap`.
3. `taskGateway` ensures a profile exists, then returns profile and dashboard data.
4. User mutations call `taskGateway` with action-based payloads.
5. The page refreshes its local dashboard after each successful mutation.
6. If the task version is stale, the function returns a conflict payload plus a fresh dashboard and the page refreshes itself immediately.

## UI Structure

The current native shell keeps all primary task interactions inside one page:

- `home`
- `mission`
- `collab`
- `archive`
- `achievements`
- `profile`

Task detail, create, rework, and profile edit are all implemented as in-page modals.

## Why Action Routing Lives In One Gateway

A single gateway provides:

- fewer deployment units
- easier permission evolution
- easier refactor of shared task rules
- simpler frontend invocation model

This can be split later if the function grows too large.

