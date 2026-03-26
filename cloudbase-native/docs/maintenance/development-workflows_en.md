# Development Workflows

## Purpose

This file describes the real development, debugging, testing, and deployment
paths for the current CloudBase-native codebase.

## Development Modes

### 1. Frontend UI Iteration

Use this when changing page layout, copy, modal behavior, or interaction flow.

Steps:

1. Open `cloudbase-native` in WeChat DevTools.
2. Confirm the AppID and cloud environment in use.
3. Edit files under `miniprogram/`.
4. Rebuild or preview inside DevTools.
5. Verify the affected shell tab or modal flow manually.

### 2. Cloud Function Logic Iteration

Use this when changing task rules, permissions, AI behavior, moderation, or
subscribe reminder logic.

Steps:

1. Edit the target function under `cloudfunctions/`.
2. Validate syntax locally if the file is plain JavaScript.
3. Upload and deploy that function from WeChat DevTools.
4. Re-run the user flow that depends on the function.

### 3. Environment Switching

Use this when moving between test and production CloudBase environments.

Steps:

1. run `node scripts/set-cloud-env.js <envId>` inside `cloudbase-native/`
2. verify `miniprogram/config/private.js`
3. confirm the same environment is selected in DevTools
4. deploy functions to that exact environment

### 3.2. Private Setup Restore

The public repository intentionally does not include the real private Mini
Program config file.

Required private file:

- `miniprogram/config/private.js`

Optional private file:

- `project.private.config.json`

Expected restore flow:

1. generate or obtain `cloudbase-native/private-package/task-mate-private-package.zip`
2. extract that zip at the repository root
3. confirm `cloudbase-native/miniprogram/config/private.js` now exists
4. optionally restore `cloudbase-native/project.private.config.json`
5. continue development exactly as usual

Once the zip is extracted at the repository root, the project should behave the
same way as a non-redacted local checkout. That includes:

- `node scripts/set-cloud-env.js <envId>`
- WeChat DevTools preview and upload
- normal cloud-function deployment
- dual-account testing and manual smoke tests

### 3.3. Private Package Build

Use this when you want to export the current private config into a restorable
local package.

Run:

```bash
cd cloudbase-native
node scripts/build-private-package.js
```

Output:

- `cloudbase-native/private-package/task-mate-private-package.zip`

This zip preserves the original relative paths, so extracting it at the
repository root restores the private files directly into place.

If you already have the private zip, the expected usage is simple:

1. clone the public repository
2. extract the zip at the repository root
3. continue using the project exactly like a pre-redaction local checkout

### 3.5. Cloud Data Integrity Check

Use this when you suspect duplicate users, orphan task ownership, or leftover
records from earlier migration periods.

Run:

```bash
TENCENTCLOUD_SECRETID=...
TENCENTCLOUD_SECRETKEY=...
node scripts/check-cloud-data-integrity.js <envId>
```

The script checks:

- duplicate `users.userId`
- missing `users.userId`
- legacy `wx:`-prefixed user IDs
- task records pointing to missing users
- archive records pointing to missing users

### 4. Dual-Account Collaboration Testing

Use this when changing share links, task claiming, review, or rework behavior.

Recommended pattern:

1. prepare two WeChat accounts
2. create a collaborative task on account A
3. open the shared task on account B
4. verify accept, review, continue-review, and complete flows
5. intentionally test stale-state conflicts after one side mutates first

### 5. AI-Off Validation

Use this before release if AI credentials may be missing in some environments.

Check:

- normal task creation still works
- moderation fallback still rejects obviously blocked content
- AI entry points fail gracefully instead of breaking the page

## Daily Development Loop

1. update docs if the behavior contract changes
2. edit frontend or cloud-function code
3. run a narrow manual smoke test for the changed path
4. deploy only the functions that changed
5. run one full shell-page sanity check

## Debugging Tips

### UI Looks Updated But Behavior Is Old

Check:

1. `miniprogram/config/private.js`
2. selected CloudBase environment in DevTools
3. whether the changed function was actually uploaded

### Write Succeeds Once But Later Operations Fail

Usually check:

- stale `updatedAt`
- hidden task state transition mismatch
- a later write still targeting an older task version

### Share Link Opens But Task Is Missing

Check:

- whether `openTaskId` reaches the page query
- whether the page falls back to `taskGateway.getTask`
- whether the target environment has the latest `taskGateway` deployed

## Deployment Paths

### Small Frontend-Only Change

- update `miniprogram/`
- preview in DevTools
- upload Mini Program code when ready

### Function Change

- update the specific function
- upload that function
- verify the real environment variables still exist after deployment

### Release Candidate Pass

Use `integration-checklist_en.md` plus:

1. one self-assigned task flow
2. one collaborative task flow
3. one share-link open flow
4. one subscribe-message flow
5. one AI-assisted draft flow if AI is enabled

## Current Limits

- there is no complete automated test suite yet
- validation still depends heavily on DevTools and real-environment smoke tests
- deployment is partially manual through the WeChat toolchain
