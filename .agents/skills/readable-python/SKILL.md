---
name: readable-python
description: >
  A set of Python code practices to improve code readability.
---

## Function Design

### Do One Thing Per Function

Function do one named job; no surprises.

```python
# ❌ BAD: mixes loading, validation, and saving
def process_order(order_id: str) -> None:
    order = db.fetch_order(order_id)
    if order.total <= 0:
        raise ValueError("invalid total")
    db.save_invoice(order)


# ✅ GOOD: each function has one clear job
def validate_order(order: Order) -> None:
    if order.total <= 0:
        raise ValueError("invalid total")


def create_invoice(order_id: str) -> None:
    order = db.fetch_order(order_id)
    validate_order(order)
    db.save_invoice(order)
```

Small functions easier to test, reuse, read.

**Rule of thumb for spotting violations**: function name containing "and" likely does too much.

### Keep To One Level Of Abstraction Within A Function

Do not mix high-level workflow with low-level details in same function.

```python
# ❌ BAD: high-level workflow mixed with low-level calculation details
def process_order(order: Order) -> None:
    validate(order)

    total = Decimal("0")
    for item in order.items:
        total += item.price * item.quantity
    order.total = total

    charge_customer(order)
    send_confirmation(order)


# ✅ GOOD: each line describes one step at the same level
def process_order(order: Order) -> None:
    validate(order)
    calculate_total(order)
    charge_customer(order)
    send_confirmation(order)
```

Consistent abstraction reads easier. Switching detail levels creates friction.

**Rule of thumb for spotting violations**: mental "zoom in" or "zoom out" between adjacent lines signals mixed abstraction levels.

### Keep Functions Simple

Enforce:

- **Max complexity** (McCabe). Keep branching low; split complex decisions into small functions.
- **Max nested blocks** (no deep if/for/while nesting). Prefer flat code. Handle invalid or uninteresting cases first with guard clauses. Use early returns over deep indentation.

Refactor when limits hit.

```python
# ❌ BAD: Complex nested logic
def process_order(order):
    if order.valid:
        if order.in_stock:
            if order.payment_ok:
                if order.address_valid:
                    # 4 levels deep!
                    ...


# ✅ GOOD: Early returns + helper functions
def process_order(order: Order) -> None:
    if not order.valid:
        raise InvalidOrderError()
    if not order.in_stock:
        raise OutOfStockError()

    validate_payment(order)
    validate_address(order)
    ship_order(order)
```

Simpler function easier to read and test.

**Rule of thumb for spotting violations**: enforce max complexity and nested blocks in linter.

> Ruff Rule: `C901 Complex-Structure`
>
> Ruff Rule: `PLR1702 Too-Many-Nested-Blocks`

### Prefer Obvious Code Over Clever Code

Write for next human reader, not to show Python knowledge.

```python
# ❌ BAD: Dense and mentally expensive
return next(transform(x) for x in items if is_valid(x) and x.enabled)

# ✅ GOOD: More lines, less effort
for item in items:
    if not is_valid(item):
        continue

    if not item.enabled:
        continue

    return transform(item)

raise ItemNotFoundError()
```

Obvious code speeds review.

**Rule of thumb for spotting violations**: if code needs explanation, rewrite it. Clear beats impressive.

### Pass State Instead Of Using Globals

Keep mutable state local; pass dependencies as arguments. Do not assign globals inside functions.

```python
# ❌ BAD: hidden shared state makes behavior hard to follow
count = 0


def increment():
    global count
    count += 1


increment()
print(count)  # 1


# ✅ GOOD: state is explicit at the call site
def increment(count: int) -> int:
    return count + 1


count = 0
count = increment(count)
print(count)  # 1
```

Explicit state easier to test and understand. Globals create hidden coupling.

**Rule of thumb for spotting violations**: monitor `global` usage; usually `global` signals code smell.

> Ruff Rule: `PLW0603 global-statement`

### Separate Business Logic From Implementation

