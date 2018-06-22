# Zotero DOI Manager

This is an add-on for Zotero, a research source management tool. The add-on can auto-fetch DOI names for journal articles using the CrossRef API, as well as look up shortDOI names using http://shortdoi.org. The add-on additionally verifies that stored DOIs are valid and marks invalid DOIs.

Please report any bugs, questions, or feature requests on the Zotero forums.

Code for this extension is based in part [Zotero Google Scholar Citations](https://github.com/beloglazov/zotero-scholar-citations) by Anton Beloglazov.

### Plugin Functions

  - Get shortDOIs: For the selected items, look up shortDOIs (replacing stored DOIs, if any) and mark invalid DOIs.
  - Get long DOIs: For the selected items, look up full DOIs (replacing stored DOIs, if any) and mark invalid DOIs.
  - Verify and clean DOIs: For the selected items, look up full DOIs (replacing stored DOIs, if any), verify that stored DOIs are valid, and mark invalid DOIs.
    - This function also removes unnecessary prefixes (such as `doi:`, `https://doi.org/`, or a publisher URL prefix) from the DOI field.

### License

Copyright (C) 2017 Brenton M. Wiernik

Distributed under the Mozilla Public License (MPL) Version 2.0.
