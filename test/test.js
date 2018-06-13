var expect = require('expect');
var sinon = require('sinon');

describe('holochrome', function(){
  beforeEach(() => {
    global.chrome = require('sinon-chrome');
    createFakeXhr();
    numCycles = 0;
  });

  afterEach(() => {
    xhr.restore();
    global.chrome.reset();
  });

  var createFakeXhr = function() {
    xhr = sinon.useFakeXMLHttpRequest();
    global.XMLHttpRequest = xhr;
    requests = [];
    xhr.onCreate = (xhr) => {
      requests.push(xhr);
    };
  };

  var createCompleteXhrResponse = function(){
    var totalRequiredRequests = 4;
    var numAttempts = numCycles * totalRequiredRequests;
    numCycles++;
    expect(requests.length).toBe(numAttempts+1);
    expect(requests[numAttempts+0].method).toBe('GET');
    expect(requests[numAttempts+0].url).toBe('http://169.254.169.254/latest/meta-data/iam/security-credentials/');
    requests[numAttempts+0].respond(200, {}, 'iam-role-name\n');

    expect(requests.length).toBe(numAttempts+2);
    expect(requests[numAttempts+1].method).toBe('GET');
    expect(requests[numAttempts+1].url).toBe('http://169.254.169.254/latest/meta-data/iam/security-credentials/iam-role-name');
    requests[numAttempts+1].respond(200, {}, JSON.stringify({
      'AccessKeyId': 'omg',
      'SecretAccessKey': 'such',
      'Token': 'wow'
    }));

    expect(requests.length).toBe(numAttempts+3);
    expect(requests[numAttempts+2].method).toBe('GET');
    expect(requests[numAttempts+2].url).toBe('https://signin.aws.amazon.com/federation?Action=getSigninToken&SessionDuration=43200&Session=%7B%22sessionId%22%3A%22omg%22%2C%22sessionKey%22%3A%22such%22%2C%22sessionToken%22%3A%22wow%22%7D');
    requests[numAttempts+2].respond(200, {}, JSON.stringify({
      'SigninToken':'token'
    }));

    expect(requests.length).toBe(numAttempts+4);
    expect(requests[numAttempts+3].method).toBe('GET');
    expect(requests[numAttempts+3].url).toBe('https://signin.aws.amazon.com/federation?Action=login&Issuer=holochrome&Destination=https%3A%2F%2Fconsole.aws.amazon.com%2F&SigninToken=token');
    // TODO: set cookie?
    requests[numAttempts+3].respond(200, {}, '');
  }

  var loadHolochrome = function(){
    var scriptPath = '../holochrome/script.js'
    delete require.cache[require.resolve(scriptPath)];
    chrome.commands.onCommand._listeners = []
    chrome.browserAction.onClicked._listeners = []
    holochrome = require(scriptPath);
    createCompleteXhrResponse();
    return holochrome
  };


  it("loads a cookie upon init", function(){
    loadHolochrome();
  });

  it("doesn't open a tab upon init", function(){
    loadHolochrome();
    expect(chrome.tabs.create.called).toBeFalsy();
  });

  it("should attach the same event listener on init", function () {
    loadHolochrome();
    expect(chrome.commands.onCommand.addListener.calledOnce).toBeTruthy();
    expect(chrome.browserAction.onClicked.addListener.calledOnce).toBeTruthy();
    expect(chrome.browserAction.onClicked._listeners).toEqual(chrome.commands.onCommand._listeners);
  });

  it("brings chrome into focus on event", function(){
    chrome.windows.getLastFocused.yields({
      'id': 1
    });
    loadHolochrome();
    chrome.commands.onCommand.trigger();
    createCompleteXhrResponse();
    expect(chrome.windows.update.withArgs(1, {focused:true}).calledOnce).toBeTruthy();
  });

  it("opens an active tab on event", function(){
    chrome.windows.getLastFocused.yields({
      'id': 1
    });
    loadHolochrome();
    chrome.browserAction.onClicked.trigger();
    createCompleteXhrResponse();
    expect(chrome.tabs.create.withArgs({
      windowId: 1,
      url: 'https://console.aws.amazon.com/',
      active: true
    }).calledOnce).toBeTruthy();
  });

  it("creates error notification if it can't find the metadata service", function(){
    loadHolochrome();
    chrome.browserAction.onClicked.trigger();
    expect(requests[4].url).toBe('http://169.254.169.254/latest/meta-data/iam/security-credentials/');
    requests[4].respond(0, {}, '');
    expect(chrome.notifications.create.calledOnce).toBeTruthy();
  });

  it("creates error notification if it can't find an IAM role", function(){
    loadHolochrome();
    chrome.browserAction.onClicked.trigger();
    expect(requests[4].url).toBe('http://169.254.169.254/latest/meta-data/iam/security-credentials/');
    requests[4].respond(200, {}, 'non-existent-role\n');
    expect(requests[5].url).toBe('http://169.254.169.254/latest/meta-data/iam/security-credentials/non-existent-role');
    requests[5].respond(500, {}, '');
    expect(chrome.notifications.create.calledOnce).toBeTruthy();
  });

  it("doesn't display a notification if it fails to refresh in the background", function(){
    global.clock = sinon.useFakeTimers();
    loadHolochrome();
    global.clock.tick(1200000);
    expect(requests[4].url).toBe('http://169.254.169.254/latest/meta-data/iam/security-credentials/');
    requests[4].respond(0, {}, '');
    expect(chrome.notifications.create.notCalled).toBeTruthy();
    global.clock = sinon.restore();
  });

  it("automatically logs out and back in when switching accounts", function(){
    loadHolochrome();
    chrome.commands.onCommand.trigger();
    // this is basically just testing the logic of retrying the most recent
    // request when receiving a 400
    // i use the original request to the metadata service here to reduce testing complexity
    requests[4].respond(400, {}, '');
    expect(requests[5].url).toBe('https://console.aws.amazon.com/console/logout!doLogout');
    requests[5].respond(200, {}, '');
    expect(requests[6].url).toBe('http://169.254.169.254/latest/meta-data/iam/security-credentials/');
  });
});


