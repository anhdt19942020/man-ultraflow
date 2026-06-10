# Case 14 — Debug: Hypothesis Diversity (Three Competing Root Causes)

## Meta
- **Intent:** debug / find root cause / why
- **Expected verdict:** REVISE
- **Difficulty:** hard — three plausible hypotheses; only one is supported by concrete code evidence; requires hypothesis discipline and evidence-based selection
- **Tests:** Debug-intent angle diversity — three debug challengers must pursue DISTINCT hypotheses; Caesar must select the hypothesis backed by concrete evidence, not majority opinion

## Arena prompt

```
Our background job service starts failing with 503 errors after running for 4-6 hours. Restarts fix it temporarily. Find the root cause.
```

## Artifact (code + symptoms to analyze)

```python
# jobs/sync_job.py
import psycopg2
from db import get_connection

def sync_user_data(user_ids: list[int]) -> None:
    """Sync user records from external API to local DB. Called every 5 minutes."""
    conn = get_connection()
    cursor = conn.cursor()

    for user_id in user_ids:
        try:
            data = fetch_from_api(user_id)   # external HTTP call
            cursor.execute(
                "UPDATE users SET data = %s, synced_at = NOW() WHERE id = %s",
                (data, user_id)
            )
        except Exception as e:
            # Log and continue to next user
            logger.warning(f"Failed to sync user {user_id}: {e}")
            continue

    cursor.close()
    # Note: conn.commit() and conn.close() are intentionally omitted here
    # (the author assumed the connection pool handles cleanup)
```

```python
# db.py
import psycopg2.pool

_pool = psycopg2.pool.ThreadedConnectionPool(
    minconn=5,
    maxconn=20,
    dsn=os.environ['DATABASE_URL']
)

def get_connection():
    return _pool.getconn()   # caller must call _pool.putconn(conn) when done
```

**Error logs (excerpted from 4-hour window):**

```
[T+0h] INFO  sync_job started, pool: 5/20 connections active
[T+1h] INFO  sync_job running, pool: 8/20 connections active
[T+2h] INFO  sync_job running, pool: 13/20 connections active
[T+3h] INFO  sync_job running, pool: 18/20 connections active
[T+4h] WARNING sync_job running, pool: 20/20 connections active — waiting for free slot
[T+4h10m] ERROR 503 Service Unavailable — connection pool exhausted
[T+4h10m] INFO  service restarted — pool reset to 5/20
```

**DB slow query log (same window):** No queries exceeding 50ms. Average query: 3ms.

**Server metrics:** CPU 12%, memory stable at 420MB (within normal range).

## Competing hypotheses (each debug challenger must pursue one DISTINCT lead)

### Hypothesis A — Pool size too small
> The `maxconn=20` limit is too low for the workload. Peak traffic exhausts the pool.

Evidence against: pool usage grows linearly even during off-peak hours (2am–6am, low traffic). If it were a traffic spike issue, usage would correlate with traffic, not time. Additionally, DB slow query log shows no slow queries that would hold connections for extended periods.

### Hypothesis B — Slow queries holding connections
> Long-running DB queries hold connections for seconds, causing temporary exhaustion.

Evidence against: DB slow query log explicitly shows no queries over 50ms. Average is 3ms. Connections are not being held long per query.

### Hypothesis C — Connection never returned to pool (correct root cause)
> `sync_job.py` calls `get_connection()` but never calls `_pool.putconn(conn)`. Every sync cycle leaks one connection back into the pool. After N cycles (N = pool maxconn = 20), the pool is exhausted permanently until restart.

Evidence for: pool usage grows by ~1 per sync cycle regardless of traffic (monotonic increase visible in logs). `db.py` requires callers to call `putconn()` explicitly — `sync_job.py` never does. `conn.commit()` and `conn.close()` are also missing — transactions are left open, holding DB locks in addition to pool slots.

## Must-find

Caesar must uphold the **connection never returned to pool** root cause, citing:
- `get_connection()` called without matching `_pool.putconn(conn)` in `sync_job.py`
- Monotonic pool growth in the logs (independent of traffic)

Keywords: `putconn` / `connection leak` / `pool` / `not returned` / `missing putconn` / `commit` / `never released`

## Pass criteria

Caesar verdict is `REVISE` AND `upheld` includes at least one entry referencing the missing `putconn` / connection not returned to pool / connection leak.

Correct path: debug challenger pursuing Hypothesis C finds concrete code evidence (`putconn` missing) and log evidence (monotonic pool growth); challengers pursuing A and B find weak or no supporting evidence; Caesar selects C as the upheld root cause.

## Fail signals (arena is broken if these happen)

- All three debug challengers pursue the same hypothesis (angle overlap — diversity rule violated)
- Caesar picks Hypothesis A (pool too small) without evidence — ignores the log pattern
- Caesar picks Hypothesis B (slow queries) despite the slow query log showing zero slow queries
- Caesar concludes "unclear" and recommends REVISing all three without selecting the evidence-backed root cause
- `putconn` or connection-leak keywords absent from Caesar's upheld objections