Separate domain decisions from databases, HTTP clients, files, frameworks. Infrastructure code fetches/saves data; business code decides outcomes.

```python
# ❌ BAD: business rule is buried inside infrastructure code
def save_order(db, order_id):
    order = db.fetch_order(order_id)

    total = sum(item.price * item.quantity for item in order.items)

    if total >= 100:
        order.status = "ready_for_free_shipping"
    else:
        order.status = "standard_shipping"

    db.save(order)


# ✅ GOOD: business rule is isolated and testable
def shipping_status_for(order):
    total = sum(item.price * item.quantity for item in order.items)

    if total >= 100:
        return "ready_for_free_shipping"

    return "standard_shipping"


def save_order(db, order_id):
    order = db.fetch_order(order_id)
    order.status = shipping_status_for(order)
    db.save(order)
```

Separated logic tests without external systems and prevents duplicated business rules across adapters.

**Rule of thumb for spotting violations**: database needed to test pricing/status rule means wrong location. Put decisions in plain Python.

## Make Illegal States Impossible

Constrain data shape. Pydantic at edges; dataclasses in core; enums for constrained values.

### Name Magic Values

Move unexplained numbers/strings into named constants. Put shared constants near module top or dedicated constants module (e.g. `constants.py`). Use `enums` for related constants.

```python
# ❌ BAD: the values have no meaning at the call site
def calculate_discount(user_type, order_total):
    if user_type == "premium" and order_total > 100:
        return order_total * 0.85
    return order_total


# ✅ GOOD: the names explain the discount policy
PREMIUM_USER = "premium"
PREMIUM_DISCOUNT_THRESHOLD = 100
PREMIUM_DISCOUNT_MULTIPLIER = 0.85


def calculate_discount(user_type, order_total):
    if user_type == PREMIUM_USER and order_total > PREMIUM_DISCOUNT_THRESHOLD:
        return order_total * PREMIUM_DISCOUNT_MULTIPLIER
    return order_total
```

Named values show intent, reduce inconsistent copies, and make policy changes safer.

**Rule of thumb for spotting violations**: if reader asks "why this value?", name it. Name repeated literals.

> Ruff Rule: `PLR2004 magic-value-comparison` (partially, identifies unnamed magic numbers but not strings)

### Use Enums for Constrained Sets of Values

Use enum for constrained value set. Do not scatter raw status strings through code.

```python
# ❌ BAD: typo-prone magic strings
if order.status == "shippped":
    notify_customer(order)


# ✅ GOOD: allowed values are centralized
class OrderStatus(StrEnum):
    PAID = "paid"
    SHIPPED = "shipped"


if order.status is OrderStatus.SHIPPED:
    notify_customer(order)
```

Hard-coded "magic strings" are hard to maintain, error-prone, and hide valid values. Enums prevent invalid states and improve autocomplete/static analysis.

**Rule of thumb for spotting violations**: string controlling behavior suggests enum.

### Use Dataclasses Not Dictionaries For Domain Data

Use dicts for loose/temporary data (e.g. JSON payloads, metadata, lookup tables, glue code). Prefer dataclasses over anonymous dictionaries for structured data without validation, persistence, or framework behavior. Use Pydantic at IO boundaries needing parsing/validation.

```python
# ❌ BAD: field names and types are implicit
invoice = {
    "id": "INV-123",
    "total": Decimal("149.00"),
    "paid": False,
}

# ✅ GOOD: shape and intent are explicit
from dataclasses import dataclass


@dataclass(frozen=True)
class InvoiceSummary:
    id: str
    total: Decimal
    paid: bool


invoice = InvoiceSummary(
    id="INV-123",
    total=Decimal("149.00"),
    paid=False,
)
```

Named data helps readers/tools understand shape and catches field errors early.

**Rule of thumb for spotting violations**: type domain data (e.g. User, Order, Invoice). Dictionary fine for incidental, dynamic, or external data.

Use dataclass for clear named shape.

### Pydantic Models for All IO

Define Pydantic model; validate external data immediately at boundary before core logic. Examples:

