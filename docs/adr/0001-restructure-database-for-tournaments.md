# Restructure Database Schema for Unified Tournament and Club Support

## Status

Accepted

## Context

In the v1.0 architecture, the system was originally modelled around a rigid hierarchy designed primarily for academic debate societies (Club => Event => Room). However, it became apparent that the platform also needs to support independent enthusiasts hosting full competitive tournaments. Forcing an enthusiast to create a fake "Club" just to run a weekend tournament results in poor user experience and fractured data. I needed a way to support both casual weekly meetings and structured, multi-round tournament pipelines without creating a deeply nested, parallel hierarchy that would complicate the statistics engine.

## Decision

I'm restructuring the core database schema to utilise a flattened approach. The specific schema migrations are:

- Club renamed to Holding: The top-level entity now acts as a flexible workspace. Have introduced a type constraint (academic or personal) to structurally distinguish between formal university societies and independent enthusiasts.

- Event renamed to Session: This accurately reflects a specific block of time, allowing the entity to seamlessly represent either a casual club meeting or "Round 1" of a major tournament.

- New Motions Table: Introducing a dedicated table for debate motions, linked directly to Sessions. Crucially, this table includes an is_released boolean flag. This allows Tournament Owners to safely pre-configure all Sessions and their Motions in advance. The backend will hide the motion text from standard users until it is officially revealed by an authorized colleague.

## Consequences

- **What becomes easier:** The system is now infinitely more scalable and can handle diverse debate formats natively. This refactor cleanly preserves existing Role-Based Access Control (RBAC) and transactional matchmaking algorithms without requiring dual logic paths. Generating long-term user statistics is also heavily simplified.

- **What becomes more difficult:** This introduces an immediate technical debt. I have to execute a database migration to update foreign keys and table names. Additionally, must refactor existing controllers, authentication middleware, and API routes to align with the new Holding and Session nomenclature before deploying v2.0.
