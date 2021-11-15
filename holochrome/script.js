var federationUrlBase = "https://signin.aws.amazon.com/federation";
var awsConsole = 'https://console.aws.amazon.com/';
var logoutUrl = awsConsole + 'console/logout!doLogout';

var createNotification = function(message) {
  chrome.notifications.create({
    type: "basic",
    title: 'Holochrome',
    message: message,
    iconUrl: 'holochrome-128.png'
  });
};

var request = function(url, callback, isEvent, attempts=0) {

  if (attempts > 2) {
    console.log("Too many attempts. Retrying from beginning.");
    getMyCreds(isEvent);
    return;
  }

  var xhr = new XMLHttpRequest();
  xhr.open("GET", url, true);
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      switch (xhr.status) {
        case 200:
          callback(xhr.responseText);
          break;
        case 400:
          // follow logout redirect, then re-administer login command
          request(logoutUrl,  function(){
            request(url, callback, isEvent, attempts++);
          }, false, attempts++);
          break;
        case 0:
          var errorMessage = "The instance metadata service could not be reached.";
          console.log(errorMessage);
          if (isEvent) {
            createNotification(errorMessage);
          }
          break;
        case 500:
          var errorMessage = "Cannot find IAM role. Are you on a machine with an instance profile?";
          console.log(errorMessage);
          if (isEvent) {
            createNotification(errorMessage);
          }
          break;
        default:
          break;
      }
    }
  };
  console.log('Making HTTP request to: ' + url);
  xhr.send();
}

var getSigninToken = function(creds, isEvent) {
  var signinTokenUrl = federationUrlBase
                        + '?Action=getSigninToken'
                        + '&SessionDuration=43200'
                        + '&Session=' + encodeURIComponent(JSON.stringify(creds));
  var onComplete = function(response) {
      response = JSON.parse(response);
      getSessionCookies(response['SigninToken'], isEvent);
  };
  request(signinTokenUrl, onComplete, isEvent);
};

var getSessionCookies = function(signinToken, isEvent) {
  var federationUrl = federationUrlBase
                        + '?Action=login'
                        + '&Issuer=holochrome'
                        + '&Destination=' + encodeURIComponent(awsConsole)
                        + '&SigninToken=' + signinToken;
  var onComplete = function(response) {
    openTabWithConsole(isEvent);
  };
  request(federationUrl, onComplete, isEvent);
};

var getMyCreds = function(isEvent){
  var metadataUrl = "http://169.254.169.254/latest/meta-data/iam/security-credentials/";
  var onComplete = function(response) {
      profileName = response.split("\n")[0]; // a bit of a hack, but everyone does it :(
      getMyCredsFromProfile(isEvent, profileName);
  };
  request(metadataUrl, onComplete, isEvent);
}

var getMyCredsFromProfile = function(isEvent, profileName){
  var metadataUrl = "http://169.254.169.254/latest/meta-data/iam/security-credentials/" + profileName;
  var onComplete = function(response) {
      response = JSON.parse(response);
      var myCreds = {
        'sessionId': response["AccessKeyId"],
        'sessionKey': response["SecretAccessKey"],
        'sessionToken': response["Token"]
      };
      getSigninToken(myCreds, isEvent);
  };
  request(metadataUrl, onComplete, isEvent);
}

var openTabWithConsole = function(isEvent){
  if(isEvent) {
    chrome.windows.getLastFocused(function(window){
      chrome.windows.update(window.id,
      {
        focused: true
      });
      chrome.tabs.create(
        {
          windowId: window.id,
          url: awsConsole,
          active: true
        });
    });
  }
}

var eventTriggered = function(arg) {
  console.log("Event received.");
  getMyCreds(true);
};

chrome.commands.onCommand.addListener(eventTriggered);

chrome.browserAction.onClicked.addListener(eventTriggered);

var init = (function(){
  getMyCreds(false);
  // TODO: Make the refresh period a user input
  // 10 hour timeout (10 hours * 60 minutes * 60 seconds * 1000 ms)
  const timeoutMilliseconds = 10 * 60 * 60 * 1000;
  setInterval(getMyCreds, timeoutMilliseconds, false);
})();