- API responses: `response.json()` → immediate `Model.model_validate()`
- Config files: `json.load()` → immediate `Model.model_validate()`
- CLI arguments*: `argparse.Namespace` → convert to Pydantic model
- Environment variables: use `pydantic-settings` instead of raw `os.getenv()`

```python
# ❌ BAD: Raw dict from API/file
def process_user_data(data: dict) -> None:
    name = data["name"]  # Could fail, no validation
    age = data.get("age", 0)  # Type is Any


# ✅ GOOD: Pydantic model + immediate validation
from pydantic import BaseModel, Field


class UserData(BaseModel):
    name: str = Field(min_length=1)
    age: int = Field(ge=0, le=150)


def process_user_data(data: dict) -> None:
    user = UserData.model_validate(data)  # Fails fast with clear errors
    # Now user.name and user.age are fully typed and validated
```

Validated inputs keep messy external data outside core. Fail early near boundary.

**Rule of thumb for spotting violations**: use Pydantic at edges, dataclasses in core, enums for constrained values. Keep raw payloads out of application.

## Exception Handling

### Keep Try Blocks Narrow

Put only operation raising expected exception inside try block. Keep unrelated work outside handler.

```python
# ❌ BAD: too much code is covered by the same handler
try:
    user = find_user(user_id)
    audit_login(user)
    send_welcome_email(user)
except UserNotFoundError:
    return None

# ✅ GOOD: only the risky lookup is inside the try block
try:
    user = find_user(user_id)
except UserNotFoundError:
    return None

audit_login(user)
send_welcome_email(user)
```

Narrow handlers show expected failure and avoid swallowing later bugs.

**Rule of thumb for spotting violations**: every try-block line must risk caught exception. Move others out.

### Avoid Bare Exceptions

Catch known, actionable exceptions. Avoid bare except blocks, silent pass statements, empty re-raises.

```python
# ❌ BAD: Hides all errors
try:
    risky_operation()
except Exception:
    pass

# ✅ GOOD: Catch specific exceptions
try:
    risky_operation()
except (ValueError, KeyError) as e:
    logger.error(f"Expected error: {e}")
    raise
```

Specific handling shows expected failure and next action. Silent failures make systems unreliable, hard to debug.

**Rule of thumb for spotting violations**: except block must log, recover, translate, or add context. Never hide errors by default.

> Ruff Rule: `E722 bare-except`

### Easier to Ask Forgiveness than Permission (EAFP)

Assume valid keys/attributes exist; handle exceptions when absent.

```python
# ❌ BAD: checks first, then performs a separate operation
if path.exists():
    content = path.read_text()
else:
    content = ""

# ✅ GOOD: performs the operation and handles the expected failure
try:
    content = path.read_text()
except FileNotFoundError:
    content = ""
```

Often shorter, faster code with fewer pre-checks.

**Rule of thumb for spotting violations**: if check only predicts next-line failure, handle failure instead. Ask forgiveness when failure normal and recoverable.

## Types

### Add Type Hints

Use type hints for function parameters, returns, important variables.

```python
# ❌ BAD: callers must guess the expected shape
def calculate_tax(amount, rate):
    return amount * rate


# ✅ GOOD: types make the contract clear
def calculate_tax(amount: Decimal, rate: Decimal) -> Decimal:
    return amount * rate
```

Types improve readability without runtime change. They document intent and help tools find bugs early.

**Rule of thumb for spotting violations**: type anything called by another module. Untyped public functions make callers guess.

> Ruff Rule: `ANN flake8-annotations`

### Avoid Any Where Possible

Do not use `Any` to silence normal application type errors. If boundary value truly needs `Any`, validate or narrow immediately.

```python
# ❌ BAD: Any disables useful checking
def customer_name(customer: Any) -> str:
    return customer["name"]


# ✅ GOOD: the expected shape is explicit
class CustomerPayload(TypedDict):
    name: str


def customer_name(customer: CustomerPayload) -> str:
    return customer["name"]
```

