#!/bin/sh
echo Enter version number:
read version
rm zotero-shortdoi-${version}.xpi
zip -r zotero-shortdoi-${version}.xpi chrome/* defaults/* chrome.manifest install.rdf options.xul
