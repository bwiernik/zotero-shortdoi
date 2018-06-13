const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/Services.jsm");

// Startup -- load Zotero and constants
if (typeof Zotero === 'undefined') {
    Zotero = {};
}
Zotero.ShortDOI = {};

const PREF_BRANCH = 'extensions.shortdoi.';
const PREFS = {
    //savelong: true,
    autoshort: true
};

// Preference managers
function getPref(key) {
  // Cache the prefbranch after first use
  if (getPref.branch == null)
    getPref.branch = Services.prefs.getBranch(PREF_BRANCH);

  // Figure out what type of pref to fetch
  switch (typeof PREFS[key]) {
    case "boolean":
      return getPref.branch.getBoolPref(key);
    case "number":
      return getPref.branch.getIntPref(key);
    case "string":
      return getPref.branch.getCharPref(key);
  }
}

function setPref(key, value) {
  // Cache the prefbranch after first use
  if (setPref.branch == null)
    setPref.branch = Services.prefs.getBranch(PREF_BRANCH);

  // Figure out what type of pref to fetch
  switch (typeof PREFS[key]) {
    case "boolean":
      return setPref.branch.setBoolPref(key, value);
    case "number":
      return setPref.branch.setIntPref(key, value);
    case "string":
      return setPref.branch.setCharPref(key, value);
  }
}

function setDefaultPrefs() {
  let branch = Services.prefs.getDefaultBranch(PREF_BRANCH);
  for (let [key, val] in Iterator(PREFS)) {
    switch (typeof val) {
      case "boolean":
        branch.setBoolPref(key, val);
        break;
      case "number":
        branch.setIntPref(key, val);
        break;
      case "string":
        branch.setCharPref(key, val);
        break;
    }
  }
}

var prefObserver = {
  register: function() {
    var prefService = Components.classes["@mozilla.org/preferences-service;1"]
                                .getService(Components.interfaces.nsIPrefService);

    this.branch = prefService.getBranch(PREF_BRANCH);

    // Now we queue the interface called nsIPrefBranch2. This interface is described as:
    // "nsIPrefBranch2 allows clients to observe changes to pref values."
    // This is only necessary prior to Gecko 13
    if (!("addObserver" in this.branch))
        this.branch.QueryInterface(Components.interfaces.nsIPrefBranch2);

    // Finally add the observer.
    this.branch.addObserver("", this, false);
  },

  unregister: function() {
    this.branch.removeObserver("", this);
  },

  observe: function(aSubject, aTopic, aData) {
    switch (aData) {
      case "autoshort": {
        Zotero.ShortDOI.autoshort = getPref("autoshort");
      }
      break;
    }
  }
};

// Startup - initialize plugin

Zotero.ShortDOI.init = function() {
    setDefaultPrefs();
    Zotero.ShortDOI.resetState("initial");

    /*stringBundle = document.getElementById('zoteroshortdoi-bundle');
    Zotero.ShortDOI.invalidDOIString = 'Invalid DOI';
    Zotero.ShortDOI.invalidDOITagString = 'Invalid DOIs were found. These have been tagged with \u26A0\uFE0FInvalid DOI.';
    if (stringBundle != null) {
        Zotero.ShortDOI.invalidDOIString = stringBundle.getString('invalidDOIString');
        Zotero.ShortDOI.invalidDOITagString = stringBundle.getString('invalidDOITagString');
    }*/

    // Register the callback in Zotero as an item observer
    var notifierID = Zotero.Notifier.registerObserver(
        Zotero.ShortDOI.notifierCallback, ['item']);
    prefObserver.register();
    Zotero.ShortDOI.autoshort = getPref("autoshort");

    // Unregister callback when the window closes (important to avoid a memory leak)
    window.addEventListener('unload', function(e) {
        Zotero.Notifier.unregisterObserver(notifierID);
        prefObserver.unregister();
    }, false);

};

