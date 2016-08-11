var dbapi = require('../../db/api');

function DeviceEventStore() {
}

DeviceEventStore.prototype.storeEvent = function(eventName, eventData) {
  var imgId = eventData.imgId;
  var serial = eventData.serial;
  var timestamp = eventData.timestamp;
  var sessionId = eventData.wsId;
  var userEmail = eventData.userEmail;
  var userGroup = eventData.userGroup;
  var userIP = eventData.userIP;
  var userLastLogin = eventData.userLastLogin;
  var userName = eventData.userName;
  var viewHierarchy = eventData.viewHierarchy;

  dbapi.saveDeviceEvent(serial, sessionId, eventName, imgId, timestamp,
      eventData.seq, eventData.contact, eventData.x, eventData.y,
      eventData.pressure, userEmail, userGroup, userIP, userLastLogin,
      userName, viewHierarchy);
};

module.exports = DeviceEventStore;
