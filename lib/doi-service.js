/**
 * Pure DOI logic: validation, normalization, URL building, response parsing.
 *
 * Touches no Zotero API except Zotero.Utilities.cleanDOI, so it runs under
 * `node --test` in a vm sandbox (see __tests__/doi-service.test.js).
 *
 * Everything is wrapped in an IIFE assigned to a `var`: disabling and
 * re-enabling the plugin re-runs startup() against the *same* bootstrap
 * scope, so a top-level `const` here would throw "redeclaration of const"
 * on the second load and the plugin would never come back.
 */
var DoiService = (function () {
  const SHORTDOI = "https://shortdoi.org/";
  const HANDLES = "https://doi.org/api/handles/";
  const CROSSREF = "https://www.crossref.org/openurl?pid=zoteroDOI@wiernik.org&";

  const SHORT_DOI_PATTERN = /10\/[^\s]*[^\s.,]/;

  const SUPPORTED_ITEM_TYPES = [
    "journalArticle", "conferencePaper", "book", "bookSection", "report",
    "thesis", "preprint", "dataset", "document", "presentation", "standard",
    "encyclopediaArticle", "dictionaryEntry", "magazineArticle", "newspaperArticle",
  ];

  /** @returns {boolean} true if `doi` is in shortDOI form (`10/xxxx`). */
  function isShortDoi(doi) {
    return typeof doi === "string" && SHORT_DOI_PATTERN.test(doi);
  }

  /**
   * Lookup URL for the DOI already on an item.
   *
   * @param {string} rawDoi  Raw field value; may carry prefixes or whitespace.
   * @param {"short"|"long"|"check"} operation
   * @returns {{kind:"lookup",url:string}|{kind:"invalid"}|null}
   *   null means the field is empty, so the caller should fall back to CrossRef.
   */
  function buildDoiLookupUrl(rawDoi, operation) {
    if (!rawDoi) return null;
    if (typeof rawDoi !== "string") return { kind: "invalid" };

    const doi = Zotero.Utilities.cleanDOI(rawDoi);
    if (!doi) return { kind: "invalid" };

    const url = operation === "short" && !isShortDoi(doi)
      ? `${SHORTDOI}${encodeURIComponent(doi)}?format=json`
      : `${HANDLES}${encodeURIComponent(doi)}`;
    return { kind: "lookup", url };
  }

  /** CrossRef OpenURL lookup for an item with no DOI. */
  function buildCrossrefUrl(contextObject) {
    return `${CROSSREF}${contextObject}&multihit=true`;
  }

  /** User-facing CrossRef link stored on items with several candidate DOIs. */
  function buildCrossrefLinkUrl(contextObject) {
    return `${CROSSREF}${contextObject}`;
  }

  /** @returns {string|null} shortDOI from a shortdoi.org response. */
  function parseShortDoiResponse(response) {
    return (response.ShortDOI || response.handle || "").toLowerCase() || null;
  }

  /**
   * @param {boolean} fromShortDoi  Whether the lookup started from a shortDOI.
   * @returns {{ok:true,doi:string}|{ok:false}}
   */
  function parseLongDoiResponse(response, fromShortDoi) {
    if (response.responseCode !== 1) return { ok: false };

    const doi = (
      (fromShortDoi && response.values?.["1"]?.data?.value) || response.handle || ""
    ).toLowerCase();
    return doi ? { ok: true, doi } : { ok: false };
  }

  /**
   * Compare a doi.org response against the DOI already on the item.
   *
   * @returns {{kind:"invalid"}|{kind:"unchanged"}|{kind:"updated",doi:string}}
   */
  function parseCheckDoiResponse(response, existingDoi) {
    if (response.responseCode === 200 || !response.handle) return { kind: "invalid" };
    if (response.handle === existingDoi) return { kind: "unchanged" };
    return { kind: "updated", doi: response.handle.toLowerCase() };
  }

  /**
   * @param {Document} responseXml  CrossRef OpenURL response.
   * @returns {{status:"resolved",doi:string}|{status:"unresolved"|"multiresolved"|"unknown"}}
   */
  function parseCrossrefResponse(responseXml) {
    const query = responseXml.getElementsByTagName("query")[0];
    if (!query) return { status: "unknown" };

    const status = query.getAttribute("status");
    if (status === "unresolved" || status === "multiresolved") return { status };
    if (status !== "resolved") return { status: "unknown" };

    const doi = query.getElementsByTagName("doi")[0]?.childNodes[0]?.nodeValue;
    return doi ? { status: "resolved", doi } : { status: "unknown" };
  }

  return {
    SUPPORTED_ITEM_TYPES,
    isShortDoi,
    buildDoiLookupUrl,
    buildCrossrefUrl,
    buildCrossrefLinkUrl,
    parseShortDoiResponse,
    parseLongDoiResponse,
    parseCheckDoiResponse,
    parseCrossrefResponse,
  };
})();
