const Applet = imports.ui.applet;
const GLib = imports.gi.GLib;

function getKernelRelease() {
    try {
        let [ok, contents] = GLib.file_get_contents('/proc/sys/kernel/osrelease');
        if (ok) {
            return new TextDecoder().decode(contents).trim();
        }
    } catch (e) {
        global.logError(e);
    }
    return 'unknown';
}

class DisplayKernelApplet extends Applet.TextApplet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);

        let release = getKernelRelease();
        this.set_applet_label(release);
        this.set_applet_tooltip(`Kernel ${release}`);
    }
}

function main(metadata, orientation, panelHeight, instanceId) {
    return new DisplayKernelApplet(metadata, orientation, panelHeight, instanceId);
}
