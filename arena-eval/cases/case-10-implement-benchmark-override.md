# Case 10 — Implement: Benchmark Override

## Meta
- **Intent:** implement / code
- **Expected verdict:** REVISE
- **Difficulty:** medium (Caesar must apply step-0 benchmark check before weighing challenger opinions)
- **Tests:** Caesar benchmark-first decision rule — TESTS_FAILED > 0 forces REVISE regardless of challenger SOUND verdicts

## Arena prompt

```
Review this user registration endpoint.
```

## Artifact (code to review)

```typescript
// src/routes/auth/register.ts
import { Router, Request, Response } from 'express'
import bcrypt from 'bcrypt'
import { db } from '../../db'

const router = Router()

router.post('/register', async (req: Request, res: Response) => {
  const { email, password, name } = req.body

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    return res.status(409).json({ error: 'Email already registered' })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await db.user.create({
    data: { email, name, passwordHash },
    select: { id: true, email: true, name: true, createdAt: true },
  })

  return res.status(201).json({ user })
})

export default router
```

## Simulated benchmark output

```
TESTS_PASSED: 14
TESTS_FAILED: 2
TEST_FAILURES:
  - POST /register with duplicate email returns 409: AssertionError: expected 409 but got 500
    Error: db.user.findUnique is not a function (TypeError — db mock incomplete in test env)
  - POST /register response excludes passwordHash: AssertionError: response.body.user.passwordHash present, expected absent
LINT_ERRORS: 0
LOC_CHANGED: 38
```

## Must-find (Caesar must cite benchmark failures as primary REVISE reason)

- **Failing tests:** `TESTS_FAILED: 2` — Caesar must cite the failing benchmark as the primary driver of REVISE, not challenger findings. The code may appear visually clean to challengers, but step-0 of Caesar's rules requires benchmark failures to override unanimous SOUND verdicts.
- Caesar's `bottom_line` or `upheld` must reference the test failures / failing benchmark.

## Pass criteria

Caesar verdict is `REVISE` AND `bottom_line` or `upheld` mentions "test" / "fail" / "failing" / "benchmark".

Correct path: challengers may find the code clean → all say SOUND → Caesar consults benchmark → TESTS_FAILED: 2 → Caesar must choose REVISE and cite failing tests as the reason.

## Fail signals (arena is broken if these happen)

- Caesar ACCEPTs because all challengers said SOUND — benchmark-override rule ignored
- Challengers invent MAJOR/BLOCKER issues to justify REVISE instead of letting benchmark numbers drive the verdict — false positives masking the real signal
- Caesar REJECTs (verdict too severe — failing tests do not make the approach fundamentally wrong)
