var wire = require('../../wire')

function LayoutCaptureService() {
  this.actionQueue = [];
}

LayoutCaptureService.prototype.enqueue = function(wireEvent, actionFn) {
  this.actionQueue.push({
    wireEvent: wireEvent,
    actionFn: actionFn
  });
  this.checkStartCaptures(wireEvent);
}

LayoutCaptureService.prototype.dequeue = function() {
  if (this.actionQueue.length > 0) {
    return this.actionQueue.shift();
  } else {
    return null;
  }
}

LayoutCaptureService.prototype.checkStartCaptures = function() {
  if (this.actionQueue.length > 0 && !this.processing) {
    this.processing = true;
    this.processStr = "";
    var nextItem = function() {
      var eventActionObj = layoutCaptureService.dequeue();
      if (eventActionObj) {
        layoutCaptureService.processStr += " (" +
          eventActionObj.wireEvent.$code + ") ";
        if (eventActionObj.wireEvent === wire.GestureStartMessage) {
          console.log("Queueing gesture-start event")

          layoutCaptureService.fetchLayout(function(err, res) {
            if (err) {
              console.error(err);
            } else {
              eventActionObj.actionFn(res)
              nextItem()
            }
          });
        } else {
          if (eventActionObj.wireEvent === wire.GestureStopMessage) {
            console.log("Queueing gesture-stop event")
          }

          eventActionObj.actionFn()
          nextItem()
        }
      } else {
        layoutCaptureService.processing = false;
      }
    }

    nextItem();
  }
}

LayoutCaptureService.prototype.fetchLayout = function(callback) {
  //TODO(hibschman@): swap out this delay simulation stub with Device XML Fetch
  var rand = Math.floor(Math.random() * (300 - 100 + 1) + 100);
  console.log("Delay", rand, "millis")
  setTimeout(function() {
    callback(null, "<xml layout='mock'></xml>");
  }, rand)
};

var layoutCaptureService = new LayoutCaptureService();
module.exports = layoutCaptureService;
