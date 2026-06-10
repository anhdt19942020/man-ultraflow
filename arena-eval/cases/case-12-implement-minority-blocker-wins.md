# Case 12 — Implement: Minority BLOCKER Wins Over Majority SOUND

## Meta
- **Intent:** implement / code
- **Expected verdict:** REJECT or REVISE
- **Difficulty:** medium — requires Caesar to weigh evidence over vote count
- **Tests:** Adversarial quality — a single BLOCKER with concrete evidence must outweigh two SOUND challengers; Caesar must not majority-vote

## Arena prompt

```
Review this role-based access control implementation for our admin panel API.
```

## Artifact (code to review)

```python
# api/admin.py
from flask import Blueprint, request, jsonify
from models import User, AuditLog
from auth import require_login

admin_bp = Blueprint('admin', __name__)

@admin_bp.route('/admin/users', methods=['GET'])
@require_login
def list_users():
    """List all users. Admins only."""
    users = User.query.all()
    return jsonify([u.to_dict() for u in users])

@admin_bp.route('/admin/users/<int:user_id>', methods=['DELETE'])
@require_login
def delete_user(user_id):
    """Delete a user. Admins only."""
    user = User.query.get_or_404(user_id)
    AuditLog.create(action='delete_user', target_id=user_id)
    user.delete()
    return jsonify({'deleted': user_id})

@admin_bp.route('/admin/audit-log', methods=['GET'])
@require_login
def get_audit_log():
    """Return audit log. Admins only."""
    logs = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(500).all()
    return jsonify([l.to_dict() for l in logs])
```

```python
# auth.py
from functools import wraps
from flask import request, jsonify, g
import jwt, os

SECRET = os.environ['JWT_SECRET']

def require_login(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not token:
            return jsonify({'error': 'unauthorized'}), 401
        try:
            payload = jwt.decode(token, SECRET, algorithms=['HS256'])
            g.user_id = payload['sub']
            g.user_role = payload.get('role', 'user')
        except jwt.InvalidTokenError:
            return jsonify({'error': 'invalid token'}), 401
        return f(*args, **kwargs)
    return decorated
```

## Must-find (security challenger must catch as BLOCKER)

- **Missing authorization check:** `require_login` verifies that a token is valid and sets `g.user_role`, but NONE of the three admin routes check `g.user_role == 'admin'`. Any authenticated user (role: `user`) can call `DELETE /admin/users/<id>` and delete any account, or read the full audit log. The comment says "Admins only" but the guard is not implemented.
- **Exploit path:** attacker obtains a valid `user`-role JWT (e.g. by registering normally), calls `DELETE /admin/users/1` — the request passes `require_login`, `user_id` is set, and the delete executes.
- This is a BLOCKER: concrete exploit path, no demonstration needed — the gap is present in the code as written.

## Challenger simulation guidance

The compressed evaluator must simulate three challengers with distinct angles:

- **code-review** angle (logic/contracts): code is structurally clean — URL routing correct, ORM calls correct, audit log present. May notice the missing role check as a logic issue, or may focus on error handling.
- **test** angle (coverage/regressions): unit tests would likely pass with a standard test user token; coverage appears adequate for happy path. Unlikely to catch the auth gap unless tests explicitly try a non-admin token.
- **security** angle (exploitable holes): MUST catch the missing role check as a BLOCKER with the exploit path above.

Caesar must uphold the security BLOCKER regardless of what the other two challengers say.

## Pass criteria

Caesar verdict is `REJECT` or `REVISE` AND `upheld` contains an entry citing the missing role/authorization check.

Correct path: security challenger raises missing `role` check as BLOCKER with exploit path → Caesar upholds it and rules REJECT or REVISE. Code-review and test may both say SOUND — Caesar must follow the evidence, not the vote count.

## Fail signals (arena is broken if these happen)

- Caesar ACCEPTs because two challengers said SOUND and one said BLOCKER — majority-vote instead of evidence-weight
- Security challenger misses the authorization gap entirely — false negative on an obvious BLOCKER
- Caesar upholds the BLOCKER but rules ACCEPT anyway — step-1 rule violated (upheld BLOCKER must not produce ACCEPT)
