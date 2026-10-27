"use client";

import { useEffect, useRef, useState } from "react";
import { AttributionControl, GeoJSONSource, Map as MapLibreMap, NavigationControl, ScaleControl, type StyleSpecification } from "maplibre-gl";
import type { SiteRecord } from "@/lib/hydro";
import { colorTokens } from "@/lib/tokens";

export type BasemapKey = "dark" | "imagery" | "topo" | "street";
type Coordinates = { lat: number; lng: number };

interface MapViewProps {
  sites: SiteRecord[];
  basemap: BasemapKey;
  pickMode: boolean;
  onPick: (point: Coordinates) => void;
  onSelectSite: (site: SiteRecord) => void;
}

const MAP_API_KEY = process.env.NEXT_PUBLIC_MAP_API_KEY?.trim() ?? "";

const cartoDarkTiles = MAP_API_KEY
  ? [`https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png?api_key=${MAP_API_KEY}`]
  : ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"];

const BASEMAPS: Record<BasemapKey, { label: string; tiles: string[]; attribution: string }> = {
  dark: {
    label: "Carto dark",
    tiles: cartoDarkTiles,
    attribution: "© CARTO · © OpenStreetMap",
  },
  imagery: {
    label: "Satellite",
    tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
    attribution: "Tiles © Esri",
  },
  topo: {
    label: "Terrain",
    tiles: ["https://a.tile.opentopomap.org/{z}/{x}/{y}.png"],
    attribution: "© OpenTopoMap · © OpenStreetMap",
  },
  street: {
    label: "Street",
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    attribution: "© OpenStreetMap contributors",
  },
};

const NEPAL_BOUNDARY = {
  type: "FeatureCollection" as const,
  features: [{
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "Polygon" as const,
      coordinates: [[
        [80.05, 28.9], [80.45, 29.1], [80.8, 30.35], [81.45, 30.18], [82.1, 30.3],
        [82.45, 29.8], [83.0, 30.05], [83.7, 29.72], [84.35, 30.1], [84.85, 29.74],
        [85.45, 30.0], [86.0, 29.82], [86.72, 30.08], [87.35, 29.72], [88.15, 29.28],
        [88.02, 28.62], [87.4, 28.45], [86.75, 27.9], [86.05, 27.68], [85.2, 27.45],
        [84.2, 27.4], [83.55, 27.32], [82.8, 27.55], [81.9, 27.45], [81.1, 27.72],
        [80.45, 28.05], [80.05, 28.9],
      ]],
    },
  }],
};

const RIVER_LINES = [
  [[86.2, 27.85], [85.75, 27.95], [85.15, 28.08], [84.65, 28.2], [84.1, 28.15], [83.55, 28.05]],
  [[87.68, 27.35], [87.3, 27.48], [86.95, 27.62], [86.5, 27.8], [86.15, 27.9]],
  [[84.8, 29.35], [84.65, 29.0], [84.45, 28.65], [84.35, 28.35], [84.1, 28.15]],
  [[82.0, 29.85], [82.2, 29.4], [82.45, 29.0], [82.25, 28.6], [82.55, 28.2], [83.2, 27.95]],
  [[83.85, 29.2], [83.72, 28.8], [83.6, 28.45], [83.45, 28.1], [83.2, 27.95]],
  [[81.5, 29.95], [81.65, 29.55], [81.75, 29.1], [81.85, 28.65], [82.15, 28.28]],
];

function styleFor(basemap: BasemapKey): StyleSpecification {
  const source = BASEMAPS[basemap];
  return {
    version: 8,
    sources: {
      basemap: { type: "raster", tiles: source.tiles, tileSize: 256, attribution: source.attribution },
    },
    layers: [{
      id: "basemap",
      type: "raster",
      source: "basemap",
      paint: {
        "raster-opacity": 0.94,
        "raster-saturation": basemap === "dark" ? -0.58 : 0,
        "raster-contrast": basemap === "dark" ? 0.04 : 0,
      },
    }],
  };
}

function siteCollection(sites: SiteRecord[]) {
  return {
    type: "FeatureCollection" as const,
    features: sites.map((site) => ({
      type: "Feature" as const,
      id: site.id,
      properties: { id: site.id, code: site.code, name: site.name, score: site.score, plantType: site.plantType, powerKw: site.powerKw },
      geometry: { type: "Point" as const, coordinates: [site.lng, site.lat] },
    })),
  };
}

