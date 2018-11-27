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
    autoretrieve: "short",
    tag_invalid: "_Invalid DOI",
    tag_multiple: "_Multiple DOIs found",
    tag_nodoi: "_No DOI found"
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
      return getPref.branch.getComplexValue(key, Components.interfaces.nsISupportsString).data;
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
      var str = Components.classes["@mozilla.org/supports-string;1"]
                .createInstance(Components.interfaces.nsISupportsString);
      str.data = value;
      setPref.branch.setComplexValue(key, 
                             Components.interfaces.nsISupportsString, str);
      break;
  }
}

/*
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
        var str = Components.classes["@mozilla.org/supports-string;1"]
                  .createInstance(Components.interfaces.nsISupportsString);
        str.data = val;
        branch.setComplexValue(key, 
                               Components.interfaces.nsISupportsString, str);
        break;
    }
  }
}
*/

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
      case "autoretrieve":
        Zotero.ShortDOI.autoretrieve = getPref("autoretrieve");
        break;
      case "tag_invalid": 
        Zotero.ShortDOI.tag_invalid = getPref("tag_invalid");
        break;
      case "tag_multiple": 
        Zotero.ShortDOI.tag_multiple = getPref("tag_multiple");
        break;
      case "tag_nodoi":
        Zotero.ShortDOI.tag_nodoi = getPref("tag_nodoi");
        break; 
    }
  }
};

// Startup - initialize plugin

Zotero.ShortDOI.init = function() {
    //setDefaultPrefs();
    Zotero.ShortDOI.resetState("initial");

    /*stringBundle = document.getElementById('zoteroshortdoi-bundle');
    error_invalidString = 'Invalid DOI';
    error_invalidTagString = 'Invalid DOIs were found. These have been tagged with \u26A0\uFE0FInvalid DOI.';
    if (stringBundle != null) {
        error_invalidString = stringBundle.getString('invalidDOIString');
        error_invalidTagString = stringBundle.getString('invalidDOITagString');
    }*/

    // Register the callback in Zotero as an item observer
    var notifierID = Zotero.Notifier.registerObserver(
        Zotero.ShortDOI.notifierCallback, ['item']);
    prefObserver.register();
    Zotero.ShortDOI.autoretrieve = getPref("autoretrieve");
    Zotero.ShortDOI.tag_invalid = getPref("tag_invalid");
    Zotero.ShortDOI.tag_multiple = getPref("tag_multiple");
    Zotero.ShortDOI.tag_nodoi = getPref("tag_nodoi");

    // Unregister callback when the window closes (important to avoid a memory leak)
    window.addEventListener('unload', function(e) {
        Zotero.Notifier.unregisterObserver(notifierID);
        prefObserver.unregister();
    }, false);

};

Zotero.ShortDOI.notifierCallback = {
    notify: function(event, type, ids, extraData) {
        if (event == 'add') {
          alert(getPref("autoretrieve"));
          switch (getPref("autoretrieve")) {
            case "short":
              Zotero.ShortDOI.updateItems(Zotero.Items.get(ids), "short");
              break;
            case "long":
              Zotero.ShortDOI.updateItems(Zotero.Items.get(ids), "long");
              break;
            case "verify":
              Zotero.ShortDOI.updateItems(Zotero.Items.get(ids), "check");
              break;
            default:
              break;
          }
        }
    }
};

// Controls for Tools menu

// *********** Set the checkbox checks, frompref
Zotero.ShortDOI.setCheck = function() {
    var tools_short = document.getElementById("menu_Tools-zoteroshortdoi-menu-popup-short");
    var tools_long  = document.getElementById("menu_Tools-zoteroshortdoi-menu-popup-long");
    var tools_check = document.getElementById("menu_Tools-zoteroshortdoi-menu-popup-check");
    var tools_none  = document.getElementById("menu_Tools-zoteroshortdoi-menu-popup-none");
    var pref = getPref("autoretrieve");
    tools_short.setAttribute("checked", Boolean(pref === "short"));
    tools_long.setAttribute("checked", Boolean(pref === "long"));
    tools_check.setAttribute("checked", Boolean(pref === "check"));
    tools_none.setAttribute("checked", Boolean(pref === "none"));
};

// *********** Change the checkbox, topref
Zotero.ShortDOI.changePref = function changePref(option) {
    setPref("autoretrieve", option);
};

