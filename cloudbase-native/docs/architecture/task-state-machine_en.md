# Task State Machine

## Purpose

This document records the business task states preserved in the rebuilt app.
When task behavior looks odd, check this file before changing logic.

## Core States

- `pending`
- `in_progress`
- `review_pending`
- `pending_confirmation`
- `completed`
- `closed`
- `refactored`

## Meaning Of Each State

### pending

Created but not yet accepted.

Typical surfaces:

- collab tab
- challenge list

Typical actions:

- accept
- share
- rework
- close

### in_progress

Accepted and being worked on.

Typical surfaces:

- mission tab
- sometimes collab tracking for creator side

Typical actions:

- update progress
- submit review
- complete directly for some task types
- abandon

### review_pending

Submitted and waiting for confirmation/review.

Typical surfaces:

- archive snapshot list
- creator-side tracking

### pending_confirmation

Used by rework/confirmation flows where a follow-up decision is needed.

Typical actions:

- accept rework
- reject rework
- cancel rework

### completed

Finished task. The active task no longer lives in normal mission/collab action
flow and a snapshot should exist in archives.

### closed

Closed by creator, not archived as completion.

Important:

- closed tasks stay in `tasks`
- closed tasks remain visible in collab until deleted or cleaned
- delete is allowed here

### refactored

Legacy-style superseded task version kept for chain/history logic.

## Tab Mapping

### Home

- today focus
- daily challenge previews

### Mission

- accepted tasks
- pending confirmation items tied to execution

### Collab

- created tasks still needing creator-side attention
- closed tasks
- history chains where relevant

### Archive

- completed snapshots
- review-pending snapshots

## Important State Rules

### Closed vs Archive

These are not the same.

- `closed` means stopped and still belongs to active task storage
- `archive` means a snapshot of a completed/reviewed record

### Rework Chain

Rework does not mean 鈥渆dit task in place and forget history鈥? Some rework
flows preserve or supersede prior versions, so history handling matters.

### Challenge Expiry

Challenge tasks behave differently:

- active challenge records expire quickly
- completed challenge archive retention is shorter than normal completed tasks

## Action Expectations

### Pending task

- share
- rework
- accept
- close

### In-progress task

- update progress
- submit review or complete
- abandon
- optional creator-side rework/close in special self-owned scenarios

### Closed task

- restart
- delete
- rework may remain available depending on surface

### Archive record

- view details
- delete archive record

## Maintenance Warning

When changing task rules, do not only update backend assertions. Also check:

- detail button visibility
- list card visibility
- onboarding mock tasks
- archive generation
- scheduler cleanup rules

