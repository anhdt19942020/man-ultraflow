# Case 02 — Implement: Clean Code (false-positive gate)

## Meta
- **Intent:** implement / code
- **Expected verdict:** ACCEPT
- **Difficulty:** easy — this is intentionally correct code
- **Tests:** arena must NOT invent issues on clean, correct code. High false-positive rate = broken challengers.

## Arena prompt

```
Review this discount calculation utility added to the billing module.
```

## Artifact (code to review)

```python
# billing/discount.py
from decimal import Decimal, ROUND_HALF_UP

def calculate_discounted_price(unit_price: Decimal, discount_pct: Decimal) -> Decimal:
    """Return unit_price reduced by discount_pct (0–100). Raises ValueError on invalid input."""
    if not isinstance(unit_price, Decimal) or unit_price < 0:
        raise ValueError(f"unit_price must be a non-negative Decimal, got {unit_price!r}")
    if not isinstance(discount_pct, Decimal) or not (Decimal("0") <= discount_pct <= Decimal("100")):
        raise ValueError(f"discount_pct must be Decimal in [0, 100], got {discount_pct!r}")

    multiplier = (Decimal("100") - discount_pct) / Decimal("100")
    return (unit_price * multiplier).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
```

```python
# billing/test_discount.py
import pytest
from decimal import Decimal
from billing.discount import calculate_discounted_price

@pytest.mark.parametrize("price,pct,expected", [
    (Decimal("100.00"), Decimal("10"), Decimal("90.00")),
    (Decimal("99.99"),  Decimal("0"),  Decimal("99.99")),
    (Decimal("50.00"),  Decimal("100"), Decimal("0.00")),
    (Decimal("1.005"),  Decimal("0"),  Decimal("1.01")),   # rounding
])
def test_happy_path(price, pct, expected):
    assert calculate_discounted_price(price, pct) == expected

def test_negative_price_raises():
    with pytest.raises(ValueError):
        calculate_discounted_price(Decimal("-1"), Decimal("10"))

def test_pct_out_of_range_raises():
    with pytest.raises(ValueError):
        calculate_discounted_price(Decimal("100"), Decimal("101"))

def test_wrong_type_raises():
    with pytest.raises(ValueError):
        calculate_discounted_price(100.0, Decimal("10"))  # float, not Decimal
```

## Must-find

Nothing critical. If challengers find only genuine MINOR observations (e.g., "consider adding `__all__`", "docstring could note rounding mode"), that is acceptable noise.

## Pass criteria

Caesar verdict is `ACCEPT`. `upheld` array is empty or contains only MINOR items. No BLOCKER or MAJOR upheld.

## Fail signals (arena is broken if these happen)

- Caesar REVISEs or REJECTs based on fabricated issues → false-positive failure
- Challengers invent BLOCKERs (e.g., "no input validation" when validation is clearly present)
