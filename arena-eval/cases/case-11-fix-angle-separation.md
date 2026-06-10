# Case 11 — Fix: Angle Separation

## Meta
- **Intent:** fix
- **Expected verdict:** REJECT
- **Difficulty:** hard (requires two distinct challenger angles to both fire; single-angle coverage misses either root cause or regression)
- **Tests:** Fix-intent angle separation — debug challenger verifies root cause, code-review challenger catches regression introduced by the fix

## Arena prompt

```
Users are randomly getting logged out on our platform. A teammate submitted this fix. Review it.
```

## Artifact (code to review)

```python
# auth/middleware.py

def get_current_user(request):
    try:
        user_id = request.session['user_id']
        user = User.objects.get(id=user_id)
        return user
    except Exception:
        # Session expired or missing — treat as anonymous
        return None

# Previously:
# def get_current_user(request):
#     user_id = request.session['user_id']   # KeyError if session missing
#     user = User.objects.get(id=user_id)    # DoesNotExist if user deleted
#     return user
```

## Must-find (TWO groups — both required for a passing verdict)

**Group A — debug angle (wrong root cause):**
- The fix silences the exception but does not address why sessions expire in the first place. The real issue is sessions expiring without renewal — there is no sliding expiry / session renewal on active requests. Users still get logged out when TTL expires; the fix just stops raising an exception and returns `None` silently instead of crashing.
- Keywords: root cause / symptom / sliding / renew / session renewal / expire

**Group B — code-review angle (regression introduced by fix):**
- `except Exception` is dangerously broad. It catches `DatabaseError` and `OperationalError` (DB outage) → during an outage, all users are silently treated as anonymous, allowing unauthenticated access to authenticated routes. It also swallows any future `AttributeError` from refactors, masking bugs.
- Keywords: regression / broad / except exception / DatabaseError / OperationalError / mask / swallow

Both groups must appear in Caesar's `upheld` list for the verdict to be correct. Missing either group means a challenger angle failed.

## Pass criteria

Caesar verdict is `REJECT` AND `upheld` contains at least one keyword from Group A AND at least one keyword from Group B.

Correct path: debug challenger finds wrong root cause (sessions still expire) → BLOCKER; code-review challenger finds dangerous broad except clause → BLOCKER or MAJOR; Caesar REJECTs because the fix approach itself is wrong (silence-the-error rather than fix-the-cause).

## Fail signals (arena is broken if these happen)

- Both challengers attack the same angle (e.g. both note "wrong root cause") — angle overlap means regression is missed
- Caesar REVISEs instead of REJECTs — the fix approach (silencing the error) is fundamentally wrong, not just incomplete
- No mention of broad `except Exception` swallowing `DatabaseError` — code-review challenger missed the regression
- Only Group A keywords present but not Group B (or vice versa) — one challenger failed its assigned lens
