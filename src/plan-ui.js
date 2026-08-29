const CATEGORY_LABELS = {
  planet: "Planet",
  bright_star: "Bright star",
  deep_sky: "Deep sky",
};

export function planChipPresentation(snapshot = {}) {
  const count = (snapshot.preview || snapshot.plan)?.targets?.length || 0;
  const index = snapshot.tour?.currentIndex;
  if (snapshot.plan && snapshot.tour?.active && Number.isInteger(index) && index >= 0 && index < count) {
    return { text: `${index + 1}/${count}`, ariaLabel: `Tour target ${index + 1} of ${count}` };
  }
  return { text: String(count), ariaLabel: `${count} ${count === 1 ? "target" : "targets"}` };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

function formatScheduledTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date).replace("GMT", "UTC");
}

function audienceOptions(selected) {
  return [
    ["child", "Child"],
    ["beginner", "Beginner"],
    ["general", "General"],
    ["experienced", "Experienced"],
  ].map(([value, label]) => (
    `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`
  )).join("");
}

function renderContext(context = {}) {
  const place = context.locationName || "Selected observer location";
  const latitude = Number.isFinite(context.latitude) ? context.latitude.toFixed(4) : "—";
  const longitude = Number.isFinite(context.longitude) ? context.longitude.toFixed(4) : "—";
  return `
    <dl class="plan-context" aria-label="Plan context">
      <div><dt>Observer</dt><dd>${escapeHtml(place)}</dd></div>
      <div><dt>Coordinates</dt><dd>${escapeHtml(latitude)}°, ${escapeHtml(longitude)}°</dd></div>
    </dl>`;
}

function renderTargets(targets = [], mode) {
  if (targets.length === 0) {
    return '<p class="plan-empty-targets">Select a target in the sky, then choose Add to plan.</p>';
  }
  return `<ol class="plan-thread">
    ${targets.map((target, index) => {
      const name = escapeHtml(target.name);
      const targetId = escapeHtml(target.targetId);
      const status = ["current", "complete"].includes(target.status) ? target.status : "upcoming";
      const statusText = status === "current" ? "Current target" : status === "complete" ? "Complete" : "Upcoming";
      const category = CATEGORY_LABELS[target.category] || target.category || "Target";
      const minimum = Number.isFinite(target.minimumAltitude) ? `${Math.round(target.minimumAltitude)}° minimum` : "Altitude unavailable";
      const editControls = mode === "preview" ? `
        <div class="plan-target-actions" aria-label="Reorder or remove ${name}">
          <button type="button" data-action="move-earlier" data-target-id="${targetId}" aria-label="Move ${name} earlier"${index === 0 ? " disabled" : ""}>↑</button>
          <button type="button" data-action="move-later" data-target-id="${targetId}" aria-label="Move ${name} later"${index === targets.length - 1 ? " disabled" : ""}>↓</button>
          <button type="button" data-action="remove-target" data-target-id="${targetId}" aria-label="Remove ${name} from plan">Remove</button>
        </div>` : "";
      const targetName = mode === "tour"
        ? `<button type="button" class="plan-target-name" data-action="go-target" data-index="${index}" aria-label="Go to ${name}">${name}</button>`
        : `<strong class="plan-target-name">${name}</strong>`;
      return `<li class="plan-target plan-target-${status}" data-target-id="${targetId}" tabindex="-1">
        <span class="plan-node" aria-hidden="true"></span>
        <div class="plan-target-copy">
          <span class="plan-target-status">${statusText}</span>
          ${targetName}
          <span class="plan-target-category">${escapeHtml(category)}</span>
          <span class="plan-target-schedule">${escapeHtml(formatScheduledTime(target.scheduledTime))} · ${escapeHtml(minimum)}</span>
          ${editControls}
        </div>
      </li>`;
    }).join("")}
  </ol>`;
}

function renderEmpty() {
  return `<section class="plan-state plan-empty-state">
    <span class="plan-state-label">No route yet</span>
    <h3>Build a night worth remembering.</h3>
    <p>Select a target in the sky and add it here, or create a plan and fill the route as you explore.</p>
    <button type="button" class="plan-primary-action" data-action="create-plan">Create plan</button>
  </section>`;
}

function renderPreview(preview) {
  const isAgent = preview.source === "agent";
  const targetCount = Array.isArray(preview.targets) ? preview.targets.length : 0;
  return `<section class="plan-state plan-edit-state">
    <span class="plan-state-label">${isAgent ? "Agent preview" : "Edit plan"}</span>
    <form class="plan-form">
      <label for="plan-title">Title</label>
      <input id="plan-title" name="title" data-field="title" maxlength="90" value="${escapeHtml(preview.title)}" />
      <div class="plan-form-row">
        <label>Audience
          <select name="audience" data-field="audience">${audienceOptions(preview.audience)}</select>
        </label>
        <label>Duration
          <span class="plan-number-field"><input name="durationMinutes" data-field="durationMinutes" type="number" min="10" max="180" step="1" value="${escapeHtml(preview.durationMinutes ?? 30)}" /><span>min</span></span>
        </label>
      </div>
      <label for="plan-notes">Notes</label>
      <textarea id="plan-notes" name="notes" data-field="notes" maxlength="500" rows="3">${escapeHtml(preview.notes)}</textarea>
    </form>
    ${renderContext(preview.context)}
    <div class="plan-validation" role="status">
      <strong>${targetCount ? `${targetCount} ${targetCount === 1 ? "target" : "targets"} ready` : "Route needs a target"}</strong>
      <span>${targetCount ? `${escapeHtml(preview.minAltitude ?? 20)}° altitude floor` : "Add at least one target before saving."}</span>
    </div>
    ${renderTargets(preview.targets, "preview")}
    <div class="plan-footer-actions">
      <button type="button" class="plan-secondary-action" data-action="dismiss-plan">${isAgent ? "Dismiss preview" : "Close"}</button>
      <button type="button" class="plan-primary-action" data-action="save-plan"${targetCount === 0 ? " disabled" : ""}>${isAgent ? "Save this plan" : "Save plan"}</button>
    </div>
  </section>`;
}

