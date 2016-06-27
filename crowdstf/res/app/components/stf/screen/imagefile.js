function ImageFile() {
  this.nextImgId = ""
  this.deviceSerial = ""
}

ImageFile.prototype.getNextImgId = function() {
  return this.nextImgId;
}

ImageFile.prototype.setNextImgId = function(nextImgId) {
  this.nextImgId = nextImgId;
}

ImageFile.prototype.getCurrentDeviceSerial = function() {
  return this.deviceSerial;
}

ImageFile.prototype.setCurrentDeviceSerial = function(deviceSerial) {
  this.deviceSerial = deviceSerial;
}

module.exports = new ImageFile()