Zotero.ShortDOI.notifierCallback = {
    notify: function(event, type, ids, extraData) {
        if (event == 'add') {
          if (Zotero.ShortDOI.autoshort) {
            Zotero.ShortDOI.updateItems(Zotero.Items.get(ids), "short");
          }
        }
    }
};

// Controls for Tools menu

// *********** Set the checkbox checks, frompref
Zotero.ShortDOI.setCheck = function() {
    var autoshortCheck = document.getElementById("zoteroshortdoi-options-autoshort");
    autoshortvalue = getPref("autoshort");
    autoshortCheck.setAttribute("checked", Boolean(autoshortvalue));
};

// *********** Change the checkbox, topref
Zotero.ShortDOI.changePref = function changePref() {
    var autoshortCheck = document.getElementById("zoteroshortdoi-options-autoshort");
    autoshortvalue = getPref("autoshort");
    var autoshortvalue = !autoshortvalue;
    setPref("autoshort", Boolean(autoshortvalue));
};


Zotero.ShortDOI.resetState = function(operation) {

    if (operation == "initial") {
        if (Zotero.ShortDOI.progressWindow) {
            Zotero.ShortDOI.progressWindow.close();
        }
    } else {
        if(Zotero.ShortDOI.invalidDOI || Zotero.ShortDOI.lookupFailure || Zotero.ShortDOI.multiLookup) {
            Zotero.ShortDOI.progressWindow.close();
            var icon = "chrome://zotero/skin/cross.png";
            if(Zotero.ShortDOI.invalidDOI) {
                Zotero.ShortDOI.progressWindowInvalid = new Zotero.ProgressWindow({closeOnClick:true});
                Zotero.ShortDOI.progressWindowInvalid.changeHeadline("Invalid DOI");
                Zotero.ShortDOI.progressWindowInvalid.progress = new Zotero.ShortDOI.progressWindowInvalid.ItemProgress(icon, "Invalid DOIs were found. These have been tagged with '\u26A0\uFE0FInvalid DOI'.");
                Zotero.ShortDOI.progressWindowInvalid.progress.setError();
                Zotero.ShortDOI.progressWindowInvalid.show();
                Zotero.ShortDOI.progressWindowInvalid.startCloseTimer(8000);
            }
            if(Zotero.ShortDOI.lookupFailure) {
                Zotero.ShortDOI.progressWindowLookup = new Zotero.ProgressWindow({closeOnClick:true});
                Zotero.ShortDOI.progressWindowLookup.changeHeadline("DOI not found");
                Zotero.ShortDOI.progressWindowLookup.progress = new Zotero.ShortDOI.progressWindowLookup.ItemProgress(icon, "No DOI was found for some items. These have been tagged with '\u{1F50D}No DOI found'.");
                Zotero.ShortDOI.progressWindowLookup.progress.setError();
                Zotero.ShortDOI.progressWindowLookup.show();
                Zotero.ShortDOI.progressWindowLookup.startCloseTimer(8000);
            }
            if(Zotero.ShortDOI.multiLookup) {
                Zotero.ShortDOI.progressWindowMulti = new Zotero.ProgressWindow({closeOnClick:true});
                Zotero.ShortDOI.progressWindowMulti.changeHeadline("Multiple possible DOIs");
                Zotero.ShortDOI.progressWindowMulti.progress = new Zotero.ShortDOI.progressWindowMulti.ItemProgress(icon, "Some items had multiple possible DOIs. Links to lists of DOIs have been added and tagged with '\u2753Multiple DOI'.");
                Zotero.ShortDOI.progressWindow.progress.setError();
                Zotero.ShortDOI.progressWindowMulti.show();
                Zotero.ShortDOI.progressWindowMulti.startCloseTimer(8000);
            }

        } else {
            var icon = "chrome://zotero/skin/tick.png";
            Zotero.ShortDOI.progressWindow = new Zotero.ProgressWindow({closeOnClick:true});
            Zotero.ShortDOI.progressWindow.changeHeadline("Finished");
            Zotero.ShortDOI.progressWindow.progress = new Zotero.ShortDOI.progressWindow.ItemProgress(icon);
            Zotero.ShortDOI.progressWindow.progress.setProgress(100);
            if (operation == "short") {
                Zotero.ShortDOI.progressWindow.progress.setText("shortDOIs updated for "+Zotero.ShortDOI.counter+" items.");
            } else if (operation == "long") {
                Zotero.ShortDOI.progressWindow.progress.setText("Long DOIs updated for "+Zotero.ShortDOI.counter+" items.");
            } else {
                Zotero.ShortDOI.progressWindow.progress.setText("DOIs verified for "+Zotero.ShortDOI.counter+" items.");
            }
            Zotero.ShortDOI.progressWindow.show();
            Zotero.ShortDOI.progressWindow.startCloseTimer(4000);
        }
    }
    Zotero.ShortDOI.current = -1;
    Zotero.ShortDOI.toUpdate = 0;
    Zotero.ShortDOI.itemsToUpdate = null;
    Zotero.ShortDOI.numberOfUpdatedItems = 0;
    Zotero.ShortDOI.counter = 0;
    Zotero.ShortDOI.invalidDOI = null;
    Zotero.ShortDOI.lookupFailure = null;
    Zotero.ShortDOI.multiLookup = null;

};


