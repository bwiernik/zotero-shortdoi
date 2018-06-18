# Zotero DOI Manager

This is an add-on for Zotero, a research source management tool. The add-on auto-fetch DOI names for journal articles using the CrossRef API, as well as look up shortDOI names using http://shortdoi.org. The add-on additionally verifies that stored DOIs are valid and marks invalid DOIs.

Please report any bugs, questions, or feature requests on the Zotero forums.

Code for this extension is based in part [Zotero Google Scholar Citations](https://github.com/beloglazov/zotero-scholar-citations) by Anton Beloglazov.

### Plugin Functions

  - Get shortDOIs: For the selected items, replace stored DOIs with shortDOIs and mark invalid DOIs.
  - Get long DOIs: For the selected items, replace stored DOIs with long DOIs and mark invalid DOIs.
  - Verify and clean DOIs: For the selected items, verify thata stored DOIs are valid and mark invalid DOIs.
    - This function also removes unnecessary prefixes (such as `doi:`, `https://doi.org/`, or a publisher URL prefix) from the DOI field.
  - All functions will look up the DOI using CrossRef is an item has no DOI.

### License

Copyright (C) 2017 Brenton M. Wiernik

Distributed under the Mozilla Public License (MPL) Version 2.0.
