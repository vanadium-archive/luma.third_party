var fs = require('fs');
var logger = require('./lib/util/logger');
var log = logger.createLogger('config');

var config;
try {
  config = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'));
  log.info('Found config.json:\n %s', JSON.stringify(config, null, 2));
} catch (ignored) {
  config = {};
  log.warn('No config file found, using defaults.');
}

module.exports = config;
