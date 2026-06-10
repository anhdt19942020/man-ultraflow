# Case 15 — Research: Disconfirming Angle (One Wrong Claim Must Be Caught)

## Meta
- **Intent:** research / find info / compare
- **Expected verdict:** REVISE
- **Difficulty:** medium — one claim is correct, one is factually wrong; the wrong claim sounds authoritative; requires the disconfirming-angle challenger to actively seek refuting evidence
- **Tests:** Research-intent disconfirming angle — one challenger must seek disconfirming sources and catch the factually wrong claim; Caesar must not accept a report containing a demonstrably incorrect technical statement

## Arena prompt

```
Review this database selection research before we present it to the engineering team next week.
```

## Artifact (research output to review)

```markdown
## Database Selection: MongoDB vs PostgreSQL for New Microservices

### Executive Summary
For new microservices requiring flexible schemas and horizontal scalability,
MongoDB is recommended. For services with complex relational data and
strict transactional requirements, PostgreSQL is the right choice.

### Key Technical Findings

#### 1. Transaction Support
**PostgreSQL** supports full ACID transactions across multiple rows and tables,
making it ideal for financial and inventory workloads.

**MongoDB** is designed for single-document atomicity. It does not support
multi-document ACID transactions, so workflows requiring atomic updates
across multiple collections must be handled in application code.

#### 2. Schema Flexibility
**MongoDB** uses BSON documents with no enforced schema, enabling rapid
iteration without migrations. Fields can be added or removed at any time.

**PostgreSQL** enforces a strict schema; schema changes require ALTER TABLE
migrations which can lock tables on large datasets.

#### 3. Concurrency Model
**PostgreSQL** uses Multi-Version Concurrency Control (MVCC), allowing
readers and writers to operate concurrently without blocking each other
for most workloads.

**MongoDB** uses document-level locking, providing good write throughput
on workloads where documents are updated independently.

### Recommendation
- Choose **MongoDB** for: event logs, user activity feeds, catalog data
- Choose **PostgreSQL** for: financial transactions, inventory, any workflow
  requiring cross-entity atomicity
```

## Must-find

### BLOCKER — Factually wrong claim (disconfirming challenger must catch)

The statement "MongoDB does not support multi-document ACID transactions" is **factually wrong as of MongoDB 4.0 (released 2018)**.

MongoDB 4.0 introduced multi-document ACID transactions across collections within a single replica set. MongoDB 4.2 extended this to sharded clusters. As of MongoDB 6.x+, multi-document transactions are a fully supported, production-ready feature.

The research report, if presented to the engineering team, will lead architects to incorrectly exclude MongoDB from transaction-requiring workloads. This directly affects the recommendation section.

Source: https://www.mongodb.com/docs/manual/core/transactions/

### MAJOR — Recommendation section not updated

The "Recommendation" bullet "Choose PostgreSQL for: any workflow requiring cross-entity atomicity" is based on the wrong claim. If MongoDB supports multi-document transactions, this boundary is less absolute — the recommendation needs nuance.

## Challenger simulation guidance

The compressed evaluator must simulate two or three research challengers:

- **research-1** (confirming angle): verifies PostgreSQL MVCC claim (correct) and schema flexibility claim (correct). Finds citations acceptable.
- **research-2** (disconfirming angle — explicitly assigned to seek refuting sources): must check whether "MongoDB does not support multi-document transactions" is still accurate. Finds MongoDB 4.0 release notes and official transaction docs contradicting the claim. Reports as BLOCKER with citation.
- **research-3** (if 3 challengers): may check the document-level locking claim (partially outdated — MongoDB uses WiredTiger storage engine with intent locks since 3.x, but this is less critical than the transaction claim).

## Pass criteria

Caesar verdict is `REVISE` AND `upheld` contains an entry referencing MongoDB multi-document transaction support (keywords: `transaction` / `multi-document` / `4.0` / `ACID` / `wrong` / `incorrect` / `supported`).

Correct path: disconfirming challenger finds the MongoDB transaction claim is wrong → BLOCKER; confirming challenger validates the PostgreSQL MVCC claim; Caesar REVISEs citing the factually wrong claim.

## Fail signals (arena is broken if these happen)

- Both challengers only confirm claims — no challenger takes the disconfirming angle
- Challengers flag citation style (MINOR) but miss the factually incorrect MongoDB claim
- Caesar ACCEPTs a report containing a demonstrably wrong technical statement
- Caesar REVISEs but for the wrong reason (e.g. formatting only) without citing the MongoDB transaction error
- The MongoDB multi-document transaction keywords are absent from the upheld objections
