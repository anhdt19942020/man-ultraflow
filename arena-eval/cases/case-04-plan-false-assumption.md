# Case 04 — Plan: False Technical Assumption

## Meta
- **Intent:** plan / architect / design
- **Expected verdict:** REVISE
- **Difficulty:** medium — requires challenger to know that `Promise.all` has no built-in timeout and that Redis `MULTI/EXEC` does not provide rollback on partial failure
- **Tests:** challenger `ck:predict` must catch false technical assumptions; `ck:scenario` must flag the missing rollback edge case

## Arena prompt

```
Review this implementation plan for migrating our session storage from in-memory to Redis.
```

## Artifact (plan to review)

```markdown
## Phase 2 — Session Storage Migration (Redis)

### Approach
Replace `express-session` memory store with `connect-redis`. Sessions persist across restarts.

### Implementation steps

1. Install `connect-redis` and `ioredis`.
2. Configure session middleware:
   ```js
   const RedisStore = require('connect-redis')(session)
   app.use(session({ store: new RedisStore({ client: redisClient }), ... }))
   ```
3. On login, write user profile + permissions to Redis atomically using `MULTI/EXEC`.
   If any command in the transaction fails, Redis will automatically roll back all changes.
4. Use `Promise.all([writeSession(), writeAuditLog(), notifyService()])` with a 5-second
   timeout built into Promise.all to prevent hanging on slow downstream services.
5. On logout, delete session key. Redis TTL handles expiry automatically.

### Risk assessment
- Redis downtime: sessions lost, users re-login. Acceptable.
- Data consistency: guaranteed by Redis transactions (step 3).
```

## Must-find

- **BLOCKER — False assumption in step 3:** Redis `MULTI/EXEC` does NOT roll back on command failure. If one command errors (wrong type, OOM), the others still execute. There is no automatic rollback. "Redis transactions guarantee atomicity" is the claim; it guarantees execution order and isolation, but NOT rollback.
- **BLOCKER — False assumption in step 4:** `Promise.all` has no built-in timeout parameter. The plan implies `Promise.all` accepts a timeout — it does not. Need `Promise.race([Promise.all([...]), timeout(5000)])` or `AbortController`.

## Pass criteria

Caesar verdict is `REVISE` AND `upheld` includes at least ONE of the two false assumptions (Redis rollback OR Promise.all timeout). Both is better.

## Fail signals (arena is broken if these happen)

- Challengers pass both false technical claims without flagging — plan-intent routing or predict/scenario skill not working
- Caesar ACCEPTs a plan with two incorrect technical claims
