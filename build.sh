#!/bin/sh

version=1.3.1
rm builds/zotero-shortdoi-${version}.xpi
zip -r builds/zotero-shortdoi-${version}.xpi chrome/* chrome.manifest install.rdf options.xul
