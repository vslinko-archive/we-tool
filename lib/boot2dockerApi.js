var exec = require('child_process').exec;
var when = require('when');

function boot2dockerApi(spec) {
  var that = {};
  var logger = spec.logger;

  function isStarted() {
    var deferred = when.defer();

    logger.verbose('Executing "boot2docker status"');

    exec('boot2docker status', function(err, stdout, stderr) {
      if (err) return deferred.reject(err);

      var status = stdout.trim();
      var isStarted = status === 'running';

      logger.debug('Boot2docker status "%s"', status);
      if (isStarted) logger.verbose('Boot2docker is running');
      if (!isStarted) logger.verbose('Boot2docker is not running');

      deferred.resolve(isStarted);
    });

    return deferred.promise;
  }

  function start() {
    var deferred = when.defer();

    logger.verbose('Executing "boot2docker up"');

    exec('boot2docker up', function(err, stdout, stderr) {
      if (err) return deferred.reject(err);

      logger.verbose('Boot2docker is runned');

      deferred.resolve();
    });

    return deferred.promise;
  }

  function stop() {
    var deferred = when.defer();

    logger.verbose('Executing "boot2docker down"');

    exec('boot2docker down', function(err, stdout, stderr) {
      if (err) return deferred.reject(err);

      logger.verbose('Boot2docker is stopped');

      deferred.resolve();
    });

    return deferred.promise;
  }

  that.isStarted = isStarted;
  that.start = start;
  that.stop = stop;

  return that;
}

module.exports = boot2dockerApi;
