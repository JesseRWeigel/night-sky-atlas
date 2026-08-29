import { serializeAppError } from "./app-error.js";

const safe = (handler) => async (input) => {
  try {
    return { ok: true, ...handler(input) };
  } catch (error) {
    return serializeAppError(error);
  }
};

const categoryRequirementsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    planet: { type: "integer", minimum: 0, maximum: 12 },
    bright_star: { type: "integer", minimum: 0, maximum: 12 },
    deep_sky: { type: "integer", minimum: 0, maximum: 12 },
  },
  required: ["planet", "bright_star", "deep_sky"],
};

const observerSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    latitude: { type: "number", minimum: -90, maximum: 90 },
    longitude: { type: "number", minimum: -180, maximum: 180 },
    location_name: { type: "string", minLength: 1, maxLength: 80 },
  },
  required: ["latitude", "longitude"],
};

export function createWebMcpTools(actions) {
  return [
    {
      name: "get_sky_context",
      title: "Get sky context",
      description: "Get the current observer, sky view, layers, selection, and plan summary without changing the atlas.",
      inputSchema: { type: "object", additionalProperties: false, properties: {} },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: safe(() => actions.getSkyContext()),
    },
    {
      name: "find_observable_targets",
      title: "Find observable targets",
      description: "Find currently observable targets matching the requested categories and sky constraints without changing the atlas.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          categories: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            uniqueItems: true,
            items: { type: "string", enum: ["planet", "bright_star", "deep_sky"] },
          },
          min_altitude: { type: "number", minimum: 0, maximum: 90 },
          max_magnitude: { type: "number", minimum: -30, maximum: 15 },
          at_time: { type: "string", format: "date-time" },
          limit: { type: "integer", minimum: 1, maximum: 12 },
        },
        required: ["categories", "min_altitude", "limit"],
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: safe((input) => actions.findObservableTargets({
        categories: input.categories,
        minAltitude: input.min_altitude,
        maxMagnitude: input.max_magnitude,
        atTime: input.at_time,
        limit: input.limit,
      })),
    },
    {
      name: "get_target_details",
      title: "Get target details",
      description: "Get scientific and observing details for one target at the current or requested time without changing the atlas.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          target_id: { type: "string", minLength: 1, maxLength: 80 },
          at_time: { type: "string", format: "date-time" },
        },
        required: ["target_id"],
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: safe((input) => actions.getTargetDetails(input.target_id, input.at_time)),
    },
    {
      name: "set_observer_location",
      title: "Set observer location",
      description: "Change the atlas observer coordinates and visibly update the sky. This does not alter a saved plan's proposed location.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          latitude: { type: "number", minimum: -90, maximum: 90 },
          longitude: { type: "number", minimum: -180, maximum: 180 },
          location_name: { type: "string", minLength: 1, maxLength: 80 },
        },
        required: ["latitude", "longitude", "location_name"],
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: safe((input) => actions.setObserverLocation({
        latitude: input.latitude,
        longitude: input.longitude,
        locationName: input.location_name,
      })),
    },
    {
      name: "set_observer_time",
      title: "Set observer time",
      description: "Set the observer time, pause playback, and visibly update the atlas sky.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: { iso_time: { type: "string", format: "date-time" } },
        required: ["iso_time"],
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: safe((input) => actions.setObserverTime({ isoTime: input.iso_time })),
    },
    {
      name: "frame_target",
      title: "Frame target",
      description: "Select and visibly center the atlas on a target, optionally using a requested field of view.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          target_id: { type: "string", minLength: 1, maxLength: 80 },
          field_of_view: { type: "number", minimum: 0.05, maximum: 180 },
        },
        required: ["target_id"],
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: safe((input) => actions.frameTarget({
        targetId: input.target_id,
        fieldOfView: input.field_of_view,
      })),
    },
    {
      name: "preview_observing_plan",
      title: "Preview observing plan",
      description: "Build and visibly show an observing-plan preview without changing the current observer location or time.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", minLength: 1, maxLength: 90 },
          audience: { type: "string", enum: ["child", "beginner", "general", "experienced"] },
          notes: { type: "string", maxLength: 500 },
          duration_minutes: { type: "integer", minimum: 10, maximum: 180 },
          target_ids: {
            type: "array",
            minItems: 1,
            maxItems: 12,
            uniqueItems: true,
            items: { type: "string", minLength: 1, maxLength: 80 },
          },
          category_requirements: categoryRequirementsSchema,
          min_altitude: { type: "number", minimum: 0, maximum: 90 },
          start_time: { type: "string", format: "date-time" },
          observer: observerSchema,
        },
        required: ["title", "audience", "duration_minutes", "target_ids", "category_requirements", "min_altitude"],
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: safe((input) => actions.previewPlan({
        title: input.title,
        audience: input.audience,
        notes: input.notes,
        durationMinutes: input.duration_minutes,
        targetIds: input.target_ids,
        categoryRequirements: input.category_requirements,
        minAltitude: input.min_altitude,
        startTime: input.start_time,
        observer: input.observer === undefined ? undefined : {
          latitude: input.observer.latitude,
          longitude: input.observer.longitude,
          locationName: input.observer.location_name,
        },
        source: "agent",
      })),
    },
    {
      name: "save_observing_plan",
      title: "Save observing plan",
      description: "Save the current observing-plan preview and visibly switch it to the saved itinerary.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: { preview_id: { type: "string", minLength: 1, maxLength: 100 } },
        required: ["preview_id"],
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: safe((input) => actions.savePlan({ previewId: input.preview_id })),
    },
    {
      name: "advance_observing_tour",
      title: "Advance observing tour",
      description: "Start, move through, or jump to one target in the saved observing tour and visibly update the atlas.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          direction: { type: "string", enum: ["start", "next", "previous"] },
          target_index: { type: "integer", minimum: 0, maximum: 11 },
        },
        oneOf: [
          { required: ["direction"] },
          { required: ["target_index"] },
        ],
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: safe((input) => actions.advanceTour(
        input.direction === undefined ? { targetIndex: input.target_index } : { direction: input.direction },
      )),
    },
    {
      name: "configure_sky_layers",
      title: "Configure sky layers",
      description: "Change one or more visible sky layers or the survey source and immediately update the atlas.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        minProperties: 1,
        properties: {
          stars: { type: "boolean" },
          objects: { type: "boolean" },
          constellations: { type: "boolean" },
          grid: { type: "boolean" },
          labels: { type: "boolean" },
          survey: { type: "string", enum: ["auto", "dss", "panstarrs", "2mass", "off"] },
        },
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: safe((input) => actions.configureLayers(input)),
    },
  ];
}

export async function registerWebMcpTools(modelContext, tools) {
  const registered = [];
  for (const tool of tools) {
    await modelContext.registerTool(tool);
    registered.push(tool.name);
  }
  return { supported: true, registered };
}

export async function setupWebMcp(actions, documentLike = document) {
  if (typeof documentLike.modelContext?.registerTool !== "function") {
    return { supported: false, registered: [] };
  }
  return registerWebMcpTools(documentLike.modelContext, createWebMcpTools(actions));
}
