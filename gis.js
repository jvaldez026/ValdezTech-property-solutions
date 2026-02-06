/***********************************************************
 * gis.js
 * Uses real GIS services to derive:
 * - Parcel (lot) square footage
 * - Building footprint square footage
 *
 * Improvements:
 * - Uses Web Mercator projection + shoelace formula for area in m²,
 *   then converts to ft². More accurate for typical parcel sizes than
 *   an arbitrary multiplier.
 ***********************************************************/

window.appState = window.appState || {
  location: {
    lat: null,
    lon: null,
    parcelSqFt: null,
    buildingSqFt: null
  }
};

async function runGISAnalysis() {
  const { lat, lon } = window.appState.location;
  if (!lat || !lon) return;

  const [parcelSqFt, buildingSqFt] = await Promise.all([
    fetchParcelArea(lat, lon),
    fetchBuildingFootprintArea(lat, lon)
  ]);

  if (parcelSqFt != null) window.appState.location.parcelSqFt = parcelSqFt;
  if (buildingSqFt != null) window.appState.location.buildingSqFt = buildingSqFt;

  if (typeof updateEstimateUI === "function") updateEstimateUI();
}

// Harris County parcel lookup (ArcGIS REST)
async function fetchParcelArea(lat, lon) {
  const geometry = { x: lon, y: lat, spatialReference: { wkid: 4326 } };
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
    if (!res.ok) throw new Error("Parcel service returned " + res.status);
    const data = await res.json();
    if (!data.features || !data.features.length) return null;
    const geom = data.features[0].geometry;
    const areaSqFt = calculatePolygonAreaSqFt(geom);
    return areaSqFt ? Math.round(areaSqFt) : null;
  } catch (err) {
    console.error("Parcel lookup failed", err);
    return null;
  }
}

// H-GAC building footprint lookup
async function fetchBuildingFootprintArea(lat, lon) {
  const geometry = { x: lon, y: lat, spatialReference: { wkid: 4326 } };
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
    if (!res.ok) throw new Error("Building footprints returned " + res.status);
    const data = await res.json();
    if (!data.features || !data.features.length) return null;

    let totalSqFt = 0;
    data.features.forEach((feature) => {
      const area = calculatePolygonAreaSqFt(feature.geometry);
      if (area) totalSqFt += area;
    });

    return totalSqFt ? Math.round(totalSqFt) : null;
  } catch (err) {
    console.error("Building footprint lookup failed", err);
    return null;
  }
}

/**
 * calculatePolygonAreaSqFt
 * - Accepts an ESRI polygon geometry object (with rings array of [x(lon), y(lat)]).
 * - Projects lon/lat into Web Mercator (meters), computes polygon area via shoelace,
 *   returns area in square feet.
 */
function calculatePolygonAreaSqFt(geometry) {
  if (!geometry || !geometry.rings || !geometry.rings.length) return null;

  // Web Mercator projection (spherical Mercator)
  const R = 6378137; // meters

  function lonLatToMercator(lon, lat) {
    const λ = (lon * Math.PI) / 180;
    const φ = (lat * Math.PI) / 180;
    const x = R * λ;
    const y = R * Math.log(Math.tan(Math.PI / 4 + φ / 2));
    return [x, y];
  }

  // Compute area of one polygon ring in m² using shoelace on projected coords
  function ringAreaMeters2(ring) {
    if (!Array.isArray(ring) || ring.length < 3) return 0;
    let area = 0;
    let prev = lonLatToMercator(ring[0][0], ring[0][1]);
    for (let i = 1; i < ring.length; i++) {
      const curr = lonLatToMercator(ring[i][0], ring[i][1]);
      area += prev[0] * curr[1] - curr[0] * prev[1];
      prev = curr;
    }
    // close with first point
    const first = lonLatToMercator(ring[0][0], ring[0][1]);
    area += prev[0] * first[1] - first[0] * prev[1];
    return Math.abs(area) / 2;
  }

  // Sum all rings (outer ring positive; inner rings subtract)
  let totalMeters2 = 0;
  // ESRI rings may include multiple rings; the orientation determines sign but we'll treat
  // first as outer and subtract holes if any by checking orientation via shoelace sign.
  for (let r = 0; r < geometry.rings.length; r++) {
    const ring = geometry.rings[r];
    // Compute signed area in meters (using projected coords) to determine orientation
    // We'll compute signed shoelace quickly (without converting to meters twice)
    // but easier: use ringAreaMeters2 and orient by computing signed planar area in lon/lat
    const signed = signedAreaLonLat(ring);
    const m2 = ringAreaMeters2(ring);
    // If signed < 0 assume hole and subtract
    if (signed < 0) totalMeters2 -= m2;
    else totalMeters2 += m2;
  }

  const meters2ToSqFt = 10.76391041671;
  const totalSqFt = totalMeters2 * meters2ToSqFt;
  return totalSqFt > 0 ? Math.round(totalSqFt) : null;
}

// Helper: compute signed area in lon/lat planar approximation to detect ring orientation
function signedAreaLonLat(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1];
    const xj = ring[j][0],
      yj = ring[j][1];
    sum += (xj - xi) * (yi + yj);
  }
  return sum / 2;
}

// Expose for debugging
window.runGISAnalysis = runGISAnalysis;
window.calculatePolygonAreaSqFt = calculatePolygonAreaSqFt;
