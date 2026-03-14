# Integration Checklist

## Goal

This checklist is for the short paid integration window after CloudBase is
enabled. The target is to verify the rebuilt app in one concentrated pass
instead of discovering missing setup details piecemeal.

## Before Opening CloudBase

- Confirm the branch is `feat/cloudbase-native-rebuild`.
- Confirm `cloudbase-native` is the only directory you need for the rebuild.
- Confirm the Mini Program AppID that will be used in DevTools.
- Prepare AI provider keys if `generateTaskByAI` or `moderateContent` will be tested immediately.
- Prepare subscribe template IDs if subscribe messages will be tested immediately.

## Environment Setup

1. Open `cloudbase-native` as the project root in WeChat DevTools.
2. Replace the placeholder AppID in `project.config.json` if needed.
3. Enable Cloud Development in the intended environment.
4. Create collections:
   - `users`
   - `tasks`
   - `task_archives`
5. Add indexes described in [operations.md](/h:/gitdata/task-mate-app/cloudbase-native/docs/operations.md).
6. Upload `taskGateway`.
7. Upload `generateTaskByAI`.
8. Upload `moderateContent`.
9. Upload `subscribeScheduler`.
10. Fill `miniprogram/config/subscribe.js` with the same template IDs used by the cloud environment.
11. Configure environment variables:
   - `WEAPP_APPID`
   - `WEAPP_SECRET`
   - `SUBSCRIBE_TPL_TODO`
   - `SUBSCRIBE_TPL_TASK_UPDATE`
   - `SUBSCRIBE_TPL_REVIEW`
   - `SUBSCRIBE_TPL_WORK`
   - AI variables only if AI functions will be tested
12. Create a timed trigger for `subscribeScheduler`.

## Smoke Test Order

Run these in order so state dependencies stay simple.

1. Launch app and verify bootstrap creates a profile automatically.
2. Edit nickname and verify it persists after pull-down refresh.
3. Verify blocked nickname text is rejected by moderation.
4. Create a normal task.
5. Verify blocked task text is rejected by moderation.
6. Create a self-assigned task.
7. Open the self-assigned task and update subtask progress.
8. Submit review for the self-assigned task or complete it directly.
9. Verify archive entry is visible in the archive tab.
10. Create a collaborative task from one account.
11. Accept the task from another account.
12. Submit review from the assignee account.
13. Continue review from the creator account.
14. Complete the task from creator or assignee.
15. Create a rework from the creator account.
16. Accept the rework from the assignee account.
17. Repeat rework and reject it from the assignee account.
18. Repeat rework and cancel it from the creator account.
19. Create an overdue pending task and verify `refreshTaskSchedule`.
20. Delete a pending creator task.
21. Delete a non-review archive record.
22. Trigger an intentional stale write and verify the page refreshes from the
    returned dashboard.
23. Tap the subscribe button in settings and verify consent can be recorded.
24. Accept a collaborative task and verify creator-side work notification.
25. Submit review and verify creator-side review notification.
26. Trigger the scheduler manually and verify due-soon/overdue reminders.

## Expected Results

- No page navigation is required for any primary task flow.
- Pull-down refresh works on the single shell page.
- Rework history is visible in the collab tab.
- Archive shows both completed and review-pending snapshots.
- Stale writes return a conflict refresh instead of silently overwriting data.
- No WebSocket setup is required anywhere.

## Still Outside This Checklist

These are intentionally not blockers for the first CloudBase smoke test.

- scheduled cleanup function
- external moderation service parity
- final achievement system redesign
- post-parity visual redesign
