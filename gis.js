/***********************************************************
 * gis.js
 * ---------------------------------------------------------
 * Uses real GIS services to derive:
 * - Parcel (lot) square footage
 * - Building footprint square footage
 ***********************************************************/

window.appState = window.appState || {
  location: {
    lat: null,
    lon: null,
    parcelSqFt: null,
    buildingSqFt: null
  }
};

/**
 * Main entry point (called from maps.js)
 */
async function runGISAnalysis() {
  const { lat, lon } = window.appState.location;
  if (!lat || !lon) return;

  const [parcelSqFt, buildingSqFt] = await Promise.all([
    fetchParcelArea(lat, lon),
    fetchBuildingFootprintArea(lat, lon)
  ]);

  if (parcelSqFt) {
    window.appState.location.parcelSqFt = parcelSqFt;
  }

  if (buildingSqFt) {
    window.appState.location.buildingSqFt = buildingSqFt;
  }

  if (typeof updateEstimateUI === "function") {
    updateEstimateUI();
  }
}

/**
 * Harris County parcel lookup
 */
async function fetchParcelArea(lat, lon) {
  const geometry = {
    x: lon,
    y: lat,
    spatialReference: { wkid: 4326 }
  };

  const params = new URLSearchParams({
    f: "json",
    geometry: JSON.stringify(geometry),
    geometryType: "esriGeometryPoint",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    returnGeometry: "true",
    inSR: 4326
  });

  const url =
    "https://gis.harriscountytx.gov/arcgis/rest/services/HCAD/Parcels/MapServer/0/query?" +
    params.toString();

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.features || !data.features.length) return null;

    return calculatePolygonAreaSqFt(data.features[0].geometry);
  } catch (err) {
    console.error("Parcel lookup failed", err);
    return null;
  }
}

/**
 * H-GAC building footprint lookup
 */
async function fetchBuildingFootprintArea(lat, lon) {
  const geometry = {
    x: lon,
    y: lat,
    spatialReference: { wkid: 4326 }
  };

  const params = new URLSearchParams({
    f: "json",
    geometry: JSON.stringify(geometry),
    geometryType: "esriGeometryPoint",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    returnGeometry: "true",
    inSR: 4326
  });

  const url =
    "https://gis.h-gac.com/arcgis/rest/services/Hosted/Building_Footprints/FeatureServer/0/query?" +
    params.toString();

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.features || !data.features.length) return null;

    // Some properties have multiple structures
    let totalSqFt = 0;

    data.features.forEach((feature) => {
      const area = calculatePolygonAreaSqFt(feature.geometry);
      if (area) totalSqFt += area;
    });

    return Math.round(totalSqFt);
  } catch (err) {
    console.error("Building footprint lookup failed", err);
    return null;
  }
}

/**
 * Polygon area calculator (ArcGIS geometry)
 * Returns square feet
 */
function calculatePolygonAreaSqFt(geometry) {
  if (!geometry || !geometry.rings) return null;

  const ring = geometry.rings[0];
  let area = 0;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[j];
    area += (x2 - x1) * (y2 + y1);
  }

  // Degrees² → m² (approx) → ft²
  const areaSqMeters = Math.abs(area) * 12365;
  const areaSqFt = areaSqMeters * 10.7639;

  return areaSqFt;
}

