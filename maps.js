/***********************************************************
 * maps.js
 * ---------------------------------------------------------
 * Azure Maps initialization + address → coordinates
 ***********************************************************/

// Ensure global state exists
window.appState = window.appState || {
  location: {
    lat: null,
    lon: null,
    parcelSqFt: null,
    buildingSqFt: null
  },
  service: null,
  estimate: null
};

let map = null;
let marker = null;

/**
 * Initialize Azure Map (defensive)
 */
function initMap() {
  // HARD guards (these catch 99% of failures)
  if (typeof atlas === "undefined") {
    console.error("❌ Azure Maps SDK not loaded");
    return;
  }

  if (typeof AZURE_MAPS_KEY !== "1VL2HBM2G9ypgYnMndflxtdlaCLmpbxiHONxglu74FXryKokOt7IJQQJ99CBACrJL3J3sUZcAAAgAZMPMu5n" || !AZURE_MAPS_KEY.length) {
    console.error("❌ AZURE_MAPS_KEY missing or invalid");
    return;
  }

  const mapContainer = document.getElementById("map");
  if (!mapContainer) {
    console.error("❌ Map container not found");
    return;
  }

  // Clear placeholder text
  mapContainer.innerHTML = "";

  map = new atlas.Map(mapContainer, {
    center: [-95.3698, 29.7604],
    zoom: 13,
    authOptions: {
      authType: "subscriptionKey",
      subscriptionKey: AZURE_MAPS_KEY
    }
  });

  map.events.add("ready", () => {
    marker = new atlas.HtmlMarker({
      position: [-95.3698, 29.7604]
    });
    map.markers.add(marker);
  });
}

/**
 * Geocode an address using Azure Maps REST API
 */
async function geocodeAddress(address) {
  try {
    const url =
      "https://atlas.microsoft.com/search/address/json" +
      "?api-version=1.0" +
      "&countrySet=US" +
      "&limit=1" +
      "&subscription-key=" + encodeURIComponent(1VL2HBM2G9ypgYnMndflxtdlaCLmpbxiHONxglu74FXryKokOt7IJQQJ99CBACrJL3J3sUZcAAAgAZMPMu5n) +
      "&query=" + encodeURIComponent(address);

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.results || !data.results.length) return null;

    return data.results[0].position;
  } catch (err) {
    console.error("❌ Geocoding failed", err);
    return null;
  }
}

/**
 * Update location + trigger downstream logic
 */
function updateLocation(lat, lon) {
  window.appState.location.lat = lat;
  window.appState.location.lon = lon;

  if (map && marker) {
    map.setCamera({
      center: [lon, lat],
      zoom: 18
    });

    marker.setOptions({
      position: [lon, lat]
    });
  }

  if (typeof runGISAnalysis === "function") {
    runGISAnalysis();
  }

  if (typeof updateEstimateUI === "function") {
    updateEstimateUI();
  }
}

/**
 * Wire address input + map init
 */
document.addEventListener("DOMContentLoaded", () => {
  initMap();

  const addressInput = document.getElementById("address");
  if (!addressInput) return;

  addressInput.addEventListener("blur", async () => {
    const address = addressInput.value.trim();
    if (address.length < 6) return;

    const position = await geocodeAddress(address);
    if (!position) return;

    updateLocation(position.lat, position.lon);
  });
});