Zotero.ShortDOI.generateItemUrl = function(item, operation) {
    var doi = item.getField('DOI');
    if (! doi) {
        doi = Zotero.ShortDOI.crossrefLookup(item, operation);
    } else {

        if (typeof doi === "string") {
            doi = Zotero.Utilities.cleanDOI(doi);
            if (doi) {
                if (operation === "short" && ! doi.match(/10\/[^\s]*[^\s\.,]/)) {
                    var url = 'http://shortdoi.org/' + encodeURIComponent(doi) + '?format=json';
                    return url;

                } else {
                    var url = 'https://doi.org/api/handles/' + encodeURIComponent(doi);
                    return url;
                }

            } else {
                return "invalid";
            }

          } else {
              return "invalid";
          }
    }

    return false;

};

Zotero.ShortDOI.updateSelectedEntity = function(operation) {
    if (!ZoteroPane.canEdit()) {
        ZoteroPane.displayCannotEditLibraryMessage();
        return;
    }

    var collection = ZoteroPane.getSelectedCollection();
    var group = ZoteroPane.getSelectedGroup();

    if (collection) {
        var items = [];
        collection.getChildItems(false).forEach(function (item) {
            items.push(Zotero.Items.get(item.id));
        });
        Zotero.ShortDOI.updateItems(items, operation);
    } else if (group) {
        if (!group.editable) {
            alert("This group is not editable!");
            return;
        }
        var items = [];
        group.getCollections().forEach(function(collection) {
            collection.getChildItems(false).forEach(function(item) {
                items.push(Zotero.Items.get(item.id));
            })
        });
        Zotero.ShortDOI.updateItems(items, operation);
    } else {
        Zotero.ShortDOI.resetState(operation);
        return;
    }
};

Zotero.ShortDOI.updateSelectedItems = function(operation) {
    Zotero.ShortDOI.updateItems(ZoteroPane.getSelectedItems(), operation);
};

