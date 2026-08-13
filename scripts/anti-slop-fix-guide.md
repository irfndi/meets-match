# Anti-Slop Fix Patterns Guide

This guide explains how to fix each anti-slop rule finding in the MeetMatch codebase.
Run `pnpm lint` to see current findings. Run `pnpm typecheck:fast` to ensure your changes compile.
Never weaken/suppress rules. Do not add unsafe casts or launder types.

## Rule fixes

### 1. no-chained-type-assertions (`x as unknown as Y`)
The rule flags assertion chains with >1 non-const assertion. Fixes, in order of preference:

- **If the mock is passed into an `any`-typed parameter** (e.g. `env: any`): remove the
  chained cast entirely: `KV: kv` instead of `KV: kv as unknown as KVNamespace`.
- **For a mock that genuinely cannot satisfy the interface**: extract the object into a
  variable typed with a named type it DOES satisfy, then cast once to the target. Because a
  single `as Y` fails on partial objects, the correct approach is to define a helper:
  ```ts
  function castForTest<T>(value: object): T {
    return value as T;               // single assertion, allowed
  }
  ```
  and use `castForTest<KVNamespace>({ ... })`. Note: this helper itself may trigger
  `no-object-parameters` — place it only where needed and prefer removing the cast when the
  consuming parameter is `any`.
- **Where the object structurally matches a named interface**, add the missing members as
  mocks (`vi.fn()`) so the object satisfies the interface, then use a single type annotation
  (not assertion).

### 2. no-unsafe-dictionary-type (`Record<string, unknown>` / `Record<string, any>` / `Record<string, object>` / `{}` index)
Replace unsafe dictionary value types with a concrete owner type:

- **Test fixtures**: introduce a named interface for the shape, e.g.
  ```ts
  interface MockResponseRow { success?: boolean; meta?: Record<string, string>; results?: Array<Record<string, string>>; }
  ```
  Use concrete value types instead of `unknown`/`any`. For `Record<string, unknown>` used for
  arbitrary response bodies, define a narrow interface or schema-derived type.
- **The `LogContext [key: string]: unknown`** in `structured-log.ts`: this is intentional
  arbitrary metadata. The rule fires on it. To comply, replace the index signature with an
  explicit named type OR document the boundary. Prefer defining a concrete context interface.
- **Function params typed `Record<string, unknown>`**: change to a named interface / schema type.

### 3. no-runtime-typeof (`typeof x === "string"`)
Replace ad hoc `typeof` narrowing with proper typed parsing.

- **For request/response bodies**: parse with `await response.json() as KnownType` OR use an
  Effect Schema / a validated struct at the boundary.
- **In test helpers**: `typeof req === "string" ? req : req.url` — type the param properly and
  branch on the declared type, or use a discriminant.

### 4. no-known-value-widening (`const x: Record<string, ...> = {...}`)
The known initializer has type evidence discarded by the explicit broad target. Fix:
- Replace `Record<string, string[]>` annotation with `satisfies` or let inference preserve the
  type: `const x = { ... } satisfies Record<...>` OR drop the annotation entirely if inference
  is precise enough. Prefer `satisfies`.
- For function return types annotated with a broad object type returning a known object, use
  `satisfies` on the return or narrow the return type to a named interface.

### 5. no-unknown-parameters (`param: unknown` except `cause`)
Replace `unknown` params with a typed owner/schema type. For `error: unknown` in logging,
this is genuinely any error — rename the param or parse it. The rule only allows `cause`.
- For error handlers, type as `unknown` is disallowed; use `Error` or a custom type union, or
  parse via a helper that accepts a typed value.

### 6. no-conditional-empty-object-spread (`...{cond ? {x} : {}}`)
Replace conditional empty-object spreads with a direct property declaration:
- `...{cond ? { field: value } : {}}` → `...(cond ? { field: value } : {})` is still flagged.
  Instead build the object with the field conditionally set via explicit statements, e.g.
  ```ts
  const obj = { ... };
  if (cond) obj.field = value;
  ```
  Or inline the property using a spread only when non-empty.

## Verification
- `pnpm typecheck:fast` — must pass (tsgo). Also run `node_modules/.bin/tsgo --noEmit -p <service>` if needed.
- `pnpm lint` — must show 0 anti-slop errors for your files.
- Run the affected tests: `pnpm test -- --run <path>`.

## Files/directories to fix
Subagents get an explicit list of files. Only modify files assigned to you.