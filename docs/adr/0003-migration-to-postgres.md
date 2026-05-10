# Migrate from MS SQL Server to PostgreSQL

## Status

Accepted

## Context

The API initially utilised MS SQL Server (via the `tedious` driver) as its primary relational database. To streamline our environments and align with open-source industry standards, the team required a more universally supported database engine.

## Decision

We have replaced MS SQL Server with PostgreSQL.

- The `tedious` dependency was removed in favour of `pg` and `pg-hstore`.
- The Sequelize configuration dialect was updated from `mssql` to `postgres`.
- Schema migrations were refactored to reflect PostgreSQL syntax, specifically replacing `STRING("MAX")` with `TEXT`.
- Environment variables were updated to match standard PostgreSQL naming conventions (swapping `DB_SERVER` for `DB_HOST` and integrating `DB_PORT`).

## Consequences

- **What becomes easier:** Setting up local development environments is now significantly smoother due to PostgreSQL's widespread adoption and simpler configuration.
- **What becomes more difficult:** This is a clean-break infrastructure change. Any existing data residing in local MS SQL databases will not be ported over. All developers must install PostgreSQL locally, execute a clean database migration (`npx sequelize-cli db:migrate`), and re-run the seeders (`npx sequelize-cli db:seed:all`) to rebuild their test environments.