Zotero.ShortDOI.updateItems = function(items, operation) {
    // For now, filter out non-journal article items
    var items = items.filter(item => item.itemTypeID == Zotero.ItemTypes.getID('journalArticle'));

    if (items.length === 0 ||
            Zotero.ShortDOI.numberOfUpdatedItems < Zotero.ShortDOI.toUpdate) {
        return;
    }

    Zotero.ShortDOI.resetState("initial");
    Zotero.ShortDOI.toUpdate = items.length;
    Zotero.ShortDOI.itemsToUpdate = items;

    // Progress Windows
    Zotero.ShortDOI.progressWindow = new Zotero.ProgressWindow({closeOnClick: false});
    var icon = 'chrome://zotero/skin/toolbar-advanced-search' + (Zotero.hiDPI ? "@2x" : "") + '.png';
    //var icon = "chrome://zotero/skin/toolbar-advanced-search.png";
    if (operation == "short") {
        Zotero.ShortDOI.progressWindow.changeHeadline("Getting shortDOIs", icon);
    } else if (operation == "long") {
        Zotero.ShortDOI.progressWindow.changeHeadline("Getting long DOIs", icon);
    } else {
        Zotero.ShortDOI.progressWindow.changeHeadline("Validating DOIs and removing extra text", icon);
    }
    var doiIcon = 'chrome://zoteroshortdoi/skin/doi' + (Zotero.hiDPI ? "@2x" : "") + '.png';
    //var doiIcon = 'chrome://zoteroshortdoi/skin/doi.png';
    Zotero.ShortDOI.progressWindow.progress = new Zotero.ShortDOI.progressWindow.ItemProgress(doiIcon, "Checking DOIs.");

    Zotero.ShortDOI.updateNextItem(operation);
};

Zotero.ShortDOI.updateNextItem = function(operation) {
    Zotero.ShortDOI.numberOfUpdatedItems++;

    if (Zotero.ShortDOI.current == Zotero.ShortDOI.toUpdate - 1) {
        Zotero.ShortDOI.progressWindow.close();
        Zotero.ShortDOI.resetState(operation);
        return;
    }

    Zotero.ShortDOI.current++;

    // Progress Windows
    var percent = Math.round((Zotero.ShortDOI.numberOfUpdatedItems/Zotero.ShortDOI.toUpdate)*100);
    Zotero.ShortDOI.progressWindow.progress.setProgress(percent);
    Zotero.ShortDOI.progressWindow.progress.setText("Item "+Zotero.ShortDOI.current+" of "+Zotero.ShortDOI.toUpdate);
    Zotero.ShortDOI.progressWindow.show();

    Zotero.ShortDOI.updateItem(
            Zotero.ShortDOI.itemsToUpdate[Zotero.ShortDOI.current], operation);
};

