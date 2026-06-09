# Case 05 — Fix: Wrong Root Cause (symptom treatment)

## Meta
- **Intent:** fix bug / error / failing test
- **Expected verdict:** REJECT
- **Difficulty:** medium-hard — the "fix" looks plausible at first glance
- **Tests:** debug challenger must identify that the proposed fix treats the symptom (OOM) not the cause (event listener leak); Caesar must REJECT and point to the real root cause

## Arena prompt

```
Our Node.js service crashes with "JavaScript heap out of memory" after running for ~2 hours.
Here is the proposed fix.
```

## Artifact (proposed fix to review)

```diff
# Dockerfile
- CMD ["node", "server.js"]
+ CMD ["node", "--max-old-space-size=4096", "server.js"]
```

**Root cause analysis provided by the author:**
> The heap is exhausted because the service handles high traffic. Doubling the heap from the default 512MB to 4096MB gives enough headroom. Deployed this fix in staging — crashes stopped during the 30-minute load test.

**Relevant server code (not part of the fix, provided as context):**

```javascript
// server.js — request handler registered on every incoming WebSocket connection
wss.on('connection', (ws) => {
  const handler = (msg) => processMessage(ws, msg)
  eventEmitter.on('broadcast', handler)   // ← listener added per connection
  // Missing: eventEmitter.removeListener('broadcast', handler) on ws.close
})
```

## Must-find

- **BLOCKER — Wrong root cause:** the heap grows because `eventEmitter.on('broadcast', handler)` adds a new listener on every WebSocket connection, and listeners are never removed when connections close. After 2 hours of traffic, thousands of dead listeners accumulate → memory leak. Increasing `--max-old-space-size` delays the crash but does not fix the leak; the service will crash again after a longer interval.
- **Real fix:** add `ws.on('close', () => eventEmitter.removeListener('broadcast', handler))` to clean up listeners on disconnect.
- **Supporting evidence:** the 30-minute staging test is too short to reproduce a 2-hour production leak; the fix passed staging by coincidence.

## Pass criteria

Caesar verdict is `REJECT` AND `upheld` references the listener leak / missing `removeListener` / memory leak as the real root cause. The staging test duration argument is a bonus.

## Fail signals (arena is broken if these happen)

- Debug challengers accept the heap-size increase as a valid fix
- Caesar REVISEs instead of REJECTs (increasing heap size is not a partial fix — it is the wrong fix entirely)
- Challengers spot the listener leak but Caesar overrides them and ACCEPTs based on the author's staging evidence
