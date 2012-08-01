var http = require('http'),
    urlparse = require('url').parse,
    querystring = require('querystring'),
    util = require('util'),
    EventEmitter = require('events').EventEmitter;

/**
 * Simple http client.
 * @class
 * @name HTTPClient
 */
var HTTPClient = module.exports = function (agent) {
    this._httpAgent = agent;
};

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
 * @param {Object} [proxy] Remote proxy host and port.
 * @returns {HTTPRequest} Useful for events listening.
 */
HTTPClient.prototype.open = function (url, data, callback, headers, proxy) {
    'function' !== typeof callback &&
        'function' === typeof data &&
            (callback = data, data = null, headers = callback, proxy = headers); // Shift params if data not specified.

    var options = urlparse(url),
        isBuf = Buffer.isBuffer(data),
        chunk, contentType, answer = [], size = 0;

    options.method = this.getHTTPMethod() || (data && 'POST' || 'GET');
    headers = headers || {};

    if('object' === typeof data) {
        isBuf || (data = querystring.stringify(data));
        if('GET' === options.method) {
            options.pathname = options.path = util.format('%s?%s', options.pathname, data);
        }
        else {
            headers['Content-Length'] || (headers['Content-Length'] = isBuf ? data.length : Buffer.byteLength(data));
            headers['Content-Type'] || (headers['Content-Type'] = isBuf && 'multipart/form-data' || 'application/x-www-form-urlencoded');
        }
    }

    if(proxy) {
        options.pathname = options.path = util.format('%s//%s%s', options.protocol, options.hostname, options.pathname);
        options.hostname = options.host = proxy.host;
        options.port = proxy.port;
    }

    options.headers = headers;
    options.agent = this._httpAgent;

    return new HTTPRequest(options)
        .once('request', function (request) {
            if('function' === typeof data) {
                while (chunk = data()) {
                    request.write(chunk);
                }
            } else {
                request.write(data);
            }
            request.end();
        })
        .once('response', function (response) {
            contentType = response.headers['content-type'];
        })
        .on('data', function (chunk) {
            size += chunk.length;
            answer.push(chunk);
        })
        .once('end', function () {
            var result = new Buffer(size),
                offset = 0;

            answer.forEach(function (chunk) {
                chunk.copy(result, offset);
                offset += chunk.length;
            });

            callback(null, ~contentType.indexOf('json') ? JSON.parse(result) : result.toString());
        })
        .once('error', function (err) {
            callback(err.toString());
        })
        .open();
};

/**
 * Wrapper on the native nodejs http.ClientRequest.
 * @class
 * @name HTTPRequest
 * @param {Object} options Request params.
 * @augments events.EventEmitter
 * @borrows http.ClientRequest#event:response as this.event:response
 * @borrows http.ClientRequest#event:data as this.event:data
 * @borrows http.ClientRequest#event:end as this.event:end
 * @borrows http.ClientRequest#event:error as this.event:error
 */
var HTTPRequest = function (options) {
    EventEmitter.call(this);

    this._options = options;
};
/**
 * @augments events.EventEmitter
 */
util.inherits(HTTPRequest, EventEmitter);

/**
 * Open connection with server.
 * @function
 * @name HTTPRequest.open
 * @returns {HTTPRequest} Useful for events listening.
 */
HTTPRequest.prototype.open = function () {
    var self = this;

    this._request = http.request(this._options);

    /**
     * @name HTTPRequest#request
     * @event
     * @param {http.ClientRequest} request
     */
    this.emit('request', this._request);

    this._request
        /**
         * @name HTTPRequest#socket
         * @event
         * @param {net.Socket} socket
         */
        .once('socket', function (socket) {
            self.emit('socket', socket);
        })
        .once('response', function (response) {
            /**
             * @name HTTPRequest#response
             * @event
             * @param {http.ClientResponse} response
             */
            self.emit('response', response);
            response
                .on('data', function (chunk) {
                    /**
                     * @name HTTPRequest#data
                     * @event
                     * @param {String|Buffer} chunk
                     */
                    self.emit('data', chunk);
                })
                .once('end', function () {
                    /**
                     * @name HTTPRequest#end
                     * @event
                     */
                    self.emit('end');
                });
        })
        .once('error', function (err) {
            /**
             * @name HTTPRequest#error
             * @event
             * @param {Object} err
             */
            self.emit('error', err);
        });

    return this;
};

/**
 * Close connection with server.
 * @function
 * @name HTTPRequest.close
 */
HTTPRequest.prototype.close = function () {
    this._request.abort();
    this.emit('abort');

    return this;
};
