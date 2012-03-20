var HTTPClient = require('..');

exports.testIsConstructor = function (test) {
    test.equal(typeof HTTPClient, 'function');

    test.done();
};

exports.testInstanceProperties = function (test) {
    var client = new HTTPClient();

    test.equal(typeof client.open, 'function');
    test.equal(typeof client.close, 'function');

    test.done();
};

exports.testGetRequest = function (test) {
    var client = new HTTPClient();

    test.expect(5);

    test.ok(client.open('http://www.yandex.ru/yandsearch?text=test', function (err, page) {
        test.ifError(err);
        test.equal(typeof page, 'string');
        test.ok(page.length > 0);
        test.ok(~page.indexOf('html'));
        test.done();
    }) instanceof HTTPClient);
};

exports.testPostRequest = function (test) {
    var client = new HTTPClient(),
        data = {
             "client" : "t"
           , "text" : "The quick brown fox jumps over the lazy dog"
           , "hl" : "en"
           , "sl" : "auto"
           , "tl" : "ru"
           , "multires" : "1"
           , "otf" : "1"
           , "pc" : "1"
           , "ssel" : "0"
           , "tsel" : "6"
           , "uptl" : "ru"
           , "alttl" : "en"
           , "sc" : "1"
        };

    test.expect(5);

    test.ok(client.open('http://translate.google.com/', data, function (err, page) {
        test.ifError(err);
        test.equal(typeof page, 'string');
        test.ok(page.length > 0);
        test.ok(~page.indexOf('The quick brown fox jumps over the lazy dog'));
        test.done();
    }) instanceof HTTPClient);
};
