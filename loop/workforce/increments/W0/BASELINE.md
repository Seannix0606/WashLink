# W0 Baseline - check suite before any workforce change

Run 2026-10-24 on branch `feature/workforce` @ ec6570a (Windows 11, Git Bash), by the W0 BUILD step.
Output below is copied from the actual runs. Only lint, build and pytest exist at this point;
`npm test`, `supabase test db` and `supabase db reset` do NOT exist until W1 and were not run.

## Results

| Check | Command | Exit code | Result |
|---|---|---|---|
| Frontend deps | `npm ci` | not run | `frontend/node_modules` already present |
| Frontend lint | `cd frontend && npm run lint` | **0** | 0 errors, 0 warnings (eslint printed nothing) |
| Frontend build | `cd frontend && npm run build` | **0** | `tsc -b && vite build`, 2453 modules, built in 754ms |
| Backend tests | `cd backend && .venv/Scripts/python.exe -m pytest -q` | **0** | `4 passed, 1 warning in 4.01s` |
| Backend tests (bare) | `cd backend && pytest -q` | **127** | `pytest: command not found` (venv not activated in the shell; see note) |

Note on pytest: the existing `backend/.venv` was used; no dependencies were installed. A bare
`pytest` is not on PATH in Git Bash unless the venv is activated, so the loop should invoke
`backend/.venv/Scripts/python.exe -m pytest` (or activate the venv) for the regression check.
The result matches the LOOP.md baseline of 4 passed.

## Toolchain

```
node v24.20.0
npm 11.19.0
Python 3.12.10
Docker version 29.9.2, build a82e528
supabase CLI (npx --no-install supabase --version): 2.122.0
```

No Supabase command other than `--version` was run; no project was contacted.

## Frontend lint (verbatim)

```
> washlink@0.0.0 lint
> eslint .

LINT_EXIT=0
```

## Frontend build (head and last lines, verbatim; ANSI colour codes removed)

```
> washlink@0.0.0 build
> tsc -b && vite build

vite v8.0.8 building client environment for production...
transforming...✓ 2453 modules transformed.
rendering chunks...
computing gzip size...
...
dist/assets/ResetPasswordPage-DTg3DPla.js             3.08 kB │ gzip:   1.35 kB
dist/assets/SupabaseShopRepository-CQNvJ5AF.js        5.02 kB │ gzip:   1.59 kB
dist/assets/shopVerificationDisplay-Cbjr0D2Z.js       8.69 kB │ gzip:   2.88 kB
dist/assets/SuperAdminDashboardPage-DQAuK2E_.js      11.33 kB │ gzip:   3.51 kB
dist/assets/BookingRatingStars-lec-zhrh.js           12.12 kB │ gzip:   3.74 kB
dist/assets/AuthLandingPage-Ben4Tvs9.js              13.85 kB │ gzip:   3.91 kB
dist/assets/WorkerJobsPage-B744X5jY.js               16.12 kB │ gzip:   4.69 kB
dist/assets/OwnerDashboardPage-BO_WLFke.js           48.24 kB │ gzip:  12.24 kB
dist/assets/CustomerBookingPage-CV4YVMpO.js          56.73 kB │ gzip:  13.77 kB
dist/assets/AuthenticatedTopBar-Dh5DGurH.js          78.38 kB │ gzip:  21.25 kB
dist/assets/LocationPickerMap-Cpf-9t3u.js           163.38 kB │ gzip:  48.36 kB
dist/assets/index-7pc0Jt9A.js                       186.27 kB │ gzip:  59.11 kB
dist/assets/ui-DCWBqZFB.js                          377.28 kB │ gzip: 107.93 kB

✓ built in 754ms
BUILD_EXIT=0
```

## Backend tests (verbatim)

```
....                                                                     [100%]
============================== warnings summary ===============================
.venv\Lib\site-packages\fastapi\testclient.py:1
  C:\Users\PC\WashLink\backend\.venv\Lib\site-packages\fastapi\testclient.py:1: StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is deprecated; install `httpx2` instead.
    from starlette.testclient import TestClient as TestClient  # noqa

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
4 passed, 1 warning in 4.01s
PYTEST_EXIT=0
```

Bare command attempt:

```
/usr/bin/bash: line 1: pytest: command not found
BARE_PYTEST_EXIT=127
```

## Working tree before and after the checks

`git status --porcelain` before and after the three checks (identical):

```
?? .claude/
?? loop/
?? supabase/.temp/
```

`git check-ignore -v`: `frontend/dist` ignored by `.gitignore:11:dist`; `frontend/node_modules`
by `.gitignore:10:node_modules`. Nothing from the build or test runs was staged or shown as
untracked. (After this step `docs/workforce/` also appears untracked, containing only the W0 audit.)
