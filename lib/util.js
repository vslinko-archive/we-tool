var path = require('path');
var fs = require('fs');

function readProjectConfig(root, fileName) {
  var file;

  while (!file && root !== '/') {
    if (fs.existsSync(path.join(root, fileName))) {
      file = path.join(root, fileName);
    } else {
      root = path.dirname(root);
    }
  }

  if (!file) {
    return null;
  }

  var config = JSON.parse(fs.readFileSync(file).toString());

  config.name = path.basename(root);
  config.root = root;

  if (typeof config.proxy === 'string') {
    config.proxy = {
      cmd: config.proxy,
      cwd: root
    };
  }

  if (!config.proxy) {
    config.proxy = {
      cmd: null,
      cwd: root
    };
  }

  if (config.proxy.cwd && config.proxy.cwd[0] != '/') {
    config.proxy.cwd = path.join(root, config.proxy.cwd);
  }

  return config;
}

function containerIsStarted(container) {
  return /Up/.test(container.Status);
}

function containerExists(name, containers) {
  return containers.some(function(container) {
    return container.Names.indexOf('/' + name) >= 0;
  });
}

function selectContainer(name, containers) {
  return containers.filter(function(container) {
    return container.Names.indexOf('/' + name) >= 0;
  }).shift();
}

function getContainerName(container) {
  return container.Names[0].replace(/^\//, '');
}

function getUsedPorts(containers) {
  return containers.reduce(function(usedPorts, container) {
    usedPorts = usedPorts.concat(container.Ports.filter(function(port) {
      return !!port.PublicPort;
    }).map(function(port) {
      return port.PublicPort;
    }));

    return usedPorts;
  }, []);
}

function getHttpPublicPort(container) {
  return container.Ports.filter(function(port) {
    return port.PrivatePort == 80;
  }).map(function(port) {
    return port.PublicPort;
  }).shift();
}

function getNextAvailablePort(first, last, usedPorts) {
  for (var port = first; port <= last; port++) {
    if (usedPorts.indexOf(port) < 0) {
      return port;
    }
  }

  return null;
}

module.exports = {
  readProjectConfig: readProjectConfig,
  containerIsStarted: containerIsStarted,
  containerExists: containerExists,
  selectContainer: selectContainer,
  getContainerName: getContainerName,
  getUsedPorts: getUsedPorts,
  getHttpPublicPort: getHttpPublicPort,
  getNextAvailablePort: getNextAvailablePort
};
