/**
 * HTTP access, the async update loop, and the progress UI.
 *
 * `updateItems(items, operation)` is the only entry point. It makes one
 * sequential pass over the supported items, dispatches each through the DOI
 * APIs, applies the result, and reports progress. An `isRunning` flag keeps
 * the auto-retrieve notifier from starting a parallel pass over a manual one.
 *
 * IIFE-wrapped for the same reason as doi-service.js: re-enabling the plugin
 * re-runs startup() against the same scope, and a top-level `const` would
 * throw "redeclaration of const" on the second load.
 */
var DoiUpdater = (function () {
  const REQUEST_TIMEOUT_MS = 30_000;

  // Zotero 10's ProgressWindow takes an item-type name, not an icon URL:
  // ItemProgress() feeds it to `data-item-type`, which the stylesheet maps to
  // a built-in icon. Arbitrary chrome:// or plugin PNG paths render blank.
  const PROGRESS_ITEM_TYPE = "journalArticle";

  const HEADLINES = {
    short: "Getting shortDOIs",
    long: "Getting long DOIs",
    check: "Validating DOIs and removing extra text",
  };

  const COMPLETED = {
    short: (n) => `shortDOIs updated for ${n} items.`,
    long: (n) => `Long DOIs updated for ${n} items.`,
    check: (n) => `DOIs verified for ${n} items.`,
  };

  const tagged = (tag) => (tag ? ` These have been tagged with '${tag}'.` : "");

  // Outcome buckets that get their own toast, keyed by the pref holding the
  // tag they apply. `found` is a finding rather than a failure, so it is not
  // styled as an error.
  const FINDINGS = {
    invalid: {
      pref: "tagInvalid",
      headline: "Invalid DOI",
      text: (tag) => `Invalid DOIs were found.${tagged(tag)}`,
      error: true,
    },
    nodoi: {
      pref: "tagNodoi",
      headline: "DOI not found",
      text: (tag) => `No DOI was found for some items.${tagged(tag)}`,
      error: true,
    },
    multiple: {
      pref: "tagMultiple",
      headline: "Multiple possible DOIs",
      text: (tag) =>
        `Some items had multiple possible DOIs.${
          tag ? ` Links to lists of DOIs have been added and tagged with '${tag}'.` : ""
        }`,
      error: true,
    },
    found: {
      pref: "tagFound",
      headline: "DOI available",
      text: (tag) =>
        `Some items without a DOI have one available in CrossRef.${
          tag ? ` These have been tagged with '${tag}'.` : ""
        } The DOI field was left unchanged.`,
      error: false,
    },
  };

  let isRunning = false;

  /**
   * GET through Zotero.HTTP. 400 and 404 collapse to `invalid` because
   * shortdoi.org, doi.org and CrossRef all use them for "not a valid
   * identifier"; real transport failures stay distinguishable as `error`.
   *
   * @returns {Promise<{status:"ok",response:any}|{status:"invalid"}|{status:"error",error:Error}>}
   */
  async function fetchDoi(url, responseType) {
    try {
      const xhr = await Zotero.HTTP.request("GET", url, {
        responseType,
        timeout: REQUEST_TIMEOUT_MS,
        successCodes: [200],
      });
      return {
        status: "ok",
        response: responseType === "json" ? xhr.response : xhr.responseXML,
      };
    } catch (error) {
      if (
        error instanceof Zotero.HTTP.UnexpectedStatusException &&
        (error.xmlhttp?.status === 400 || error.xmlhttp?.status === 404)
      ) {
        return { status: "invalid" };
      }
      return { status: "error", error };
    }
  }

  /** Read every DOI pref once per run. */
  function readPrefs() {
    const get = (key) => Zotero.Prefs.get(`extensions.shortdoi.${key}`, true);
    return {
      tagInvalid: get("tag_invalid"),
      tagNodoi: get("tag_nodoi"),
      tagMultiple: get("tag_multiple"),
      tagFound: get("tag_found"),
    };
  }

  const doiTags = (prefs) =>
    Object.values(FINDINGS).map((f) => prefs[f.pref]).filter(Boolean);

  function clearDoiTags(item, prefs) {
    for (const tag of doiTags(prefs)) item.removeTag(tag);
  }

  function hasDoiTag(item, prefs) {
    return doiTags(prefs).some((tag) => item.hasTag(tag));
  }

  /** Replace every DOI tag on the item with the one for `finding`. */
  async function tagFinding(item, finding, prefs) {
    clearDoiTags(item, prefs);
    const tag = prefs[FINDINGS[finding].pref];
    if (tag) item.addTag(tag, 1);
    await item.saveTx();
  }

  /** @returns {{supported: Zotero.Item[], unsupported: Zotero.Item[]}} */
  function partitionItems(items) {
    const supportedTypeIDs = new Set(
      DoiService.SUPPORTED_ITEM_TYPES
        .map((type) => Zotero.ItemTypes.getID(type))
        .filter((id) => id !== false)
    );

    const supported = [];
    const unsupported = [];
    for (const item of items) {
      if (!item.isRegularItem() || item.isFeedItem) continue;
      (supportedTypeIDs.has(item.itemTypeID) ? supported : unsupported).push(item);
    }
    return { supported, unsupported };
  }

  /** One-line notification popup. */
  function toast(headline, text, { error = false, ms = 5000 } = {}) {
    const win = new Zotero.ProgressWindow({ closeOnClick: true });
    win.changeHeadline(headline);
    win.progress = new win.ItemProgress(PROGRESS_ITEM_TYPE, text);
    win.progress.setProgress(100);
    if (error) win.progress.setError();
    win.show();
    win.startCloseTimer(ms);
  }

  function showUnsupportedWarning(items) {
    const types = [...new Set(items.map((i) => Zotero.ItemTypes.getName(i.itemTypeID)))];
    toast(
      "Unsupported Item Types",
      `${items.length} item(s) skipped (unsupported types: ${types.join(", ")})`,
      { error: true, ms: 6000 }
    );
  }

  function showCompletion(operation, counts, prefs) {
    const found = Object.keys(FINDINGS).filter((key) => counts[key] > 0);
    if (!found.length) {
      const message = (COMPLETED[operation] ?? COMPLETED.check)(counts.updated);
      toast("Finished", message, { ms: 4000 });
      return;
    }
    for (const key of found) {
      const finding = FINDINGS[key];
      toast(finding.headline, finding.text(prefs[finding.pref]), {
        error: finding.error,
        ms: 8000,
      });
    }
  }

  /**
   * Process one item.
   *
   * @returns {Promise<"updated"|"invalid"|"nodoi"|"multiple"|"found"|"skipped">}
   */
  async function processItem(item, operation, prefs) {
    const existingDoi = item.getField("DOI");
    if (!existingDoi) return processCrossrefLookup(item, operation, prefs);

    const target = DoiService.buildDoiLookupUrl(existingDoi, operation);
    if (target?.kind === "invalid") {
      await tagFinding(item, "invalid", prefs);
      return "invalid";
    }
    if (!target) {
      if (hasDoiTag(item, prefs)) {
        clearDoiTags(item, prefs);
        await item.saveTx();
      }
      return "skipped";
    }

    const result = await fetchDoi(target.url, "json");
    if (result.status === "invalid") {
      await tagFinding(item, "invalid", prefs);
      return "invalid";
    }
    if (result.status === "error") {
      Zotero.debug(`DOI Manager: HTTP error fetching DOI: ${result.error}`);
      return "skipped";
    }

    return applyDoiResponse(result.response, item, existingDoi, operation, prefs);
  }

  /** Write a resolved DOI onto the item and drop any stale DOI tags. */
  async function setDoi(item, doi, prefs) {
    item.setField("DOI", doi);
    clearDoiTags(item, prefs);
    await item.saveTx();
    return "updated";
  }

  async function applyDoiResponse(response, item, existingDoi, operation, prefs) {
    if (!item.isRegularItem()) return "skipped";

    if (operation === "short") {
      const shortDoi = DoiService.parseShortDoiResponse(response);
      if (!shortDoi) {
        await tagFinding(item, "invalid", prefs);
        return "invalid";
      }
      return setDoi(item, shortDoi, prefs);
    }

    if (operation === "long") {
      const parsed = DoiService.parseLongDoiResponse(
        response,
        DoiService.isShortDoi(existingDoi)
      );
      if (!parsed.ok) {
        await tagFinding(item, "invalid", prefs);
        return "invalid";
      }
      return setDoi(item, parsed.doi, prefs);
    }

    // check: validate what is already there, normalizing away any extra text.
    const parsed = DoiService.parseCheckDoiResponse(response, existingDoi);
    if (parsed.kind === "invalid") {
      await tagFinding(item, "invalid", prefs);
      return "invalid";
    }
    if (parsed.kind === "updated") {
      await setDoi(item, parsed.doi, prefs);
    } else if (hasDoiTag(item, prefs)) {
      clearDoiTags(item, prefs);
      await item.saveTx();
    }
    return "updated";
  }

  /**
   * Item has no DOI, so ask CrossRef by metadata. `check` never writes the DOI
   * field — a DOI the item never had is a finding, not a correction — so it
   * tags the item instead of silently passing over it.
   */
  async function processCrossrefLookup(item, operation, prefs) {
    const ctx = Zotero.OpenURL.createContextObject(item, "1.0");
    if (!ctx) return "skipped";

    const result = await fetchDoi(DoiService.buildCrossrefUrl(ctx), "document");
    if (result.status === "error") {
      Zotero.debug(`DOI Manager: CrossRef lookup failed: ${result.error}`);
      return "skipped";
    }
    if (result.status === "invalid") return "skipped";

    const parsed = DoiService.parseCrossrefResponse(result.response);

    if (parsed.status === "resolved") {
      if (operation === "check") {
        await tagFinding(item, "found", prefs);
        return "found";
      }
      item.setField("DOI", parsed.doi);
      // A shortDOI run needs a second hop to convert the fresh long DOI.
      if (operation === "short") return processItem(item, operation, prefs);
      clearDoiTags(item, prefs);
      await item.saveTx();
      return "updated";
    }

    if (parsed.status === "unresolved") {
      await tagFinding(item, "nodoi", prefs);
      return "nodoi";
    }

    if (parsed.status === "multiresolved") {
      await Zotero.Attachments.linkFromURL({
        url: DoiService.buildCrossrefLinkUrl(ctx),
        parentItemID: item.id,
        contentType: "text/html",
        title: "Multiple DOIs found",
      });
      await tagFinding(item, "multiple", prefs);
      return "multiple";
    }

    Zotero.debug("DOI Manager: CrossRef returned unknown status");
    return "skipped";
  }

  /**
   * Run a DOI operation over `items`. Calls made while a run is in flight are
   * dropped rather than queued.
   *
   * @param {Zotero.Item[]} items
   * @param {"short"|"long"|"check"} operation
   */
  async function updateItems(items, operation) {
    if (isRunning) return;

    const { supported, unsupported } = partitionItems(items);
    if (unsupported.length) showUnsupportedWarning(unsupported);
    if (!supported.length) return;

    isRunning = true;
    const prefs = readPrefs();
    const counts = { updated: 0, invalid: 0, nodoi: 0, multiple: 0, found: 0, skipped: 0 };

    const progress = new Zotero.ProgressWindow({ closeOnClick: true });
    progress.changeHeadline(HEADLINES[operation] ?? HEADLINES.check);
    progress.progress = new progress.ItemProgress(PROGRESS_ITEM_TYPE, "Checking DOIs.");
    progress.show();

    try {
      for (let i = 0; i < supported.length; i++) {
        progress.progress.setProgress(Math.round(((i + 1) / supported.length) * 100));
        progress.progress.setText(`Item ${i + 1} of ${supported.length}`);
        counts[await processItem(supported[i], operation, prefs)] += 1;
      }
      progress.close();
      showCompletion(operation, counts, prefs);
    } catch (error) {
      Zotero.debug(`DOI Manager: unexpected error in update loop: ${error}`);
      progress.close();
    } finally {
      isRunning = false;
    }
  }

  return { updateItems };
})();
