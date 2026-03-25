# Integration Checklist

## Goal

This checklist is for validating a real CloudBase environment in one pass.

## Before Testing

- confirm `cloudbase-native` is the project root in DevTools
- confirm the target Mini Program AppID
- prepare AI provider keys if AI functions will be tested
- prepare subscribe template IDs if subscribe flows will be tested

## Environment Setup

1. Open `cloudbase-native` in WeChat DevTools.
2. Confirm `miniprogram/config/cloud.js` points to the intended environment.
3. Enable Cloud Development in that environment.
4. Create collections:
   - `users`
   - `tasks`
   - `task_archives`
5. Add indexes described in `operations_en.md`.
6. Upload `taskGateway`.
7. Upload `generateTaskByAI`.
8. Upload `moderateContent`.
9. Upload `subscribeScheduler`.
10. Fill `miniprogram/config/subscribe.js` with the same template IDs used by the cloud environment.
11. Configure required environment variables.
12. Create the timed trigger for `subscribeScheduler`.

## Smoke Test Order

1. Launch app and verify bootstrap creates a profile automatically.
2. Edit nickname and verify it persists after refresh.
3. Verify blocked nickname text is rejected.
4. Create a normal task.
5. Create a self-assigned task.
6. Update multiple subtask progress values.
7. Submit review or complete directly where appropriate.
8. Verify archive entry is visible in the archive tab.
9. Create a collaborative task from one account.
10. Open the task from a shared link on another account.
11. Accept the task from another account.
12. Submit review from the assignee account.
13. Continue review from the creator account.
14. Complete the task.
15. Verify rework accept, reject, and cancel flows.
16. Verify an intentional stale write causes a conflict refresh.
17. Verify subscribe authorization can be recorded.
18. Trigger the scheduler manually and verify due-soon and overdue reminders.

## Expected Results

- no page navigation is required for any primary task flow
- pull-down refresh works on the shell page
- rework history is visible in `collab`
- archive shows both completed and review-pending snapshots
- stale writes return a conflict refresh instead of silently overwriting data

