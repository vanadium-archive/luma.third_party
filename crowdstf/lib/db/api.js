var r = require('rethinkdb')
var util = require('util')

var db = require('./')
var wireutil = require('../wire/util')

var dbapi = Object.create(null)

const MIN_TOKEN_LEN = 20;

db.connect().then(function(conn) {
  r.table('kicks').changes().run(conn, function(err, cursor) {
    if (!cursor) {
      return;
    }

    cursor.each(function(err, item) {
      if (dbapi.kickCallback) {
        dbapi.kickCallback(item.new_val.serial);
      }
    });
  });
});

dbapi.DuplicateSecondaryIndexError = function DuplicateSecondaryIndexError() {
  Error.call(this)
  this.name = 'DuplicateSecondaryIndexError'
  Error.captureStackTrace(this, DuplicateSecondaryIndexError)
}

util.inherits(dbapi.DuplicateSecondaryIndexError, Error)

dbapi.close = function(options) {
  return db.close(options)
}

dbapi.saveUserAfterLogin = function(user) {
  return db.run(r.table('users').get(user.email).update({
      name: user.name
    , ip: user.ip
    , lastLoggedInAt: r.now()
    }))
    .then(function(stats) {
      if (stats.skipped) {
        return db.run(r.table('users').insert({
          email: user.email
        , name: user.name
        , ip: user.ip
        , group: wireutil.makePrivateChannel()
        , lastLoggedInAt: r.now()
        , createdAt: r.now()
        , forwards: []
        , settings: {}
        }))
      }
      return stats
    })
}

dbapi.loadUser = function(email) {
  return db.run(r.table('users').get(email))
}

dbapi.deleteUser = function(email) {
  return db.run(r.table('users').get(email).delete());
};

dbapi.updateUserSettings = function(email, changes) {
  return db.run(r.table('users').get(email).update({
    settings: changes
  }))
}

dbapi.resetUserSettings = function(email) {
  return db.run(r.table('users').get(email).update({
    settings: r.literal({})
  }))
}

dbapi.insertUserAdbKey = function(email, key) {
  return db.run(r.table('users').get(email).update({
    adbKeys: r.row('adbKeys').default([]).append({
      title: key.title
    , fingerprint: key.fingerprint
    })
  }))
}

dbapi.deleteUserAdbKey = function(email, fingerprint) {
  return db.run(r.table('users').get(email).update({
    adbKeys: r.row('adbKeys').default([]).filter(function(key) {
      return key('fingerprint').ne(fingerprint)
    })
  }))
}

dbapi.lookupUsersByAdbKey = function(fingerprint) {
  return db.run(r.table('users').getAll(fingerprint, {
    index: 'adbKeys'
  }))
}

dbapi.lookupUserByAdbFingerprint = function(fingerprint) {
  return db.run(r.table('users').getAll(fingerprint, {
      index: 'adbKeys'
    })
    .pluck('email', 'name', 'group'))
    .then(function(cursor) {
      return cursor.toArray()
    })
    .then(function(groups) {
      switch (groups.length) {
        case 1:
          return groups[0]
        case 0:
          return null
        default:
          throw new Error('Found multiple users for same ADB fingerprint')
      }
    })
}

dbapi.lookupUserByVncAuthResponse = function(response, serial) {
  return db.run(r.table('vncauth').getAll([response, serial], {
      index: 'responsePerDevice'
    })
    .eqJoin('userId', r.table('users'))('right')
    .pluck('email', 'name', 'group'))
    .then(function(cursor) {
      return cursor.toArray()
    })
    .then(function(groups) {
      switch (groups.length) {
        case 1:
          return groups[0]
        case 0:
          return null
        default:
          throw new Error('Found multiple users with the same VNC response')
      }
    })
}

dbapi.loadGroup = function(email) {
  return db.run(r.table('devices').getAll(email, {
    index: 'owner'
  }))
}

dbapi.saveDeviceLog = function(serial, entry) {
  return db.run(r.table('logs').insert({
      serial: entry.serial
    , timestamp: r.epochTime(entry.timestamp)
    , priority: entry.priority
    , tag: entry.tag
    , pid: entry.pid
    , message: entry.message
    }
  , {
      durability: 'soft'
    }))
}

/**
 * Persists android device events
 * @example
 *   dbapi.saveDeviceEvent(eventObj)
 *   .then(function(result) {
 *     console.log("Saved", result.inserted, "device events");
 *   })
 *   .catch(function(err){
 *     throw err;
 *   })
 * @returns {Promise} Returns a promise with RethinkDB result
 */
dbapi.saveDeviceEvent = function(deviceEvent) {
  return db.run(r.table('deviceEvents').insert(deviceEvent, {
    durability: 'soft'
  }));
};

dbapi.saveDeviceInitialState = function(serial, device) {
  var data = {
    present: false
  , presenceChangedAt: r.now()
  , provider: device.provider
  , owner: null
  , status: device.status
  , statusChangedAt: r.now()
  , ready: false
  , reverseForwards: []
  }
  return db.run(r.table('devices').get(serial).update(data))
    .then(function(stats) {
      if (stats.skipped) {
        data.serial = serial
        data.createdAt = r.now()
        return db.run(r.table('devices').insert(data))
      }
      return stats
    })
}

dbapi.saveDeviceStatus = function(serial, status) {
  return db.run(r.table('devices').get(serial).update({
    status: status
  , statusChangedAt: r.now()
  }))
}

