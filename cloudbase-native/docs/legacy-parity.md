# Legacy Parity

## Purpose

This document tracks what has already been migrated from the legacy
`client/ + server/` app into `cloudbase-native`, and what still depends on a
real CloudBase environment or later product decisions.

## Parity Already Implemented

- Native WeChat single-shell page instead of Taro page routing
- Dashboard bootstrap
- Profile bootstrap and nickname update
- Create task
- Self-assign task on creation
- Accept task
- Daily challenge preview
- Accept daily challenge
- Update subtask progress
- Submit review
- Continue review
- Complete task
- Abandon task
- Close task
- Restart task
- Refresh overdue pending task schedule
- Delete creator-owned pending task
- Delete archive record
- Rework task
- Accept rework
- Reject rework
- Cancel rework
- History chain visibility in collab tab
- Conflict refresh on stale writes
- Local sensitive-word check placeholders
- AI moderation function boundary and task/profile moderation hook
- AI draft generation function boundary
- Subscribe message consent capture
- Immediate subscribe notifications for task-state updates
- Scheduled subscribe reminder function boundary
- Task sharing entry and shared-task open path

## Intentionally Different But Accepted

- No WebSocket or real-time watch channel
- No multi-page task navigation
- Full dashboard refresh after key writes instead of incremental patching
- Task interactions happen inside in-page modals
- No legacy avatar or animated hero area in the new home design

## Pending Until CloudBase Is Opened

- real collection creation
- real index creation
- Cloud Function upload
- environment variable configuration
- subscribe template ID configuration in the mini program
- end-to-end verification of every task path with real user identities

## Pending After First Integration

- scheduled cleanup and retention automation
- richer moderation pipeline
- achievement system rebuild
- about/legal pages if still needed in the native rebuild
- dev account switching if still needed in the native rebuild
- full nickname gate parity if product still wants it
- final UI redesign
