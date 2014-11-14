var format = require('util').format;
var objectAssign = require('object-assign');
var request = require('request');
var when = require('when');

function dockerApi(spec) {
  var that = {};
  var logger = spec.logger;

  logger.debug('Docker key "%s"', spec.key);
  logger.debug('Docker cert "%s"', spec.cert);
  logger.debug('Docker ca "%s"', spec.ca);

  function apiRequest(options) {
    objectAssign(options, {
      uri: format('https://%s:%d%s', spec.hostname, spec.port, options.uri),
      json: true,
      agentOptions: {
        key: spec.key,
        cert: spec.cert,
        ca: spec.ca
      }
    });

    (function() {
      var debugOptions = {};
      objectAssign(debugOptions, options);
      objectAssign(debugOptions, {
        agentOptions: {}
      });
      logger.debug('Docker request %s', JSON.stringify(debugOptions));
    })();

    var deferred = when.defer();

    request(options, function (err, res, body) {
      if (err) return deferred.reject(err);

      logger.debug('Docker response "%s" "%d" %s', options.uri, res.statusCode, JSON.stringify(body));

      if (res.statusCode >= 400) return deferred.reject(new Error(body));

      deferred.resolve(body);
    });

    return deferred.promise;
  }

  function getContainers() {
    return apiRequest({
      method: 'GET',
      uri: '/containers/json',
      qs: {
        all: true,
        size: true
      }
    });
  }

  function createContainer(containerSpec) {
    logger.verbose('Creating container "%s"', containerSpec.name);

    var body = {
      Image: containerSpec.image,
      HostConfig: {
        Binds: [
          [containerSpec.root, '/home/vslinko/workspace'].join(':')
        ],
        PortBindings: {
          '80/tcp': [{HostPort: String(containerSpec.port)}]
        }
      }
    };

    return apiRequest({
      method: 'POST',
      uri: '/containers/create',
      qs: {
        name: containerSpec.name
      },
      body: body
    });
  }

  function startContainer(id) {
    logger.verbose('Starting container "%s"', id);

    return apiRequest({
      method: 'POST',
      uri: format('/containers/%s/start', id)
    });
  }

  function stopContainer(id) {
    logger.verbose('Stopping container "%s"', id);

    return apiRequest({
      method: 'POST',
      uri: format('/containers/%s/stop', id)
    });
  }

  that.getContainers = getContainers;
  that.createContainer = createContainer;
  that.startContainer = startContainer;
  that.stopContainer = stopContainer;

  return that;
}

module.exports = dockerApi;
