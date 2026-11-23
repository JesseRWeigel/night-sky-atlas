import { buildCatalogAt, previewObservingPlan } from "./observing.js";
import { decodePortablePlan, encodePortablePlan } from "./portable-plan.js";

export function formatPortableTime(utc, timezone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const local = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "shortOffset",
    timeZone: timezone,
  }).format(new Date(utc));
  return `UTC: ${utc} · Browser time (${timezone}): ${local}`;
}

export function previewPortableAtLocation(json, location) {
  const recipe = decodePortablePlan(json);
  const { startTimeUtc, audience, durationMinutes, targetIds, categoryRequirements } = recipe;
  return previewObservingPlan(buildCatalogAt(startTimeUtc), {
    context: { ...location, date: startTimeUtc },
    previewId: "portable-readonly",
    title: "Imported plan preview",
    now: startTimeUtc,
    audience,
    durationMinutes,
    targetIds,
    categoryRequirements,
    minAltitude: 0,
  });
}

export function mountPortablePlanUi({ root, getPlan, getLocation }) {
  const find = (id) => root.querySelector(`#${id}`);
  const result = find("portableResult");
  const targets = find("portableTargets");
  const input = find("portableInput");
  const outputGroup = find("portableOutputGroup");
  const output = find("portableOutput");
  let importResultVisible = false;
  const clearPreview = () => {
    importResultVisible = false;
    result.textContent = "";
    targets.replaceChildren();
  };
  const clearExport = () => {
    outputGroup.hidden = true;
    output.value = "";
    find("portableExportTime").textContent = "";
  };
  find("portableExport").addEventListener("click", () => {
    clearPreview();
    clearExport();
    const plan = getPlan();
    if (!plan) {
      result.textContent = "Save a plan before creating a shareable copy.";
      return;
    }
    try {
      const json = encodePortablePlan(plan, buildCatalogAt(plan.context.date));
      find("portableExportTime").textContent = formatPortableTime(decodePortablePlan(json).startTimeUtc);
      output.value = json;
      outputGroup.hidden = false;
      output.focus();
    } catch {
      result.textContent = "Could not export this saved plan.";
    }
  });
  input.addEventListener("input", clearPreview);
  find("portableImport").addEventListener("click", () => {
    clearPreview();
    importResultVisible = true;
    try {
      const location = getLocation();
      const preview = previewPortableAtLocation(input.value, location);
      const place = location.locationName || "current observing location";
      result.textContent = `${formatPortableTime(preview.context.date)}. Preview for ${place}, checked against the horizon only. No plan was saved or replaced.`;
      for (const target of preview.targets) {
        const row = root.ownerDocument.createElement("li");
        row.textContent = `${target.name} · ${formatPortableTime(target.scheduledTime)}`;
        targets.append(row);
      }
    } catch (error) {
      result.textContent = `Cannot preview this plan at the current location: ${error.message}`;
    }
  });
  const reset = () => {
    clearPreview();
    clearExport();
    input.value = "";
  };
  root.addEventListener("toggle", () => { if (!root.open) reset(); });
  return {
    close() { root.open = false; reset(); },
    invalidateLocation() {
      if (!importResultVisible) return;
      clearPreview();
      result.textContent = "Observing location changed. Preview again.";
    },
  };
}
