#!/bin/bash

read -p 'Enter version number: ' version
rm -f zotero-doi-manager-"$version".xpi
zip -r zotero-doi-manager-"$version".xpi content/* locale/* skin/* bootstrap.js chrome.manifest install.rdf manifest.json prefs.js zoteroshortdoi.js
echo Check that manifest.json, install.rdf, update.rdf and updates.json all point to version $version