# Release And Rollback

## Purpose

This document is the practical runbook for pushing new logic live and backing out safely.

## Release Order

1. Confirm branch and working tree are what you expect.
2. Confirm `miniprogram/config/cloud.js` points to the intended environment.
3. Upload production functions:
   - `taskGateway`
   - `generateTaskByAI`
   - `moderateContent`
   - `subscribeScheduler`
4. Re-check function env vars after upload.
5. Re-upload the scheduler trigger if `subscribeScheduler/config.json` changed.
6. Confirm collections exist.
7. Confirm indexes exist.
8. Recompile the Mini Program.
9. Run the smoke tests in `integration-checklist_en.md`.

## Rollback Strategy

### Frontend Rollback

- switch git to the previous known-good commit
- rebuild and re-upload the Mini Program

### Function Rollback

- upload previous known-good function code from git
- re-check env vars because DevTools uploads can overwrite assumptions

### Environment Rollback

If a new CloudBase environment proves bad:

1. point `miniprogram/config/cloud.js` back to the old env
2. rebuild the Mini Program
3. keep users on the old environment until the new one is repaired

## Post-Release Checks

- one user sees the correct nickname and stats
- one creator sees historical tasks in `collab`
- one assignee sees accepted tasks in `mission`
- one archive record can open and be deleted
- no function timeout errors in AI, moderation, or scheduler paths

