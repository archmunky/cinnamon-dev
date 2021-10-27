const Applet = imports.ui.applet;
const Lang = imports.lang;
const St = imports.gi.St;
const PopupMenu = imports.ui.popupMenu;
const Util = imports.misc.util;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const AccountsService = imports.gi.AccountsService;
const GnomeSession = imports.misc.gnomeSession;
const ScreenSaver = imports.misc.screenSaver;
const Settings = imports.ui.settings;

class CinnamonUserEnhancedApplet extends Applet.TextIconApplet {
    constructor(orientation, panel_height, instance_id) {
        super(orientation, panel_height, instance_id);

        this.setAllowedLayout(Applet.AllowedLayout.BOTH);

        this._session = new GnomeSession.SessionManager();
        this._screenSaverProxy = new ScreenSaver.ScreenSaverProxy();
        this.settings = new Settings.AppletSettings(this, "user-enhanced@archmunky", instance_id);

        this._updateFace();
        this._updateLabel();

        this.menuManager = new PopupMenu.PopupMenuManager(this);
        this.menu = new Applet.AppletPopupMenu(this, orientation);
        this.menuManager.addMenu(this.menu);
        this._contentSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._contentSection);

        this.settings.bind("display-icon", "disp_icon", this._updateFace);
        this.settings.bind("display-name", "disp_name", this._updateLabel);

        /*** User Details ***/
        let item = new PopupMenu.PopupIconMenuItem(_("User Details"), "user-info", St.IconType.SYMBOLIC);
        item.connect('activate', Lang.bind(this, function() {
            Util.spawnCommandLine("cinnamon-settings user");
        }));
        this.menu.addMenuItem(item);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        /*** System Monitor ***/
        item = new PopupMenu.PopupIconMenuItem(_("System Monitor"), "utilities-system-monitor", St.IconType.SYMBOLIC);
        item.connect('activate', Lang.bind(this, function() {
            Util.spawnCommandLine("gnome-system-monitor");
        }));
        this.menu.addMenuItem(item);

        /*** System Preferences ***/
        item = new PopupMenu.PopupIconMenuItem(_("System Settings"), "preferences-system", St.IconType.SYMBOLIC);
        item.connect('activate', Lang.bind(this, function() {
            Util.spawnCommandLine("cinnamon-settings");
        }));
        this.menu.addMenuItem(item);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        /*** Lock Screen ***/
        item = new PopupMenu.PopupIconMenuItem(_("Lock Screen"), "system-lock-screen", St.IconType.SYMBOLIC);
        item.connect('activate', Lang.bind(this, function() {
            let screensaver_settings = new Gio.Settings({ schema_id: "org.cinnamon.desktop.screensaver" });
            let screensaver_dialog = Gio.file_new_for_path("/usr/bin/cinnamon-screensaver-command");
            if (screensaver_dialog.query_exists(null)) {
                if (screensaver_settings.get_boolean("ask-for-away-message")) {
                    Util.spawnCommandLine("cinnamon-screensaver-lock-dialog");
                }
                else {
                    Util.spawnCommandLine("cinnamon-screensaver-command --lock");
                }
            }
            else {
                this._screenSaverProxy.LockRemote();
            }
        }));
        this.menu.addMenuItem(item);

        /*** Switch User ***/
        let lockdown_settings = new Gio.Settings({ schema_id: 'org.cinnamon.desktop.lockdown' });
        if (!lockdown_settings.get_boolean('disable-user-switching')) {
            if (GLib.getenv("XDG_SEAT_PATH")) {
                // LightDM
                item = new PopupMenu.PopupIconMenuItem(_("Switch User"), "system-switch-user", St.IconType.SYMBOLIC);
                item.connect('activate', Lang.bind(this, function() {
                    Util.spawnCommandLine("cinnamon-screensaver-command --lock");
                    Util.spawnCommandLine("dm-tool switch-to-greeter");
                }));
                this.menu.addMenuItem(item);
            }
            else if (GLib.file_test("/usr/bin/mdmflexiserver", GLib.FileTest.EXISTS)) {
                // MDM
                item = new PopupMenu.PopupIconMenuItem(_("Switch User"), "system-switch-user", St.IconType.SYMBOLIC);
                item.connect('activate', Lang.bind(this, function() {
                    Util.spawnCommandLine("mdmflexiserver");
                }));
                this.menu.addMenuItem(item);
            }
            else if (GLib.file_test("/usr/bin/gdmflexiserver", GLib.FileTest.EXISTS)) {
                // GDM
                item = new PopupMenu.PopupIconMenuItem(_("Switch User"), "system-switch-user", St.IconType.SYMBOLIC);
                item.connect('activate', Lang.bind(this, function() {
                    Util.spawnCommandLine("cinnamon-screensaver-command --lock");
                    Util.spawnCommandLine("gdmflexiserver");
                }));
                this.menu.addMenuItem(item);
            }
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        /*** Logout ***/
        item = new PopupMenu.PopupIconMenuItem(_("Log Out..."), "system-log-out", St.IconType.SYMBOLIC);
        item.connect('activate', Lang.bind(this, function() {
            this._session.LogoutRemote(0);
        }));
        this.menu.addMenuItem(item);

        /*** Suspend ***/
        item = new PopupMenu.PopupIconMenuItem(_("Suspend..."), "pause", St.IconType.SYMBOLIC);
        item.connect('activate', Lang.bind(this, function() {
        //    this._session.LogoutRemote(0);
            Util.spawnCommandLine("systemctl suspend -i");
        }));
        this.menu.addMenuItem(item);

        /*** Shutdown/Restart ***/
        item = new PopupMenu.PopupIconMenuItem(_("Power Off..."), "system-shutdown", St.IconType.SYMBOLIC);
        item.connect('activate', Lang.bind(this, function() {
            this._session.ShutdownRemote();
        }));
        this.menu.addMenuItem(item);

        this._user = AccountsService.UserManager.get_default().get_user(GLib.get_user_name());
        this._userLoadedId = this._user.connect('notify::is-loaded', Lang.bind(this, this._onUserChanged));
        this._userChangedId = this._user.connect('changed', Lang.bind(this, this._onUserChanged));
        this._onUserChanged();
        this.set_show_label_in_vertical_panels(false);
    }

    on_applet_clicked(event) {
        this.menu.toggle();
    }

    _updateFace() {
        try {
            if (this.disp_icon) {
                let iconFileName = this._user.get_icon_file();
                let iconFile = Gio.file_new_for_path(iconFileName);
                let icon;
                if (iconFile.query_exists(null)) {
                    icon = new Gio.FileIcon({file: iconFile});
                    this.set_applet_icon_path(iconFileName);
                }            
            }
        } catch(e) {
            this.set_applet_icon_symbolic_name("avatar-default");
        }
    }
    
    _updateLabel() {
        try {
            if (this.disp_name) {
                this.set_applet_label(this._user.get_real_name());
            }
        } catch(e) {
            this.set_applet_label("");
        }
    }

    _onUserChanged() {
        this._updateLabel();
        this._updateFace();
    }

    on_applet_removed_from_panel() {
        this.settings.finalize();
    }
}

function main(metadata, orientation, panel_height, instance_id) {
    return new CinnamonUserEnhancedApplet(orientation, panel_height, instance_id);
}
