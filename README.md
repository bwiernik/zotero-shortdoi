# Zotero DOI Manager

This is an add-on for Zotero, a research source management tool. The add-on can look up shortDOI names using http://shortdoi.org and store them for Zotero items. The add-on additionally verifies that stored DOIs are valid and marks invalid DOIs.

Please report any bugs, questions, or feature requests on the Zotero forums.

Code for this extension is based in part [Zotero Google Scholar Citations](https://github.com/beloglazov/zotero-scholar-citations) by Anton Beloglazov.

### Plugin Functions

  - Get shortDOIs: For the selected items, collection, or library, replace stored DOIs with shortDOIs and mark invalid DOIs.
  - Get long DOIs: For the selected items, collection, or library, replace stored DOIs with long DOIs and mark invalid DOIs.
  - Verify and clean DOIs: For the selected items, collection, or library, verify thata stored DOIs are valid and mark invalid DOIs.
    - This function also removes unnecessary prefixes (such as `doi:`, `https://doi.org/`, or a publisher URL prefix) from the DOI field.

### License

Copyright (C) 2017 Brenton M. Wiernik

Distributed under the Mozilla Public License (MPL) Version 2.0.