Zotero.ShortDOI.updateItem = function(item, operation) {
    var url = Zotero.ShortDOI.generateItemUrl(item, operation);

    if ( ! url ) {
        if (item.hasTag('\u26A0\uFE0FInvalid DOI')) {
            item.removeTag('\u26A0\uFE0FInvalid DOI');
            item.saveTx();
        }
        Zotero.ShortDOI.updateNextItem(operation);
    } else if (url == 'invalid') {
        Zotero.ShortDOI.invalidate(item, operation);
    } else {
        var oldDOI = item.getField('DOI');
        var req = new XMLHttpRequest();
        req.open('GET', url, true);
        req.responseType = 'json';

        if (operation == "short") {

            req.onreadystatechange = function() {
                if (req.readyState == 4) {
                    if (req.status == 200) {
                        if (item.isRegularItem() && !item.isCollection()) {
                            if (oldDOI.match(/10\/[^\s]*[^\s\.,]/)) {
                                if (req.response.responseCode == 1) {
                                    if (req.response.handle != oldDOI) {
                                        var shortDOI = req.response.handle;
                                        item.setField('DOI', shortDOI);
                                        item.removeTag('\u26A0\uFE0FInvalid DOI');
                                        item.removeTag('\u2753Multiple DOI');
                                        item.removeTag('\u{1F50D}No DOI found');
                                        item.saveTx();
                                        Zotero.ShortDOI.counter++;
                                    } else if (item.hasTag('\u26A0\uFE0FInvalid DOI') || item.hasTag('\u2753Multiple DOI') || item.hasTag('\u{1F50D}No DOI found')) {
                                        item.removeTag('\u26A0\uFE0FInvalid DOI');
                                        item.removeTag('\u2753Multiple DOI');
                                        item.removeTag('\u{1F50D}No DOI found');
                                        item.saveTx();
                                    }
                                } else {
                                    Zotero.ShortDOI.invalidate(item, operation);
                                }
                            } else {
                                var shortDOI = req.response.ShortDOI;
                                item.setField('DOI', shortDOI);
                                item.removeTag('\u26A0\uFE0FInvalid DOI');
                                item.removeTag('\u2753Multiple DOI');
                                item.removeTag('\u{1F50D}No DOI found');
                                item.saveTx();
                                Zotero.ShortDOI.counter++;
                            }

                        }
                        Zotero.ShortDOI.updateNextItem(operation);
                    } else if (req.status == 400 || req.status == 404) {
                        Zotero.ShortDOI.invalidate(item, operation);
                    } else {
                        Zotero.ShortDOI.updateNextItem(operation);
                    }
                }
            };

            req.send(null);

        } else if (operation == "long") {
            //req.setRequestHeader('Accept', 'application/vnd.citationstyles.csl+json');

            req.onreadystatechange = function() {
                if (req.readyState == 4) {
                    if (req.status == 200) {
                        if (req.response.responseCode == 1) {
                            if (oldDOI.match(/10\/[^\s]*[^\s\.,]/)) {

                                if (item.isRegularItem() && !item.isCollection()) {
                                    var longDOI = req.response.values["1"].data.value;
                                    item.setField('DOI', longDOI);
                                    item.removeTag('\u26A0\uFE0FInvalid DOI');
                                    item.removeTag('\u2753Multiple DOI');
                                    item.removeTag('\u{1F50D}No DOI found');
                                    item.saveTx();
                                    Zotero.ShortDOI.counter++;
                                }
                            } else {
                                if (req.response.handle != oldDOI) {
                                    var longDOI = req.response.handle;
                                    item.setField('DOI', longDOI);
                                    item.removeTag('\u26A0\uFE0FInvalid DOI');
                                    item.removeTag('\u2753Multiple DOI');
                                    item.removeTag('\u{1F50D}No DOI found');
                                    item.saveTx();
                                    Zotero.ShortDOI.counter++;
                                } else if (item.hasTag('\u26A0\uFE0FInvalid DOI') || item.hasTag('\u2753Multiple DOI') || item.hasTag('\u{1F50D}No DOI found')) {
                                    item.removeTag('\u26A0\uFE0FInvalid DOI');
                                    item.removeTag('\u2753Multiple DOI');
                                    item.removeTag('\u{1F50D}No DOI found');
                                    item.saveTx();
                                }
                            }
                            Zotero.ShortDOI.updateNextItem(operation);

                        } else {
                            Zotero.ShortDOI.invalidate(item, operation);
                        }

                    } else if (req.status == 404) {
                        Zotero.ShortDOI.invalidate(item, operation);

                    } else {
                        Zotero.ShortDOI.updateNextItem(operation);
                    }
                }
            };

            req.send(null);

        } else { //operation == "check"

            req.onreadystatechange = function() {
                if (req.readyState == 4) {
                    if (req.status == 404) {
                        Zotero.ShortDOI.invalidate(item, operation);
                    } else if (req.status == 200) {
                        if (req.response.responseCode == 200) {
                            Zotero.ShortDOI.invalidate(item, operation);
                        } else {
                            if (req.response.handle != oldDOI) {
                                var newDOI = req.response.handle;
                                item.setField('DOI', newDOI);
                                item.removeTag('\u26A0\uFE0FInvalid DOI');
                                item.removeTag('\u2753Multiple DOI');
                                item.removeTag('\u{1F50D}No DOI found');
                                item.saveTx();
                            } else if (item.hasTag('\u26A0\uFE0FInvalid DOI') || item.hasTag('\u2753Multiple DOI') || item.hasTag('\u{1F50D}No DOI found')) {
                                item.removeTag('\u26A0\uFE0FInvalid DOI');
                                item.removeTag('\u2753Multiple DOI');
                                item.removeTag('\u{1F50D}No DOI found');
                                item.saveTx();
                            }
                            Zotero.ShortDOI.counter++;
                            Zotero.ShortDOI.updateNextItem(operation);
                        }

                    } else {
                        Zotero.ShortDOI.updateNextItem(operation);
                    }
                }
            };

            req.send(null);
        }
    }
};

