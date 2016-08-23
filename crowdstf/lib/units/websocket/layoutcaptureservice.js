var wire = require('../../wire');
var net = require('net');
var logger = require('../../util/logger');
var log = logger.createLogger('layoutcaptureservice');

function LayoutCaptureService() {
  this.serialActions = {};
  this.serialProcessing = {};
}

LayoutCaptureService.prototype.enqueue = function(wireEvent, actionFn,
                                                  fetchView, serial) {
  if (!serial) {
    log.warn('No serial provided for wire event %s', wireEvent);
    return actionFn();
  }

  if (!this.serialActions[serial]) {
    this.serialActions[serial] = [];
  }

  this.serialActions[serial].push({
    wireEvent: wireEvent,
    actionFn: actionFn,
    fetchView: fetchView
  });
  this.checkStartCaptures(serial);
};

LayoutCaptureService.prototype.dequeue = function(serial) {
  if (!this.validSerialQueue(serial)) {
    return;
  }

  if (this.serialActions[serial].length > 0) {
    return this.serialActions[serial].shift();
  } else {
    return null;
  }
};

LayoutCaptureService.prototype.checkStartCaptures = function(serial) {
  if (!this.validSerialQueue(serial)) {
    return;
  }

  if (this.serialActions[serial].length > 0 && !this.serialProcessing[serial]) {
    this.serialProcessing[serial] = true;
    layoutCaptureService.processStr = '';
    var nextItem = function() {
      var eventActionObj = layoutCaptureService.dequeue(serial);
      if (eventActionObj) {
        layoutCaptureService.processStr += ' (' +
            eventActionObj.wireEvent.$code + ') ';
        if (eventActionObj.wireEvent === wire.GestureStartMessage) {
          eventActionObj.fetchView(function(err, layoutJSON) {
            if (err) {
              console.error(err);
            } else {
              eventActionObj.actionFn(layoutJSON);
              nextItem();
            }
          });
        } else {
          eventActionObj.actionFn();
          nextItem();
        }
      } else {
        layoutCaptureService.serialProcessing[serial] = false;
      }
    };

    nextItem();
  }
};

LayoutCaptureService.prototype.validSerialQueue = function(serial) {
  if (serial) {
    if (this.serialActions[serial]) {
      return true;
    } else {
      log.error('Serial queue not found for serial: %s', serial);
      return false;
    }
  } else {
    log.error('Missing serial for dequeue action: %s');
    return false;
  }
};

LayoutCaptureService.prototype.resetSerial = function(serial) {
  if (serial) {
    this.serialActions[serial] = [];
  }
};

var layoutCaptureService = new LayoutCaptureService();
module.exports = layoutCaptureService;
