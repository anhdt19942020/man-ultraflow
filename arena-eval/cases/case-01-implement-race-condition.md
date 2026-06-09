# Case 01 — Implement: TOCTOU Race Condition

## Meta
- **Intent:** implement / code
- **Expected verdict:** REVISE
- **Difficulty:** medium (race condition requires concurrent-access reasoning)
- **Tests:** challenger code-review catches BLOCKER concurrency bug; Caesar upholds it

## Arena prompt

```
Review this user creation endpoint. It should ensure no duplicate emails are created.
```

## Artifact (code to review)

```javascript
// src/api/users.js
async function createUserIfNotExists(email) {
  const existing = await db.users.findOne({ email })
  if (existing) return existing

  const user = await db.users.create({
    email,
    createdAt: new Date(),
    role: 'member',
  })
  return user
}

async function POST_register(req, res) {
  const { email, password } = req.body
  const user = await createUserIfNotExists(email)
  await setPassword(user.id, password)
  res.json({ userId: user.id })
}
```

## Must-find (challenger must raise as BLOCKER or MAJOR)

- **Race condition / TOCTOU:** two concurrent `POST /register` requests with the same email will both pass the `findOne` check (both read null), then both call `db.users.create` → duplicate users created. `findOne` + `create` is not atomic.
- Fix direction: use `upsert` with unique constraint on `email`, or a DB-level unique index + catch constraint violation.

## Pass criteria

Caesar verdict is `REVISE` or `REJECT` AND `upheld` array includes an entry referencing the race condition / TOCTOU / concurrency / non-atomic check-then-act pattern.

## Fail signals (arena is broken if these happen)

- Caesar ACCEPTs → challengers missed a BLOCKER-level concurrency bug
- Challengers raise only MINOR issues (style, naming) and miss the race
