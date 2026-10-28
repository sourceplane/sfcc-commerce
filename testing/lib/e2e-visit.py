#!/usr/bin/env python3
"""What a visitor does to the served Worker — testing/e2e.test.sh's stages 3 and 4.

    e2e-visit.py born      <url> <values.json>
    e2e-visit.py connected <url> <values.json>    (E2E_API, E2E_SECRET)

`born` is a fresh product, no Salesforce store: `/` says "Connect your
Salesforce Commerce Cloud store" under the product's name; every storefront
page answers (empty, with the connect note), never a 500; `/api/health` says
not connected; revalidation is off (503); the Open Graph image draws; the
sitemap lists no product and no category.

`connected` is the same product built with the stand-in SCAPI + SLAS
(tests/web/fake-sfcc.mjs) as its store: the home grid, the carousel,
search, a category and a product render from it (each read behind a SLAS
guest login, the public client's PKCE flow); a second visit reads Salesforce
not at all — not the catalogue (every read is a `"use cache"` entry in the
local R2 bucket) and not SLAS (a visitor without a cart costs no guest
login); a change in the store does not show until the secret-checked
revalidation route drops the `products` tag, and then the products are read
again but not the categories; a missing or wrong secret is refused (401), and
a call naming no topic drops nothing.
"""
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

mode, base, values = sys.argv[1], sys.argv[2], json.load(open(sys.argv[3]))
name = values["productname"]
# Upstream's store name: residue in a product named anything else.
UPSTREAM_NAME = "ACME Store"
renamed = name != UPSTREAM_NAME
problems = []


def bad(m):
    problems.append(m)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


opener = urllib.request.build_opener(NoRedirect)


def request(url, data=None, headers=None, method=None):
    req = urllib.request.Request(url, data=data, headers=dict(headers or {}), method=method)
    try:
        r = opener.open(req, timeout=90)
    except urllib.error.HTTPError as e:
        r = e
    return r.status, r.headers, r.read()


def get(path, headers=None):
    s, h, b = request(base + path, headers=headers)
    return s, h, b.decode("utf-8", "replace")


def text(page):
    return html.unescape(page)


def title_of(page):
    m = re.search(r"<title>(.*?)</title>", page, re.S)
    return html.unescape(m.group(1)) if m else None


def done(summary):
    if problems:
        for p in problems:
            print(f"  ✕ {p}", file=sys.stderr)
        sys.exit(1)
    for line in summary:
        print(f"   {line}")
    sys.exit(0)


def check_og():
    status, h, body = request(base + "/opengraph-image")
    if status != 200 or (h.get("content-type") or "") != "image/png" or not body.startswith(b"\x89PNG"):
        bad(f"/opengraph-image answered {status} {h.get('content-type')}, not a PNG")


# ── a fresh product: no Salesforce store ─────────────────────────────────
if mode == "born":
    status, _, page = get("/")
    if status != 200:
        bad(f"/ answered {status}, not 200")
    if "Connect your Salesforce Commerce Cloud store" not in text(page):
        bad("/ does not say \"Connect your Salesforce Commerce Cloud store\"")
    if "data-connect-store" not in page:
        bad("/ carries no connect-store note")
    if title_of(page) != name:
        bad(f"/'s <title> is {title_of(page)!r}, not the store's name {name!r}")
    if renamed and UPSTREAM_NAME in text(page):
        bad(f"/ still names the store {UPSTREAM_NAME!r}")
    for path in ("/search", "/search?q=shirt", "/search/mens", "/product/sample-shirt", "/about",
                 "/checkout", "/checkout/confirmation"):
        status, _, page = get(path)
        if status != 200 or "data-connect-store" not in page:
            note = "with" if "data-connect-store" in page else "without"
            bad(f"{path} answered {status} {note} the connect note")
    status, _, body = get("/api/health")
    if status != 200 or json.loads(body or "{}") != {"ok": True, "connected": False}:
        bad(f"/api/health answered {status} {body[:80]!r}, not ok and not connected")
    status, _, body = request(base + "/api/revalidate?secret=anything", data=b"", method="POST",
                              headers={"x-sfcc-topic": "products/update"})
    if status != 503:
        bad(f"POST /api/revalidate answered {status} with no secret configured, not 503")
    status, _, body = get("/sitemap.xml")
    locs = re.findall(r"<loc>(.*?)</loc>", body)
    if status != 200 or not locs or any("/product/" in loc or "/search/" in loc for loc in locs):
        bad(f"/sitemap.xml answered {status} with {locs}, not the home and content pages alone")
    check_og()
    status, h, _ = request(base + "/favicon.ico")
    if status != 200:
        bad(f"/favicon.ico answered {status}")
    done([
        "/ asks for a Salesforce store under the product's name; search, a category, a product, a page",
        "and the checkout answer empty with the connect note; /api/health says not connected;",
        "revalidation is off (503); the sitemap lists no product; the Open Graph image draws; never a 500",
    ])