function renderSaved(plan) {
  return `<section class="plan-state plan-saved-state">
    <span class="plan-state-label">Saved route</span>
    <h3>${escapeHtml(plan.title)}</h3>
    ${renderContext(plan.context)}
    ${renderTargets(plan.targets, "saved")}
    <div class="plan-footer-actions">
      <button type="button" class="plan-secondary-action" data-action="edit-plan">Edit plan</button>
      <button type="button" class="plan-primary-action" data-action="start-tour"${plan.targets?.length ? "" : " disabled"}>Start tour</button>
    </div>
  </section>`;
}

function renderTour(plan, tour) {
  const targets = Array.isArray(plan.targets) ? plan.targets : [];
  const index = Number.isInteger(tour.currentIndex) ? tour.currentIndex : plan.currentIndex;
  const progress = targets.length ? `Target ${index + 1} of ${targets.length}` : "No targets";
  return `<section class="plan-state plan-tour-state">
    <span class="plan-state-label">Tour in progress</span>
    <h3>${escapeHtml(plan.title)}</h3>
    <p class="plan-progress" aria-live="polite">${progress}</p>
    ${renderTargets(targets, "tour")}
    <div class="plan-footer-actions plan-tour-actions">
      <button type="button" class="plan-secondary-action" data-action="previous-target"${index <= 0 ? " disabled" : ""}>Previous target</button>
      <button type="button" class="plan-primary-action" data-action="next-target"${index >= targets.length - 1 ? " disabled" : ""}>Next target</button>
    </div>
  </section>`;
}

export function renderPlanMarkup(snapshot = {}) {
  if (snapshot.preview) return renderPreview(snapshot.preview);
  if (snapshot.plan && snapshot.tour?.active) return renderTour(snapshot.plan, snapshot.tour);
  if (snapshot.plan) return renderSaved(snapshot.plan);
  return renderEmpty();
}

export function mountPlanUi({
  root,
  toggle,
  closeButton,
  status,
  actions,
  getSnapshot,
  onClose = () => {},
  closeTopmostOverlay = () => false,
}) {
  const render = () => {
    const active = root.ownerDocument.activeElement;
    const activeField = active && root.contains(active) ? active.dataset.field : null;
    const selection = activeField && Number.isInteger(active.selectionStart) && Number.isInteger(active.selectionEnd)
      ? { start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection || "none" }
      : null;
    root.innerHTML = renderPlanMarkup(getSnapshot());
    const replacement = activeField ? root.querySelector(`[data-field="${activeField}"]`) : null;
    if (replacement) {
      replacement.focus();
      if (selection && typeof replacement.setSelectionRange === "function") {
        replacement.setSelectionRange(selection.start, selection.end, selection.direction);
      }
    }
  };
  const close = () => {
    onClose();
    toggle.focus();
  };

  closeButton?.addEventListener("click", close);

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "create-plan") actions.createManualPlan({
      title: "My observing plan",
      audience: "general",
      durationMinutes: 30,
    });
    if (action === "edit-plan") actions.updatePlan({});
    if (action === "save-plan") actions.savePlan({ previewId: getSnapshot().preview.id });
    if (action === "start-tour") actions.advanceTour({ direction: "start" });
    if (action === "next-target") actions.advanceTour({ direction: "next" });
    if (action === "previous-target") actions.advanceTour({ direction: "previous" });
    if (action === "go-target") actions.advanceTour({ targetIndex: Number(button.dataset.index) });
    if (action === "remove-target") actions.removeTargetFromPlan(button.dataset.targetId);
    if (action === "move-earlier" || action === "move-later") {
      actions.movePlanTarget({
        targetId: button.dataset.targetId,
        direction: action === "move-earlier" ? "earlier" : "later",
      });
    }
    if (action === "dismiss-plan") {
      close();
      return;
    }
    render();
  });

  const updateField = (event, allowedFields) => {
    const field = event.target.closest("[data-field]");
    if (!field || !allowedFields.includes(field.dataset.field)) return;
    const value = field.dataset.field === "durationMinutes" ? Number(field.value) : field.value;
    const result = actions.updatePlan({ [field.dataset.field]: value });
    if (result?.ok === false) {
      if (result.error?.message) status.textContent = result.error.message;
      render();
    }
  };
  root.addEventListener("input", (event) => updateField(event, ["title", "notes"]));
  root.addEventListener("change", (event) => updateField(event, ["audience", "durationMinutes"]));
  root.addEventListener("submit", (event) => event.preventDefault());

  toggle.addEventListener("click", () => {
    setTimeout(() => {
      if (toggle.getAttribute("aria-expanded") !== "true") return;
      const rail = root.ownerDocument.getElementById(toggle.getAttribute("aria-controls"));
      rail?.querySelector("h2")?.focus();
    }, 0);
  });
  root.ownerDocument.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const closedOverlay = closeTopmostOverlay();
    if (!closedOverlay && toggle.getAttribute("aria-expanded") !== "true") return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    if (closedOverlay) return;
    close();
  });

  return {
    render,
    focusTarget(targetId) {
      const target = [...root.querySelectorAll(".plan-target[data-target-id]")]
        .find((item) => item.dataset.targetId === targetId);
      target?.focus();
      return Boolean(target);
    },
    announce(message) {
      status.textContent = message;
    },
  };
}
