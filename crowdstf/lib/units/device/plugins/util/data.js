var syrup = require('stf-syrup')
var deviceData = require('stf-device-db')
var config = require('../../../../../config');
var _ = require('underscore');

var logger = require('../../../../util/logger')

module.exports = syrup.serial()
  .dependency(require('./identity'))
  .define(function(options, identity) {
    var log = logger.createLogger('device:plugins:data')

    function find() {
      var data = deviceData.find(identity)

      if (config.deviceModels) {
        var cfModel = _(config.deviceModels).find(function(dm) {
          return dm.model === identity.model;
        });

        if (cfModel) {
          data = cfModel;
        }
      }

      if (!data) {
        log.warn('Unable to find device data', identity)
      }
      return data
    }

    return find()
  })
