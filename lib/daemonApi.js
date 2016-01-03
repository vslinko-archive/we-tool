var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var objectAssign = require('object-assign');
var when = require('when');

function daemonApi(spec) {
  var that = {};
  var logger = spec.logger;

  function isStarted() {
    var deferred = when.defer();

    logger.verbose('Executing "ps x"');

    exec('ps x', function(err, stdout, stderr) {
      if (err) return deferred.reject(err);

      var rows = stdout.split('\n');
      var isStarted = rows.some(function(row) {
        return row.indexOf('we-daemon') >= 0;
      });

      deferred.resolve(isStarted);
    });

    return deferred.promise;
  }

  function start() {
    var env = {};
    objectAssign(env, spec.env);

    spawn('we-daemon', [], {
      stdio: 'ignore',
      env: env,
      detached: true
    });
  }

  that.isStarted = isStarted;
  that.start = start;

  return that;
}

module.exports = daemonApi;