Avoiding `Any` preserves type checking and exposes unclear data contracts.

**Rule of thumb for spotting violations**: treat `Any` as temporary quarantine, not design. Narrow at first reasonable point.

> Ruff Rule: `ANN401 any-type`

## Maintainability

### Don't Repeat Yourself (DRY)

Extract repeated logic representing same rule/workflow. Do not combine unrelated code because it looks similar.

```python
# ❌ BAD: the same logging rule is copied into multiple functions
def save_user(user):
    print("Starting task")
    database.save(user)
    print("Finished task")


def send_email(email):
    print("Starting task")
    email_service.send(email)
    print("Finished task")


# ✅ GOOD: the shared logging rule lives in one place
def log_task(func):
    def wrapper(*args, **kwargs):
        print("Starting task")
        result = func(*args, **kwargs)
        print("Finished task")
        return result

    return wrapper


@log_task
def save_user(user):
    database.save(user)


@log_task
def send_email(email):
    email_service.send(email)
```

Good deduplication keeps fixes synced. Poor deduplication creates awkward, rigid abstractions.

**Rule of thumb for spotting violations**: duplicate knowledge, not text, is problem. Extract copies that must change together.

> SonarQube spots duplicate code lines.

### Make Structure Consistent Everywhere

Developers should predict code before opening file. Keep consistent:

- Naming
- File organisation
- Class responsibilities
- Imports
- Error handling
- Project layout

```python
# BAD: the same role has three different names
class UserService: ...


class ProductManager: ...


class InvoiceHandler: ...


# GOOD: the naming convention communicates the architecture
class UserService: ...


class ProductService: ...


class InvoiceService: ...
```

```text
# BAD: each feature uses a different file name for the same layer
users/
    service.py

products/
    manager.py

billing/
    invoice_handler.py


# GOOD: once you know one module, you know where to look in the others
users/
    service.py

products/
    service.py

billing/
    service.py
```

```python
# BAD: similar operations use different verbs
create_user()
get_user()
fetch_order()
retrieve_invoice()
load_customer()


# GOOD: one convention is used everywhere
create_user()
get_user()
get_order()
get_invoice()
get_customer()
```

```python
# BAD: service classes all expose their actions differently
class UserService:
    def create(self): ...

    def update(self): ...

    def delete(self): ...


class ProductService:
    def add_product(self): ...

    def modify_product(self): ...

    def remove_product(self): ...


# GOOD: related classes have the same shape
class UserService:
    def create(self): ...

    def update(self): ...

    def delete(self): ...


class ProductService:
    def create(self): ...

    def update(self): ...

    def delete(self): ...
```

```python
# BAD: filesystem paths are imported three different ways
import pathlib
from pathlib import Path
from pathlib import *


# GOOD: the project has one import style for this dependency
from pathlib import Path
```

```python
# BAD: not-found cases behave differently in each function
def get_user(user_id):
    return db.find_user(user_id)


def get_order(order_id):
    order = db.find_order(order_id)
    if order is None:
        raise ValueError()
    return order


def get_product(product_id):
    product = db.find_product(product_id)
    if product is None:
        return None
    return product


# GOOD: callers can rely on one failure convention
def get_user(user_id):
    user = db.find_user(user_id)
    if user is None:
        raise NotFoundError()
    return user


def get_order(order_id):
    order = db.find_order(order_id)
    if order is None:
        raise NotFoundError()
    return order


def get_product(product_id):
    product = db.find_product(product_id)
    if product is None:
        raise NotFoundError()
    return product
```

```text
# BAD: every feature has grown its own layout
users/
    handlers.py
    utils.py

orders/
    api.py
    helpers.py

billing/
    views.py
    services.py


# GOOD: each feature follows the same structure
users/
    api.py
    service.py
    models.py

orders/
    api.py
    service.py
    models.py

billing/
    api.py
    service.py
    models.py
```

Predictable location and style make code simpler.

**Rule of thumb for spotting violations**: before new pattern, inspect nearby code. Match codebase unless clear reason to change.
