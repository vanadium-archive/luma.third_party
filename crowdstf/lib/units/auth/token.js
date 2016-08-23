var http = require('http');

var express = require('express');
var validator = require('express-validator');
var cookieSession = require('cookie-session');
var bodyParser = require('body-parser');
var csrf = require('csurf');
var Promise = require('bluebird');
var basicAuth = require('basic-auth');
var request = require('request');

var logger = require('../../util/logger');
var requtil = require('../../util/requtil');
var jwtutil = require('../../util/jwtutil');
var pathutil = require('../../util/pathutil');
var urlutil = require('../../util/urlutil');
var lifecycle = require('../../util/lifecycle');
var dbapi = require('../../db/api');

const JWT_EXPIRE_LENGTH = 24 * 3600;
const DEFAULT_EXPIRE_MINS = 5.0;
const MILLIS_IN_ONE_MINUTE = 60 * 1000;

module.exports = function(options) {
  var log = logger.createLogger('auth-token');
  var app = express();
  var server = Promise.promisifyAll(http.createServer(app));

  lifecycle.observe(function() {
    log.info('Waiting for client connections to end');
    return server.closeAsync();
  });

  var basicAuthMiddleware = function(req, res, next) {
    function unauthorized(res) {
      res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
      return res.send(401);
    }

    var user = basicAuth(req);

    if (!user || !user.name || !user.pass) {
      return unauthorized(res);
    }

    if (user.name === options.mock.basicAuth.username &&
        user.pass === options.mock.basicAuth.password
    ) {
      return next();
    }
    else {
      return unauthorized(res);
    }
  };

  app.set('strict routing', true);
  app.set('case sensitive routing', true);

  app.use(cookieSession({
    name: options.ssid,
    keys: [options.secret]
  }));
  app.use(bodyParser.json());
  app.use(csrf());
  app.use(validator());

  app.use(function(req, res, next) {
    res.cookie('XSRF-TOKEN', req.csrfToken());
    next();
  });

  if (options.mock.useBasicAuth) {
    app.use(basicAuthMiddleware);
  }

  var resetSession = function(req, res) {
    res.clearCookie('XSRF-TOKEN');
    res.clearCookie('ssid');
    res.clearCookie('ssid.sig');
    res.redirect('/task-end');
  };

  app.get('/auth/token', resetSession);
  app.get('/auth/token/', resetSession);
  app.get('/auth/token/:token', function(req, res) {
    res.clearCookie('XSRF-TOKEN');
    res.clearCookie('ssid');
    res.clearCookie('ssid.sig');
    var token = req.params.token;
    if (token) {
      // Check if token is in db and is valid.
      dbapi.getToken(token).then(function(tokenObj) {
        if (tokenObj && tokenObj.status === 'unused') {
          var log = logger.createLogger('auth-token');
          log.setLocalIdentifier(req.ip);

          log.info('Authenticated token "%s"', tokenObj.token);
          var jwtOptions = {
            payload: {
              email: token,
              name: 'token'
            },
            secret: options.secret,
            header: {
              exp: Date.now() + JWT_EXPIRE_LENGTH
            }
          };
          var jwtToken = jwtutil.encode(jwtOptions);

          var authRedirURL = urlutil.addParams(options.appUrl, {
            jwt: jwtToken,
            serial: tokenObj.serial
          });

          tokenObj.jwtToken = jwtToken;
          tokenObj.jwtOptions = jwtOptions;
          tokenObj.status = 'active';
          tokenObj.activeTimeStart = Date.now();
          tokenObj.activeIP = req.ip;

          if (tokenObj.expireMinutes) {
            tokenObj.expireMinutes = parseFloat(tokenObj.expireMinutes);
          } else {
            tokenObj.expireMinutes = DEFAULT_EXPIRE_MINS;
          }

          setTimeout(function() {
            console.log('Kicking user, reached timeout for token',
                        tokenObj.token);
            request.delete(options.appUrl + '/app/api/v1/token/' +
                    tokenObj.token + '?authed=true',
                    function(err, res) {
                      if (err) {
                        log.error('Error kicking user token ', tokenObj.token,
                            err.stack);
                      }
                    });
          }, tokenObj.expireMinutes * MILLIS_IN_ONE_MINUTE);

          dbapi.updateToken(tokenObj).then(function() {
            log.info('Marked token "%s" active', tokenObj.token);
          });

          log.info('Issuing auth redirect to "%s"', authRedirURL);
          res.redirect(authRedirURL);
        }
        else {
          return resetSession(req, res);
        }
      }).catch(function(err) {
        log.error('Failed to load token "%s": ', token, err.stack);
        return res.redirect('/task-end');
      });
    } else {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        validationErrors: ['No token provided']
      });
    }
  });

  app.get('/auth/token-google', function(req, res) {
    res.clearCookie('XSRF-TOKEN');
    res.clearCookie('ssid');
    res.clearCookie('ssid.sig');
    var log = logger.createLogger('auth-token');
    log.setLocalIdentifier(req.ip);

    log.info('Authenticated Admin Token Google');
    var jwtOptions = {
      payload: {
        email: 'google@google.com',
        name: 'google'
      },
      secret: options.secret,
      header: {
        exp: Date.now() + 24 * 3600
      }
    };
    var jwtToken = jwtutil.encode(jwtOptions);

    var authRedirURL = urlutil.addParams(options.appUrl + '#!/devices-home', {
      jwt: jwtToken
    });

    log.info('Issuing auth redirect to "%s"', authRedirURL);
    res.redirect(authRedirURL);
  });

  server.listen(options.port);
  log.info('Listening on port %d', options.port);
};
