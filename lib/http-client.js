var http = require('http'),
    urlparse = require('url').parse,
    querystring = require('querystring'),
    util = require('util'),
    EventEmitter = require('events').EventEmitter;

/**
 * Simple http client.
 * @class
 * @name HTTPClient
 * @augments events.EventEmitter
 * @borrows http.ClientRequest#event:response as this.event:response
 * @borrows http.ClientRequest#event:data as this.event:data
 * @borrows http.ClientRequest#event:end as this.event:end
 * @borrows http.ClientRequest#event:error as this.event:error
 */
var HTTPClient = module.exports = function () {
    EventEmitter.call(this);
};

/**
 * @augments events.EventEmitter
 */
util.inherits(HTTPClient, EventEmitter);

/**
 * Useful for overlap when you need method other then GET or POST
 * @function
 * @name HTTPClient.getHTTPMethod
 * @returns {String} Name of the HTTP-method e.g.'PUT' or 'DELETE'.
 */
HTTPClient.prototype.getHTTPMethod = function () {};

/**
 * Open connection with server.
 * @function
 * @name HTTPClient.open
 * @param {String} url Uniform resource locator.
 * @param {Object|Buffer|Function} [data] In case of:
 * - Object align with querystring.stringify.
 * @see http://nodejs.org/api/querystring.html#querystring_querystring_stringify_obj_sep_eq
 * - Buffer sends as is with installing properly Content-Length header.
 * - Function must return part of the data (Buffer|String) in each call and false when done
 * (you must provide properly Content-Length in headers param in this case)
 * @param {Function} callback Calls with null or error description as first param and server answer as second.
 * @param {Object} [headers] Request headers addition.
 * @returns {HTTPClient} Useful for events listening.
 */
HTTPClient.prototype.open = function (url, data, callback, headers) {
    if('function' !== typeof callback && 'function' === typeof data) callback = data, data = null, headers = callback; // Shift params if data not specified.

    var self = this,
        options = urlparse(url),
        headers = headers || {},
        isBuf = Buffer.isBuffer(data),
        request, chunk;

    options.method = this.getHTTPMethod() || (data && 'POST' || 'GET');

    if('object' === typeof data) {
        isBuf || (data = querystring.stringify(data));
        headers['Content-Length'] || (headers['Content-Length'] = isBuf && data.length || Buffer.byteLength(data));
        headers['Content-Type'] || (headers['Content-Type'] = isBuf && 'multipart/form-data' || 'application/x-www-form-urlencoded');
    }

    // Hack for older versions of node (<0.6).
    // Because url.parse method doesn't fill the path property
    // and http.request use host instead of hostname (fixed in 0.6)
    options.path || (options.path = options.pathname || '/', options.host = options.hostname);

    options.headers = headers;

    this.request = request = http.request(options)
        /**
         * @name HTTPClient#socket
         * @event
         * @param {net.Socket} socket
         */
        .on('socket', function (socket) {
            self.emit('socket', socket);
        })
        .on('response', function (response) {
            var result = [],
                contentType = response.headers['content-type'];
            /**
             * @name HTTPClient#response
             * @event
             * @param {http.ClientResponse} response
             */
            self.emit('response', response);
            response
                .on('data', function (chunk) {
                    /**
                     * @name HTTPClient#data
                     * @event
                     * @param {String|Buffer} chunk
                     */
                    self.emit('data', chunk);
                    result.push(chunk);
                })
                .on('end', function () {
                    /**
                     * @name HTTPClient#end
                     * @event
                     */
                    self.emit('end');
                    result = result.join('');
                    callback(null, ~contentType.indexOf('json') && JSON.parse(result) || result);
                });
        })
        .on('error', function (err) {
            /**
             * @name HTTPClient#error
             * @event
             * @param {Object} err
             */
            self.emit('error', err);
            callback('Error: ' + err.message, false);
        });

    /**
     * @name HTTPClient#request
     * @event
     * @param {http.ClientRequest} request
     */
    this.emit('request', request);

    if('function' === typeof data) {
        while (chunk = data()) {
            request.write(chunk);
        }
    } else {
        request.write(data);
    }

    request.end();

    return this;
};

/**
 * Abort connection with server.
 * @function
 * @name HTTPClient.close
 */
HTTPClient.prototype.close = function () {
    this.request.abort();
    this.emit('abort');

    return this;
};

