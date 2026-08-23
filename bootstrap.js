// Zotero 10 bootstrap: Zotero, Services, Cc, Ci are available in this scope,
// as are the globals defined by the subscripts loaded in startup().

const PLUGIN_ID = "zoteroshortdoi@wiernik.org";
const FTL_FILE = "zoteroshortdoi.ftl";
const AUTORETRIEVE_PREF = "extensions.shortdoi.autoretrieve";
const AUTORETRIEVE_OPTIONS = ["short", "long", "check", "none"];
const OPERATIONS = ["short", "long", "check"];

var DoiService;
var DoiUpdater;
var chromeHandle;
var notifierID;
var menuIDs = [];

const autoretrieve = () => Zotero.Prefs.get(AUTORETRIEVE_PREF, true);

async function startup({ rootURI }) {
  await Zotero.initializationPromise;

  chromeHandle = Cc["@mozilla.org/addons/addon-manager-startup;1"]
    .getService(Ci.amIAddonManagerStartup)
    .registerChrome(Services.io.newURI(`${rootURI}manifest.json`), [
      ["content", "zoteroshortdoi", "content/"],
      ["locale", "zoteroshortdoi", "en-US", "locale/en-US/"],
      ["locale", "zoteroshortdoi", "de", "locale/de/"],
    ]);

  Services.scriptloader.loadSubScript(`${rootURI}lib/doi-service.js`);
  Services.scriptloader.loadSubScript(`${rootURI}lib/doi-updater.js`);

  setDefaultPrefs(rootURI);
  Zotero.PreferencePanes.register({
    pluginID: PLUGIN_ID,
    src: `${rootURI}content/options.xhtml`,
  });

  // onMainWindowLoad only fires for windows opened after the plugin starts,
  // so seed the ones already open. MenuManager renders through Fluent's
  // data-l10n-id in the host document and does not load plugin FTL itself.
  for (const win of Zotero.getMainWindows()) {
    if (win.MozXULElement) win.MozXULElement.insertFTLIfNeeded(FTL_FILE);
  }

  notifierID = Zotero.Notifier.registerObserver(
    { notify: onNotify },
    ["item"],
    "shortdoi"
  );
  registerMenus();
}

function shutdown() {
  if (notifierID) Zotero.Notifier.unregisterObserver(notifierID);
  for (const id of menuIDs) if (id) Zotero.MenuManager.unregisterMenu(id);
  if (chromeHandle) chromeHandle.destruct();
  notifierID = chromeHandle = undefined;
  menuIDs = [];
  DoiUpdater = DoiService = undefined;
}

function onMainWindowLoad({ window }) {
  window.MozXULElement.insertFTLIfNeeded(FTL_FILE);
}

// Zotero warns when a bootstrap method is missing; these have nothing to do.
function install() {}
function uninstall() {}

function onNotify(event, type, ids) {
  if (event !== "add") return;
  const operation = autoretrieve();
  if (!operation || operation === "none") return;
  DoiUpdater.updateItems(Zotero.Items.get(ids), operation);
}

function runOnSelection(operation) {
  const pane = Zotero.getActiveZoteroPane();
  if (pane) DoiUpdater.updateItems(pane.getSelectedItems(), operation);
}

function registerMenus() {
  menuIDs = [
    Zotero.MenuManager.registerMenu({
      menuID: "shortdoi-items-menu",
      pluginID: PLUGIN_ID,
      target: "main/library/item",
      menus: [{
        menuType: "submenu",
        l10nID: "zoteroshortdoi-menu-manage",
        onShowing: (_event, context) => {
          const items = Zotero.getActiveZoteroPane()?.getSelectedItems() ?? [];
          context.setVisible(items.some((item) => item.isRegularItem?.()));
        },
        menus: OPERATIONS.map((operation) => ({
          menuType: "menuitem",
          l10nID: `zoteroshortdoi-menu-${operation}`,
          onCommand: () => runOnSelection(operation),
        })),
      }],
    }),

    Zotero.MenuManager.registerMenu({
      menuID: "shortdoi-tools-menu",
      pluginID: PLUGIN_ID,
      target: "main/menubar/tools",
      menus: [{
        menuType: "submenu",
        l10nID: "zoteroshortdoi-tools-autoretrieve",
        // MenuManager has no checkbox menu type, so the selected option is
        // marked through a Fluent { $marker } argument set on each showing.
        menus: AUTORETRIEVE_OPTIONS.map((option) => ({
          menuType: "menuitem",
          l10nID: `zoteroshortdoi-tools-autoretrieve-${option}`,
          onShowing: (_event, context) =>
            context.setL10nArgs(
              JSON.stringify({ marker: autoretrieve() === option ? "✓ " : "    " })
            ),
          onCommand: () => Zotero.Prefs.set(AUTORETRIEVE_PREF, option, true),
        })),
      }],
    }),
  ];
}

function setDefaultPrefs(rootURI) {
  const branch = Services.prefs.getDefaultBranch("");
  Services.scriptloader.loadSubScript(`${rootURI}prefs.js`, {
    // ponytail: every pref in prefs.js is a string; add type dispatch here if
    // a boolean or integer pref is ever introduced.
    pref: (key, value) => branch.setStringPref(key, value),
  });
}
