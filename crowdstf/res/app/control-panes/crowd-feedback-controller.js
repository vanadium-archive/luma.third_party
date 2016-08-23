const MILLIS_PER_SEC = 1000;
const SECS_PER_MIN = 60;
const MILLIS_PER_MIN = SECS_PER_MIN * MILLIS_PER_SEC;

module.exports = function($scope, $interval, CrowdFeedbackService) {
  $scope.hitAccounts = window.stfConfig.hitAccounts || {};

  $scope.exitSession = function() {
    var serial;
    var hashArr = window.location.hash.split('/');
    if (hashArr.length >= 3) {
      serial = hashArr[2];
      CrowdFeedbackService.expireSerial(serial);
    } else {
      console.error('Missing serial for expiration.');
    }
  };

  CrowdFeedbackService.fetchTokenMetaData().then(function success(response) {
    var token = response.data;
    if (!token) {
      console.error('Failed to load token metadata.');
      return;
    }

    $scope.appId = token.appId;
    var expireMinutes = token.expireMinutes;
    var activeTimeStart = token.activeTimeStart;
    if (activeTimeStart) {
      $scope.taskTime = expireMinutes;

      // Continuously update minutes and seconds until token expires.
      $interval(function() {
        var nowTS = new Date().getTime();
        var endTS = activeTimeStart + (expireMinutes * MILLIS_PER_MIN);
        var diffMillis = Math.floor((endTS - nowTS) / MILLIS_PER_SEC);

        $scope.seconds = diffMillis % SECS_PER_MIN;
        $scope.minutes = (diffMillis - $scope.seconds) / SECS_PER_MIN;
      }.bind(this), MILLIS_PER_SEC);
    }
  }, function err(err) {
    console.error('Error fetching tokens', err);
  });
};
