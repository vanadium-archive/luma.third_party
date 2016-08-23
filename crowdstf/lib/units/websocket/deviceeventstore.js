var dbapi = require('../../db/api');
var log = require('../../util/logger').createLogger('websocket:event:store');

function DeviceEventStore() {
}

DeviceEventStore.prototype.storeEvent = function(eventName, eventData) {
  if (!eventData || !eventData.imgId || !eventData.userEmail) {
    log.error('Missing critical event data, ignoring save event on %s:%s',
        eventName,
        JSON.stringify(eventData));
    return;
  }

  // Transform attribute names for db and convert undefined's to nulls.
  // Strictly check numeric undefined's.
  var deviceEvent = {
    serial: eventData.serial,
    sessionId: eventData.wsId,
    eventName: eventName,
    imgId: eventData.imgId,
    timestamp: eventData.timestamp,
    userEmail: eventData.userEmail,
    userGroup: eventData.userGroup,
    userIP: eventData.userIP,
    userLastLogin: eventData.userLastLogin,
    userName: eventData.userName,
    seq: eventData.seq === undefined ? null : eventData.seq,
    x: eventData.x === undefined ? null : eventData.x,
    y: eventData.y === undefined ? null : eventData.y,
    pressure: eventData.pressure === undefined ? null : eventData.pressure,
    viewHierarchy: eventData.viewHierarchy ? eventData.viewHierarchy : null
  };

  dbapi.saveDeviceEvent(deviceEvent).catch(function(err) {
    log.error('Failed save attempt on %s:%s',
        eventName,
        JSON.stringify(eventData), err);
  });

};

module.exports = DeviceEventStore;
