var util = require('util')

var syrup = require('stf-syrup')
var ProtoBuf = require('protobufjs')
var semver = require('semver')
var adbkit = require('adbkit');
var request = require('request');
var viewBridgePorts = require('../viewbridgeports');

var pathutil = require('../../../util/pathutil')
var streamutil = require('../../../util/streamutil')
var promiseutil = require('../../../util/promiseutil')
var logger = require('../../../util/logger')

module.exports = syrup.serial()
  .dependency(require('../support/adb'))
  .define(function(options, adb) {
    var log = logger.createLogger('device:resources:service')
    var builder = ProtoBuf.loadProtoFile(
      pathutil.vendor('STFService/wire.proto'))

    var resource = {
      requiredVersion: '1.0.2'
    , pkg: 'jp.co.cyberagent.stf'
    , main: 'jp.co.cyberagent.stf.Agent'
    , apk: pathutil.vendor('STFService/STFService.apk')
    , wire: builder.build().jp.co.cyberagent.stf.proto
    , builder: builder
    , startIntent: {
        action: 'jp.co.cyberagent.stf.ACTION_START'
      , component: 'jp.co.cyberagent.stf/.Service'
      }
    }

    function initViewServer() {
      log.info('Running CMD: adb shell dumpsys activity start-view-server');
      adb.shell(options.serial, 'dumpsys activity start-view-server')
          .then(adbkit.util.readAll)
          .then(function(output) {
            log.info('Success starting view server, messages: [%s]',
                output.toString().trim());
          });
    }

    function forwardTcpXml() {
      log.info('Creating adb tcp view bridge port forward.');
      var localPort = 'tcp:' + viewBridgePorts[options.serial] ||
          viewBridgePorts.default;
      var remotePort = 'tcp:' + viewBridgePorts.ANDROID_REMOTE;

      // Remove any existing forwards per serial, then add new forward.
      adb.shell(options.serial, 'forward --remove ' + localPort)
          .then(function() {
            log.info('Success removing ports for device %s', options.serial);
            adb.forward(options.serial, localPort, remotePort)
                .then(function(output) {
                  log.info('Forwarded tcp xml port %s, messages: [%s]',
                      localPort,
                      output.toString().trim());
                });
          });
    }

    function getPath() {
      return adb.shell(options.serial, ['pm', 'path', resource.pkg])
        .timeout(10000)
        .then(function(out) {
          return streamutil.findLine(out, (/^package:/))
            .timeout(15000)
            .then(function(line) {
              return line.substr(8)
            })
        })
    }

    function install() {
      log.info('Checking whether we need to install STFService')
      return getPath()
        .then(function(installedPath) {
          log.info('Running version check')
          return adb.shell(options.serial, util.format(
            "export CLASSPATH='%s';" +
            " exec app_process /system/bin '%s' --version 2>/dev/null"
          , installedPath
          , resource.main
          ))
          .timeout(10000)
          .then(function(out) {
            return streamutil.readAll(out)
              .timeout(10000)
              .then(function(buffer) {
                var version = buffer.toString()
                if (semver.satisfies(version, resource.requiredVersion)) {
                  return installedPath
                }
                else {
                  throw new Error(util.format(
                    'Incompatible version %s'
                  , version
                  ))
                }
              })
          })
        })
        .catch(function() {
          log.info('Installing STFService')
          // Uninstall first to make sure we don't have any certificate
          // issues.
          return adb.uninstall(options.serial, resource.pkg)
            .timeout(15000)
            .then(function() {
              return promiseutil.periodicNotify(
                  adb.install(options.serial, resource.apk)
                , 20000
                )
                .timeout(65000)
            })
            .progressed(function() {
              log.warn(
                'STFService installation is taking a long time; ' +
                'perhaps you have to accept 3rd party app installation ' +
                'on the device?'
              )
            })
            .then(function() {
              return getPath()
            })
        })
    }

    initViewServer();
    forwardTcpXml();
    return install()
      .then(function(path) {
        log.info('STFService up to date')
        resource.path = path
        return resource
      })
  })
