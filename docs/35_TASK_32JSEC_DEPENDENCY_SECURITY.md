# Task 32J-SEC — Dependency security review

**Scope:** dependency remediation only. This review does not authorize deployment, hosted RFID ingestion, hardware integration, or Task 32K.

**Baseline:** `747c7078bac4d01f8b6fcd0e8c219c3ccd79aa3c`, branch `feat/task32j-parent-voice-accessibility`. Remediation is isolated on `fix/task32jsec-dependency-security`.

## Initial audit (2026-10-19)

The locked and installed versions matched: Next.js `16.3.4`, `eslint-config-next` `16.3.4`, `sharp` `0.35.4`, `source-map-js` `1.2.1`, `braces` `3.0.3`, and `brace-expansion` `1.1.18` / `5.0.9`. `npm audit` reported 9 total findings: 1 critical and 8 high.

| Dependency path | Severity / exposure | Finding and range | Remediation |
|---|---|---|---|
| `next@16.3.4` (direct production) | Critical; production | `next/og` Node `ImageResponse` RCE, affected `>=16.2.0 <16.3.6`; additionally npm audit grouped Next cache, metadata, image-optimization SSRF and development information-disclosure advisories affecting versions below `16.3.8`. | Upgrade to `16.3.8` (same major, minimum patch release verified to address the reported 16.3.4 advisories). No `ImageResponse`, metadata image route, `use cache`, `draftMode`, or `next/image` use was identified in the application source; this reduces known feature exposure but is not a substitute for patching. |
| `sharp@0.35.4` (optional transitive production dependency of Next) | High; production dependency, platform-specific librsvg runtime conditions | CVE-2026-96889 / GHSA-wq5f-xc86-pv6w; versions `<0.35.5`. | Pin compatible `sharp@0.35.5` through npm override; it supplies the patched librsvg dependency. |
| `source-map-js@1.2.1` (transitive build/development dependency) | High; development/build path | CVE-2026-93749 / GHSA-68fv-2mgg-jv7q; versions `<1.2.2`. | Override to `1.2.2`. |
| `brace-expansion@1.1.18` and `5.0.9` (transitive development dependencies) | High; development tooling | GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p, and GHSA-q2hr-2g5m-vwhr. | Version-specific overrides to `1.1.21` and `5.0.12`, the fixed releases in the advisory ranges. |
| `eslint-config-next@16.3.4` → `@next/eslint-plugin-next` → `fast-glob@3.3.1` → `micromatch@4.0.8` → `braces@3.0.3` | High; development-only lint dependency chain | GHSA-vfj7-8cjw-p6xm, `braces <=3.0.3`. The registry has no patched `braces` 3.x release at this review. | Keep the supported, version-aligned Next ESLint config. No incompatible downgrade or fabricated override was applied. Track as an unresolved development-tool advisory until an upstream compatible fix is available. |

The audit graph reports the `braces` root issue through `micromatch`, `fast-glob`, `@next/eslint-plugin-next`, and `eslint-config-next`; these are not five independent root causes. npm suggested `eslint-config-next@14.2.35`, which would be a major-version downgrade and was rejected.

