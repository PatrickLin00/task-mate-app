# Product Scope

## Core Product Surface

Task Mate currently includes:

- player-owned tasks
- collaboration-style task claiming
- review flow before completion
- challenge tasks generated from daily seeds
- profile stats tied to completed task rewards
- dashboard-oriented home screen
- rework chain with accept, reject, and cancel

## Intentional Simplifications

- no real-time socket sync
- no standalone JWT auth layer
- no Express route surface
- no separate task detail pages for primary task flows

## UX Assumption

This app is a Mini Program, not a permanently active collaborative client.
Because of that:

- page entry refresh matters more than live push
- post-action refresh is sufficient for consistency
- simpler infrastructure is preferred over always-live state sync

