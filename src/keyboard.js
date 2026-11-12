// Preserve native controls, text editing, assistive-tech chords and IME composition.
export function skyShortcut(event, canvas) {
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return null;
  const target = event.target;
  if (target?.closest?.('input, textarea, select, button, a, summary, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="button"], [role="slider"], [role="combobox"]')) return null;
  if (event.key === "/") return "search";
  // Navigation belongs to the sky, not unrelated panels or scrollable content.
  if (target !== canvas && target?.tagName !== "BODY") return null;
  if ([" ", "+", "=", "-", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return "sky";
  return null;
}
