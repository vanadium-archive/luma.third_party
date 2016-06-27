var util = require('util')
var path = require('path')
var fs = require('fs')
var mkdirp = require('mkdirp')

var FINAL_SCREEN_SHOT_DIR = path.join(appRoot, "/../screen_shots/")
mkdirp.sync(FINAL_SCREEN_SHOT_DIR)

function FrameStore() {
  this.sessionImgCountMap = {};
}

FrameStore.prototype.storeFrame = function(frame, sessionId) {
  if (this.sessionImgCountMap[sessionId]) {
    this.sessionImgCountMap[sessionId] += 1;
  } else {
    this.sessionImgCountMap[sessionId] = 1;
  }

  var sessionImgNumber = this.sessionImgCountMap[sessionId];
  var fileName = util.format('%s_%s_%d.jpg', sessionId, sessionImgNumber,
    Date.now());
  var filePath = path.join(FINAL_SCREEN_SHOT_DIR, fileName)

  fs.writeFile(filePath, frame, function(err) {
    if (err) {
      console.log(err);
    }
  });

  return fileName;
}

module.exports = FrameStore
