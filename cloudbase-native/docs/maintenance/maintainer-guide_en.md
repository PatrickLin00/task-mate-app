# Maintainer Guide

## Purpose

This file is the maintenance entry point for the current public mainline.

## Read Order

1. `../overview/system-reference_en.md`
2. `../overview/tech-stack_en.md`
3. `../overview/technical-challenges_en.md`
4. `../architecture/task-state-machine_en.md`
5. `../architecture/cloud-functions_en.md`
6. `config-matrix_en.md`

## Current Project Shape

- one runtime root: `cloudbase-native/`
- one Mini Program shell
- one main task gateway function
- no legacy source folders in this branch

## Files Worth Knowing

### Frontend

- `miniprogram/pages/home/index.js`
- `miniprogram/pages/home/index.wxml`
- `miniprogram/pages/home/index.wxss`
- `miniprogram/utils/api.js`

### Backend

- `cloudfunctions/taskGateway/index.js`
- `cloudfunctions/generateTaskByAI/index.js`
- `cloudfunctions/moderateContent/index.js`
- `cloudfunctions/subscribeScheduler/index.js`

### Docs

- `../architecture/data-model_en.md`
- `../product/glossary-and-rules_en.md`
- `change-playbook_en.md`
- `development-workflows_en.md`

## Safe Change Checklist

Before changing task behavior:

1. update frontend action visibility
2. update `taskGateway` assertions
3. verify dashboard grouping
4. verify archive effects
5. verify reminder effects if due dates or statuses changed

Before changing schema:

1. update `../architecture/data-model_en.md`
2. update relevant cloud-function writes and reads
3. update sample records if shape changed

Before changing user-facing copy:

1. prefer `miniprogram/config/strings.js`
2. keep task wording aligned with `../product/glossary-and-rules_en.md`

## Public Mainline Rules

- do not reintroduce legacy-only folders into this branch
- do not commit private dumps, keys, or exported user data
- keep docs focused on the current runtime, not one-off migration history

