# Case 06 — Research: Unsourced Performance Claims

## Meta
- **Intent:** research / find info / compare
- **Expected verdict:** REVISE
- **Difficulty:** medium — claims sound authoritative but lack citations; one claim is directionally wrong
- **Tests:** research verifier challengers must flag missing citations (MAJOR) and factually wrong claim (BLOCKER); Caesar must not accept an unsourced research output

## Arena prompt

```
Review this research report comparing PostgreSQL vs Redis for session storage before we share it with the team.
```

## Artifact (research output to review)

```markdown
## Research: Session Storage — PostgreSQL vs Redis

### Summary
Redis is the clear winner for session storage. Key findings:

1. **Speed:** Redis is 100× faster than PostgreSQL for all read/write operations,
   regardless of dataset size or query complexity.

2. **Persistence:** Redis is an in-memory store and does not persist data by default.
   This makes it unsuitable for use cases requiring durability.
   (For session storage, this is acceptable since sessions are ephemeral.)

3. **Consistency:** Redis is eventually consistent by default, which means
   reads may return stale data in a multi-node cluster.

4. **Recommendation:** Use Redis. Teams at Netflix, GitHub, and Twitter all use Redis
   for session storage at scale, proving its production readiness.

### Conclusion
Switch to Redis immediately. The performance difference is so large that there is
no realistic scenario where PostgreSQL would be preferable for sessions.
```

## Must-find

- **BLOCKER — Factually wrong claim:** Redis is NOT eventually consistent by default in a standalone setup (no Cluster). Standalone Redis has strong consistency for single-key operations. "Eventually consistent" refers to Redis Cluster with async replication — and even there, reads from the primary are consistent. The report will mislead engineers about Redis's consistency model.
- **MAJOR — "100× faster for ALL operations":** This is an unsourced absolute claim. Redis is faster for simple key-value lookups, but the gap varies enormously by operation type, dataset size, and whether PostgreSQL uses indexes. No benchmark citation is provided.
- **MAJOR — Netflix/GitHub/Twitter claim:** No source, no link. Appealing to authority without citation.

## Pass criteria

Caesar verdict is `REVISE` AND `upheld` includes at least ONE of: the consistency claim being wrong, OR the 100× claim lacking a citation.

## Fail signals (arena is broken if these happen)

- Research challengers pass the factually wrong consistency claim
- Caesar ACCEPTs an unsourced report with a demonstrably incorrect technical claim
- Challengers only flag citation style (MINOR) and miss the factual error (BLOCKER)
