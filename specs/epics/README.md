# Epics

Orun-style work programs. Each epic is a folder carrying `epic.yaml` (the
declaration the platform reads: slug, key prefix, milestones with exit
criteria and task keys) beside its doc set. The pull request that adds the
folder is the adoption; the merge creates the epic in the workspace.

| Epic | Cluster | Status | What it is |
|------|---------|--------|------------|
| [`sfcc-commerce/`](./sfcc-commerce/) | **SX** | ✅ Shipped (`baseline-v1`); live bootstrap pending | Vercel's Next.js Commerce for Salesforce Commerce Cloud on Cloudflare Workers, its catalogue reads cached in R2 and revalidated by a secret-checked route, every shopper a SLAS guest — and an Orun baseline that instantiates it in one landing, live before a store is connected (SX2) |

As-built ≠ intent: what shipped lives in each epic's `IMPLEMENTATION-STATUS.md`.
