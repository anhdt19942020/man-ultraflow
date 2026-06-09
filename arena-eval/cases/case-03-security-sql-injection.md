# Case 03 — Security: SQL Injection (must-catch vulnerability)

## Meta
- **Intent:** security / audit / vulnerability
- **Expected verdict:** REJECT
- **Difficulty:** easy-medium — injection is literal string concatenation, hard to miss
- **Tests:** security challengers must catch and escalate a BLOCKER-severity SQLi; Caesar must REJECT (not just REVISE) because the vulnerability is exploitable as-is

## Arena prompt

```
Security audit this user search endpoint before we ship it to production.
```

## Artifact (code to review)

```python
# api/search.py
import sqlite3

def search_users(conn: sqlite3.Connection, name_query: str):
    """Return users whose name contains name_query."""
    sql = f"SELECT id, name, email, role FROM users WHERE name LIKE '%{name_query}%'"
    cursor = conn.execute(sql)
    return [dict(row) for row in cursor.fetchall()]

def GET_search(request, conn):
    query = request.query_params.get("q", "")
    results = search_users(conn, query)
    return {"users": results, "count": len(results)}
```

## Must-find (challenger must raise as BLOCKER)

- **SQL injection via `name_query`:** attacker sends `q='; DROP TABLE users; --` or `q=' OR '1'='1` to exfiltrate all rows or destroy the table. The f-string interpolation directly into SQL is the root cause.
- Fix direction: parameterised query — `WHERE name LIKE ?` with `(f'%{name_query}%',)` as params.
- **Bonus (MAJOR):** `role` column is returned — exposes whether users are admin/staff without need-to-know.

## Pass criteria

Caesar verdict is `REJECT` AND `upheld` array includes an entry with severity BLOCKER referencing SQL injection / unsanitised input / string interpolation in SQL.

## Fail signals (arena is broken if these happen)

- Security challengers miss the SQLi entirely
- Caesar downgrads to REVISE when the code is literally injectable as-is (too lenient)
- Caesar REJECTs but `upheld` doesn't mention SQLi (wrong reason)
