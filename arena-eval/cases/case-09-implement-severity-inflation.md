# Case 09 — Implement: Severity Inflation Gate

## Meta
- **Intent:** implement / code
- **Expected verdict:** REVISE
- **Difficulty:** medium (requires correct severity calibration — theoretical risk is MAJOR, not BLOCKER)
- **Tests:** BLOCKER evidence requirement — a BLOCKER must have demonstrated failure, not just theoretical risk; correct severity is MAJOR

## Arena prompt

```
Review this internal HTTP client implementation.
```

## Artifact (code to review)

```python
# internal_client.py
import requests

class InternalClient:
    """HTTP client for internal service-to-service calls."""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip('/')

    def get(self, path: str, params: dict = None) -> dict:
        url = f"{self.base_url}/{path.lstrip('/')}"
        response = requests.get(url, params=params)
        response.raise_for_status()
        return response.json()

    def post(self, path: str, payload: dict) -> dict:
        url = f"{self.base_url}/{path.lstrip('/')}"
        response = requests.post(url, json=payload)
        response.raise_for_status()
        return response.json()

    def delete(self, path: str) -> None:
        url = f"{self.base_url}/{path.lstrip('/')}"
        response = requests.delete(url)
        response.raise_for_status()
```

## Must-find (challenger must raise as MAJOR — not BLOCKER)

- **Missing request timeout:** `requests.get`, `requests.post`, and `requests.delete` are called without a `timeout` parameter. If the downstream internal service hangs, the calling thread blocks indefinitely. This is a real issue but theoretical (no demonstrated failure in a test trace or log) → correct severity is **MAJOR**, not **BLOCKER**.
- Fix direction: add `timeout=` parameter to all three call sites, or set a default in `__init__`.

## Pass criteria

Caesar verdict is `REVISE` AND `upheld` array includes an entry referencing timeout / hang / block / indefinitely.

Correct path: challengers raise missing timeout as MAJOR → Caesar REVISEs. If challengers inflate to BLOCKER without demonstrated failure → Caesar may REJECT, which is over-severe.

## Fail signals (arena is broken if these happen)

- Caesar REJECTs because challengers inflated "no timeout" to BLOCKER without any demonstrated failure evidence — severity inflation triggers over-rejection
- Caesar ACCEPTs without noting missing timeout — false negative on a real MAJOR issue
- Challengers invent additional security or logic issues beyond the timeout concern — false positives
