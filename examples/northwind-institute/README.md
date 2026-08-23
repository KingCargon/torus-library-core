# Example: Northwind Institute

A complete, fictional library. Nothing here describes a real organisation.

```bash
cd examples/northwind-institute
torus-library validate papers/NW-2026-01-15-PHI-001.md --config library.config.json
```

This is the same fictional organisation the test suite runs against, which
is deliberate: if the engine ever acquired an assumption about one
particular company, this example would stop working.
