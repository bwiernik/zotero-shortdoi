// Startup -- load Zotero and constants
if (typeof Zotero === "undefined") {
    Zotero = {};
}
Zotero.ShortDOI = {
    initialized: false,

    // Initialize plugin
    init: function() {
        this.resetState("initial");
    
        // Register the callback in Zotero as an item observer
        var notifierID = Zotero.Notifier.registerObserver(
            this.notifierCallback, ["item"]);
    
        // Unregister callback when the window closes (important to avoid a memory leak)
        window.addEventListener("unload", function(e) {
            Zotero.Notifier.unregisterObserver(notifierID);
        }, false);
    
    },

    notifierCallback: {
        notify: function(event, type, ids, extraData) {
            if (event == "add") {
              switch (getPref("autoretrieve")) {
                case "short":
                  this.updateItems(Zotero.Items.get(ids), "short");
                  break;
                case "long":
                  this.updateItems(Zotero.Items.get(ids), "long");
                  break;
                case "verify":
                  this.updateItems(Zotero.Items.get(ids), "check");
                  break;
                default:
                  break;
              }
            }
        }
    },

    // Controls for Tools menu
    setCheck: function() {
        var tools_short = document.getElementById("menu_Tools-shortdoi-menu-popup-short");
        var tools_long  = document.getElementById("menu_Tools-shortdoi-menu-popup-long");
        var tools_check = document.getElementById("menu_Tools-shortdoi-menu-popup-check");
        var tools_none  = document.getElementById("menu_Tools-shortdoi-menu-popup-none");
        var pref = getPref("autoretrieve");
        tools_short.setAttribute("checked", Boolean(pref === "short"));
        tools_long.setAttribute("checked", Boolean(pref === "long"));
        tools_check.setAttribute("checked", Boolean(pref === "check"));
        tools_none.setAttribute("checked", Boolean(pref === "none"));
    },

    changePref: function changePref(option) {
        setPref("autoretrieve", option);
    },

    openPreferenceWindow: function(paneID, action) {
        var io = {pane: paneID, action: action};
        window.openDialog("chrome://zoteroshortdoi/content/options.xul",
            "shortdoi-pref",
            "chrome,titlebar,toolbar,centerscreen" + Zotero.Prefs.get("browser.preferences.instantApply", true) ? "dialog=no" : "modal", io
        );
    },

    // Reset plugin state
    resetState: function(operation) {

        if (operation == "initial") {
            if (this.progressWindow) {
                this.progressWindow.close();
            }
            this.current = -1;
            this.toUpdate = 0;
            this.itemsToUpdate = null;
            this.numberOfUpdatedItems = 0;
            this.counter = 0;
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
                this.progressWindow.close();
                var icon = "chrome://zotero/skin/cross.png";
                if(error_invalid && ! error_invalid_shown) {
                  var progressWindowInvalid = new Zotero.ProgressWindow({closeOnClick:true});
                  progressWindowInvalid.changeHeadline("Invalid DOI");
                  if(getPref("tag_invalid") !== "") {
                    progressWindowInvalid.progress = new progressWindowInvalid.ItemProgress(icon, "Invalid DOIs were found. These have been tagged with '" + getPref("tag_invalid") + "'.");
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
                  if(getPref("tag_nodoi") !== "") {
                    progressWindowNoDOI.progress = new progressWindowNoDOI.ItemProgress(icon, "No DOI was found for some items. These have been tagged with '" + getPref("tag_nodoi") + "'.");
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
                  if(getPref("tag_multiple") !== "") {
                    progressWindowMulti.progress = new progressWindowMulti.ItemProgress(icon, "Some items had multiple possible DOIs. Links to lists of DOIs have been added and tagged with '" + getPref("tag_multiple") + "'.");
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
                this.progressWindow = new Zotero.ProgressWindow({closeOnClick:true});
                this.progressWindow.changeHeadline("Finished");
                this.progressWindow.progress = new this.progressWindow.ItemProgress(icon);
                this.progressWindow.progress.setProgress(100);
                if (operation == "short") {
                    this.progressWindow.progress.setText("shortDOIs updated for "+this.counter+" items.");
                } else if (operation == "long") {
                    this.progressWindow.progress.setText("Long DOIs updated for "+this.counter+" items.");
                } else {
                    this.progressWindow.progress.setText("DOIs verified for "+this.counter+" items.");
                }
                this.progressWindow.show();
                this.progressWindow.startCloseTimer(4000);
                final_count_shown = true;
              }
            }
            return;
        }
    },

    // Helper functions
    doiFromExtra: function(item, form) {
        if (from === "short") {
            var value = item.extra.match(/^short\s?doi:\s*(.+)/mi);
        } else {
            var value = item.extra.match(/^doi:\s*(.+)/mi);
        }
        return value[1];
    },

    setExtraDOI: function(item, value) {

        // TODO: Finish this.
        try {
            var old = item.getField('extra')
                if (old.length == 0 || old.search(/^\d{5}$/) != -1) {
                    item.setField('extra', citations);
                } else if (old.search(/^\d{5} *\n/) != -1) {
                    item.setField(
                            'extra',
                            old.replace(/^\d{5} */, citations + ' '));
                } else if (old.search(/^\d{5} *[^\n]+/) != -1) {
                    item.setField(
                            'extra',
                            old.replace(/^\d{5} */, citations + ' \n'));
                } else if (old.search(/^\d{5}/) != -1) {
                    item.setField(
                            'extra',
                            old.replace(/^\d{5}/, citations));
                } else {
                    item.setField('extra', citations + ' \n' + old);
                }
            item.save();
          } catch (e) {}

    },

    setExtraShortDOI: function(item, value) {

    },

    generateURL: function(doi, form) {
        if (form === "short" && ! doi.match(/10\/[^\s]*[^\s.,]/)) {
            var url = "http://shortdoi.org/" + encodeURIComponent(doi) + "?format=json";
            return url;
        } else {
            var url = "https://doi.org/api/handles/" + encodeURIComponent(doi);
            return url;
        }
    },

    // Process items workflow
    updateSelectedItems: function(operation) {
        this.updateItems(ZoteroPane.getSelectedItems(), operation);
    },

    updateItems: function(items, operation) {
        // For now, filter out non-journal article and conference paper items
        var items = items.filter(item => item.itemTypeID == Zotero.ItemTypes.getID("journalArticle") || item.itemTypeID == Zotero.ItemTypes.getID("conferencePaper"));
        var items = items.filter(item => ! item.isFeedItem);
    
        if (items.length === 0 ||
                this.numberOfUpdatedItems < this.toUpdate) {
            return;
        }
    
        this.resetState("initial");
        this.toUpdate = items.length;
        this.itemsToUpdate = items;
    
        // Progress Windows
        this.progressWindow = new Zotero.ProgressWindow({closeOnClick: false});
        var icon = "chrome://zotero/skin/toolbar-advanced-search" + (Zotero.hiDPI ? "@2x" : "") + ".png";
        if (operation == "short") {
            this.progressWindow.changeHeadline("Getting shortDOIs", icon);
        } else if (operation == "long") {
            this.progressWindow.changeHeadline("Getting long DOIs", icon);
        } else {
            this.progressWindow.changeHeadline("Validating DOIs and removing extra text", icon);
        }
        var doiIcon = "chrome://zoteroshortdoi/skin/doi" + (Zotero.hiDPI ? "@2x" : "") + ".png";
        this.progressWindow.progress = new this.progressWindow.ItemProgress(doiIcon, "Checking DOIs.");
    
        this.updateNextItem(operation);
    },

    updateNextItem: function(operation) {
        this.numberOfUpdatedItems++;
    
        if (this.current == this.toUpdate - 1) {
            this.progressWindow.close();
            this.resetState(operation);
            return;
        }
    
        this.current++;
    
        // Progress Windows
        var percent = Math.round((this.numberOfUpdatedItems/this.toUpdate)*100);
        this.progressWindow.progress.setProgress(percent);
        this.progressWindow.progress.setText("Item "+this.current+" of "+this.toUpdate);
        this.progressWindow.show();
    
        this.updateItem(
                this.itemsToUpdate[this.current], operation);
    },

    invalidate: function(item, operation) {
        if (item.isRegularItem() && !item.isCollection()) {
            error_invalid = true;
            if(getPref("tag_invalid") !== "") item.addTag(getPref("tag_invalid"));
            item.saveTx();
        }
        this.updateNextItem(operation);
    },

    // Update item main function
    updateItem: function(item, operation) {
        var oldDOI = item.getField("DOI");        
        if (!oldDOI) {
            var oldDOI = this.doiFromExtra(item, "long");
        }
        if (oldDOI && oldDOI.match(/10\/[^\s]*[^\s.,]/)) {
            // If a shortDOI is stored in DOI field, move it to shortDOI and retrieve long DOI
            var oldShortDOI = oldDOI;
            oldDOI = null;
        } else {
            var oldShortDOI = this.doiFromExtra(item, "short");
        }
        doi = Zotero.Utilities.cleanDOI(oldDOI);
        shortDOI = Zotero.Utilities.cleanDOI(oldShortDOI);

        // Ill-formed DOIs will be deleted at this point.

        /* TODO: Should I always do a double check that the DOI is correct from CrossRef
                 (versus a DOI for a different item)? This is a concern if the DOI is 
                 stored in Extra because it may have stuck around from an item change.

                 The reason not to do this is performance and to avoid unnecessary calls 
                 to CrossRef.
        */

        if (doi) {
            if (shortDOI) {
                // If both DOI and shortDOI, generate URLs to verify
                var longURL = this.generateURL(doi, "check");
                var shortURL = this.generateURL(shortDOI, "check");
            } else {
                // If DOI, but no shortDOI, generate URL to look up shortDOI
                var shortLookupURL = this.generateURL(doi, "short");
            }
        } else {
            if (shortDOI) {
                // If shortDOI, but no DOI, generate URL to verify and retrieve DOI
                var shortURL = this.generateURL(shortDOI, "check");
            } else {
                // If no DOI information, look up DOI from CrossRef
                var doi = this.crossrefLookup(item, operation);
                var shortLookupURL = this.generateURL(doi, "short");
            }
        }

        if (longURL) {
            // Check if invalid

            // Request data from DOI.org

        }

        if (shortURL) {
            // Check if invalid

            // Request data from DOI.org
            
        }

        if (shortLookupURL) {
            // Check if invalid

            // Request data from shortDOI.org
            
        }

        // At the end of the process, if new short/DOI values !== old short/DOI values,
        // invalidate()

        // At the end of the process, if shortDOI and DOI values are not for same source,
        // add conflict tag

        // At the end of the process, if there are multiple possible DOIs, then add
        // multiple tag

        // TODO: Remove No DOI Found tag to avoid massive false positives?
        //       I expect there will be massive false positives for 
        //       non-journalArticle/conferencePaper items.
        //       Just add a debug message.

    
        if ( ! url ) { // TODO: What was this first check for?
            if (item.hasTag(getPref("tag_invalid"))) {
                item.removeTag(getPref("tag_invalid"));
                item.saveTx();
            }
            this.updateNextItem(operation);
        } else if (url == "invalid") {
            this.invalidate(item, operation);
        } else {
            var oldDOI = item.getField("DOI");
            var oldExtra = item.getField("extra");
            var req = new XMLHttpRequest();
            req.open("GET", url, true);
            req.responseType = "json";
    
            if (operation == "short") {
    
                req.onreadystatechange = function() {
                    if (req.readyState == 4) {
                        if (req.status == 200) {
                            if (item.isRegularItem() && !item.isCollection()) {
                                if (oldDOI.match(/10\/[^\s]*[^\s.,]/)) {
                                    if (req.response.responseCode == 1) {
                                        if (req.response.handle != oldDOI) {
                                            var shortDOI = req.response.handle.toLowerCase();
                                            item.setField("DOI", shortDOI);
                                            item.removeTag(getPref("tag_invalid"));
                                            item.removeTag(getPref("tag_multiple"));
                                            item.removeTag(getPref("tag_nodoi"));
                                            item.saveTx();
                                            this.counter++;
                                        } else if (item.hasTag(getPref("tag_invalid")) || item.hasTag(getPref("tag_multiple")) || item.hasTag(getPref("tag_nodoi"))) {
                                            item.removeTag(getPref("tag_invalid"));
                                            item.removeTag(getPref("tag_multiple"));
                                            item.removeTag(getPref("tag_nodoi"));
                                            item.saveTx();
                                        }
                                    } else {
                                        this.invalidate(item, operation);
                                    }
                                } else {
                                    var shortDOI = req.response.ShortDOI.toLowerCase();
                                    item.setField("DOI", shortDOI);
                                    item.removeTag(getPref("tag_invalid"));
                                    item.removeTag(getPref("tag_multiple"));
                                    item.removeTag(getPref("tag_nodoi"));
                                    item.saveTx();
                                    this.counter++;
                                }
    
                            }
                            this.updateNextItem(operation);
                        } else if (req.status == 400 || req.status == 404) {
                            this.invalidate(item, operation);
                        } else {
                            this.updateNextItem(operation);
                        }
                    }
                };
    
                req.send(null);
    
            } else if (operation == "long") {
    
                req.onreadystatechange = function() {
                    if (req.readyState == 4) {
                        if (req.status == 200) {
                            if (req.response.responseCode == 1) {
                                if (oldDOI.match(/10\/[^\s]*[^\s.,]/)) {
    
                                    if (item.isRegularItem() && !item.isCollection()) {
                                        var longDOI = req.response.values["1"].data.value.toLowerCase();
                                        item.setField("DOI", longDOI);
                                        item.removeTag(getPref("tag_invalid"));
                                        item.removeTag(getPref("tag_multiple"));
                                        item.removeTag(getPref("tag_nodoi"));
                                        item.saveTx();
                                        this.counter++;
                                    }
                                } else {
                                    if (req.response.handle != oldDOI) {
                                        var longDOI = req.response.handle.toLowerCase();
                                        item.setField("DOI", longDOI);
                                        item.removeTag(getPref("tag_invalid"));
                                        item.removeTag(getPref("tag_multiple"));
                                        item.removeTag(getPref("tag_nodoi"));
                                        item.saveTx();
                                        this.counter++;
                                    } else if (item.hasTag(getPref("tag_invalid")) || item.hasTag(getPref("tag_multiple")) || item.hasTag(getPref("tag_nodoi"))) {
                                        item.removeTag(getPref("tag_invalid"));
                                        item.removeTag(getPref("tag_multiple"));
                                        item.removeTag(getPref("tag_nodoi"));
                                        item.saveTx();
                                    }
                                }
                                this.updateNextItem(operation);
    
                            } else {
                                this.invalidate(item, operation);
                            }
    
                        } else if (req.status == 404) {
                            this.invalidate(item, operation);
    
                        } else {
                            this.updateNextItem(operation);
                        }
                    }
                };
    
                req.send(null);
    
            } else { //operation == "check"
    
                req.onreadystatechange = function() {
                    if (req.readyState == 4) {
                        if (req.status == 404) {
                            this.invalidate(item, operation);
                        } else if (req.status == 200) {
                            if (req.response.responseCode == 200) {
                                this.invalidate(item, operation);
                            } else {
                                if (req.response.handle != oldDOI) {
                                    var newDOI = req.response.handle.toLowerCase();
                                    item.setField("DOI", newDOI);
                                    item.removeTag(getPref("tag_invalid"));
                                    item.removeTag(getPref("tag_multiple"));
                                    item.removeTag(getPref("tag_nodoi"));
                                    item.saveTx();
                                } else if (item.hasTag(getPref("tag_invalid")) || item.hasTag(getPref("tag_multiple")) || item.hasTag(getPref("tag_nodoi"))) {
                                    item.removeTag(getPref("tag_invalid"));
                                    item.removeTag(getPref("tag_multiple"));
                                    item.removeTag(getPref("tag_nodoi"));
                                    item.saveTx();
                                }
                                this.counter++;
                                this.updateNextItem(operation);
                            }
    
                        } else {
                            this.updateNextItem(operation);
                        }
                    }
                };
    
                req.send(null);
            }
        }
    }, 

    sendRequest: function() {

    },

    shortDOIorgLookup: function(url) {

    },

    DOIorgLookup: function(url) {

    },

    crossrefLookup: function(item, operation) {
        var crossrefOpenURL = "https://www.crossref.org/openurl?pid=zoteroDOI@wiernik.org&";
        var ctx = Zotero.OpenURL.createContextObject(item, "1.0");
        if (ctx) {
            var url = crossrefOpenURL + ctx + "&multihit=true";
            var req = new XMLHttpRequest();
            req.open("GET", url, true);
      
            req.onreadystatechange = function() {
                if (req.readyState == 4) {
                    if (req.status == 200) {
                        var response = req.responseXML.getElementsByTagName("query")[0];
                        var status = response.getAttribute("status")
                        if (status === "resolved") {
                            var doi = response.getElementsByTagName("doi")[0].childNodes[0].nodeValue;
                            if (operation === "short") {
                                item.setField("DOI", doi);
                                this.updateItem(item, operation);
      
                            } else {
                                item.setField("DOI", doi);
                                item.removeTag(getPref("tag_invalid"));
                                item.removeTag(getPref("tag_multiple"));
                                item.removeTag(getPref("tag_nodoi"));
                                item.saveTx();
                                this.counter++;
                                this.updateNextItem(operation);
                            }
      
                        } else if (status === "unresolved") {
                            error_nodoi = true;
                            item.removeTag(getPref("tag_invalid"));
                            item.removeTag(getPref("tag_multiple"));
                            item.removeTag(getPref("tag_nodoi"));
                            if(getPref("tag_nodoi") !== "") item.addTag(getPref("tag_nodoi"));
                            item.saveTx();
                            this.updateNextItem(operation);
      
                        } else if (status === "multiresolved") {
                            error_multiple = true;
                            Zotero.Attachments.linkFromURL({"url":crossrefOpenURL + ctx, "parentItemID":item.id, "contentType":"text/html", "title":"Multiple DOIs found"});
                            if (item.hasTag(getPref("tag_invalid")) || item.hasTag(getPref("tag_nodoi"))) {
                                item.removeTag(getPref("tag_invalid"));
                                item.removeTag(getPref("tag_nodoi"));
                            }
                            // TODO: Move this tag to the attachment link
                            if(getPref("tag_multiple") !== "") item.addTag(getPref("tag_multiple"));
                            item.saveTx();
                            this.updateNextItem(operation);
      
                        } else {
                            Zotero.debug("DOI Manager: CrossRef lookup: Unknown status code: " + status);
                            this.updateNextItem(operation);
                        }
      
                    } else {
                        this.updateNextItem(operation);
                    }
      
                }
            };
      
            req.send(null);
      
          }
      
          return false;
      
    }
};

// Preference managers

function getPref(pref) {
    return Zotero.Prefs.get("extensions.shortdoi." + pref, true);
};

function setPref(pref, value) {
    return Zotero.Prefs.set("extensions.shortdoi." + pref, value, true);
};




if (typeof window !== "undefined") {
    window.addEventListener("load", function(e) {
        Zotero.ShortDOI.init();
    }, false);
}
