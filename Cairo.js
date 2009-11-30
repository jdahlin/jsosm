const _cairo = imports.gi.cairo;
//const sys = imports.sys;

const Content = _cairo.Content;
const Format = _cairo.Format;
const SurfaceType = _cairo.SurfaceType;

function instanceOf(object, constructor) {
    while (object != null) {
        if (object == constructor.prototype)
            return true;
        object = object.__proto__;
    }
    return false;
}

function Surface(args) {
    throw new Error("Surface is an abstract class, it cannot be instantiated");
}

Surface.fromNative = function(surface) {
    switch (surface.get_type()) {
        case SurfaceType.IMAGE:
            return ImageSurface.fromNative(surface);
        default:
            throw new Error("Unimplemented surface type: " + surface.get_type());
    }
}
//gjs.registerCustomType("cairo.Surface", Surface.fromNative);


/*
 * Cairo Surface
 */
Surface.prototype = {
    createSimilar : function(content, width, height) {
        return _cairo.create_similar(this._surface, content, width, height);
    }
}


/*
 * Cairo ImageSurface
 */
function ImageSurface(args) {
    this._init(args);
}
ImageSurface.fromNative = function(surfaceNative) {
    return new ImageSurface({ _surface: surfaceNative });
}
//gjs.registerCustomType("cairo.ImageSurface", ImageSurface.fromNative);

ImageSurface.prototype = {
    __proto__: Surface.prototype,
    _init : function(args) {
        if ('_surface' in args) {
            this._surface = args._surface;
            return;
        }
        if (!('format' in args)) {
            throw new Error("ImageSurface constructor requires a 'format' parameter");
        }
        if (!('width' in args)) {
            throw new Error("ImageSurface constructor requires a 'width' parameter");
        }
        if (!('height' in args)) {
            throw new Error("ImageSurface constructor requires a 'height' parameter");
        }
        if ('data' in args) {
            this._surface = _cairo.image_surface_create_for_data(
                data, args.format, args.width, args.height, stride);
        } else {
            this._surface = _cairo.image_surface_create(
                args.format, args.width, args.height);
        }
    },

    get format() {
        return _cairo.image_surface.get_format(this._surface);
    },

    get width() {
        return _cairo.image_surface.get_width(this._surface);
    },

    get height() {
        return _cairo.image_surface.get_height(this._surface);
    },

    get stride() {
        return _cairo.image_surface.get_stride(this._surface);
    },

    get data() {
        return _cairo.image_surface.get_data(this._surface);
    }
}


/*
 * Cairo Context (cairo_t)
 */
function Context(args) {
    this._init(args);
}

Context.fromNative = function(nativeContext) {
    return new Context({ _context: nativeContext });
}
//gjs.registerCustomType("cairo.Context", Context.fromNative);

Context.prototype = {
    _init : function(args) {
        if ('_context' in args) {
            this._context = args._context;
            return;
        }
        if (!('surface' in args)) {
            throw new Error("Context constructor requires a surface parameter");
        }
        surface = args.surface;
        if (!(instanceOf(surface, Surface))) {
            throw new Error("surface must be an instance of Surface, not a '" + surface + "'");
        }
        this._context = _cairo.context_create(surface._surface);
    },

    _checkStatus : function() {
        if (this._context.status() != 0) {
            throw Error(this._context.status());
        }
    },

    destroy : function() {
        this._context.destroy();
        delete this._context;
    },

    setLineWidth : function(lineWidth) {
        this._context.set_line_width(lineWidth);
        this._checkStatus();
    },

    setSourceRGB : function(red, green, blue) {
        this._context.set_source_rgb(red, green, blue);
        this._checkStatus();
    },

    lineTo : function(x, y) {
        this._context.line_to(x, y);
        this._checkStatus();
    },

    moveTo : function(x, y) {
        this._context.move_to(x, y);
        this._checkStatus();
    },

    stroke : function() {
        this._context.stroke();
        this._checkStatus();
    },

    rectangle : function(x, y, width, height) {
        this._context.rectangle(x, y, width, height);
        this._checkStatus();
    },

    fill : function() {
        this._context.fill();
        this._checkStatus();
    },

    paint : function() {
        this._context.paint();
        this._checkStatus();
    }
}


