const UUID = 'usgs-level@archmunky';
const Applet = imports.ui.applet;
const Lang = imports.lang;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const PopupMenu = imports.ui.popupMenu;
const Soup = imports.gi.Soup;   // Cinnamon pins Soup 3.0 (js/ui/environment.js)
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

function MyApplet(orientation, panel_height, instance_id) {
    this._init(orientation, panel_height, instance_id);
}

// variables to store persistent data
var siteName = "Unknown",
    siteLocation = "Unknown",
    mHeight = 0,
    mHeightUnit = "Unknown",
    mHeightDate = "Unknown",
    mFlow = 0,
    mFlowUnit = "Unknown",
    mFlowDate = "Unknown",
    measurement = "Unknown",
    updateDate = "Not checked",
    numChecks = 0,
    checkDate = "Not checked",
    minutesBetweenChecks = 60;

MyApplet.prototype = {
    __proto__: Applet.TextIconApplet.prototype,

    _init: function(orientation, panel_height, instance_id) {
        Applet.TextIconApplet.prototype._init.call(this, orientation, panel_height, instance_id);
        
        try {

            this.set_applet_icon_name("kayak");
            this.set_applet_label("USGS Water Level");
            this.set_applet_tooltip(_("Click here for detailed water level data"));

            this.menu = new Applet.AppletPopupMenu(this, orientation);
            this.menuManager = new PopupMenu.PopupMenuManager(this);
            this.menuManager.addMenu(this.menu);
      
            this.keepUpdating = true;
            this.update();
        }
        catch (e) {
          //this.logError("Init error: " + e.message + " | stack: " + e.stack);
          this.logError("Init error: " + e);
        }
    },

    on_applet_clicked: function(event) {
        try {
            this.updateMenu();
            this.menu.toggle();
        }
        catch (e) {
            this.logError("Click error: " + e);
        }
    },

    on_applet_removed_from_panel: function() {
        this.keepUpdating = false;
        if (this.timeout) Mainloop.source_remove(this.timeout);
        this.timeout = 0;
        if (this._cancellable) this._cancellable.cancel();
        this._cancellable = null;
        if (this._session) this._session.abort();
    },

    update: function() {
        if (this.keepUpdating) {
            this.GetInfo();
            this.timeout = Mainloop.timeout_add_seconds(minutesBetweenChecks * 60, Lang.bind(this, this.update));
        }
    },

    GetInfo:function(){

        this.set_applet_icon_name("view-refresh");
        this.logInfo("USGS Level information updating");

        if (!this._session) {
            this._session = new Soup.Session({ timeout: 30, user_agent: 'usgs-level-cinnamon-applet/1.0' });
        }
        if (this._cancellable) this._cancellable.cancel();
        let cancellable = new Gio.Cancellable();
        this._cancellable = cancellable;

        let url = "https://waterservices.usgs.gov/nwis/iv/?format=json&sites=03335000";
        let message = Soup.Message.new('GET', url);
        this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable,
            (session, result) => {
                if (this._cancellable === cancellable) this._cancellable = null;

                let bytes;
                try {
                    bytes = session.send_and_read_finish(result);
                }
                catch (e) {
                    if (e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        return;
                    this.logError("Request error: " + e);
                    this.setTooltip();
                    return;
                }

                // calculate last check date and number of checks
                try {
                    numChecks += 1;
                    let current = new Date();
                    let cDate = current.getFullYear() + '-' + (current.getMonth() + 1 < 10 ? '0' : '') + (current.getMonth() + 1) + '-' + current.getDate();
                    let cTime = (current.getHours() < 10 ? '0' : '') + current.getHours() + ":" + (current.getMinutes() < 10 ? '0' : '') + current.getMinutes() + ":" + (current.getSeconds() < 10 ? '0' : '') + current.getSeconds();
                    checkDate = "Last checked: " + cDate + ' @ ' + cTime + " [" + numChecks + "]";
                }
                catch (e) {
                    this.logError("CheckDate calc error: " + e);
                    this.setTooltip();
                    return;
                }

                if (message.get_status() !== Soup.Status.OK) {
                    this.logInfo("USGS Level returned HTTP " + message.get_status());
                    this.setTooltip();
                    return;
                }

                try {
                    let json = JSON.parse(new TextDecoder('utf-8').decode(bytes.get_data()));

                    siteName = json.value.timeSeries[0].sourceInfo.siteName;
                    
                    var geoLatitude = json.value.timeSeries[0].sourceInfo.geoLocation.geogLocation.latitude;
                    var geoLongitude = json.value.timeSeries[0].sourceInfo.geoLocation.geogLocation.longitude;
                    siteLocation = geoLatitude + ", " + geoLongitude;                    
                    
                    mFlowUnit = json.value.timeSeries[0].variable.unit.unitCode;
                    mFlow = json.value.timeSeries[0].values[0].value[0].value;
                    mFlowDate = json.value.timeSeries[0].values[0].value[0].dateTime;
                    mHeightUnit = json.value.timeSeries[1].variable.unit.unitCode;
                    mHeight = json.value.timeSeries[1].values[0].value[0].value;
                    mHeightDate = json.value.timeSeries[1].values[0].value[0].dateTime;
                    updateDate = "Last updated: " + mHeightDate.replace("T"," @ ");

                    this.setLabel(mHeight + ' ' + mHeightUnit + ' @ ' + mFlow + ' ' + mFlowUnit);
                    this.setIcon(mHeight);
                    this.setTooltip();
                }
                catch (e) {
                    this.logError("JSON Parse error: " + e);
                    this.setTooltip();
                }
            });
    },

    setIcon:function(amt){
        if (amt < 3 || amt >= 6) {
            this.set_applet_icon_name("kayak-red");
        } else if (amt >= 3 && amt <= 3.45) {
            this.set_applet_icon_name("kayak-orange");
        } else if (amt > 3.45 && amt <= 3.75) {
            this.set_applet_icon_name("kayak-yellow");
        } else if (amt > 3.75 && amt < 6) {
            this.set_applet_icon_name("kayak-green");
        } else {
            this.set_applet_icon_name("kayak");
        }
    },

    setLabel(info) {
        this.set_applet_label(info);
    },

    setTooltip() {
        this.set_applet_tooltip(checkDate + "\n" + updateDate);
    },
    
    updateMenu: function() {
        try {
            this.menu.removeAll();
            let miName = new PopupMenu.PopupMenuItem(siteName);
            this.menu.addMenuItem(miName);
            let miLoc = new PopupMenu.PopupMenuItem(siteLocation);
            this.menu.addMenuItem(miLoc);
            let miRead = new PopupMenu.PopupMenuItem(mHeight + ' ' + mHeightUnit + ' @ ' + mFlow + ' ' + mFlowUnit);
            this.menu.addMenuItem(miRead);
            let miUpd = new PopupMenu.PopupMenuItem(updateDate);
            this.menu.addMenuItem(miUpd);
            let miChk = new PopupMenu.PopupMenuItem(checkDate);
            this.menu.addMenuItem(miChk);
        }
        catch (e) {
            this.logError("updateMenu error: " + e);
        }
    },

    logInfo: function(message) {
        global.log("[" + UUID + "] " + message);
    },
    
    logError: function(message) {
        global.logError("[" + UUID + "] " + message);
    }
   
};

function main(metadata, orientation, panel_height, instance_id) {
    return new MyApplet(orientation, panel_height, instance_id);
}