Zotero.ShortDOI.invalidate = function(item, operation) {
    if (item.isRegularItem() && !item.isCollection()) {
        Zotero.ShortDOI.invalidDOI = true;
        item.addTag('\u26A0\uFE0FInvalid DOI');
        item.saveTx();
    }
    Zotero.ShortDOI.updateNextItem(operation);
};

if (typeof window !== 'undefined') {
    window.addEventListener('load', function(e) {
        Zotero.ShortDOI.init();
    }, false);
}

Zotero.ShortDOI.crossrefLookup = function(item, operation) {
  var crossrefOpenURL = 'https://www.crossref.org/openurl?pid=zoteroDOI@wiernik.org&';
  var ctx = Zotero.OpenURL.createContextObject(item, "1.0");
  if (ctx) {
      var url = crossrefOpenURL + ctx + '&multihit=true';
      var req = new XMLHttpRequest();
      req.open('GET', url, true);
      // req.responseType = 'json';

      req.onreadystatechange = function() {
          if (req.readyState == 4) {
              if (req.status == 200) {
                  var response = req.responseXML.getElementsByTagName("query")[0];
                  var status = response.getAttribute('status')
                  if (status === "resolved") {
                      var doi = response.getElementsByTagName("doi")[0].childNodes[0].nodeValue;
                      if (operation === "short") {
                          //return doi;    // Need to promisfy to be able to simply use return()
                          item.setField('DOI', doi);
                          Zotero.ShortDOI.updateItem(item, operation);

                      } else {
                          item.setField('DOI', doi);
                          item.removeTag('\u26A0\uFE0FInvalid DOI');
                          item.removeTag('\u2753Multiple DOI');
                          item.removeTag('\u{1F50D}No DOI found');
                          item.saveTx();
                          Zotero.ShortDOI.counter++;
                          Zotero.ShortDOI.updateNextItem(operation);
                      }


                  } else if (status === "unresolved") {
                      Zotero.ShortDOI.lookupFailure = true;
                      item.removeTag('\u26A0\uFE0FInvalid DOI');
                      item.removeTag('\u2753Multiple DOI');
                      item.removeTag('\u{1F50D}No DOI found');
                      item.addTag('\u{1F50D}No DOI found');
                      item.saveTx();
                      Zotero.ShortDOI.updateNextItem(operation);

                  } else if (status === "multiresolved") {
                      Zotero.ShortDOI.multiLookup = true;
                      Zotero.Attachments.linkFromURL({"url":crossrefOpenURL + ctx, "parentItemID":item.id, "contentType":"text/html", "title":"Multiple DOIs found"});
                      if (item.hasTag('\u26A0\uFE0FInvalid DOI') || item.hasTag('\u{1F50D}No DOI found')) {
                          item.removeTag('\u26A0\uFE0FInvalid DOI');
                          item.removeTag('\u{1F50D}No DOI found');
                      }
                      // TODO: Move this tag to the attachment link
                      item.addTag('\u2753Multiple DOI');
                      item.saveTx();
                      Zotero.ShortDOI.updateNextItem(operation);

                  } else {
                      Zotero.debug("Zotero DOI Manager: CrossRef lookup: Unknown status code: " + status);
                      Zotero.ShortDOI.updateNextItem(operation);
                  }

              } else {
                  Zotero.ShortDOI.updateNextItem(operation);
              }

          }
      };

      req.send(null);

    }

    return false;

};
