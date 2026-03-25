# Change Playbook

## Purpose

This document answers the maintenance question:

`If I need to change feature X, which files do I touch?`

## 1. Change Button Visibility Or Task Detail Actions

Read first:

- `../product/glossary-and-rules_en.md`
- `../architecture/task-state-machine_en.md`

Then edit:

- `miniprogram/pages/home/index.js`
- `miniprogram/pages/home/index.wxml`
- `miniprogram/pages/home/index.wxss`
- `cloudfunctions/taskGateway/index.js`

## 2. Change Task Status Logic

Read first:

- `../architecture/task-state-machine_en.md`
- `../overview/system-reference_en.md`

Then edit:

- `cloudfunctions/taskGateway/index.js`
- `miniprogram/pages/home/index.js`
- `../architecture/task-state-machine_en.md`
- `../product/glossary-and-rules_en.md`

## 3. Change Today Focus Logic

Edit:

- `cloudfunctions/taskGateway/index.js`
- `miniprogram/pages/home/index.js`
- `../product/glossary-and-rules_en.md`

## 4. Change Create Task Form

Edit:

- `miniprogram/pages/home/index.js`
- `miniprogram/pages/home/index.wxml`
- `miniprogram/pages/home/index.wxss`
- `cloudfunctions/taskGateway/index.js`
- `cloudfunctions/generateTaskByAI/index.js`
- `../architecture/data-model_en.md`

## 5. Change AI Fill Or Moderation

Edit:

- `cloudfunctions/generateTaskByAI/index.js`
- `cloudfunctions/moderateContent/index.js`
- `../architecture/cloud-functions_en.md`
- `operations_en.md`

## 6. Change Onboarding

Edit:

- `miniprogram/pages/home/index.js`
- `miniprogram/pages/home/index.wxml`
- `miniprogram/pages/home/index.wxss`
- `miniprogram/config/strings.js`
- `../architecture/frontend-shell_en.md`
- `../product/glossary-and-rules_en.md`

Important:

- onboarding must remain mock-driven
- onboarding must not write real data

## 7. Change Legal Pages

Edit:

- `miniprogram/pages/legal-terms/index.*`
- `miniprogram/pages/legal-privacy/index.*`
- `miniprogram/config/legal-strings.js`
- `miniprogram/pages/home/index.wxml`

## 8. Change Environment Or Deployment Setup

Edit:

- `miniprogram/config/cloud.js`
- `scripts/set-cloud-env.js`
- `project.config.json`
- `miniprogram/app.json`
- `config-matrix_en.md`
- `release-and-rollback_en.md`

## 9. Change Collection Schema

Edit:

- `cloudfunctions/taskGateway/index.js`
- `miniprogram/pages/home/index.js`
- `../architecture/data-model_en.md`
- `../reference/sample-data-reference_en.md`

## Rule Of Thumb

If you changed a runtime rule and only touched code, documentation is probably
incomplete. At minimum, also check:

- `../product/glossary-and-rules_en.md`
- `../architecture/task-state-machine_en.md`
- `../architecture/data-model_en.md`
- `config-matrix_en.md`

