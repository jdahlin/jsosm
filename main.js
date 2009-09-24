const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Signals = imports.signals;

const GLib = imports.gi.GLib;
const GModule = imports.gi.GModule;
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
        this._width = args.width;
        this._height = args.height;
        this._buildUI();

        this._nodes = {};
        this._ways = {};
        this._api = new OSMAPI();
        this._api.connect('logged-in', Lang.bind(this, this._onApiLoggedIn));
        this._api.login();
    },
    
    _onApiLoggedIn : function() {
        this._statusBar.push(0, "Logged in!");            
        this._api.getMap(Lang.bind(this, this._onGetMapResponse),
                         -47.889, -22.010, -47.880, -22.001);
    },
    
    _onGetMapResponse : function(response) {
        this._statusBar.push(0, "Got response!");
        let bounds = response.bounds;
        let cr = this._texture.create();
        if (cr.status() != 0) {
            throw Error(cr.status());
        }
        this._cr = cr;
        log("(" + bounds.@minlon + "," + bounds.@minlat + ") -> " +
            "(" + bounds.@maxlon + "," + bounds.@maxlat + ")");
        let latScale = this._width / Math.abs(bounds.@minlat - bounds.@maxlat);
        let lonScale = this._height / Math.abs(bounds.@minlon - bounds.@maxlon);

        let i;
        for (i = 0; i < response.node.length(); ++i) {
            let node = response.node[i];
            this._nodes[node.@id] = node;
            log(node.@lon + ':' + node.@lat);
        }
        
        cr.set_line_width(1);
        cr.set_source_rgb(0, 0, 0);
        if (cr.status() != 0) {
            throw Error(cr.status());
        }
        let translate = Lang.bind(this, function(node) {
            let y = (node.@lat - bounds.@minlat) * latScale;
            let x = (node.@lon - bounds.@minlon) * lonScale;

            log("x,y: " + x + "," + y);
            return [x, this._width-y];
        });
        
        log("ways: " + response.way.length());
        for (i = 0; i < response.way.length(); ++i) {
            let way = response.way[i];
            //log(way.toXMLString());
            let name = way.tag.(@k == "name").@v;
            if (name != undefined) log(name);
            
            let x, y;
            
            [x, y] = translate(this._nodes[way.nd[0].@ref]);
            cr.move_to(x, y);
            
            for (let j = 1; j < way.nd.length(); j++) {
                let node = this._nodes[way.nd[j].@ref];
                [x, y] = translate(node);
                cr.line_to(x, y);
            }
            this._ways[way.@id] = way;   
            cr.stroke_preserve();
        }
        cr.destroy();
        delete cr;
                
        //log(response.toXMLString());
    },
    
    _onWinDestroy : function() { 
        Gtk.main_quit();
        this._win.destroy();
     },

    _buildUI : function() {
        this._win = new Gtk.Window({ type: Gtk.WindowType.TOPLEVEL });
        let me = this;
        this._win.connect("destroy", Lang.bind(this, this._onWinDestroy));
        this._win.set_size_request(this._width, this._height);
        
        let box = new Gtk.VBox();
        this._win.add(box);
        box.show();      
        
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
        
        this._statusBar.push(0, "Logging in...");
        
        this._win.show();
    }
}

function initialize() {
    Gtk.init(0, null);
    GtkClutter.init('');
}

initialize();

let mainWin = new MainWindow({ width: 800, height: 800 });
Gtk.main();

