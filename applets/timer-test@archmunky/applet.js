const UUID = 'timer-test@archmunky';
const Applet = imports.ui.applet;
const Lang = imports.lang;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;

function MyApplet(orientation, panel_height, instance_id) {
    this._init(orientation, panel_height, instance_id);
}

var numChecks = 1,
    minutesBetweenChecks = 1;

MyApplet.prototype = {
    __proto__: Applet.TextIconApplet.prototype,

    _init: function(orientation, panel_height, instance_id) {
        Applet.TextIconApplet.prototype._init.call(this, orientation, panel_height, instance_id);
        
        try {

            //this.logInfo("Starting init");

            this.set_applet_icon_name("stock_alarm");
            this.set_applet_label("0");


            this.keepUpdating = true;
            this.update();
        }
        catch (e) {
          //this.logError("Init error: " + e.toString());
          global.logError(e);
        }
    },

    on_applet_clicked: function(event) {

    },

    on_applet_removed_from_panel: function() {
        //this.logInfo("removing from panel");
        this.keepUpdating = false;
        if (this.timeout) Mainloop.source_remove(this.timeout);
        this.timeout = 0;
    },
  
    update:function(){
        //this.logInfo("entered function update");
        if (this.keepUpdating) {
            this.doWork();
            this.timeout = Mainloop.timeout_add_seconds(10, Lang.bind(this, this.update));
        }
    }, 

    doWork: function (){
        //this.logInfo("entered doWork");

        this.set_applet_icon_name("view-refresh");

        numChecks += 1

        let current = new Date();
        let cDate = current.getFullYear() + '-' + (current.getMonth() + 1) + '-' + current.getDate();
        let cTime = current.getHours() + ":" + current.getMinutes() + ":" + current.getSeconds();

        this.set_applet_icon_name("stock_alarm");
        this.set_applet_label("#" + numChecks);
        this.set_applet_tooltip(_("Last checked: " + cDate + ' @ ' + cTime));

        return this.keepUpdating;
    },

    logInfo: function(message) {
        global.log('[' + this.metadata.uuid + '] ' + message);
    },
    
    logError: function(message) {
        global.logError('[' + this.metadata.uuid + '] ' + message);
    }
   
};

function main(metadata, orientation, panel_height, instance_id) {
    return new MyApplet(orientation, panel_height, instance_id);
}
