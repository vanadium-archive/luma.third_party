var wire = require('../../wire');
var net = require('net');

function LayoutCaptureService() {
  this.actionQueue = [];
}

LayoutCaptureService.prototype.enqueue = function(wireEvent, actionFn,
                                                  fetchView) {
  this.actionQueue.push({
    wireEvent: wireEvent,
    actionFn: actionFn,
    fetchView: fetchView
  });
  this.checkStartCaptures(wireEvent);
};

LayoutCaptureService.prototype.dequeue = function() {
  if (this.actionQueue.length > 0) {
    return this.actionQueue.shift();
  } else {
    return null;
  }
};

LayoutCaptureService.prototype.checkStartCaptures = function() {
  if (this.actionQueue.length > 0 && !this.processing) {
    this.processing = true;
    layoutCaptureService.processStr = '';
    var nextItem = function() {
      var eventActionObj = layoutCaptureService.dequeue();
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
        layoutCaptureService.processing = false;
      }
    };

    nextItem();
  }
};

var layoutCaptureService = new LayoutCaptureService();
module.exports = layoutCaptureService;
