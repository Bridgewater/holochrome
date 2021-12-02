(function() {
    var s = document.createElement('script');
    // DEPRECATION: chrome.extension.getURL is deprecated in Manifest v3
    //   see full details here: https://developer.chrome.com/docs/extensions/mv3/intro/mv3-migration/
    s.src = chrome.extension.getURL('disableReload.js');
    s.onload = function() {
        this.parentNode.removeChild(this);
    };
    (document.head || document.documentElement).appendChild(s);
})()
