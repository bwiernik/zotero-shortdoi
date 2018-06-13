#!/bin/sh

version=1.3.2
rm zotero-shortdoi-${version}.xpi
zip -r zotero-shortdoi-${version}.xpi chrome/* chrome.manifest install.rdf options.xul
