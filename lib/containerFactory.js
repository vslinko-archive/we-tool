var winston = require('winston');
var boot2dockerApi = require('../lib/boot2dockerApi');
var daemonApi = require('../lib/daemonApi');
var dockerApi = require('../lib/dockerApi');
var cliApi = require('../lib/cliApi');

function containerFactory(spec) {
  var logger = new winston.Logger({
    transports: [
      new winston.transports.Console({
        level: 'info',
        colorize: true,
        timestamp: true
      })
    ]
  });

  var daemon = daemonApi({
    logger: logger,
    env: process.env
  });

  var boot2docker = boot2dockerApi({
    logger: logger
  });

  var docker = dockerApi({
    logger: logger,
    hostname: spec.hostname,
    port: spec.port,
    key: spec.key,
    cert: spec.cert,
    ca: spec.ca
  });

  var cli = cliApi({
    logger: logger,
    daemon: daemon,
    boot2docker: boot2docker,
    docker: docker,
    configFileName: spec.configFileName,
    hostname: spec.hostname,
    port: spec.port,
    certsPath: spec.certsPath,
    cwd: process.cwd(),
    env: process.env,
    exit: process.exit
  });

  return {
    logger: logger,
    daemon: daemon,
    boot2docker: boot2docker,
    docker: docker,
    cli: cli
  };
}

module.exports = containerFactory;
