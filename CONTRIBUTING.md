# Contributing

## Before anything else

Run the tests.

```bash
npm install
npm test        # 146 tests
```

They run against a **fictional organisation**. That is not decoration: if
the engine acquired an assumption about any particular company, those
tests would fail. They are the standing proof that it is genuinely
reusable.

## Rules that are not up for negotiation

These are the product, not preferences.

1. **Canon is never rewritten.** No feature may edit a published record in
   place. Corrections are amendments or superseding revisions.
2. **The audience boundary fails closed.** Any ambiguity — missing, blank,
   misspelled, unconfigured — is refused, never defaulted, and never
   assumed public.
3. **There is one definition of "public".** Do not add a second content
   path with its own filter. That is how an archive leaks.
4. **No credentials, ever.** The Library is not a secret store. Do not add
   a feature that requires it to hold one.
5. **No network listener.** Exports are files. A hosted product is a
   separate thing, not an expansion of this.

A test enforces each of these. If a change makes one fail, the change is
wrong, not the test.

## Style

- Plain Node. No framework, no build step, no transpiler.
- Comments explain *why*, not what. If a decision looks odd, say why it
  isn't.
- Errors name what happened, where, and what to do about it — and never
  echo secret material, because error text reaches logs and bug reports.

## Pull requests

Include a test that fails before your change and passes after. Describe
the failure mode you fixed, not just the code you wrote.

If you are changing behaviour that a record already depends on, say so
explicitly — this product's users will still be reading their archives in
a decade.
