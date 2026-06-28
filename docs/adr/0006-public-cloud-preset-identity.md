# ADR 0006: Public cloud preset identity

## Decision
Public user cloud shares are user-owned logical presets. Two users saving the same displayed name must not append versions to the same public logical identity unless an explicit owner/admin update flow is used.

## Consequences
- New public cloud saves include owner identity in logical uniqueness.
- Name collisions across different owners create separate preset ids.
- Existing legacy reads remain compatible.
- Rename/existence checks must be scoped by owner where applicable.
- Legacy `owner_key = 'public'` rows remain readable for compatibility, but new user-originated public shares use an owner-scoped public key.
