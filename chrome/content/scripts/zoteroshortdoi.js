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
      //case "savelong": Zotero.ShortDOI.savelong = getPref("savelong");
      case "autoshort": {
        Zotero.ShortDOI.autoshort = getPref("autoshort");
        if (Zotero.ShortDOI.autoshort) {
            // Register the callback in Zotero as an item observer
            var notifierID = Zotero.Notifier.registerObserver(
            Zotero.ShortDOI.notifierCallback, ['item']);
        } else {
            // Unregister the callback in Zotero as an item observer
            Zotero.Notifier.unregisterObserver(notifierID);
        }
      } 
      break;
    }
  }
}

// Startup - initialize plugin

Zotero.ShortDOI.init = function() {
    setDefaultPrefs();
    Zotero.ShortDOI.resetState();

    stringBundle = document.getElementById('zoteroshortdoi-bundle');
    Zotero.ShortDOI.invalidDOIString = 'Invalid DOI';
    Zotero.ShortDOI.invalidDOITagString = 'Invalid DOIs were found. These have been tagged with _Invalid DOI.';
        if (stringBundle != null) {
            Zotero.ShortDOI.invalidDOIString = stringBundle.getString('invalidDOIString');
            Zotero.ShortDOI.invalidDOITagString = stringBundle.getString('invalidDOITagString');
        }

    prefObserver.register();
    //Zotero.ShortDOI.savelong = getPref("savelong")
    Zotero.ShortDOI.autoshort = getPref("autoshort")

    // Unregister callback when the window closes (important to avoid a memory leak)
    window.addEventListener('unload', function(e) {
        Zotero.Notifier.unregisterObserver(notifierID);
        prefObserver.unregister();
    }, false);

};

