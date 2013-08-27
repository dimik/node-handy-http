var http = require('http'),
    https = require('https'),
    url = require('url'),
    querystring = require('querystring'),
    util = require('util'),
    fs = require('fs'),
    EventEmitter = require('events').EventEmitter;

/**
 * Simple http client.
 * @class
 * @name HTTPClient
 * @param {Object|Boolean} [agent] Controls Agent behavior. When an Agent is used request will default to Connection: keep-alive.
 */
var HTTPClient = module.exports = function (agent) {
    this._httpAgent = agent;
};

/**
 * Open connection with server.
 * @function
 * @name HTTPClient.open
 * @param {String|Object} connection Uniform resource locator string or connection params object.
 * if String: Alias for GET request, equivalent for the { url : connection }
 * if Object: {Object} [connection.headers] Request headers addition.
 *            {Object} [conection.proxy] Remote proxy host and port.
 *            {Object[]} [conection.files] List of files.
 *            {String|Object|Buffer|fs.ReadStream} [connection.data] In case of:
 *                - String and Buffer sends as is with properly installed Content-Length header.
 *                - fs.ReadStream sends by chunks with installing "chunked" value of Transfer-Encoding header.
 *                - Object align with querystring.stringify if not files or Content-Type header else then multipart/form-data.
 *                @see http://nodejs.org/api/querystring.html#querystring_querystring_stringify_obj_sep_eq
 * @param {Function} callback Calls with null or error description and server answer.
 * @returns {HTTPRequest} Useful for events listening.
 */
HTTPClient.prototype.open = function (connection, callback) {
    var options = url.parse(connection.url || connection),
        data = connection.data || {},
        isBuffer = Buffer.isBuffer(data),
        isStream = data instanceof fs.ReadStream,
        isString = 'string' === typeof data,
        method = (connection.method || 'GET').toUpperCase(),
        headers = connection.headers || {},
        files = connection.files || [],
        proxy = connection.proxy;

    headers['Content-Type'] = files.length?
        'multipart/form-data' : headers['Content-Type'] || 'application/x-www-form-urlencoded';

    if('multipart/form-data' === headers['Content-Type']) {
        var boundary = Date.now().toString(16),
            prefix = 'Content-Disposition: form-data;',
            segments = [];

        headers['Content-Type'] += '; boundary=' + boundary;

        for(var key in data) {
            segments.push(
                util.format('%s name="%s"\r\n\r\n%s\r\n', prefix, key, data[key])
            );
        }

        files.forEach(function (file) {
            segments.push(
                util.format('%s name="%s"; filename="%s"\r\nContent-Type: %s\r\n\r\n%s\r\n', prefix, file.fieldname || file.name, file.name, file.type, file.value)
            );
        });

        data = util.format('--%s\r\n%s--%s--\r\n', boundary, segments.join('--' + boundary + '\r\n'), boundary);
    }

    if('GET' === method) {
        options.pathname =
            options.path = url.format({
                pathname: options.pathname,
                search: [options.search, querystring.stringify(data)].filter(Boolean).join('&')
            });
    }
    else {
        if(isStream) {
            headers['Transfer-Encoding'] = 'chunked';
        }
        else if(!('Content-Length' in headers)) {
            headers['Content-Length'] = isBuffer? data.length : Buffer.byteLength(
                isString? data : (data = querystring.stringify(data))
            );
        }
    }

    if(proxy) {
        options.pathname =
            options.path = options.protocol + '//' + options.hostname + options.pathname;
        options.hostname =
            options.host = proxy.host;
        options.port = proxy.port;
    }

    options.headers = headers;
    options.method = method;
    options.agent = this._httpAgent;

    var contentType,
        size = 0,
        result = [],
        onData = function (chunk) {
            size += chunk.length;
            result.push(chunk);
        },
        request = new HTTPRequest(options)
            .once('request', function (request) {
                if(isStream) {
                    var onData = function (chunk) {
                            request.write(chunk);
                        };

                    data
                        .on('data', onData)
                        .once('end', function () {
                            data.removeListener('data', onData);
                            request.end();
                        });
                }
                else {
                    'GET' === method || request.write(data);
                    request.end();
                }
            })
            .once('response', function (response) {
                contentType = response.headers['content-type'];
            })
            .on('data', onData)
            .once('end', function () {
                request.removeListener('data', onData);
                result = Buffer.concat(result, size);

                if(contentType && ~contentType.search(/json/i)) {
                    try {
                        callback(null, JSON.parse(result));
                    }
                    catch(err) {
                        callback(err.toString());
                    }
                }
                else {
                    callback(null, result);
                }
            })
            .once('error', function (err) {
                callback(err.toString());
            })
            .open();

    return request;
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
    var self = this,
        onData = function (chunk) {
            /**
             * @name HTTPRequest#data
             * @event
             * @param {String|Buffer} chunk
             */
            self.emit('data', chunk);
        };

    this._request = ~this._options.protocol.indexOf('https')?
        https.request(this._options) : http.request(this._options);

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
                .on('data', onData)
                .once('end', function () {
                    response.removeListener('data', onData);
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
 * @returns {HTTPRequest}
 */
HTTPRequest.prototype.close = function () {
    this._request.abort();
    this.emit('abort');

    return this;
};