dbapi.saveLogcat = function(serial, date, logcatMessage) {
  db.run(r.table('devices').get(serial)).then(function(device) {
    if (device && device.owner && device.owner.email) {
      var token = device.owner.email;
      if (token && token.length > MIN_TOKEN_LEN) {
        return db.run(r.table('tokenLogcats').insert({
          token: token,
          logcatMessage: logcatMessage,
          logcatDate: date,
          timestamp: new Date().getTime()
        }));
      }
    }
  });
};

dbapi.getDeviceBySerial = function(serial) {
  return db.run(r.table('devices').get(serial));
};

dbapi.setDeviceOwner = function(serial, owner) {
  return db.run(r.table('devices').get(serial).update({
    owner: owner
  }))
}

dbapi.unsetDeviceOwner = function(serial) {
  return db.run(r.table('devices').get(serial).update({
    owner: null
  }))
}

dbapi.publishKickedSerial = function(serial) {
  return db.run(r.table('kicks').insert({serial: serial}));
};

dbapi.setKickCallback = function(callback) {
  dbapi.kickCallback = callback;
};

dbapi.setDevicePresent = function(serial) {
  return db.run(r.table('devices').get(serial).update({
    present: true
  , presenceChangedAt: r.now()
  }))
}

dbapi.setDeviceAbsent = function(serial) {
  return db.run(r.table('devices').get(serial).update({
    present: false
  , presenceChangedAt: r.now()
  }))
}

dbapi.setDeviceAirplaneMode = function(serial, enabled) {
  return db.run(r.table('devices').get(serial).update({
    airplaneMode: enabled
  }))
}

dbapi.setDeviceBattery = function(serial, battery) {
  return db.run(r.table('devices').get(serial).update({
      battery: {
        status: battery.status
      , health: battery.health
      , source: battery.source
      , level: battery.level
      , scale: battery.scale
      , temp: battery.temp
      , voltage: battery.voltage
      }
    }
  , {
      durability: 'soft'
    }))
}

dbapi.setDeviceBrowser = function(serial, browser) {
  return db.run(r.table('devices').get(serial).update({
    browser: {
      selected: browser.selected
    , apps: browser.apps
    }
  }))
}

dbapi.setDeviceConnectivity = function(serial, connectivity) {
  return db.run(r.table('devices').get(serial).update({
    network: {
      connected: connectivity.connected
    , type: connectivity.type
    , subtype: connectivity.subtype
    , failover: !!connectivity.failover
    , roaming: !!connectivity.roaming
    }
  }))
}

dbapi.setDevicePhoneState = function(serial, state) {
  return db.run(r.table('devices').get(serial).update({
    network: {
      state: state.state
    , manual: state.manual
    , operator: state.operator
    }
  }))
}

dbapi.setDeviceRotation = function(serial, rotation) {
  return db.run(r.table('devices').get(serial).update({
    display: {
      rotation: rotation
    }
  }))
}

dbapi.setDeviceNote = function(serial, note) {
  return db.run(r.table('devices').get(serial).update({
    notes: note
  }))
}

dbapi.setDeviceReverseForwards = function(serial, forwards) {
  return db.run(r.table('devices').get(serial).update({
    reverseForwards: forwards
  }))
}

dbapi.setDeviceReady = function(serial, channel) {
  return db.run(r.table('devices').get(serial).update({
    channel: channel
  , ready: true
  , owner: null
  , reverseForwards: []
  }))
}

dbapi.saveDeviceIdentity = function(serial, identity) {
  return db.run(r.table('devices').get(serial).update({
    platform: identity.platform
  , manufacturer: identity.manufacturer
  , operator: identity.operator
  , model: identity.model
  , version: identity.version
  , abi: identity.abi
  , sdk: identity.sdk
  , display: identity.display
  , phone: identity.phone
  , product: identity.product
  }))
}

dbapi.loadDevices = function() {
  return db.run(r.table('devices'))
}

dbapi.loadPresentDevices = function() {
  return db.run(r.table('devices').getAll(true, {
    index: 'present'
  }))
}

dbapi.loadDevice = function(serial) {
  return db.run(r.table('devices').get(serial))
}

dbapi.saveUserAccessToken = function(email, token) {
  return db.run(r.table('accessTokens').insert({
    email: email
  , id: token.id
  , title: token.title
  , jwt: token.jwt
  }))
}

dbapi.removeUserAccessToken = function(email, title) {
  return db.run(r.table('accessTokens').getAll(email, {
    index: 'email'
  }).filter({title: title}).delete())
}

dbapi.loadAccessTokens = function(email) {
  return db.run(r.table('accessTokens').getAll(email, {
    index: 'email'
  }))
}

dbapi.getToken = function(token) {
  return db.run(r.table('tokens').get(token));
};

dbapi.getAppIdBySerial = function(serial, callback) {
  db.run(r.table('tokens').filter({
      serial: serial
    }
  ).orderBy(r.desc('creationTime')).limit(1)).then(function(cursor) {
    cursor.toArray(function(err, results) {
      if (err || !results.length) {
        return callback('Error fetching app from serial.');
      }

      callback(null, results[0].appId);
    });
  });
};

dbapi.updateToken = function(tokenObj) {
  return db.run(r.table('tokens').get(tokenObj.token).update(tokenObj));
};

dbapi.expireToken = function(token) {
  var serial;

  return dbapi.getToken(token).then(function(tokenObj) {
    if (tokenObj.status !== 'expired') {
      serial = tokenObj.serial;

      return db.run(r.table('tokens').get(token).update({
        status: "expired",
        expiredTime: Date.now()
      }));
    }
  }).then(function() {
    return dbapi.deleteUser(token);
  }).then(function() {
    return dbapi.publishKickedSerial(serial);
  }).then(function() {
    return dbapi.unsetDeviceOwner(serial);
  });
};

module.exports = dbapi
