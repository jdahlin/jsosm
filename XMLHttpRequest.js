/*
 * XMLHttpRequest implementation using libsoup
 *
 * References:
 * http://www.w3.org/TR/XMLHttpRequest
 */

const Lang = imports.lang;
const Mainloop = imports.mainloop;

const Soup = imports.gi.Soup;

const ReadyState = {
    UNSENT : 0,
    OPENED : 1,
    HEADERS_RECEIVED: 2,
    LOADING : 3,
    DONE : 4
};

function XMLHttpRequest() {
    this._init();
}

XMLHttpRequest.prototype = {
    _init : function() {
        this._readyState = ReadyState.UNSENT;
        this._session = new Soup.SessionAsync({});
        this._readyStateFunction = null;
        this._message = null;
    },

    // XMLHttpRequest interface

    // event handlers

    get onreadystatechange() {
        return this._readyStateFunction;
    },

    set onreadystatechange(value) {
        this._readyStateFunction = value;
    },

    // states

    UNSENT: ReadyState.UNSENT,
    OPENED : ReadyState.OPENED,
    HEADERS_RECEIVED: ReadyState.HEADER_RECEIVED,
    LOADING : ReadyState.LOADING,
    DONE : ReadyState.DONE,

    get readyState() {
        return this._readyState;
    },

    // request

    open : function(method, url, async, user, password) {
        this._isAsync = async !== undefined ? async : false;
        this._user = user;
        this._password = password;

        this._message = Soup.Message.new(method, url);
        this._message.connect("finished", Lang.bind(this, this._onMessageFinished));
        this._session.queue_message(this._message, null, null);

        this._setState(ReadyState.OPENED);
    },

    setRequestHeader : function(header, value) {

    },

    send : function(data) {
        if (!this._async) {
            Mainloop.run('XMLHttpRequest');
        }
    },

    abort : function() {
        if (!this._async) {
            Mainloop.quit('XMLHttpRequest');
        }
    },

    // response

    get status() {
        return this._message.status;
    },

    get statusText() {

    },

    getResponseHeader : function(header) {

    },

    getAllResponseHeaders : function() {

    },

    get responseText() {
        return this._message.response_body.data;
    },

    get responseXML() {
        throw new Error("No Document implementation yet, use responseE4X instead");
    },

    // Custom

    get responseE4X() {
        let response;
        let data = this.responseText;
        // E4X bafs at the <?xml version=...> header, remove it
        if (data.slice(0, 5) == '<?xml') {
            response = new XML(data.slice(39));
        } else {
            response = data;
        }
        return new XML(response);
    },

    // private

    _onMessageFinished : function(msg) {
        Mainloop.idle_add(Lang.bind(this, function() {
            this._setState(ReadyState.DONE);
            this._message = null;
            return false;
        }));
    },

    _setState : function(state) {
        this._state = state;
        if (this._readyStateFunction) {
            this._readyStateFunction();
        }
    }
};