Zotero.ShortDOI.notifierCallback = {
    notify: function(event, type, ids, extraData) {
        if (event == 'add') {
            Zotero.ShortDOI.updateItems(Zotero.Items.get(ids));
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


Zotero.ShortDOI.resetState = function() {
    if (Zotero.ShortDOI.invalidDOI) {
        var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                            .getService(Components.interfaces.nsIPromptService);
                        
        promptService.alert(window,
            Zotero.ShortDOI.invalidDOIString,
            Zotero.ShortDOI.invalidDOITagString);

        Zotero.ShortDOI.invalidDOI = null;
    }
    Zotero.ShortDOI.current = -1;
    Zotero.ShortDOI.toUpdate = 0;
    Zotero.ShortDOI.itemsToUpdate = null;
    Zotero.ShortDOI.numberOfUpdatedItems = 0;
};

Zotero.ShortDOI.generateItemUrl = function(item, operation) {
    if (operation == "short") {
        var baseURL = 'http://shortdoi.org/';
        var doi = item.getField('DOI');
        if (doi && typeof doi === "string") {
            doi = Zotero.Utilities.cleanDOI(doi);
            if (doi) {
                if (doi.match(/10\/[^\s]*[^\s\.,]/)) {
                    return false;
                }
                var url = baseURL + encodeURIComponent(doi) + '?format=json';
                
                return url;
            }
        }
        
        return false;

    } else if (operation == "long") {
        var baseURL = 'https://doi.org/';
        var doi = item.getField('DOI');
        if (doi && typeof doi === "string") {
            doi = Zotero.Utilities.cleanDOI(doi);
            if (doi) {
                if (doi.match(/10\/[^\s]*[^\s\.,]/)) {
                    var url = baseURL + doi;
                } else {
                    return false;
                }
                
                return url;
            }
        }

        return false;

    } else {
        var baseURL = 'https://doi.org/';
        var doi = item.getField('DOI');
        if (doi && typeof doi === "string") {
            doi = Zotero.Utilities.cleanDOI(doi);
            if (doi) {
                if (doi.match(/10\/[^\s]*[^\s\.,]/)) {
                    var url = baseURL + doi;
                } else {
                    var url = baseURL + encodeURIComponent(doi);
                }
                
                return url;
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
        Zotero.ShortDOI.resetState();
        return;
    }
};

Zotero.ShortDOI.updateSelectedItems = function(operation) {
    Zotero.ShortDOI.updateItems(ZoteroPane.getSelectedItems(), operation);
};

Zotero.ShortDOI.updateItems = function(items, operation) {
    if (items.length == 0 ||
            Zotero.ShortDOI.numberOfUpdatedItems < Zotero.ShortDOI.toUpdate) {
        return;
    }

    Zotero.ShortDOI.resetState();
    Zotero.ShortDOI.toUpdate = items.length;
    Zotero.ShortDOI.itemsToUpdate = items;
    Zotero.ShortDOI.updateNextItem(operation);
};

Zotero.ShortDOI.updateNextItem = function(operation) {
    Zotero.ShortDOI.numberOfUpdatedItems++;

    if (Zotero.ShortDOI.current == Zotero.ShortDOI.toUpdate - 1) {
        Zotero.ShortDOI.resetState();
        return;
    }

    Zotero.ShortDOI.current++;
    Zotero.ShortDOI.updateItem(
            Zotero.ShortDOI.itemsToUpdate[Zotero.ShortDOI.current], operation);
};

Zotero.ShortDOI.updateItem = function(item, operation) {
    var req = new XMLHttpRequest();
    var url = Zotero.ShortDOI.generateItemUrl(item, operation);
    if ( ! url ) {
        Zotero.ShortDOI.updateNextItem(operation);
    } else {
        req.open('GET', url, true);
        
        if (operation == "short") {
            req.responseType = 'json';

            req.onreadystatechange = function() {
                if (req.readyState == 4) {
                    if (req.status == 200 && req.response) {
                        if (item.isRegularItem() && !item.isCollection()) {
                            var doiResponse = req.response;
                            var shortDOI = doiResponse.ShortDOI;
                            /*
                            if (Zotero.ShortDOI.savelong) {
                                var longDOI = doiResponse.DOI;
                                var longDOIstring = 'Long DOI: ' + longDOI + ' '
                                try {
                                    var old = item.getField('extra')
                                        if (old.length == 0 || old.search(/^Long DOI: *[^\s]+$/) != -1) {
                                            item.setField('extra', longDOIstring);
                                        } else if (old.search(/^Long DOI: *[^\s]+/) != -1) {
                                            item.setField(
                                                    'extra',
                                                    old.replace(/^Long DOI: *[^\s]+ ?/, longDOIstring));
                                        } else if (old.search(/\nLong DOI: *[^\s]+/) != -1) { 
                                            item.setField(
                                                    'extra',
                                                    old.replace(/\nLong DOI: *[^\s]+ ?/, ' \n' + longDOIstring));
                                        } else {
                                            item.setField('extra', old + ' \n' + longDOIstring);
                                        }
                                        
                                } catch (e) {}                        
                            }
                            */
                            item.setField('DOI', shortDOI);
                            item.saveTx();
                        }
                        Zotero.ShortDOI.updateNextItem(operation);
                    } else if (req.status == 400) {
                        Zotero.ShortDOI.invalidDOI = true;
                        var tags = item.getTags();
                        item.setTags(tags.concat(['_Invalid DOI']));
                        item.saveTx();
                        Zotero.ShortDOI.updateNextItem(operation);
                    }
                }
            };

            req.send(null);

        } else if (operation == "long") {
            req.setRequestHeader('Accept', 'application/vnd.citationstyles.csl+json');

            req.onreadystatechange = function() { 
                if (req.readyState == 4) {
                    if (req.status == 200) {
                        var longDOI = /http:\/\/dx\.doi\.org\/([^\s]+)\>/.exec(req.getResponseHeader('Link'))[1];
                        if (longDOI) {
                            if (item.isRegularItem() && !item.isCollection()) {
                                /*
                                if (Zotero.ShortDOI.savelong) {
                                    var oldExtra = item.getField('extra')
                                    var newExtra = oldExtra.replace(/Long DOI: *[^\s]+\n?/,'');
                                    item.setField('extra',newExtra);
                                }
                                */
                                item.setField('DOI', longDOI);
                                item.saveTx();
                            }
                            Zotero.ShortDOI.updateNextItem(operation);
                        } else {
                            Zotero.ShortDOI.invalidDOI = true;
                            var tags = item.getTags();
                            item.setTags(tags.concat(['_Invalid DOI']));
                            item.saveTx();
                            Zotero.ShortDOI.updateNextItem(operation);
                        } 
                    } else if (req.status == 404) {
                        if ( req.responseText.match(/\<title\>Error: DOI Not Found\<\/title\>/) ) {
                            Zotero.ShortDOI.invalidDOI = true;
                            var tags = item.getTags();
                            item.setTags(tags.concat(['_Invalid DOI']));
                            item.saveTx();
                        }
                        Zotero.ShortDOI.updateNextItem(operation);

                    } else {
                        Zotero.ShortDOI.updateNextItem(operation);
                    }
                }
            };

            req.send(null);

        } else if (operation == "clean") {
            
            var oldExtra = item.getField('extra')
            var newExtra = oldExtra.replace(/Long DOI: *[^\s]+\n?/,'');
            item.setField('extra',newExtra);
            item.saveTx();

        } else {

            req.onreadystatechange = function() {
                if (req.readyState == 2) {
                    if (req.status == 404) {
                        Zotero.ShortDOI.invalidDOI = true;
                        var tags = item.getTags();
                        item.setTags(tags.concat(['_Invalid DOI']));
                        item.saveTx();
                        Zotero.ShortDOI.updateNextItem(operation);
                    } else Zotero.ShortDOI.updateNextItem(operation);                      
                }
            };

            req.send(null);
        }
    }
};

if (typeof window !== 'undefined') {
    window.addEventListener('load', function(e) {
        Zotero.ShortDOI.init();
    }, false);
}
