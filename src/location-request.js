// The browser may respond after the user changes the observing location.
export function createLocationRequest({ getGeolocation, showMessage, apply }) {
  let generation = 0;
  return {
    invalidate() {
      generation += 1;
      showMessage("");
    },
    request() {
      const token = ++generation;
      const fail = (error) => {
        if (token === generation) showMessage(`Location unavailable: ${error?.message || "Try entering coordinates manually."}`);
      };

      let geolocation;
      try {
        geolocation = getGeolocation();
      } catch (error) {
        fail(error);
        return;
      }
      if (!geolocation) {
        showMessage("This browser does not provide geolocation.");
        return;
      }

      showMessage("Requesting your location…");
      try {
        geolocation.getCurrentPosition(({ coords }) => {
          if (token !== generation) return;
          apply(coords.latitude, coords.longitude);
          showMessage(`Location accurate to about ${Math.round(coords.accuracy)} m.`);
        }, fail, { enableHighAccuracy: true, timeout: 12000 });
      } catch (error) {
        fail(error);
      }
    },
  };
}