Other current upstream Next advisories reviewed include the AVIF optimizer and Windows-hosted RCE advisories, both fixed in Next `16.3.3`, and the rewrite SSRF advisory fixed by `16.2.11`; the baseline `16.3.4` was already beyond those fixes. The patch to `16.3.8` includes those fixes as well. Sources: [Next ImageResponse RCE](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j), [Next 16.3.8 security release](https://github.com/vercel/next.js/releases/tag/v16.3.8), [Next AVIF RCE](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4), [Next Windows RCE](https://github.com/advisories/GHSA-p293-qw3h-jr36), [Next rewrite SSRF](https://github.com/advisories/GHSA-p9j2-gv94-2wf4), [sharp/librsvg](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w), [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), and [brace-expansion](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr).

The Next.js advisories reported together by npm for `16.3.4` were:

| Advisory | Severity | Affected range | Fixed in | Component |
|---|---|---|---|---|
| GHSA-vcvr-r3jv-pc5j | Critical | `>=16.2.0 <16.3.6` | `16.3.6` | Node `next/og` `ImageResponse` with attacker-controlled SVG values. |
| GHSA-cjq9-62q9-8jv4 | High | `>=16.0.0 <16.3.8` | `16.3.8` | Image Optimization SSRF. |
| GHSA-3w37-wq28-93x7 | Moderate | `>=16.3.0 <16.3.8` | `16.3.8` | Pending `use cache` fill can leak Draft Mode content. |
| GHSA-4jqv-mc3x-m676 | Moderate | `>=16.0.0 <16.3.8` | `16.3.8` | SSG/ISR cache poisoning in self-hosted applications. |
| GHSA-f87g-xv8r-7p7x | Moderate | `>=16.0.0 <16.3.8` | `16.3.8` | App Router metadata-image dynamic-params information disclosure. |
| GHSA-mcj8-r9mp-w47p | Moderate | `>=16.0.0 <16.3.8` | `16.3.8` | SSG/ISR cache poisoning causing cross-user substitution/DoS. |
| GHSA-39w2-rjm5-chcv | Low | `>=16.0.0 <16.3.8` | `16.3.8` | Development-server MCP endpoint information disclosure. |

The initial brace-expansion findings include GHSA-6j4f-fj2g-mc7p (high, affected `<1.1.19` and `>=4.0.0 <5.0.10`), GHSA-qhr7-859c-m2p7 (high, affected `<1.1.20` and `>=4.0.0 <5.0.11`), and GHSA-q2hr-2g5m-vwhr (moderate, affected `<1.1.21` and `>=4.0.0 <5.0.12`). Their patched targets are `1.1.21` and `5.0.12`, respectively. npm reports package-level root findings rather than a separate row for every advisory/installed node.

## Changes

- Upgraded direct `next` and aligned `eslint-config-next` from `16.3.4` to `16.3.8`.
- Added lockfile-preserving npm overrides for `sharp@0.35.5`, `source-map-js@1.2.2`, and patched `brace-expansion` `1.1.21` / `5.0.12` branches.
- No React, application code, environment file, migration, or unrelated dependency was changed.

## Verification record

| Check | Result |
|---|---|
| Initial `npm audit` | 1 critical, 8 high, 9 total. |
| Fresh `npm audit` after lockfile changes | 0 critical, 5 high. Remaining entries all stem from the unresolved dev-only `braces@3.0.3` chain. |
| `npm audit --omit=dev` | Passed: 0 production dependency vulnerabilities. |
| `npm ci` | Passed with the updated lockfile (478 packages installed). The first offline attempt failed closed because the new `source-map-js@1.2.2` tarball was not cached; the subsequent normal lockfile install completed successfully. |
| `test:credential-attribution` | Passed, 20 tests. |
| `test:gateway` | Passed, 43 tests. |
| `test:rfid` | Passed, 22 tests. |
| `test:entry-polling` | Passed, 4 tests. |
| `test:parent-voice` | Passed, 13 tests. |
| Typecheck | Passed. |
| Lint | Passed. |
| `test:rfid:integration` | Passed in the isolated checkout using local Supabase and synthetic records. First attempt ran before the temporary local capability-issuer key was initialized and failed; after generating a synthetic keypair and restarting the local app, it passed. |
| `test:gateway:local-integration` | Passed in the isolated checkout against loopback Supabase. First attempt ran before the local app loaded the synthetic capability-issuer key and failed with a disabled-route response; after restart, it passed. |
| `verify:student-profile` | Passed against local Supabase. |
| `verify:reconnect` | Passed all Parent/Teacher/Principal recovery, profile, attendance, homework, timetable, context-isolation, and duplicate-refresh scenarios. |
| `verify:role-navigation` | Passed role routing, refresh, child continuity, role-mismatch denial, account switching, and 390px overflow checks. |
| `verify:accessibility-i18n` | Passed browser verification. |
| `verify:role-visuals` | Passed 22 destinations at 1440, 1024, 768, and 390px. |
| `verify:parent-voice` | Passed at 390px. Browser exposed no installed speech locales; audible playback was not tested. |
| `npm test` / `verify:phase1` | Passed local security, persistence, Realtime, acknowledgement, roles, and tenant-isolation checks. |
| Isolated production build | Passed on commit `a176b0d3f22c098631d3a95c242dfc320cead1f0`. Next reported only generated `.env.production`; all expected routes were verified; synthetic private-env sentinels were absent; only allowlisted Google Fonts egress was observed; temporary snapshot was cleaned. |

The `dev:rfid-local` launcher refused to start in the developer checkout because `.env.local` exists, as designed. Browser and DB integration regressions were instead run in a disposable detached worktree with no `.env.local`, generated loopback-only environment files, a synthetic local signing key, and `npm ci --offline`. The worktree server used only `127.0.0.1` and local Supabase. Integration tests wrote temporary synthetic records to local Supabase and their cleanup assertions passed. The offline integration environment was removed after verification.

No production Supabase or Vercel endpoint was contacted. `.env.local` was not opened, loaded or modified. Local Supabase status was checked with output limited to loopback endpoint URLs (`127.0.0.1`); only temporary synthetic test data was written to the local database and test cleanup passed.

## Limitations and release gates

- The `braces` development dependency advisory remains unresolved because a compatible patched upstream package is not published in the checked registry. Production dependency audit is clean, but overall dependency remediation is partial until this development-tool chain is updated or safely replaced. Re-audit before release.
- A clean npm audit does not establish application security or hosted configuration safety. The isolated build verifies local compilation only and cannot certify Vercel settings, production secrets, Supabase policies, or runtime behavior.
- This dependency patch does not resolve any other recorded deployment blocker and does not authorize deployment of the local-only RFID API.
- No hardware readiness is established by dependency tests. Task 32K remains blocked by the pilot/security gates in `docs/28_TASK_32D_PILOT_SECURITY_AND_OFFLINE_PLAN.md`.
