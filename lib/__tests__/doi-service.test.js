// Tests for the pure helpers in lib/doi-service.js.
// The module is loaded as a sub-script in Zotero, so it leaks `DoiService`
// onto the global scope. We replicate that load model here by reading the
// file and evaluating it after stubbing the one Zotero global it touches.

import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, "..", "doi-service.js"), "utf8");

function loadDoiService(cleanDoiImpl = (s) => s.trim().toLowerCase()) {
  const sandbox = {
    Zotero: { Utilities: { cleanDOI: cleanDoiImpl } },
  };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);
  return sandbox.DoiService;
}

test("isShortDoi recognises the 10/xxxx form", () => {
  const { isShortDoi } = loadDoiService();
  assert.equal(isShortDoi("10/abcd"), true);
  assert.equal(isShortDoi("10.1000/xyz"), false);
  assert.equal(isShortDoi(""), false);
  assert.equal(isShortDoi(null), false);
});

test("buildDoiLookupUrl returns null for empty input", () => {
  const { buildDoiLookupUrl } = loadDoiService();
  assert.equal(buildDoiLookupUrl("", "short"), null);
  assert.equal(buildDoiLookupUrl(null, "long"), null);
});

test("buildDoiLookupUrl flags non-strings and uncleanable input as invalid", () => {
  const { buildDoiLookupUrl } = loadDoiService(() => null);
  assert.deepEqual(buildDoiLookupUrl(42, "short"), { kind: "invalid" });
  assert.deepEqual(buildDoiLookupUrl("garbage", "long"), { kind: "invalid" });
});

test("buildDoiLookupUrl points long lookups at doi.org/api/handles", () => {
  const { buildDoiLookupUrl } = loadDoiService();
  const result = buildDoiLookupUrl("10.1000/xyz", "long");
  assert.equal(result.kind, "lookup");
  assert.equal(
    result.url,
    "https://doi.org/api/handles/" + encodeURIComponent("10.1000/xyz")
  );
});

test("buildDoiLookupUrl converts long DOI to shortdoi.org for the short operation", () => {
  const { buildDoiLookupUrl } = loadDoiService();
  const result = buildDoiLookupUrl("10.1000/xyz", "short");
  assert.equal(
    result.url,
    "https://shortdoi.org/" + encodeURIComponent("10.1000/xyz") + "?format=json"
  );
});

test("buildDoiLookupUrl skips shortdoi.org when DOI is already a shortDOI", () => {
  const { buildDoiLookupUrl } = loadDoiService();
  const result = buildDoiLookupUrl("10/abcd", "short");
  assert.equal(
    result.url,
    "https://doi.org/api/handles/" + encodeURIComponent("10/abcd")
  );
});

test("parseShortDoiResponse prefers ShortDOI then handle then null", () => {
  const { parseShortDoiResponse } = loadDoiService();
  assert.equal(parseShortDoiResponse({ ShortDOI: "10/AbC" }), "10/abc");
  assert.equal(parseShortDoiResponse({ handle: "10/DeF" }), "10/def");
  assert.equal(parseShortDoiResponse({}), null);
});

test("parseLongDoiResponse rejects responseCode != 1", () => {
  const { parseLongDoiResponse } = loadDoiService();
  assert.deepEqual(parseLongDoiResponse({ responseCode: 100 }, false), { ok: false });
  assert.deepEqual(parseLongDoiResponse({ responseCode: 1 }, false), { ok: false });
});

test("parseLongDoiResponse pulls values['1'] for shortDOI lookups", () => {
  const { parseLongDoiResponse } = loadDoiService();
  const response = {
    responseCode: 1,
    handle: "10/abc",
    values: { 1: { data: { value: "10.1000/XYZ" } } },
  };
  assert.deepEqual(parseLongDoiResponse(response, true), {
    ok: true,
    doi: "10.1000/xyz",
  });
});

test("parseLongDoiResponse falls back to handle for non-shortDOI lookups", () => {
  const { parseLongDoiResponse } = loadDoiService();
  const response = { responseCode: 1, handle: "10.1000/XYZ" };
  assert.deepEqual(parseLongDoiResponse(response, false), {
    ok: true,
    doi: "10.1000/xyz",
  });
});

test("parseCheckDoiResponse classifies invalid/unchanged/updated", () => {
  const { parseCheckDoiResponse } = loadDoiService();
  assert.deepEqual(parseCheckDoiResponse({ responseCode: 200 }, "10.1/x"), {
    kind: "invalid",
  });
  assert.deepEqual(parseCheckDoiResponse({ handle: "10.1/x" }, "10.1/x"), {
    kind: "unchanged",
  });
  assert.deepEqual(parseCheckDoiResponse({ handle: "10.1/Y" }, "10.1/x"), {
    kind: "updated",
    doi: "10.1/y",
  });
});

test("parseCheckDoiResponse treats missing handle as invalid", () => {
  const { parseCheckDoiResponse } = loadDoiService();
  assert.deepEqual(parseCheckDoiResponse({}, "10.1/x"), { kind: "invalid" });
  assert.deepEqual(parseCheckDoiResponse({ responseCode: 1 }, "10.1/x"), {
    kind: "invalid",
  });
});

test("parseCrossrefResponse handles resolved/unresolved/multiresolved/unknown", () => {
  const { parseCrossrefResponse } = loadDoiService();
  const make = (status, doi) => {
    const query = { getAttribute: () => status };
    if (doi !== undefined) {
      query.getElementsByTagName = (name) =>
        name === "doi" ? [{ childNodes: [{ nodeValue: doi }] }] : [];
    } else {
      query.getElementsByTagName = () => [];
    }
    return { getElementsByTagName: (name) => (name === "query" ? [query] : []) };
  };

  assert.deepEqual(parseCrossrefResponse(make("resolved", "10.1/x")), {
    status: "resolved",
    doi: "10.1/x",
  });
  assert.deepEqual(parseCrossrefResponse(make("resolved")), { status: "unknown" });
  assert.deepEqual(parseCrossrefResponse(make("unresolved")), {
    status: "unresolved",
  });
  assert.deepEqual(parseCrossrefResponse(make("multiresolved")), {
    status: "multiresolved",
  });
  assert.deepEqual(parseCrossrefResponse(make("weird")), { status: "unknown" });
  assert.deepEqual(
    parseCrossrefResponse({ getElementsByTagName: () => [] }),
    { status: "unknown" }
  );
});

test("buildCrossrefUrl includes multihit", () => {
  const { buildCrossrefUrl } = loadDoiService();
  const url = buildCrossrefUrl("ctx=1");
  assert.match(url, /^https:\/\/www\.crossref\.org\/openurl\?pid=.*ctx=1&multihit=true$/);
});
