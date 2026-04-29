# Public Core + Private Enterprise Split

This repository is the public core of AgentLens.

Its responsibilities are:

- provider discovery and parsing
- normalized session, tool, metrics, and optimization types
- metrics, pricing, advice, anomaly, and export logic
- local incremental processing cache
- single-user CLI, TUI, dashboard, and VS Code extension

## Stable Public Boundaries

The public npm package exposes these subpaths:

- `@rajaraghvendra/agentlens/core-types`
- `@rajaraghvendra/agentlens/core-engine`
- `@rajaraghvendra/agentlens/providers`
- `@rajaraghvendra/agentlens/local-runtime`

These are the supported reuse boundaries for a separate private enterprise repo.

### `core-types`

Contains:

- normalized session and message types
- metrics, findings, digests, tool advice, and processing stats
- future-safe team sync DTOs such as `TeamIdentityConfig`, `TeamAggregateRecord`, and `TeamSyncBatch`

### `core-engine`

Contains:

- `CoreEngine`
- metrics computation
- optimizer and advice generators
- pricing and currency helpers
- classifier and dedup helpers

### `providers`

Contains:

- provider registry
- provider interface
- concrete provider implementations

### `local-runtime`

Contains:

- incremental processing cache loader
- budget helpers
- local notifier
- resolved config

## What Belongs In The Private Enterprise Repo

The private repo should contain:

- Team View central server
- Postgres schema and migrations
- ingestion and read APIs
- RBAC
- offline entitlement enforcement
- central pricing overrides and pricing-sheet import
- sync policy management
- audit logs
- Docker and non-Docker deployment assets
- enterprise admin console and docs

The public repo must not depend on any of those private components.

## Integration Contract

The clean contract between public and private code is:

1. local AgentLens computes normalized aggregate sync payloads
2. private enterprise server accepts `TeamSyncBatch`
3. enterprise reporting reuses public-core pricing, metrics, and advice semantics where needed

This keeps parsing and analytics logic consistent while avoiding source duplication.

## Distribution Model

Public package:

- `@rajaraghvendra/agentlens`

Recommended private packages:

- `@agentlens/team-client`
- `@agentlens/team-server`

`team-client` can layer sync and setup commands on top of the public CLI or provide a thin companion binary. `team-server` should remain private and self-hosted.
