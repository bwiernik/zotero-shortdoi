const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/Services.jsm");

if (typeof Zotero === 'undefined') {
    Zotero = {};
}
Zotero.ShortDOI = {};

const PREF_BRANCH = 'extensions.shortdoi.';
const PREFS = {
  savelong: true
};

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
      case "savelong":
        Zotero.ShortDOI.savelong = getPref("savelong")
        break;
    }
  }
}

Zotero.ShortDOI.init = function() {
    setDefaultPrefs();
    Zotero.ShortDOI.resetState();

    stringBundle = document.getElementById('zoteroshortdoi-bundle');
    Zotero.ShortDOI.DOInotfoundString = 'DOI not found. taking you to http://shortdoi.org to view the error.';
        if (stringBundle != null) {
            Zotero.ShortDOI.DOInotfoundString = stringBundle.getString('DOInotfoundString');
        }

    // Register the callback in Zotero as an item observer
    var notifierID = Zotero.Notifier.registerObserver(
            Zotero.ShortDOI.notifierCallback, ['item']);
    prefObserver.register();

    Zotero.ShortDOI.savelong = getPref("savelong")

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

Zotero.ShortDOI.resetState = function() {
    Zotero.ShortDOI.current = -1;
    Zotero.ShortDOI.toUpdate = 0;
    Zotero.ShortDOI.itemsToUpdate = null;
    Zotero.ShortDOI.numberOfUpdatedItems = 0;
};

Zotero.ShortDOI.updateSelectedEntity = function(libraryId) {
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
        Zotero.ShortDOI.updateItems(items);
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
        Zotero.ShortDOI.updateItems(items);
    } else {
        Zotero.ShortDOI.resetState();
        return;
    }
};

Zotero.ShortDOI.updateSelectedItems = function() {
    Zotero.ShortDOI.updateItems(ZoteroPane.getSelectedItems());
};

Zotero.ShortDOI.updateItems = function(items) {
    if (items.length == 0 ||
            Zotero.ShortDOI.numberOfUpdatedItems < Zotero.ShortDOI.toUpdate) {
        return;
    }

    Zotero.ShortDOI.resetState();
    Zotero.ShortDOI.toUpdate = items.length;
    Zotero.ShortDOI.itemsToUpdate = items;
    Zotero.ShortDOI.updateNextItem();
};

Zotero.ShortDOI.updateNextItem = function() {
    Zotero.ShortDOI.numberOfUpdatedItems++;

    if (Zotero.ShortDOI.current == Zotero.ShortDOI.toUpdate - 1) {
        Zotero.ShortDOI.resetState();
        return;
    }

    Zotero.ShortDOI.current++;
    Zotero.ShortDOI.updateItem(
            Zotero.ShortDOI.itemsToUpdate[Zotero.ShortDOI.current]);
};

Zotero.ShortDOI.generateItemUrl = function(item, attempt) {
    var baseURL = 'http://shortdoi.org/';
        var doi = item.getField('DOI');
        if(doi && typeof doi === "string") {
                    doi = Zotero.Utilities.cleanDOI(doi);
                    if(doi) {
                        if(!!doi.match(/10\/[^\s]*[^\s\.,]/)) {
                            return false;
                        }
                        if(attempt === "initial") {
                            var url = baseURL + encodeURIComponent(doi) + '?format=json';
                        } else {
                            var url = baseURL + encodeURIComponent(doi);
                        }
                        
                        return url;
                    }
                }
                
                return false;
    };

Zotero.ShortDOI.updateItem = function(item) {
    var req = new XMLHttpRequest();
    var url = Zotero.ShortDOI.generateItemUrl(item, "initial");
    req.open('GET', url, true);

    req.onreadystatechange = function() {
        if (req.readyState == 4) {
            if (req.status == 200 && req.responseText !== '') {
                if (item.isRegularItem() && !item.isCollection()) {
                    var doiResponse = JSON.parse(req.responseText);
                    var shortDOI = doiResponse.ShortDOI;
                    if(Zotero.ShortDOI.savelong) {
                        var longDOI = doiResponse.DOI;
                        var longDOIstring = 'Long DOI: ' + longDOI + ' '
                        try {
                            var old = item.getField('extra')
                                if (old.length == 0 || old.search(/^Long DOI: *[^\s]+$/) != -1) {//If empty or just Long DOI:
                                    item.setField('extra', longDOIstring);
                                } else if (old.search(/^Long DOI: *[^\s]+/) != -1) {//If the field starts with Long DOI: 
                                    item.setField(
                                            'extra',
                                            old.replace(/^Long DOI: *[^\s]+ ?/, longDOIstring));
                                } else if (old.search(/\nLong DOI: *[^\s]+/) != -1) { //If there are citations and somthing else on same line
                                    item.setField(
                                            'extra',
                                            old.replace(/\nLong DOI: *[^\s]+ ?/, ' \n' + longDOIstring));
                                } else {
                                    item.setField('extra', old + ' \n' + longDOIstring);
                                }
                                item.setField('DOI', shortDOI);
                                item.saveTx();
                        } catch (e) {}                        
                    } else {
                        item.setField('DOI', shortDOI);
                        item.saveTx();
                    }
                }
                Zotero.ShortDOI.updateNextItem();
            } else if (req.status == 200 ||
                    req.status == 403 ||
                    req.status == 503) {
                alert(Zotero.ShortDOI.DOInotfoundString);
                var url2 = Zotero.ShortDOI.generateItemUrl(item, "notfound");
                req2 = new XMLHttpRequest();
                req2.open('GET', url2, true);
                req2.onreadystatechange = function() {
                    if (req2.readyState == 4) {
                        if (typeof Zotero.launchURL !== 'undefined') {
                            Zotero.launchURL(url);
                        } else if (typeof Zotero.openInViewer !== 'undefined') {
                            Zotero.openInViewer(url);
                        } else if (typeof ZoteroStandalone !== 'undefined') {
                            ZoteroStandalone.openInViewer(url);
                        } else {
                            window.gBrowser.loadOneTab(
                                    url, {inBackground: false});
                        }
                        Zotero.ShortDOI.resetState();
                    }
                }
                req2.send(null);
            }
        }
    };

    req.send(null);
};

if (typeof window !== 'undefined') {
    window.addEventListener('load', function(e) {
        Zotero.ShortDOI.init();
    }, false);
}
