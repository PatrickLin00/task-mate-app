# Frontend Shell

## Overview

The rebuilt mini program uses a single primary page:

- `miniprogram/pages/home/index`

The goal is to keep interaction latency low by avoiding repeated page
navigation for core task actions.

## Why One Shell

The shell approach was chosen because:

- task tab switching should feel instant
- many actions share the same dashboard snapshot
- modal-based details are faster than page stacks for this product
- the app no longer depends on socket-driven refresh

## Main UI Regions

### Hero

Contains:

- nickname
- attributes
- total open tasks
- create-task entry
- compact collapse mode

### Tabs

- `home`
- `mission`
- `collab`
- `archive`
- `achievements`
- `profile`

Tab switching is local-state driven, not full page navigation.

### Modals

Primary in-page overlays:

- task detail modal
- task create / rework modal
- profile edit modal

### Support Surfaces

- onboarding overlay
- scroll hint overlays
- bottom error banner

## Data Flow

The page state is built around a full dashboard snapshot. Major data buckets:

- `profile`
- `todayTasks`
- `challengeTasks`
- `missionTasks`
- `collabTasks`
- `historyTasks`
- `archiveTasks`

The shell prefers reloading a full account-scoped snapshot after mutations
instead of stitching many partial updates.

## Refresh Strategy

The shell refreshes data:

- on mini program entry
- on page show
- on pull-down refresh
- after successful task mutations
- after stale-write conflict responses

This is intentional. The rebuilt app favors consistency and simpler maintenance
over real-time push complexity.

## Important UI Rules

### Task list cards

List cards should stay concise. If an action is only meaningful in detail view,
prefer not showing it on the list card.

### Detail modal

Task detail is the main action surface. It contains:

- state-specific action buttons
- grouped task meta
- subtask progress controls
- rework/history entry points

### Create modal

The create modal supports:

- one-line prompt fill
- fill suggestion action
- title/detail editing
- reward type selection
- due date and time
- self-assign
- subtask targets

### Settings tab

The settings tab includes:

- profile edits
- subscribe permissions
- onboarding re-entry
- user agreement
- privacy agreement

## Strings And Copy

User-facing copy should live in config:

- `miniprogram/config/strings.js`
- `miniprogram/config/legal-strings.js`

Avoid scattering user-visible Chinese text across page logic unless the copy is
very small and step-specific. If it appears in multiple places, move it into
config.

## Onboarding Design

The current onboarding is action-guided but mock-driven:

- it highlights actual UI regions
- it can progress via highlighted actions
- it does not write real production data

This prevents onboarding from polluting user tasks or AI usage.

## Scroll Hint Design

Scroll hints are visual affordances only. They should:

- appear only when content clearly extends below viewport
- disappear near the bottom
- stay subtle inside modals
- never overlap or escape modal bounds

## Frontend Files Worth Knowing

- `miniprogram/pages/home/index.js`
- `miniprogram/pages/home/index.wxml`
- `miniprogram/pages/home/index.wxss`
- `miniprogram/utils/api.js`
- `miniprogram/utils/cloud.js`
- `miniprogram/utils/format.js`
- `miniprogram/utils/subscribe.js`
- `miniprogram/config/strings.js`
- `miniprogram/config/legal-strings.js`

## Editing Guidance

When changing frontend behavior:

1. update `index.js` logic first
2. align `index.wxml` conditions with that logic
3. then fix layout in `index.wxss`
4. keep strings in config when practical
5. re-test small-screen devices because this app uses dense modals