# ── the same product, with a store connected ─────────────────────────────
api = os.environ["E2E_API"]
secret = os.environ["E2E_SECRET"]


def api_call(path, method="GET"):
    s, _, b = request(api + path, data=b"" if method == "POST" else None, method=method)
    return json.loads(b or b"{}")


def reads():
    return api_call("/__calls")


def catalogue(rs):
    return {op: n for op, n in rs.items() if op.startswith(("products.", "search."))}


PRODUCT = "/product/sample-shirt"
ROUTES = (
    ("/", ("Sample Shirt v1", "Sample Dress v1", "Sample Scarf v1")),
    ("/search", ("Sample Shirt v1", "Sample Dress v1", "Sample Scarf v1")),
    ("/search?q=dress", ("Sample Dress v1",)),
    ("/search/mens", ("Sample Shirt v1",)),
    (PRODUCT, ("Sample Shirt v1", "Add To Cart")),
)

status, _, body = get("/api/health")
if json.loads(body or "{}") != {"ok": True, "connected": True}:
    bad(f"/api/health answered {status} {body[:80]!r}, not connected")

# The first visit fills the cache (the deploy's smoke already visited `/`),
# every Shopper API read behind a guest login.
for path, must in ROUTES:
    status, _, page = get(path)
    if status != 200:
        bad(f"{path} answered {status}")
        continue
    if "data-connect-store" in page:
        bad(f"{path} still says no store is connected")
    for m in must:
        if m not in text(page):
            bad(f"{path} does not show {m!r}")
first = reads()
if not first.get("slas.token"):
    bad(f"the store was read without a SLAS guest login: {first}")
if renamed:
    status, _, page = get("/")
    if title_of(page) != name:
        bad(f"/'s <title> is {title_of(page)!r}, not the store's name {name!r}")

# The second visit: every catalogue read is a cache hit, and a visitor with
# no cart costs no guest login.
api_call("/__reset", "POST")
for path, _ in ROUTES:
    get(path)
second = reads()
if second:
    bad(f"a second visit read Salesforce again: {second}")

# A change in the store is not shown until the tag is revalidated.
api_call("/__bump", "POST")
api_call("/__reset", "POST")
_, _, page = get(PRODUCT)
if "Sample Shirt v1" not in text(page):
    bad("the product page showed the store's change before any revalidation")
if catalogue(reads()):
    bad(f"the stale product page read the store: {reads()}")

topic = {"x-sfcc-topic": "products/update"}
for query in ("", "?secret=", "?secret=wrong"):
    status, _, body = request(base + "/api/revalidate" + query, data=b"", method="POST", headers=topic)
    if status != 401:
        bad(f"POST /api/revalidate{query or ' with no secret'} answered {status}, not 401")
status, _, body = request(base + f"/api/revalidate?secret={secret}", data=b"", method="POST")
if status != 200 or json.loads(body or "{}").get("revalidated") is not False:
    bad(f"POST /api/revalidate naming no topic answered {status} {body[:120]!r}, not 200 and nothing dropped")
_, _, page = get(PRODUCT)
if "Sample Shirt v1" not in text(page):
    bad("a refused revalidation dropped the cache")

status, _, body = request(base + f"/api/revalidate?secret={secret}", data=b"", method="POST", headers=topic)
if status != 200 or json.loads(body or "{}").get("revalidated") is not True:
    bad(f"POST /api/revalidate with the secret answered {status} {body[:120]!r}")
api_call("/__reset", "POST")
# stale-while-revalidate: the first visit may still be served the old entry
# while the new one is fetched; within a few visits it is the new one.
fresh = False
for _ in range(10):
    _, _, page = get(PRODUCT)
    if "Sample Shirt v2" in text(page):
        fresh = True
        break
    time.sleep(1)
if not fresh:
    bad("the product page never showed the store's change after revalidation")
reread = reads()
if not reread.get("products.getProduct"):
    bad(f"revalidation did not read the product again: {reread}")
if reread.get("products.getCategories"):
    bad(f"revalidating `products` re-read the categories too: {reread}")

check_og()
status, _, body = get("/sitemap.xml")
locs = re.findall(r"<loc>(.*?)</loc>", body)
if status != 200 or not any(loc.endswith("/product/sample-shirt") for loc in locs):
    bad(f"/sitemap.xml answered {status} without the store's products ({len(locs)} locations)")

done([
    "the home grid, the carousel, search, a category and a product render from the store behind a",
    "SLAS guest login; a second visit reads Salesforce not at all; a change in the store waits for the",
    "secret-checked revalidation, which re-reads the products and not the categories; a wrong or",
    "missing secret is refused (401) and a call naming no topic drops nothing",
])
