SET /P version= Enter version number:
rm -f zotero-doi-manager-"%version%".xpi
zip -r zotero-doi-manager-"%version%".xpi chrome/* defaults/* chrome.manifest install.rdf