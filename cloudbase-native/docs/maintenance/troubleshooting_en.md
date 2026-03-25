# Troubleshooting

## 1. Mini Program Shows Empty Or Wrong Profile

Check:

- `users` collection has exactly one row for the current `userId`
- no duplicate `userId`
- no rows missing `userId`
- current CloudBase environment is the expected one
- run `scripts/check-cloud-data-integrity.js <envId>` if you suspect old migration leftovers

## 2. Task Buttons Feel Wrong For A State

Check both:

- frontend visibility conditions in `pages/home/index.js` and `index.wxml`
- backend assertions in `cloudfunctions/taskGateway/index.js`

## 3. Closed Task Disappears Unexpectedly

Closed tasks should stay in `tasks` and appear in collab until deletion. If they vanish unexpectedly, inspect:

- collab filtering logic
- close and delete rules
- any cleanup behavior tied to task status

## 4. Archive Looks Wrong

Remember:

- archive is snapshot-based
- closed tasks do not belong there
- completed and review-pending snapshots do

## 5. AI Fill Fails

Check:

- `generateTaskByAI` uploaded
- provider env vars configured
- function timeout high enough
- provider response format still matches parser assumptions

## 6. Moderation Feels Too Strict Or Too Loose

Inspect:

- `moderateContent/index.js`
- local blocklist hits
- provider moderation prompt

## 7. Subscribe Messages Not Arriving

Check:

- template IDs in Mini Program config
- env vars in functions
- user authorization state
- `subscribeScheduler` trigger
- send markers on tasks

## 8. Scroll Hint Looks Wrong

Check:

- whether content actually exceeds viewport
- whether the current tab re-measured after switching
- whether modal hint is clipped inside modal bounds

## 9. Onboarding Gets Out Of Sync

Check:

- current onboarding step
- target mapping
- mock state transitions
- whether a step is action-driven or next-button driven

## 10. Cloud Function "resource is not found"

Usually means one of:

- function not uploaded
- wrong environment selected
- frontend cloud env not bound correctly

