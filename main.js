const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Signals = imports.signals;

const GLib = imports.gi.GLib;
const Cairo = imports.gi.cairo;
const Gdk = imports.gi.Gdk;
const Gtk = imports.gi.Gtk;
const Clutter = imports.gi.Clutter;
const GtkClutter = imports.gi.GtkClutter;
const Soup = imports.gi.Soup;

function HTTPClient() {
    this._init();
};

HTTPClient.prototype = {
    _init : function() {
        this._session = new Soup.SessionAsync({});
        this._messages = {};
    },

    get : function(uri, callback) {
       let msg = Soup.Message.new('GET', uri);
       msg.connect("finished", Lang.bind(this, this._onMessageFinished));
       this._session.queue_message(msg, null, null);
       this._messages[msg] = callback;
    },

    _onMessageFinished : function(msg) {
        let callback = this._messages[msg]

        Mainloop.idle_add(function() { 
            callback(msg.response_body.data); 
            return false; 
        });
    }

};

function OSMAPI() {
    this._init();
}

OSMAPI.prototype = {
    _init : function() {
        this._http = new HTTPClient();
    },

    login : function() {
        this._apiCall("capabilities", this._onCapabilitiesResponse);
    },

    getMap : function(callback, minLon, maxLon, minLat, maxLat) {
        let api = 'map?bbox=';
        api += minLon + ',' + maxLon + ',' +
               minLat + ',' + maxLat;   
        log("Calling API: " + api);             
        this._apiCall(api, callback);
    },

    _apiCall : function(apiName, callback) {
        let url = "http://api.openstreetmap.org/api/0.6/" + apiName;
        this._http.get(url,
                       Lang.bind(this, this._onApiCallResponse, 
                                 Lang.bind(this, callback)));
    },

    // callbacks

    _onApiCallResponse : function(data, callback) {
        let response;
        // E4X bafs at the <?xml version=...> header, remove it
        if (data.slice(0, 5) == '<?xml') {
            response = new XML(data.slice(39));
        } else {
            response = data;
       }
        callback(response);
    },

    _onCapabilitiesResponse : function(response) {
        if (response.api.version.@minimum != 0.6) {
            logError(new Error(), "Unsupported API version: " + osm.api.version.@minimum);
            Gtk.main_quit();
        }
        log("Capabilities checked, now logged in");
        this.emit('logged-in');
    }

}

Signals.addSignalMethods(OSMAPI.prototype);

function MainWindow(args) {
    this._init(args);
};

