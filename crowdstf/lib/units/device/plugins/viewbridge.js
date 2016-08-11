var syrup = require('stf-syrup');
var Promise = require('bluebird');
var net = require('net');
var logger = require('../../../util/logger');
var wire = require('../../../wire');
var wireutil = require('../../../wire/util');
var lifecycle = require('../../../util/lifecycle');
var viewBridgePorts = require('../viewbridgeports');

// Localhost binding complies with STF spec, placing
// the device threads on the same host as adb.
const ADB_VIEW_SERVER_HOST = '127.0.0.1';

module.exports = syrup.serial()
    .dependency(require('../support/adb'))
    .dependency(require('../support/router'))
    .dependency(require('../support/push'))
    .dependency(require('./group'))
    .define(function(options, adb, router, push, group) {
      // This odd plugin/object setup follows the OpenSTF open source
      // plugin pattern.
      var log = logger.createLogger('device:plugins:viewbridge');
      var plugin = Object.create(null);
      var activeViewBridge = null;

      var openViewBridge = function() {
        return new Promise(function(resolve, reject) {
          log.info('adb view bridge opening stream.');

          var activeViewBridge = new net.Socket();
          var port = viewBridgePorts[options.serial] || viewBridgePorts.default;
          activeViewBridge.connect(port, ADB_VIEW_SERVER_HOST, function() {
            resolve(activeViewBridge);
          });

          activeViewBridge.on('error', function(err) {
            reject();
            log.error('Unable to access adb view bridge');
            throw err;
          });
        });
      };

      // The plugin start implementation follows the OpenSTF
      // plugin pattern of deferred stop-start
      plugin.start = function() {
        return group.get()
            .then(function(group) {
              return plugin.stop()
                  .then(function() {
                    log.info('Starting view bridge.');
                    return openViewBridge(options.serial);
                  })
                  .then(function(logcat) {
                    activeViewBridge = logcat;

                    function entryListener(entry) {
                      try {
                        push.send([
                          group.group,
                          wireutil.envelope(
                              new wire.DeviceViewBridgeEntryMessage(
                              options.serial,
                              new Date().getTime(),
                              entry.toString()
                              )
                          )
                        ]);
                      } catch (err) {
                        log.warn('View bridge socket emit failure.');
                      }
                    }

                    activeViewBridge.on('data', entryListener);

                    return plugin.reset();
                  });
            });
      };

      // The view bridge writes a 'd' character over tcp
      // to request a dump from the on-device view hierarchy dump service.
      plugin.getSeq = Promise.method(function(seq) {
        if (plugin.isRunning()) {
          activeViewBridge.write('d ' + seq + '\n');
        }
      });

      plugin.stop = Promise.method(function() {
        if (plugin.isRunning()) {
          log.info('Stopping view bridge.');
          activeViewBridge.destroy();
          activeViewBridge = null;
        }
      });

      plugin.reset = Promise.method(function(filters) {
        filters = null;
      });

      plugin.isRunning = function() {
        return !!activeViewBridge && activeViewBridge.destroy;
      };

      lifecycle.observe(plugin.stop);
      group.on('leave', plugin.stop);

      router.on(wire.ViewBridgeStartMessage, function(channel, message) {
        var reply = wireutil.reply(options.serial);
        plugin.start(message.filters)
            .then(function() {
              push.send([
                channel,
                reply.okay('success')
              ]);
            }).catch(function(err) {
              log.warn('Unable to open view bridge.', err.stack);
              push.send([
                channel,
                reply.fail('fail')
              ]);
            });
          })
          .on(wire.ViewBridgeGetMessage, function(channel, message) {
            var reply = wireutil.reply(options.serial);

            plugin.getSeq(message.seq);
            push.send([
              channel,
              reply.okay('success')
            ]);
          })
          .on(wire.ViewBridgeStopMessage, function(channel) {
            var reply = wireutil.reply(options.serial);
            plugin.stop()
                .then(function() {
                  push.send([
                    channel,
                    reply.okay('success')
                  ]);
                })
                .catch(function(err) {
                  log.warn('Failed to stop view bridge', err.stack);
                  push.send([
                    channel,
                    reply.fail('fail')
                  ]);
                });
          });

      return plugin;
    });
