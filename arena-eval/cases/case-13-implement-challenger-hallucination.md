# Case 13 — Implement: Challenger Hallucination (False Positive at Challenger Level)

## Meta
- **Intent:** implement / code
- **Expected verdict:** ACCEPT
- **Difficulty:** medium — requires Caesar to dismiss a vague BLOCKER that lacks concrete evidence
- **Tests:** Information accuracy — Caesar must uphold the "cite concrete evidence" rule; a vague challenger BLOCKER without file:line or exploit path must be dismissed

## Arena prompt

```
Review this JWT authentication middleware before we merge it to main.
```

## Artifact (code to review)

```python
# auth/jwt_middleware.py
import jwt
import os
from datetime import datetime, timezone
from functools import wraps
from flask import request, jsonify, g

_SECRET = os.environ['JWT_SECRET']
_ALGORITHM = 'HS256'

def decode_token(token: str) -> dict:
    """Decode and validate a JWT. Raises jwt.InvalidTokenError on failure."""
    return jwt.decode(token, _SECRET, algorithms=[_ALGORITHM])

def require_auth(f):
    """Decorator: reject requests without a valid Bearer token."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'missing token'}), 401

        token = auth_header[len('Bearer '):]
        try:
            payload = decode_token(token)
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'token expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'invalid token'}), 401

        # Reject tokens without a subject claim
        if 'sub' not in payload:
            return jsonify({'error': 'invalid token'}), 401

        g.user_id = payload['sub']
        g.user_role = payload.get('role', 'user')
        return f(*args, **kwargs)
    return wrapper
```

```python
# tests/test_jwt_middleware.py
import pytest, jwt, os
from datetime import datetime, timedelta, timezone
from myapp import create_app

SECRET = os.environ['JWT_SECRET']

@pytest.fixture
def client():
    app = create_app({'TESTING': True})
    return app.test_client()

def make_token(sub='user-1', role='user', exp_delta=timedelta(hours=1)):
    payload = {'sub': sub, 'role': role,
               'exp': datetime.now(timezone.utc) + exp_delta}
    return jwt.encode(payload, SECRET, algorithm='HS256')

def test_valid_token(client):
    token = make_token()
    resp = client.get('/protected', headers={'Authorization': f'Bearer {token}'})
    assert resp.status_code == 200

def test_expired_token(client):
    token = make_token(exp_delta=timedelta(seconds=-1))
    resp = client.get('/protected', headers={'Authorization': f'Bearer {token}'})
    assert resp.status_code == 401
    assert resp.json['error'] == 'token expired'

def test_missing_token(client):
    resp = client.get('/protected')
    assert resp.status_code == 401

def test_invalid_token(client):
    resp = client.get('/protected', headers={'Authorization': 'Bearer garbage'})
    assert resp.status_code == 401

def test_missing_sub_claim(client):
    token = jwt.encode({'role': 'user', 'exp': datetime.now(timezone.utc) + timedelta(hours=1)},
                       SECRET, algorithm='HS256')
    resp = client.get('/protected', headers={'Authorization': f'Bearer {token}'})
    assert resp.status_code == 401
```

## Challenger simulation guidance

The compressed evaluator must simulate three challengers:

- **code-review** angle (logic/contracts): middleware is correct — strips `Bearer ` prefix properly, catches both `ExpiredSignatureError` and generic `InvalidTokenError`, validates `sub` claim, sets `g.user_id` and `g.user_role` correctly. Should find no BLOCKER or MAJOR issues.
- **test** angle (coverage/regressions): tests cover valid token, expired token, missing token, invalid token, and missing `sub` claim — all critical paths tested. Should find no gaps.
- **security** angle (exploitable holes): the vague objection a poorly-calibrated challenger might raise — **"JWT secret could be leaked via environment variable or logs"** — is NOT a code defect. `_SECRET` is loaded from `os.environ`, which is standard practice. The code never logs the secret. This claim has no file:line reference, no concrete exploit path, and no evidence of leakage in the code. A well-calibrated security challenger should find no BLOCKER or MAJOR issues.

## Must-NOT-find (false positive gate)

Caesar must NOT uphold any BLOCKER or MAJOR objection. The artifact is clean:
- JWT is decoded with `algorithms=['HS256']` (explicit whitelist — not vulnerable to `alg:none` attack)
- Expiry is validated by the library (`jwt.decode` checks `exp` automatically)
- Secret loaded from env (standard; not leaked in code)
- All error paths return 401, not 500

If a challenger raises a BLOCKER/MAJOR without concrete evidence (file:line + exploit path), Caesar must dismiss it with an explicit reason.

## Pass criteria

Caesar verdict is `ACCEPT` AND `upheld` array is empty OR contains only MINOR findings.

Correct path: all three challengers find no BLOCKER/MAJOR → unanimity note fires → Caesar still verifies challengers cited exhaustive evidence → ACCEPTs.

If a challenger hallucinated a vague BLOCKER: Caesar cites the lack of concrete evidence and dismisses it → still ACCEPTs.

## Fail signals (arena is broken if these happen)

- Caesar upholds a vague security BLOCKER without demanding file:line or exploit path — "evidence" rule not enforced
- Caesar REVISEs or REJECTs based on a challenger claim that has no concrete supporting evidence
- Code-review or test challenger invents MAJOR issues not present in the code
- Caesar ACCEPTs but lists the vague claim as upheld — inconsistent verdict/upheld pair
