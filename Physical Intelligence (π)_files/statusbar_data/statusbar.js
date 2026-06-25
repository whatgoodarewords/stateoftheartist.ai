/* Copyright (c) 2020 Andy McDonald. All rights reserved. */

/*jshint esversion: 6, module: true */

// ---------------------------------------------------------
const utils = window.foxclocks.utils;

// ---------------------------------------------------------
let _eClockTimes = null;
let _setClocksIntervalId = null;
let _origin = null;

const _data = {};

// ---------------------------------------------------------
const start = (recreate) => {
  if (document.readyState === "loading")
    // can be called before document ready
    return;

  if (recreate) _eClockTimes = null;

  if (document.hidden === false) {
    if (_eClockTimes === null)
      _eClockTimes = createClocks(_data.watchlist, _data.watchlist_zones);

    if (_setClocksIntervalId === null) {
      _setClocksIntervalId = window.setInterval(
        () =>
          setClockTimes(
            _eClockTimes,
            _data.watchlist,
            _data.watchlist_zones,
            _data.global_time_format
          ),
        utils.getConfig("time_update_interval_millis")
      );
    }

    setClockTimes(
      _eClockTimes,
      _data.watchlist,
      _data.watchlist_zones,
      _data.global_time_format
    );
  } else if (_setClocksIntervalId !== null) {
    window.clearInterval(_setClocksIntervalId);
    _setClocksIntervalId = null;
  }
};

// ---------------------------------------------------------
const createClocks = (watchlist, watchlist_zones) => {
  const body = $("body");

  body.find("span.clock").remove();

  let clockIndex = 0;
  for (let i = 0; i < watchlist.length; i++) {
    const item = watchlist[i];

    if ($.inArray("statusbar", item.show_in) === -1) continue;

    const itemZone = watchlist_zones[item.tz_id];
    const eClock = $(
      `<span class="clock" id="statusbar-clock-${clockIndex++}">`
    );

    if (item.statusbar.show_flag && typeof itemZone.country_code === "string")
      eClock.append(
        $("<img />", {
          src: `/images/flags/${itemZone.country_code.toLowerCase()}.png`,
        })
      );

    if (item.statusbar.bold === true) eClock.addClass("bold");

    if (item.statusbar.italic === true) eClock.addClass("italic");

    if (item.statusbar.underline === true) eClock.addClass("underline");

    if (item.statusbar.colour) eClock.css("color", item.statusbar.colour);

    eClock
      .append($('<span class="time"/>').data("watchlist-index", i))
      .appendTo(body);
  }

  window.parent.postMessage({ "resize.statusbar.foxclocks": true }, _origin);
  return body.find("span.time");
};

//---------------------------------------------------------
const setAlignment = (text_alignment) => {
  $("body").css("text-align", text_alignment);
};

//---------------------------------------------------------
const setFontSize = (font_size) => {
  $("body").css("font-size", font_size);
  window.parent.postMessage({ "resize.statusbar.foxclocks": true }, _origin);
};

// ---------------------------------------------------------
const setClockTimes = (
  $clockTimes,
  watchlist,
  watchlist_zones,
  global_time_format
) => {
  if ($clockTimes === null) return;

  const nowEpoch = new Date().getTime();

  for (let i = 0, len = $clockTimes.length; i < len; i++) {
    const eClockTime = $clockTimes[i];
    const item = watchlist[i];
    const itemZone = watchlist_zones[item.tz_id];

    const timeFormat =
      // prettier-ignore
      typeof item.statusbar.time_format === "string" ? item.statusbar.time_format : global_time_format;
    const formattedTime = utils.getFormattedTime(
      itemZone,
      nowEpoch,
      timeFormat
    );

    eClockTime.innerText =
      item.name !== "" ? `${item.name}: ${formattedTime}` : formattedTime;
  }
};

//---------------------------------------------------------
const init = () => {
  const urlParams = utils.parseUrlSearch(window.location.search);
  if (!urlParams.hasOwnProperty("origin") || !urlParams.origin[0])
    throw new Error("No origin specified in URL");

  $("html").addClass(utils.getApplicationName());

  const docReadyPromise = new Promise((resolve, reject) => {
    $(() => {
      _origin = urlParams.origin[0];

      $("body")
        .on("mousedown", (e) => e.preventDefault()) // prevent text being selected
        .on("dblclick", (e) => utils.sendMessage({ action: "open_options" }))
        .on("click", "span.clock", (e) => {
          const item =
            _data.watchlist[
              $(e.currentTarget).find("span.time").data("watchlist-index")
            ];
          const itemZone = _data.watchlist_zones[item.tz_id];

          window.parent.postMessage(
            {
              "clockclick.statusbar.foxclocks": {
                pageX: e.pageX,
                pageY: e.pageY,
                item,
                itemZone,
              },
            },
            _origin
          );
        });

      $("#closer").on("click", (e) =>
        window.parent.postMessage(
          { "closerclick.statusbar.foxclocks": true },
          _origin
        )
      );

      resolve();
    });
  });

  utils
    .getStorage(["watchlist", "tz_db", "global_time_format", "statusbar"])

    .then((storageItems) => {
      _data.watchlist = storageItems.watchlist;
      _data.global_time_format = storageItems.global_time_format;
      _data.statusbar = storageItems.statusbar;

      // NB: potentially before document ready
      //
      setAlignment(_data.statusbar.text_alignment);
      setFontSize(_data.statusbar.font_size);

      utils.onStorageChanged.addListener(update);
      document.addEventListener("visibilitychange", start);

      return storageItems.tz_db.zones;
    })
    .then((zones) => utils.getZonesForWatchlist(_data.watchlist, zones))
    .then((watchlist_zones) => {
      _data.watchlist_zones = watchlist_zones;
      docReadyPromise.then(start);
    });
};

// ---------------------------------------------------------
const update = (changes, _namespace) => {
  if (typeof changes.watchlist !== "undefined")
    _data.watchlist = changes.watchlist.newValue;

  if (typeof changes.global_time_format !== "undefined") {
    _data.global_time_format = changes.global_time_format.newValue;
    start(); // sets clock times if document is visible
  }

  if (typeof changes.statusbar !== "undefined") {
    _data.statusbar = changes.statusbar.newValue;
    setAlignment(_data.statusbar.text_alignment);
    setFontSize(_data.statusbar.font_size);
  }

  if (
    typeof changes.watchlist !== "undefined" ||
    typeof changes.tz_db !== "undefined"
  ) {
    // prettier-ignore
    const zones = typeof changes.tz_db !== "undefined" ? changes.tz_db.newValue.zones : _data.watchlist_zones;

    utils
      .getZonesForWatchlist(_data.watchlist, zones)
      .then((watchlist_zones) => {
        _data.watchlist_zones = watchlist_zones;
        start(true);
      });
  }
};

// ---------------------------------------------------------
// ENTRYPOINT
// ---------------------------------------------------------
init(); // no need to see if background is initialized - already checked in content.js
