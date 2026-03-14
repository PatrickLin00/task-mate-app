# Task Mate CloudBase Native

This directory is the rebuild target for the next version of Task Mate.
It is designed to become the future project root after the legacy `client/`
and `server/` folders are removed.

## Stack

- Native WeChat Mini Program
- Cloud Functions
- Cloud Database
- Pull-based refresh instead of WebSocket-driven sync
- AI task generation through a dedicated Cloud Function

## Why This Rebuild Exists

The legacy app uses:

- Taro on the frontend
- Express + MongoDB on the backend
- WebSocket for task refresh notifications
- A relatively heavy task state machine with server-managed side effects

The rebuild keeps the task-centric gameplay but simplifies deployment and
maintenance around the WeChat ecosystem.

## Current Goals

- Preserve core task interactions
- Keep cloud-native architecture simple
- Make future UI redesign straightforward
- Keep AI integration behind a server-side boundary
- Write maintainable docs while rebuilding

## Directory Layout

- `docs/`: product, architecture, data model, and operations docs
- `miniprogram/`: native WeChat Mini Program source
- `cloudfunctions/`: Cloud Functions source

Useful docs during launch prep:

- `docs/integration-checklist.md`
- `docs/legacy-parity.md`

## Cloud Functions

- `taskGateway`: core task, profile, and dashboard operations
- `generateTaskByAI`: task draft generation through an AI provider
- `moderateContent`: local + AI-backed content moderation for nickname and task text
- `subscribeScheduler`: scheduled subscribe-message reminders for due soon, overdue, and expired challenges

## Core Flows Implemented In This Iteration

- Bootstrap profile and dashboard
- Single-shell home/mission/collab/archive/profile experience
- Create task
- View task detail in-page
- Accept task
- Update subtask progress
- Submit for review
- Continue after review
- Complete task
- Abandon task
- Close task
- Restart task
- Daily challenge preview and acceptance
- Rework flow entry, accept, reject, cancel
- Conflict-aware writes that trigger full dashboard refresh
- Basic local sensitive-text checks for nickname and task text
- AI moderation fallback chain for nickname and task text
- Subscribe message consent capture and server-side persistence
- Immediate subscribe notifications for task assignment, review, rework, abandon, close, and cancel flows
- Scheduled subscribe notifications for due soon, overdue, and expired challenge reminders
- Task sharing entry with shared-task open support on the single shell page
- Full archive list returned from dashboard, not only the latest 10
- Legacy-style hide/supersede filtering for reworked task chains

## Deferred For Later

- Rich moderation policy parity with external model auditing
- Full achievement progression
- Final visual design system
- Real CloudBase environment creation and live integration

## Before CloudBase Is Opened

The current goal is to finish everything that can be prepared offline:

- mini program shell and interaction structure
- task gateway logic and task state machine
- data model and collection/index documentation
- Cloud Function boundaries and AI call shape
- launch checklist for a short integration window

When CloudBase is finally enabled, the remaining work should mostly be:

- create collections and indexes
- configure Mini Program subscribe template IDs in `miniprogram/config/subscribe.js`
- upload all four Cloud Functions
- set environment variables
- create the scheduler trigger for `subscribeScheduler`
- verify task flows against real data

## Branches

- Legacy archive: `archive/legacy-express-taro`
- Rebuild branch: `feat/cloudbase-native-rebuild`
