module.exports = function CrowdFeedbackService($http) {
  var service = {};

  service.fetchTokenMetaData = function() {
    return $http.get('/app/api/v1/token/~');
  };

  service.expireSerial = function(serial) {
    if (!serial) {
      return;
    }
    return $http.delete('/app/api/v1/token?serial=' + serial);
  };

  return service;
};
