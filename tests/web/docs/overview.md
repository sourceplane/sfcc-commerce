# web-tests

The port's vitest suite — the store-name seam, the Salesforce connection seam and its SLAS guest logins (public and private client, against the stand-in SCAPI), /api/health, the URL helpers and the revalidation route (its secret check and its topics)

The test suite for **web**. It deploys nothing: its lane installs, builds and runs the tests.

|              |                      |
| ------------ | -------------------- |
| Type         | `turbo-package`      |
| Source       | `tests/web`          |
| Package      | `@app/web-tests`     |
| Environments | `dev`: `quick-check` |

## Depends on

- (none)

## Depended on by

- (none)
