# 4. Speaker-Centric Universal Architecture

## Status

Proposed

## Context

The current API (v1) is hardcoded to the British Parliamentary (BP) debate format:
- Teams are fixed at 2 speakers (opener/closer)
- Rooms require exactly 4 teams in positions OG/OO/CG/CO (enum)
- Scoring is a single integer per speaker
- There is no support for adjudicator panels, multi-criteria scoring, or reply speeches

This makes it impossible to store events in any other format — Australs (3+reply, 2 teams), Policy (cross-examination), Lincoln-Douglas (1v1), WSDC (3+reply, multi-criteria), Public Forum, or custom formats.

The platform's goal is to serve ANY debate community, not just BP. We need a schema that can store any debate event without structural changes.

We studied Tabbycat (the open-source gold standard for debate tabulation) and adopted key lessons from its architecture while simplifying its approach.

## Decision

We will replace the current data model with a speaker-centric architecture where:

**1. The atomic unit is the speaker slot, not the team.**

A speaker record represents one person giving one speech at a specific side and position in a debate. Every debate format decomposes to an ordered set of speaker slots:
- BP: 4 sides × 2 positions = 8 slots
- Australs: 2 sides × 4 positions (3 substantive + 1 reply) = 8 slots
- Lincoln-Douglas: 2 sides × 1 position = 2 slots

**2. The session carries a scheme (JSONB) that defines the debate format.**

Instead of Tabbycat's ~100 key-value preference rows per tournament, we store a single JSON document per session that fully describes: sides, positions, scoring rules, adjudication type, and mechanics. All debates in one session must conform to this scheme.

A session can be anything — a single practice debate, a club meeting, or a full WUDC tournament.

**3. Person and User are separated.**

A person (name, email, institution) exists independently of a login account. Tab directors can register participants by name without requiring accounts. Users can later claim their person record via self-registration.

**4. Teams are optional.**

Not all formats have teams (Lincoln-Douglas is 1v1). Teams exist as an optional grouping layer — a named set of persons registered to a session. The speaker table is the source of truth for who actually spoke.

**5. Scores are per-speaker per-adjudicator.**

This supports both consensus panels (one score set) and voting panels (each judge scores independently). Multi-criteria scoring (Matter/Manner/Method) is handled via a score_details join table.

### New tables (replacing v1):

| New | Replaces | Purpose |
|-----|----------|---------|
| persons | _(new)_ | Human identity, independent of auth |
| users | users | Auth account, links to person |
| sessions | holdings + sessions | Event container with scheme JSONB |
| debates | rooms | One matchup within a session |
| speakers | room_speakers | Atomic unit: person + side + position |
| scores | _(new)_ | Per-speaker per-adjudicator score |
| score_details | _(new)_ | Multi-criteria breakdown |
| debate_sides | room_teams | Aggregate result per side |
| debate_adjudicators | rooms.judge column | Judge panel support |
| session_roles | owners + admins | Generic role-based access per session |
| teams | teams | Optional, session-scoped, variable size |
| team_members | _(new)_ | Person membership in teams |
| motions | motions | Per-session with round grouping |

### Format presets:

Only BP is shipped initially. The architecture supports adding other formats (Australs, WSDC, Policy, LD, etc.) later by providing new scheme JSON — no code changes required.

## Consequences

**What becomes easier:**
- Supporting new debate formats requires zero code changes — just a new scheme JSON
- Adjudicator panels, multi-criteria scoring, and reply speeches work out of the box
- Person/User separation enables paper-entry tournaments and self-registration
- The scheme JSON is self-describing — frontends can render ballot forms dynamically from it
- Data is portable: export a session and its scheme together, import elsewhere

**What becomes more difficult:**
- This is a breaking change. All v1 endpoints and tables are replaced.
- Existing v1 data cannot be auto-migrated (it was test data only).
- The scheme validation adds a layer of indirection — scores are validated against runtime config, not static constraints.
- Developers must understand the scheme contract to work with the API.

**What we chose NOT to do (vs Tabbycat):**
- No ~100 preference rows per tournament — one JSON document instead
- No mandatory Team model — teams are optional
- No separate Round table — rounds are an optional label on debates
- No adjudicator feedback system (deferred)
- No break qualification engine (deferred)
- No draw generation algorithms (deferred)
