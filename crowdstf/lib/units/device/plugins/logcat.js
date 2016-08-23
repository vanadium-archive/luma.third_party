var syrup = require('stf-syrup')
var Promise = require('bluebird')
var spawn = require('child_process').spawn;

var logger = require('../../../util/logger')
var wire = require('../../../wire')
var wireutil = require('../../../wire/util')
var lifecycle = require('../../../util/lifecycle')

module.exports = syrup.serial()
  .dependency(require('../support/adb'))
  .dependency(require('../support/router'))
  .dependency(require('../support/push'))
  .dependency(require('./group'))
  .define(function(options, adb, router, push, group) {
    var log = logger.createLogger('device:plugins:logcat')
    var plugin = Object.create(null)
    var activeLogcat = null

    var openLogcat = function(serial, appId) {
      return new Promise(function(resolve, reject) {
        var launchLogcat = function(exitCode) {
          if (exitCode === 0) {
            log.info('adb logcat opening stream.');

            // Flag -c clears backlogged output.
            // Flag -s specifies the device serial.
            // Option 2>/dev/null ignores process err messages.
            var psClear = spawn('adb', [
              '-s',
              options.serial,
              'logcat',
              '-c',
              '2>/dev/null'
            ]);

            psClear.on('close', function(exitCode) {
              if (exitCode === 0) {
                // Flag *:D provide info level Debug and higher.
                // Other flags include
                // (V)erbose (D)ebug (I)nfo (W)arning (E)rror (F)atal.
                var logcat = spawn('adb', ['-s',
                  serial,
                  'logcat',
                  '*:D',
                  '2>/dev/null'
                ]);

                resolve(logcat);
              } else {
                reject();
                throw Error('Unable to access adb logcat clear process');
              }
            });
          } else {
            reject();
            throw Error('Unable to access adb app launch process');
          }
        };

        if (appId) {
          log.info('adb launching app %s.', appId);
          var psAppLaunch = spawn('adb', [
            '-s',
            options.serial,
            'shell',
            'monkey',
            '-p',
            appId,
            '-c',
            'android.intent.category.LAUNCHER',
            '1',
            '2>/dev/null'
          ]);

          psAppLaunch.on('close', launchLogcat);
        } else {
          launchLogcat(0);
        }
      }).catch(function(err) {
        log.error('Cannot get next free app to launch.', err.stack);
      });
    };

    plugin.start = function(filters, appId) {
      return group.get()
        .then(function(group) {
          return plugin.stop()
            .then(function() {
              log.info('Starting logcat')
              return openLogcat(options.serial, appId);
            })
            .then(function(logcat) {
              activeLogcat = logcat;

              function entryListener(entry) {
                try {
                  push.send([
                    group.group,
                    wireutil.envelope(new wire.DeviceLogcatEntryMessage(
                      options.serial,
                      new Date().getTime(),
                      entry.toString()
                    ))
                  ]);
                } catch (err) {
                  console.error("Logcat stdout threw", err);
                }
              }

              logcat.stdout.on('data', entryListener);
              return plugin.reset(filters)
            });
        });
    };

    plugin.stop = Promise.method(function(appId) {
      if (plugin.isRunning()) {
        if (appId) {
          log.info('adb killing app %s', appId);
          var arrArgs = [
            '-s',
            options.serial,
            'shell',
            'am',
            'force-stop',
            appId,
            '2>/dev/null'
          ];

          var psKill = spawn('adb', arrArgs);
          psKill.on('close', function(exitCode) {
            if (exitCode === 0) {
              log.info('adb killed app %s', appId);
            } else {
              log.error('adb error killing app %s', appId);
            }
          });
        }

        log.info('Stopping logcat')
        activeLogcat.kill();
        activeLogcat = null
      }
    })

    plugin.reset = Promise.method(function(filters) {
      filters = null;
    });

    plugin.isRunning = function() {
      return !!activeLogcat && activeLogcat.kill;
    };

    lifecycle.observe(plugin.stop)
    group.on('leave', plugin.stop)

    router
      .on(wire.LogcatStartMessage, function(channel, message) {
        var reply = wireutil.reply(options.serial)
        plugin.start(message.filters, message.appId)
          .then(function() {
            push.send([
              channel
            , reply.okay('success')
            ])
          })
          .catch(function(err) {
            log.error('Unable to open logcat', err.stack)
            push.send([
              channel
            , reply.fail('fail')
            ])
          })
      })
      .on(wire.LogcatApplyFiltersMessage, function(channel, message) {
        var reply = wireutil.reply(options.serial)
        plugin.reset(message.filters)
          .then(function() {
            push.send([
              channel
            , reply.okay('success')
            ])
          })
          .catch(function(err) {
            log.error('Failed to apply logcat filters', err.stack)
            push.send([
              channel
            , reply.fail('fail')
            ])
          })
      })
      .on(wire.LogcatStopMessage, function(channel, message) {
        var reply = wireutil.reply(options.serial)
        plugin.stop(message.appId)
          .then(function() {
            push.send([
              channel
            , reply.okay('success')
            ])
          })
          .catch(function(err) {
            log.error('Failed to stop logcat', err.stack)
            push.send([
              channel
            , reply.fail('fail')
            ])
          })
      })

    return plugin
  })
