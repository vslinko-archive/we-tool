var format = require('util').format;
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var objectAssign = require('object-assign');
var when = require('when');
var util = require('./util');

var exitCodes = {
  error: 1,
  allPortsAreBusy: 2,
  boot2dockerIsNotRunned: 3,
  configNotFound: 4,
  containerNotFound: 5,
  noPublicPort: 6
};

function cliApi(spec) {
  var that = {};
  var logger = spec.logger;
  var daemon = spec.daemon;
  var boot2docker = spec.boot2docker;
  var docker = spec.docker;
  var exit = spec.exit;

  // daemon.isStarted()
  //   .then(function(started) {
  //     if (!started) {
  //       return daemon.start();
  //     }
  //   });

  function readProjectConfig() {
    var projectConfig = util.readProjectConfig(spec.cwd, spec.configFileName);

    if (!projectConfig) {
      logger.error("Unable to find configuration file");
      return exit(exitCodes.configNotFound);
    }

    logger.debug('Project configuration %s', JSON.stringify(projectConfig));

    return projectConfig;
  }

  function handleError(err) {
    logger.error(err.message);
    exit(exitCodes.error);
  }

  function boot2dockerShouldBeStarted() {
    return boot2docker.isStarted()
      .then(function(started) {
        if (!started) {
          logger.info('Starting boot2docker');
          return boot2docker.start()
            .then(function() { return true; });
        }

        return when.resolve(false);
      });
  }

  function containerShouldBeStarted(name) {
    return when(boot2dockerShouldBeStarted())
      .then(docker.getContainers)
      .then(function(containers) {
        var container = util.selectContainer(name, containers);

        if (!container) {
          logger.error('Container "%s" not found', name);
          return exit(exitCodes.containerNotFound);
        }

        if (!util.containerIsStarted(container)) {
          logger.info('Starting container');
          return docker.startContainer(container.Id)
            .then(function() { return true; });
        }

        return when.resolve(false);
      });
  }

  function stopBoot2dockerIfAllContainersIsStopped() {
    return when(docker.getContainers())
      .then(function(containers) {
        var allCointainersIsStopped = containers.every(function(container) {
          return !util.containerIsStarted(container);
        });

        if (allCointainersIsStopped) {
          logger.info('Stopping boot2docker');
          return boot2docker.stop();
        }
      });
  }

  function init() {
    var projectConfig = readProjectConfig();

    when(boot2dockerShouldBeStarted())
      .then(docker.getContainers)
      .then(function(containers) {
        if (util.containerExists(projectConfig.name, containers)) {
          logger.info('Container "%s" already exists', projectConfig.name);
          return;
        }

        var usedPorts = util.getUsedPorts(containers);
        var port = util.getNextAvailablePort(8000, 8999, usedPorts);

        logger.debug('Used ports %s', JSON.stringify(usedPorts));

        if (!port) {
          logger.error('All ports are busy');
          return exit(exitCodes.allPortsAreBusy);
        }

        logger.debug('Available port "%d"', port)
        logger.info('Creating container');

        return docker.createContainer({
          name: projectConfig.name,
          image: projectConfig.image,
          port: port,
          root: projectConfig.root
        });
      })
      .then(null, handleError);
  }

  function start() {
    var projectConfig = readProjectConfig();

    when(containerShouldBeStarted(projectConfig.name))
      .then(function(wasStarted) {
        if (!wasStarted) {
          logger.info('Container "%s" already started', projectConfig.name);
        }
      })
      .then(null, handleError);
  }

  function stop() {
    var projectConfig = readProjectConfig();

    when(boot2docker.isStarted())
      .then(function(started) {
        if (!started) {
          logger.error('Boot2docker is not runned');
          return exit(exitCodes.boot2dockerIsNotRunned);
        }

        return when(docker.getContainers())
          .then(function(containers) {
            var container = util.selectContainer(projectConfig.name, containers);

            if (!container) {
              logger.error('Container "%s" not found', projectConfig.name);
              return exit(exitCodes.containerNotFound);
            }

            if (!util.containerIsStarted(container)) {
              logger.info('Container "%s" already stopped', projectConfig.name);
              return;
            }

            logger.info('Stopping container');

            return docker.stopContainer(container.Id);
          });
      })
      .then(null, handleError);
  }

  function enter() {
    var projectConfig = readProjectConfig();

    containerShouldBeStarted(projectConfig.name)
      .then(function() {

        var childEnvironment = {};
        objectAssign(childEnvironment, spec.env);
        objectAssign(childEnvironment, {
          'DOCKER_HOST': format('tcp://%s:%d', spec.hostname, spec.port),
          'DOCKER_CERT_PATH': spec.certsPath,
          'DOCKER_TLS_VERIFY': '1'
        });

        logger.debug('Child environment %s', JSON.stringify(childEnvironment));

        var cmd = 'docker';
        var args = [
          'exec',
          '-it',
          projectConfig.name,
          '/bin/bash', '-c', 'su vslinko -l'
        ];

        logger.debug("Spawn %s", JSON.stringify([cmd].concat(args)));

        var childProcess = spawn(cmd, args, {
          stdio: 'inherit',
          env: childEnvironment
        });
      })
      .then(null, handleError);
  }

  function proxy() {
    var projectConfig = readProjectConfig();

    containerShouldBeStarted(projectConfig.name)
      .then(docker.getContainers)
      .then(function(containers) {
        var container = util.selectContainer(projectConfig.name, containers);

        if (!container) {
          logger.error('Container "%s" not found', projectConfig.name);
          return exit(exitCodes.containerNotFound);
        }

        var publicPort = util.getHttpPublicPort(container);

        if (!publicPort) {
          logger.error('Container "%s" has no published http port', projectConfig.name);
          return exit(exitCodes.noPublicPort);
        }

        var childEnvironment = {};
        objectAssign(childEnvironment, spec.env);
        objectAssign(childEnvironment, {
          SOURCE_IP: spec.hostname,
          SOURCE_PORT: publicPort,
          IP: '0.0.0.0',
          PORT: publicPort
        });

        logger.debug('Child environment %s', JSON.stringify(childEnvironment));
        logger.info(
          'Proxying from http://%s:%d to http://localhost:%d',
          childEnvironment.SOURCE_IP,
          childEnvironment.SOURCE_PORT,
          childEnvironment.PORT
        );

        var cmd = '/bin/bash';
        var args = ['-c', projectConfig.proxy.cmd || 'we-proxy'];

        logger.debug("Spawn %s", JSON.stringify([cmd].concat(args)));

        var childProcess = spawn(cmd, args, {
          stdio: 'inherit',
          cwd: projectConfig.proxy.cwd,
          env: childEnvironment
        });
      })
      .then(null, handleError);
  }

  function open(opts) {
    var projectConfig = readProjectConfig();

    containerShouldBeStarted(projectConfig.name)
      .then(docker.getContainers)
      .then(function(containers) {
        var container = util.selectContainer(projectConfig.name, containers);

        if (!container) {
          logger.error('Container "%s" not found', projectConfig.name);
          return exit(exitCodes.containerNotFound);
        }

        var publicPort = util.getHttpPublicPort(container);

        if (!publicPort) {
          logger.error('Container "%s" has no published http port', projectConfig.name);
          return exit(exitCodes.noPublicPort);
        }

        var application = opts.application || projectConfig.browser || 'Google Chrome';

        exec(format(
          'open -a "%s" http://localhost:%d%s',
          application,
          publicPort,
          projectConfig.openUrl || '/'
        ));
      });
  }

  function halt(opts) {
    docker.getContainers()
      .then(function(containers) {
        containers = containers.filter(util.containerIsStarted);

        return when.map(containers, function(container) {
          logger.info('Stopping container "%s"', util.getContainerName(container));
          return docker.stopContainer(container.Id);
        });
      })
      .then(function() {
        if (!opts.keepBoot2docker) {
          return stopBoot2dockerIfAllContainersIsStopped();
        }
      })
      .then(null, handleError);
  }

  that.init = init;
  that.start = start;
  that.stop = stop;
  that.enter = enter;
  that.proxy = proxy;
  that.open = open;
  that.halt = halt;

  return that;
}

module.exports = cliApi;
