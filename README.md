# Zotero DOI Manager

This is an add-on for Zotero, a research source management tool. The add-on can auto-fetch DOI names for journal articles using the CrossRef API, as well as look up shortDOI names using http://shortdoi.org. The add-on additionally verifies that stored DOIs are valid and marks invalid DOIs.

Please report any bugs, questions, or feature requests on the Zotero forums.

Code for this extension is based in part [Zotero Google Scholar Citations](https://github.com/beloglazov/zotero-scholar-citations) by Anton Beloglazov.

### Compatibility

Requires Zotero 10.

### Plugin Functions

- Get shortDOIs: For the selected items, look up shortDOIs (replacing stored DOIs, if any) and mark invalid DOIs.
- Get long DOIs: For the selected items, look up full DOIs (replacing stored DOIs, if any) and mark invalid DOIs.
- Verify and clean DOIs: For the selected items, verify that stored DOIs are valid and mark invalid DOIs.
  - This function also removes unnecessary prefixes (such as `doi:`, `https://doi.org/`, or a publisher URL prefix) from the DOI field.

### What each function writes

The only field the plugin ever writes is **DOI**. It does not edit Extra,
titles, creators, or any other field. The progress popup for Verify and clean
DOIs reads "Validating DOIs and removing extra text", where "extra text" means
the prefixes stripped from the DOI field itself — not Zotero's Extra field.

| Item state | Get shortDOIs | Get long DOIs | Verify and clean DOIs |
| --- | --- | --- | --- |
| Has a valid DOI | Replaced with the shortDOI | Replaced with the long DOI | Left as-is, or rewritten to strip prefixes and lowercase it |
| Has an invalid DOI | Tagged invalid, DOI kept | Tagged invalid, DOI kept | Tagged invalid, DOI kept |
| Empty DOI, CrossRef finds one | DOI written | DOI written | **Not written** — tagged "DOI available" instead |
| Empty DOI, CrossRef finds none | Tagged "No DOI found" | Tagged "No DOI found" | Tagged "No DOI found" |
| Empty DOI, CrossRef finds several | Tagged "Multiple DOI", child link added | Tagged "Multiple DOI", child link added | Tagged "Multiple DOI", child link added |

Verify and clean DOIs never invents a DOI an item did not already have: a DOI
found only in CrossRef is reported as a finding, via the "DOI available" tag,
so you can review it and decide. Use Get long DOIs on those items if you want
the DOI filled in.

An item is only tagged "No DOI found" when CrossRef is asked and answers with
nothing. An item with, say, only a title will usually still resolve in
CrossRef, so it gets the "DOI available" tag rather than "No DOI found".

All four tag names are editable, and blank means "do not tag", in
Settings → DOI Manager.

Unsupported item types are skipped with a notice; the rest of the selection is
still processed.

### How to Install

- Download the `.xpi` file for the [latest release](https://github.com/bwiernik/zotero-shortdoi/releases/latest).
  - If you are using Firefox, be sure to right-click on the file link and choose Save Link As…
- In Zotero, open the Tools → Add-Ons… menu
- Drag the downloaded `.xpi` file to the Add-Ons popup window.
  - Alternatively, click on the Gear ⚙ button in Add-Ons popup window, choose Install Add-On from File…, and select the downloaded `.xpi` file.

### Authors

- Brenton M. Wiernik (original author)
- Julius Bairaktaris

### License

Copyright (C) 2017 Brenton M. Wiernik

Distributed under the Mozilla Public License (MPL) Version 2.0.