function addHydroLayers(map: MapLibreMap, sites: SiteRecord[]): void {
  map.addSource("nepal-boundary", { type: "geojson", data: NEPAL_BOUNDARY });
  map.addLayer({
    id: "nepal-outline",
    type: "line",
    source: "nepal-boundary",
    paint: { "line-color": colorTokens.mapBoundary, "line-width": 1.8, "line-opacity": 0.75 },
  });
  map.addSource("river-network", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: RIVER_LINES.map((coordinates, index) => ({
        type: "Feature",
        properties: { order: index < 2 ? 5 : index < 4 ? 4 : 3 },
        geometry: { type: "LineString", coordinates },
      })),
    },
  });
  map.addLayer({
    id: "river-lines",
    type: "line",
    source: "river-network",
    paint: {
      "line-color": colorTokens.mapRiver,
      "line-width": ["interpolate", ["linear"], ["get", "order"], 3, 1.1, 5, 2.4],
      "line-opacity": 0.72,
    },
  });
  map.addSource("protected-areas", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { name: "Sagarmatha" }, geometry: { type: "Polygon", coordinates: [[[86.55, 27.95], [86.93, 27.95], [86.93, 28.2], [86.55, 28.2], [86.55, 27.95]]] } },
        { type: "Feature", properties: { name: "Langtang" }, geometry: { type: "Polygon", coordinates: [[[85.2, 28.0], [85.55, 28.0], [85.55, 28.24], [85.2, 28.24], [85.2, 28.0]]] } },
        { type: "Feature", properties: { name: "Annapurna" }, geometry: { type: "Polygon", coordinates: [[[83.65, 28.3], [84.35, 28.3], [84.35, 28.75], [83.65, 28.75], [83.65, 28.3]]] } },
        { type: "Feature", properties: { name: "Makalu-Barun" }, geometry: { type: "Polygon", coordinates: [[[87.05, 27.8], [87.4, 27.8], [87.4, 28.0], [87.05, 28.0], [87.05, 27.8]]] } },
      ],
    },
  });
  map.addLayer({ id: "protected-fill", type: "fill", source: "protected-areas", paint: { "fill-color": colorTokens.mapProtected, "fill-opacity": 0.15 } });
  map.addLayer({ id: "protected-outline", type: "line", source: "protected-areas", paint: { "line-color": colorTokens.mapProtected, "line-width": 1, "line-dasharray": [2, 2], "line-opacity": 0.75 } });
  map.addSource("transmission", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: [[80.8, 28.1], [82.4, 27.9], [84.2, 27.75], [85.4, 27.5], [86.6, 27.3], [87.8, 27.1]] },
      }],
    },
  });
  map.addLayer({ id: "transmission-line", type: "line", source: "transmission", paint: { "line-color": colorTokens.mapTransmission, "line-width": 1.15, "line-dasharray": [3, 3], "line-opacity": 0.78 } });
  map.addSource("hydro-sites", { type: "geojson", data: siteCollection(sites) });
  map.addLayer({
    id: "site-halo",
    type: "circle",
    source: "hydro-sites",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 9, 9, 15],
      "circle-color": colorTokens.mapHalo,
      "circle-blur": 0.4,
    },
  });
  map.addLayer({
    id: "site-circles",
    type: "circle",
    source: "hydro-sites",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 3.5, 9, 6.5],
      "circle-color": ["case", ["<", ["get", "score"], 45], colorTokens.scoreLow, ["<", ["get", "score"], 60], colorTokens.scoreModerate, ["<", ["get", "score"], 75], colorTokens.scoreHigh, colorTokens.scoreExcellent],
      "circle-stroke-width": 1.4,
      "circle-stroke-color": "#f8fafc",
      "circle-opacity": 0.98,
    },
  });
}

export function MapView({ sites, basemap, pickMode, onPick, onSelectSite }: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const sitesRef = useRef(sites);
  const pickRef = useRef(pickMode);
  const callbacks = useRef({ onPick, onSelectSite });
  const [tileMessage, setTileMessage] = useState("");

  useEffect(() => {
    sitesRef.current = sites;
    const source = mapRef.current?.getSource("hydro-sites");
    if (source instanceof GeoJSONSource) source.setData(siteCollection(sites));
  }, [sites]);

  useEffect(() => {
    pickRef.current = pickMode;
  }, [pickMode]);

  useEffect(() => {
    callbacks.current = { onPick, onSelectSite };
  }, [onPick, onSelectSite]);

  useEffect(() => {
    if (!container.current) return;
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: container.current,
        style: styleFor(basemap),
        center: [84.124, 28.3949],
        zoom: 5.65,
        minZoom: 5.2,
        maxZoom: 13,
        maxBounds: [[79.4, 25.8], [89, 31]],
        attributionControl: false,
        cooperativeGestures: true,
      });
    } catch {
      queueMicrotask(() => setTileMessage("Map canvas unavailable"));
      return;
    }
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false, visualizePitch: false }), "bottom-right");
    map.addControl(new ScaleControl({ maxWidth: 90, unit: "metric" }), "bottom-left");
    map.addControl(new AttributionControl({ compact: true }), "bottom-left");
    map.on("load", () => {
      addHydroLayers(map, sitesRef.current);
      map.on("click", (event) => {
        if (pickRef.current) {
          callbacks.current.onPick({ lat: event.lngLat.lat, lng: event.lngLat.lng });
          return;
        }
      });
      map.on("click", "site-circles", (event) => {
        if (pickRef.current) return;
        const feature = event.features?.[0];
        const id = Number(feature?.properties?.id);
        const site = sitesRef.current.find((candidate) => candidate.id === id);
        if (site) callbacks.current.onSelectSite(site);
      });
      map.on("mouseenter", "site-circles", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "site-circles", () => { map.getCanvas().style.cursor = pickRef.current ? "crosshair" : ""; });
    });
    map.on("error", (event) => {
      if (event.error?.message.toLowerCase().includes("style")) setTileMessage("Basemap is reconnecting");
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [basemap]);

  return (
    <div className={`map-stage ${pickMode ? "map-stage-picking" : ""}`} ref={container} aria-label="Interactive candidate site map" role="application">
      {tileMessage ? <div className="map-status-pill">{tileMessage}</div> : null}
      {pickMode ? <div className="map-pick-cursor"><span>Click map to set analysis point</span></div> : null}
    </div>
  );
}
