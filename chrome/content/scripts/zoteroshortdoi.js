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
    Zotero.ShortDOI.invalidDOITagString = 'Invalid DOIs were found. These have been tagged with _Invalid DOI.';
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
            Zotero.ShortDOI.updateItems(Zotero.Items.get(ids), "short");
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
        if(Zotero.ShortDOI.invalidDOI) {
            Zotero.ShortDOI.progressWindow.close();
            var win = Services.wm.getMostRecentWindow("navigator:browser");
            Zotero.ShortDOI.progressWindow = win.ZoteroPane.progressWindow;
            Zotero.ShortDOI.progressWindow.changeHeadline("Invalid DOI", "chrome://zotero/skin/cross.png");
            Zotero.ShortDOI.progressWindow.addLines("Invalid DOIs were found. These have been tagged with _Invalid DOI.", "chrome://zotero/skin/warning.png");
            Zotero.ShortDOI.progressWindow.show();
            Zotero.ShortDOI.progressWindow.startCloseTimer(8000);
        } else {
            var icon = "chrome://zotero/skin/tick.png";
            Zotero.ShortDOI.progressWindow.close();
            var win = Services.wm.getMostRecentWindow("navigator:browser");
            Zotero.ShortDOI.progressWindow = win.ZoteroPane.progressWindow;
            Zotero.ShortDOI.progressWindow.changeHeadline("Finished");
            if (operation == "short") {
                Zotero.ShortDOI.progressWindow.addLines("shortDOIs retrieved for "+Zotero.ShortDOI.counter+" items.",icon);
            } else if (operation == "long") {
                Zotero.ShortDOI.progressWindow.addLines("Long DOIs retrieved for "+Zotero.ShortDOI.counter+" items.",icon);
            } else {
                Zotero.ShortDOI.progressWindow.addLines("DOIs verified for "+Zotero.ShortDOI.counter+" items.",icon);
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
};


Zotero.ShortDOI.generateItemUrl = function(item, operation) {
    if (operation == "short") {
        var baseURL = 'http://shortdoi.org/';
        var doi = item.getField('DOI');
        if (doi) {
            if (typeof doi === "string") {
                doi = Zotero.Utilities.cleanDOI(doi);
                if (doi) {
                    if (doi.match(/10\/[^\s]*[^\s\.,]/)) {
                        var url = 'https://doi.org/api/handles/' + encodeURIComponent(doi); 
                        return url;
                    } else {
                        var url = baseURL + encodeURIComponent(doi) + '?format=json';               
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

    } else {
        var baseURL = 'https://doi.org/api/handles/';
        var doi = item.getField('DOI');
        if (doi) {
            if (typeof doi === "string") {
                doi = Zotero.Utilities.cleanDOI(doi);
                if (doi) {
                    var url = baseURL + encodeURIComponent(doi);
                    
                    return url;

                } else {
                    return "invalid";
                }
            } else {
                return "invalid";
            }
            
        }

        return false;

    }
    
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
    if (items.length === 0 ||
            Zotero.ShortDOI.numberOfUpdatedItems < Zotero.ShortDOI.toUpdate) {
        return;
    }

    Zotero.ShortDOI.resetState("initial");
    Zotero.ShortDOI.toUpdate = items.length;
    Zotero.ShortDOI.itemsToUpdate = items;

    // Progress Windows
    var win = Services.wm.getMostRecentWindow("navigator:browser");
    Zotero.ShortDOI.progressWindow = win.ZoteroPane.progressWindow;
    if (operation == "short") {
        Zotero.ShortDOI.progressWindow.addLines("Getting shortDOIs", "chrome://zotero/skin/toolbar-advanced-search.png");
    } else if (operation == "long") {
        Zotero.ShortDOI.progressWindow.addLines("Getting long DOIs", "chrome://zotero/skin/toolbar-advanced-search.png");
    } else {
        Zotero.ShortDOI.progressWindow.addLines("Validating DOIs and removing extra text", "chrome://zotero/skin/toolbar-advanced-search.png");
    }

    Zotero.ShortDOI.updateNextItem(operation);
};

Zotero.ShortDOI.updateNextItem = function(operation) {
    Zotero.ShortDOI.numberOfUpdatedItems++;

    if (Zotero.ShortDOI.current == Zotero.ShortDOI.toUpdate - 1) {
        Zotero.ShortDOI.resetState(operation);
        return;
    }

    Zotero.ShortDOI.current++;

    // Progress Windows
    Zotero.ShortDOI.progressWindow.changeHeadline("Item "+Zotero.ShortDOI.current+" of "+Zotero.ShortDOI.toUpdate);
    Zotero.ShortDOI.progressWindow.show();
    
    Zotero.ShortDOI.updateItem(
            Zotero.ShortDOI.itemsToUpdate[Zotero.ShortDOI.current], operation);
};

Zotero.ShortDOI.updateItem = function(item, operation) {
    var url = Zotero.ShortDOI.generateItemUrl(item, operation);

    if ( ! url ) {
        if (item.hasTag('_Invalid DOI')) {
            item.removeTag('_Invalid DOI');
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
                                        item.removeTag('_Invalid DOI');
                                        item.saveTx();
                                        Zotero.ShortDOI.counter++;
                                    } else if (item.hasTag('_Invalid DOI')) {
                                        item.removeTag('_Invalid DOI');
                                        item.saveTx();
                                    }
                                } else {
                                    Zotero.ShortDOI.invalidate(item, operation);
                                }
                            } else {
                                var shortDOI = req.response.ShortDOI;
                                item.setField('DOI', shortDOI);
                                item.removeTag('_Invalid DOI');
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
                                    item.removeTag('_Invalid DOI');
                                    item.saveTx();
                                    Zotero.ShortDOI.counter++;
                                }
                            } else {
                                if (req.response.handle != oldDOI) {
                                    var longDOI = req.response.handle;
                                    item.setField('DOI', longDOI);
                                    item.removeTag('_Invalid DOI');
                                    item.saveTx();
                                    Zotero.ShortDOI.counter++;
                                } else if (item.hasTag('_Invalid DOI')) {
                                    item.removeTag('_Invalid DOI');
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
                                item.removeTag('_Invalid DOI');
                                item.saveTx();
                            } else if (item.hasTag('_Invalid DOI')) {
                                item.removeTag('_Invalid DOI');
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
        item.addTag('_Invalid DOI');
        item.saveTx();
    }
    Zotero.ShortDOI.updateNextItem(operation);
};

if (typeof window !== 'undefined') {
    window.addEventListener('load', function(e) {
        Zotero.ShortDOI.init();
    }, false);
}