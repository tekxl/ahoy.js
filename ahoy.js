/*
 * Ahoy.js
 * Simple, powerful JavaScript analytics
 * https://github.com/ankane/ahoy.js
 * v0.1.0
 * MIT License
 */

/*jslint browser: true, indent: 2, plusplus: true, vars: true */

(function (window) {
  "use strict";

  window.__ = window.__ || {};
  var ahoy = window.__.Analytics || {};
  var $ = window.jQuery || window.Zepto || window.$;
  var visitId, visitorId, track;
  var visitTtl = 4 * 60; // 4 hours
  var visitorTtl = 2 * 365 * 24 * 60; // 2 years
  var userTtl = visitorTtl; // 2 years
  var isReady = false;
  var queue = [];
  var canStringify = typeof(JSON) !== "undefined" && typeof(JSON.stringify) !== "undefined";
  var eventQueue = [];
  var page = ahoy.page || window.location.pathname;
  var visitsUrl = '/ahoy/visits';
  var eventsUrl = '/ahoy/events';
  var userPrefs = {};
  var api_key = null;
  var enabled = false;

  // cookies

  // http://www.quirksmode.org/js/cookies.html
  function setCookie(name, value, ttl) {
    var expires = "";
    var cookieDomain = "";
    if (ttl) {
      var date = new Date();
      date.setTime(date.getTime() + (ttl * 60 * 1000));
      expires = "; expires=" + date.toGMTString();
    }
    if (ahoy.domain) {
      cookieDomain = "; domain=" + ahoy.domain;
    }
    document.cookie = name + "=" + escape(value) + expires + cookieDomain + "; path=/";
  }

  function getCookie(name) {
    var i, c;
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for (i = 0; i < ca.length; i++) {
      c = ca[i];
      while (c.charAt(0) === ' ') {
        c = c.substring(1, c.length);
      }
      if (c.indexOf(nameEQ) === 0) {
        return unescape(c.substring(nameEQ.length, c.length));
      }
    }
    return null;
  }

  function destroyCookie(name) {
    setCookie(name, "", -1);
  }

  function log(message) {
    if (getCookie("ahoy_debug")) {
      window.console.log(message);
    }
  }

  function setReady() {
    var callback;
    while (callback = queue.shift()) {
      callback();
    }
    isReady = true;
  }

  function ready(callback) {
    if (isReady) {
      callback();
    } else {
      queue.push(callback);
    }
  }

  // http://stackoverflow.com/a/2117523/1177228
  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
      return v.toString(16);
    });
  }

  function saveEventQueue() {
    // TODO add stringify method for IE 7 and under
    if (canStringify) {
      setCookie("ahoy_events", JSON.stringify(eventQueue), 1);
    }
  }

  function trackEvent(event) {
    ready( function () {
      // ensure JSON is defined
      if (canStringify) {
        $.ajax({
          type: "POST",
          url: eventsUrl,
          data: JSON.stringify([event]),
          contentType: "application/json; charset=utf-8",
          dataType: "json",
          success: function() {
            // remove from queue
            for (var i = 0; i < eventQueue.length; i++) {
              if (eventQueue[i].id == event.id) {
                eventQueue.splice(i, 1);
                break;
              }
            }
            saveEventQueue();
          }
        });
      }
    });
  }

  function eventProperties(e) {
    var $target = $(e.currentTarget);
    return {
      tag: $target.get(0).tagName.toLowerCase(),
      id: $target.attr("id"),
      "class": $target.attr("class"),
      page: page,
      section: $target.closest("*[data-section]").data("section")
    };
  }

  // main

  visitId = getCookie("ahoy_visit");
  visitorId = getCookie("ahoy_visitor");
  track = getCookie("ahoy_track");

  ahoy.getVisitId = ahoy.getVisitToken = function () {
    return visitId;
  };

  ahoy.getVisitorId = ahoy.getVisitorToken = function () {
    return visitorId;
  };

  ahoy.getUserPrefs = function() {
    return userPrefs;
  }

  ahoy.setUserPrefs = function(prefs) {
    userPrefs = prefs;
    userPrefs.visitor_token = visitorId;
  }

  ahoy.setVisitsUrl = function(url) {
    visitsUrl = url;
  }

  ahoy.setEventsUrl = function(url) {
    eventsUrl = url;
  }

  ahoy.reset = function () {
    destroyCookie("ahoy_visit");
    destroyCookie("ahoy_visitor");
    destroyCookie("ahoy_user");
    destroyCookie("ahoy_events");
    destroyCookie("ahoy_track");
    return true;
  };

  ahoy.debug = function (enabled) {
    if (enabled === false) {
      destroyCookie("ahoy_debug");
    } else {
      setCookie("ahoy_debug", "t", 365 * 24 * 60); // 1 year
    }
    return true;
  };

  ahoy.track = function (name, properties) {
    if (!enabled) return;

    // generate unique id
    var event = {
      id: generateId(),
      api_key: api_key,
      name: name,
      properties: properties,
      user_prefs: userPrefs,
      time: (new Date()).getTime() / 1000.0
    };
    log(event);

    eventQueue.push(event);
    saveEventQueue();

    // wait in case navigating to reduce duplicate events
    setTimeout( function () {
      trackEvent(event);
    }, 1000);
  };

  ahoy.trackView = function () {
    if (!enabled) return;

    var properties = {
      url: window.location.href,
      title: document.title,
      page: page
    };
    ahoy.track("$view", properties);
  };

  ahoy.trackClicks = function () {
    if (!enabled) return;

    $(document).on("click", "a, button, input[type=submit]", function (e) {
      var $target = $(e.currentTarget);
      var properties = eventProperties(e);
      properties.text = properties.tag == "input" ? $target.val() : $.trim($target.text().replace(/[\s\r\n]+/g, " "));
      properties.href = $target.attr("href");
      ahoy.track("$click", properties);
    });
  };

  ahoy.trackSubmits = function () {
    if (!enabled) return;

    $(document).on("submit", "form", function (e) {
      var properties = eventProperties(e);
      ahoy.track("$submit", properties);
    });
  };

  ahoy.trackChanges = function () {
    if (!enabled) return;

    $(document).on("change", "input, textarea, select", function (e) {
      var properties = eventProperties(e);
      ahoy.track("$change", properties);
    });
  };

  ahoy.trackAll = function() {
    ahoy.trackView();
    ahoy.trackClicks();
    ahoy.trackSubmits();
    ahoy.trackChanges();
  };

  ahoy.enable = function() {
    enabled = true;
  }

  ahoy.disable = function() {
    enabled = false;
  }

  ahoy.init = function(API_KEY, prefs) {
    userPrefs = $.extend({}, prefs);
    api_key = API_KEY;
    enabled = true;

    if (visitId && visitorId && !track) {
      // TODO keep visit alive?
      userPrefs.visitor_token = visitorId;
      log("Active visit");
      setReady();
    } else {
      if (track) {
        destroyCookie("ahoy_track");
      }

      if (!visitId) {
        visitId = generateId();
        setCookie("ahoy_visit", visitId, visitTtl);
      }

      // make sure cookies are enabled
      if (getCookie("ahoy_visit")) {
        log("Visit started");

        if (!visitorId) {
          visitorId = generateId();
          setCookie("ahoy_visitor", visitorId, visitorTtl);
        }

        userPrefs.visitor_token = visitorId;

        var data = {
          api_key: api_key,
          visit_token: visitId,
          visitor_token: visitorId,
          platform: ahoy.platform || "Web",
          landing_page: window.location.href,
          screen_width: window.screen.width,
          screen_height: window.screen.height,
          user_prefs: userPrefs
        };

        // referrer
        if (document.referrer.length > 0) {
          data.referrer = document.referrer;
        }

        log(data);

        $.post(visitsUrl, data, setReady, "json");
      } else {
        log("Cookies disabled");
        setReady();
      }
    }

    // push events from queue
    try {
      eventQueue = JSON.parse(getCookie("ahoy_events") || "[]");
    } catch (e) {
      // do nothing
    }

    for (var i = 0; i < eventQueue.length; i++) {
      trackEvent(eventQueue[i]);
    }
  }

  window.__.Analytics = ahoy;
}(window));