Zotero.ShortDOI.resetState = function(operation) {

    if (operation == "initial") {
        if (Zotero.ShortDOI.progressWindow) {
            Zotero.ShortDOI.progressWindow.close();
        }
        Zotero.ShortDOI.current = -1;
        Zotero.ShortDOI.toUpdate = 0;
        Zotero.ShortDOI.itemsToUpdate = null;
        Zotero.ShortDOI.numberOfUpdatedItems = 0;
        Zotero.ShortDOI.counter = 0;
        error_invalid = null;
        error_nodoi = null;
        error_multiple = null;
        error_invalid_shown = false;
        error_nodoi_shown = false;
        error_multiple_shown = false;
        final_count_shown = false;
        return;
    } else {
        if(error_invalid || error_nodoi || error_multiple) {
            Zotero.ShortDOI.progressWindow.close();
            var icon = "chrome://zotero/skin/cross.png";
            if(error_invalid && ! error_invalid_shown) {
              var progressWindowInvalid = new Zotero.ProgressWindow({closeOnClick:true});
              progressWindowInvalid.changeHeadline("Invalid DOI");
              if(Zotero.ShortDOI.tag_invalid !== "") {
                progressWindowInvalid.progress = new progressWindowInvalid.ItemProgress(icon, "Invalid DOIs were found. These have been tagged with '" + Zotero.ShortDOI.tag_invalid + "'.");
              } else {
                progressWindowInvalid.progress = new progressWindowInvalid.ItemProgress(icon, "Invalid DOIs were found.");
              }
              progressWindowInvalid.progress.setError();
              progressWindowInvalid.show();
              progressWindowInvalid.startCloseTimer(8000);
              error_invalid_shown = true;
            }
            if(error_nodoi && ! error_nodoi_shown) {
              var progressWindowNoDOI = new Zotero.ProgressWindow({closeOnClick:true});
              progressWindowNoDOI.changeHeadline("DOI not found");
              if(Zotero.ShortDOI.tag_nodoi !== "") {
                progressWindowNoDOI.progress = new progressWindowNoDOI.ItemProgress(icon, "No DOI was found for some items. These have been tagged with '" + Zotero.ShortDOI.tag_nodoi + "'.");
              } else {
                progressWindowNoDOI.progress = new progressWindowNoDOI.ItemProgress(icon, "No DOI was found for some items.");
              }
              progressWindowNoDOI.progress.setError();
              progressWindowNoDOI.show();
              progressWindowNoDOI.startCloseTimer(8000);  
              error_nodoi_shown = true; 
            }
            if(error_multiple && ! error_multiple_shown) {
              var progressWindowMulti = new Zotero.ProgressWindow({closeOnClick:true});
              progressWindowMulti.changeHeadline("Multiple possible DOIs");
              if(Zotero.ShortDOI.tag_multiple !== "") {
                progressWindowMulti.progress = new progressWindowMulti.ItemProgress(icon, "Some items had multiple possible DOIs. Links to lists of DOIs have been added and tagged with '" + Zotero.ShortDOI.tag_multiple + "'.");
              } else {
                progressWindowMulti.progress = new progressWindowMulti.ItemProgress(icon, "Some items had multiple possible DOIs.");
              }
              progressWindow.progress.setError();
              progressWindowMulti.show();
              progressWindowMulti.startCloseTimer(8000); 
              error_multiple_shown = true; 
            }

        } else {
          if(! final_count_shown) {
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
            final_count_shown = true;
          }
        }
        return;
    }
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

Zotero.ShortDOI.updateSelectedItems = function(operation) {
    Zotero.ShortDOI.updateItems(ZoteroPane.getSelectedItems(), operation);
};

Zotero.ShortDOI.updateItems = function(items, operation) {
    // For now, filter out non-journal article items
    var items = items.filter(item => item.itemTypeID == Zotero.ItemTypes.getID('journalArticle') || item.itemTypeID == Zotero.ItemTypes.getID('conferencePaper'));

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
        if (item.hasTag(Zotero.ShortDOI.tag_invalid)) {
            item.removeTag(Zotero.ShortDOI.tag_invalid);
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
                                        item.removeTag(Zotero.ShortDOI.tag_invalid);
                                        item.removeTag(Zotero.ShortDOI.tag_multiple);
                                        item.removeTag(Zotero.ShortDOI.tag_nodoi);
                                        item.saveTx();
                                        Zotero.ShortDOI.counter++;
                                    } else if (item.hasTag(Zotero.ShortDOI.tag_invalid) || item.hasTag(Zotero.ShortDOI.tag_multiple) || item.hasTag(Zotero.ShortDOI.tag_nodoi)) {
                                        item.removeTag(Zotero.ShortDOI.tag_invalid);
                                        item.removeTag(Zotero.ShortDOI.tag_multiple);
                                        item.removeTag(Zotero.ShortDOI.tag_nodoi);
                                        item.saveTx();
                                    }
                                } else {
                                    Zotero.ShortDOI.invalidate(item, operation);
                                }
                            } else {
                                var shortDOI = req.response.ShortDOI;
                                item.setField('DOI', shortDOI);
                                item.removeTag(Zotero.ShortDOI.tag_invalid);
                                item.removeTag(Zotero.ShortDOI.tag_multiple);
                                item.removeTag(Zotero.ShortDOI.tag_nodoi);
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
                                    item.removeTag(Zotero.ShortDOI.tag_invalid);
                                    item.removeTag(Zotero.ShortDOI.tag_multiple);
                                    item.removeTag(Zotero.ShortDOI.tag_nodoi);
                                    item.saveTx();
                                    Zotero.ShortDOI.counter++;
                                }
                            } else {
                                if (req.response.handle != oldDOI) {
                                    var longDOI = req.response.handle;
                                    item.setField('DOI', longDOI);
                                    item.removeTag(Zotero.ShortDOI.tag_invalid);
                                    item.removeTag(Zotero.ShortDOI.tag_multiple);
                                    item.removeTag(Zotero.ShortDOI.tag_nodoi);
                                    item.saveTx();
                                    Zotero.ShortDOI.counter++;
                                } else if (item.hasTag(Zotero.ShortDOI.tag_invalid) || item.hasTag(Zotero.ShortDOI.tag_multiple) || item.hasTag(Zotero.ShortDOI.tag_nodoi)) {
                                    item.removeTag(Zotero.ShortDOI.tag_invalid);
                                    item.removeTag(Zotero.ShortDOI.tag_multiple);
                                    item.removeTag(Zotero.ShortDOI.tag_nodoi);
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
                                item.removeTag(Zotero.ShortDOI.tag_invalid);
                                item.removeTag(Zotero.ShortDOI.tag_multiple);
                                item.removeTag(Zotero.ShortDOI.tag_nodoi);
                                item.saveTx();
                            } else if (item.hasTag(Zotero.ShortDOI.tag_invalid) || item.hasTag(Zotero.ShortDOI.tag_multiple) || item.hasTag(Zotero.ShortDOI.tag_nodoi)) {
                                item.removeTag(Zotero.ShortDOI.tag_invalid);
                                item.removeTag(Zotero.ShortDOI.tag_multiple);
                                item.removeTag(Zotero.ShortDOI.tag_nodoi);
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
        error_invalid = true;
        if(Zotero.ShortDOI.tag_invalid !== "") item.addTag(Zotero.ShortDOI.tag_invalid);
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
                          item.removeTag(Zotero.ShortDOI.tag_invalid);
                          item.removeTag(Zotero.ShortDOI.tag_multiple);
                          item.removeTag(Zotero.ShortDOI.tag_nodoi);
                          item.saveTx();
                          Zotero.ShortDOI.counter++;
                          Zotero.ShortDOI.updateNextItem(operation);
                      }


                  } else if (status === "unresolved") {
                      error_nodoi = true;
                      item.removeTag(Zotero.ShortDOI.tag_invalid);
                      item.removeTag(Zotero.ShortDOI.tag_multiple);
                      item.removeTag(Zotero.ShortDOI.tag_nodoi);
                      if(Zotero.ShortDOI.tag_nodoi !== "") item.addTag(Zotero.ShortDOI.tag_nodoi);
                      item.saveTx();
                      Zotero.ShortDOI.updateNextItem(operation);

                  } else if (status === "multiresolved") {
                      error_multiple = true;
                      Zotero.Attachments.linkFromURL({"url":crossrefOpenURL + ctx, "parentItemID":item.id, "contentType":"text/html", "title":"Multiple DOIs found"});
                      if (item.hasTag(Zotero.ShortDOI.tag_invalid) || item.hasTag(Zotero.ShortDOI.tag_nodoi)) {
                          item.removeTag(Zotero.ShortDOI.tag_invalid);
                          item.removeTag(Zotero.ShortDOI.tag_nodoi);
                      }
                      // TODO: Move this tag to the attachment link
                      if(Zotero.ShortDOI.tag_multiple !== "") item.addTag(Zotero.ShortDOI.tag_multiple);
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