MainWindow.prototype = {
    _init : function(args) {
        this._response = null;
        this._latScale = 0;
        this._lonScale = 0;
        this._nodes = {};
        this._ways = {};
        this._width = args.width;
        this._height = args.height;

        this._buildUI();
        this._api = new OSMAPI();
        this._api.connect('logged-in', Lang.bind(this, this._onApiLoggedIn));
        this._login();
    },

    _buildUI : function() {
        this._win = new Gtk.Window({ type: Gtk.WindowType.TOPLEVEL });
        let me = this;
        this._win.connect("destroy", Lang.bind(this, this._onWinDestroy));
        this._win.connect("key-press-event", Lang.bind(this, this._onWinKeyPressEvent));
        this._win.set_size_request(this._width, this._height);

        let box = new Gtk.VBox();
        this._win.add(box);
        box.show()

        this._uiMgr = new Gtk.UIManager();
        let ui = <ui>
  <menubar>
    <menu name="FileMenu" action="FileMenuAction">
      <menuitem name="Export to PNG" action="ExportToPngAction"/>
      <menuitem name="Quit" action="QuitAction"/>
    </menu>
  </menubar>
</ui>;

        let buffer = ui.toXMLString();
        this._uiMgr.add_ui_from_string(buffer, buffer.length);

        let action;
        let actionGroup = new Gtk.ActionGroup();

        actionGroup.add_action(new Gtk.Action({ name: "FileMenuAction", label: "_File" }));

        action = new Gtk.Action({ name: "QuitAction", label: "_Quit",
                                  tooltip: "Quit JSOSM", stock_id: "gtk-quit" });
        action.connect("activate", Lang.bind(this, this._onQuitActivate));
        actionGroup.add_action(action);

        action = new Gtk.Action({ name: "ExportToPngAction", label: "Export to PNG" });
        action.connect("activate", Lang.bind(this, this._onExportToPngActivate));
        actionGroup.add_action(action);

        this._uiMgr.insert_action_group(actionGroup, 0);

        box.pack_start(this._uiMgr.get_widget("/menubar"), false, false, 0);
        this._embed = new GtkClutter.Embed();
        box.pack_start(this._embed, true, true, 0);
        this._embed.show();

        this._texture = new Clutter.CairoTexture({ surface_width: this._width, 
                                                   surface_height: this._height });
        this._stage = this._embed.get_stage(); 
        this._stage.add_actor(this._texture);

        this._statusBar = new Gtk.Statusbar();
        box.pack_start(this._statusBar, false, false, 0);
        this._statusBar.show();

        this._win.show();
    },

    _translateNodeCoordinates : function(node) {
        let x = (node.@lon - this._response.bounds.@minlon) * this._lonScale;
        let y = (node.@lat - this._response.bounds.@minlat) * this._latScale;
        let tx = Math.round(x);
        let ty = Math.round(this._width-y);
        log("x,y: " + tx + "," + ty);
        return [tx, ty];
     },

    _drawMapOnContext : function(cr) {

        cr.set_line_width(0.5);
        cr.set_source_rgb(0, 0, 0);

        if (cr.status() != 0) {
            throw Error(cr.status());
        }

        this._drawWaysOnContext(cr);
        cr.destroy();
        delete cr;
    },

    _drawWaysOnContext : function(cr) {
        let ways = this._response.way;
        for (let i = 0; i < ways.length(); ++i) {
            this._drawWayOnContext(cr, ways[i]);
            cr.stroke();
        }
    },

    _drawWayOnContext : function(cr, way) {
        log(way.toXMLString());
        let name = way.tag.(@k == "name").@v;
        if (name != undefined) log(name);

        let x, y;

        // First node of the way is where we start to draw our lines
        [x, y] = this._translateNodeCoordinates(this._nodes[way.nd[0].@ref]);
        cr.move_to(x, y);

        // The rest we just call cr.line_to() for
        for (let j = 1; j < way.nd.length(); j++) {
            let node = this._nodes[way.nd[j].@ref];
            [x, y] = this._translateNodeCoordinates(node);
            cr.line_to(x, y);
        }
        this._ways[way.@id] = way;
    },

    _login : function() {
        this._statusBar.push(0, "Logging in...");
        this._api.login();
    },

    _quit : function() {
        Gtk.main_quit();
        this._win.destroy();
    },

    _setResponse : function(response) {
        this._response = response;
        let bounds = response.bounds;
        log("Setting bounds from response: (" + bounds.@minlon + "," + bounds.@minlat + ") -> " +
            "(" + bounds.@maxlon + "," + bounds.@maxlat + ")");

        this._latScale = this._width / Math.abs(bounds.@minlat - bounds.@maxlat);
        this._lonScale = this._height / Math.abs(bounds.@minlon - bounds.@maxlon);

        for (let i = 0; i < response.node.length(); ++i) {
            let node = response.node[i];
            this._nodes[node.@id] = node;
        }
    },

    _updateMapView : function() {
        let cr = this._texture.create();
        if (cr.status() != 0) {
            throw Error(cr.status());
        }
        this._drawMapOnContext(cr);
    },

    _exportToPng : function(filename) {
        if (!this._response) {
            return;
        }
        let imageSurface = Cairo.image_surface_create(Cairo.Format.RGB24, this._width, this._height);
        let surface = imageSurface.get_surface();
        let cr = Cairo.context_create(surface);
        if (cr.status() != 0) {
            throw Error(cr.status());
        }
        cr.set_source_rgb(1, 1, 1);
        cr.rectangle(0, 0, this._width, this._height);
        cr.fill();
        this._drawMapOnContext(cr);
        cr.paint();
        surface.write_to_png(filename);
    },

    // Callbacks

    _onApiLoggedIn : function() {
        this._statusBar.push(0, "Logged in!");
        this._api.getMap(Lang.bind(this, this._onApiGetMap),
                         -47.889, -22.010, -47.880, -22.001);
    },

    _onApiGetMap : function(response) {
        this._statusBar.push(0, "Got response!");
        this._setResponse(response);
        this._updateMapView();
    },

    _onWinDestroy : function() {
        this._quit();
    },

    _onWinKeyPressEvent : function(win, event) {
        if (event.get_symbol() == Gdk.Escape) {
            this._quit();
        }
     },

    _onQuitActivate : function(action) {
        this._quit();
    },

    _onExportToPngActivate : function(action) {
        this._exportToPng("test.png");
    }

}

function initialize() {
    Gtk.init(0, null);
    GtkClutter.init('');
}

initialize();

let mainWin = new MainWindow({ width: 800, height: 800 });
Gtk.main();

