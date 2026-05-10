# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Swagger UI:** Initialised OpenAPI documentation and interactive testing environment.

## [1.3.0] - 2026-05-10

### Changed

- **Database Engine:** Migrated the core database dialect from MS SQL Server (`tedious`) to PostgreSQL (`pg`, `pg-hstore`).
- **Schema Types:** Converted MS SQL-specific `STRING("MAX")` definitions to PostgreSQL `TEXT` types.
- **Configuration:** Updated environment variables to standardise around PostgreSQL conventions (replaced `DB_SERVER` with `DB_HOST` and added `DB_PORT`).

## [1.2.1] - 2026-05-08

### Changed

- **Database Management:** Transitioned from `sequelize.sync()` to a formal Sequelize CLI migration and seeding pipeline for production readiness.
- **Module Imports:** Refactored controller and middleware imports to target the explicit `models/index.js`.

### Documentation

- **README:** Updated local setup instructions to reflect the new database migration and seeding commands.

## [1.2.0] - 2026-04-25

### Added

- **Motions Engine:** Introduced the `Motion` model and dedicated `/sessions/:sessionId/motion` nested routes.
- **Competitive Integrity:** Implemented backend redaction logic. If a motion is marked as `is_released: false`, the API intercepts standard user requests and strips the `motion_text` and `infoslide` to prevent early leaks, revealing them only when toggled by the Owner.
- **Type Validation:** Added strict controller-level validation for Holding creation, enforcing the `academic` or `personal` type distinction.

### Changed

- **Query Optimisation:** Refactored `getSessionRooms` and `getSessionTeams` to explicitly select attributes, removing redundant raw foreign-key IDs and dramatically reducing JSON payload sizes.
- **Session Context:** Read requests for nested session resources now automatically fetch and wrap the `session.name` in the payload for easier frontend rendering.

## [1.1.0] - 2026-04-22

### Added

- **JWT Authentication:** Implemented `jsonwebtoken` to securely sign and verify user sessions.
- **Nested Routers:** Introduced Express routers with `{ mergeParams: true }` to properly handle deeply nested relational endpoints.
- **Child Routes:** Added dedicated `teamRoutes.js`, `waitlistRoutes.js`, and `roomRoutes.js` to isolate domain logic.

### Changed

- **Authentication Pipeline:** Replaced the insecure custom `x-user-id` header with standard `Authorization: Bearer <token>` verification.
- **Database Schema Nomenclature:** Refactored `Club` to `Holding` and `Event` to `Session` across all controllers to natively support both academic societies and independent tournaments.
- **Route Restructuring:** Split the monolithic `eventRoutes.js` file into cleanly separated parent-child route files for better maintainability.
- **Middleware Logic:** Updated `restrictTo` RBAC middleware to accurately trace and verify ownership permissions based on the new `holding_id` and `session_id` architecture.

### Fixed

- Resolved variable collision bugs in the authentication middleware.
- Corrected payload casing and parameter extraction typos across various controllers.
