// Appended only to both isolated copies of src/app.js. No window hooks or
// repository changes. Plane positions come from the app's actual draw path.
{
  const report = document.getElementById('atlas-render-evidence');
  if (report?.dataset.status === "error") throw new Error(report.textContent);
  if (!report) throw new Error('Missing static Atlas test marker');
  report.dataset.status = 'scheduled';
  requestAnimationFrame(() => {
    if (report.dataset.status === "error") return;
    try {
      Object.assign(state, {
        date: new Date('2026-11-16T11:00:00Z'),
        latitude: 40.36, longitude: -80.61,
        centerAz: 160.46526828074775, centerAlt: 63.15903091524196,
        fov: 40, playing: false, selected: null, hover: null, survey: 'off',
        layers: { stars: true, objects: false, constellations: false, grid: false, labels: true },
      });
      resize();
      updateDynamicCatalog(true);
      draw();
      const targets = Object.fromEntries(['Sun', 'Mars', 'Jupiter'].map(name => {
        const catalogObject = state.dynamicCatalog.find(o => o.name === name);
        if (!catalogObject) throw new Error(`Missing catalog object ${name}`);
        const record = state.rendered.find(item => item.object.id === catalogObject.id);
        if (!record) return [name, null];
        const { x, y } = record;
        return [name, { x, y, onCanvas: x >= 0 && x < state.width && y >= 0 && y < state.height }];
      }));
      const evidence = {
        instant: state.date.toISOString(),
        width: state.width, height: state.height, dpr: state.dpr,
        canvasWidth: canvas.width, canvasHeight: canvas.height,
        mode: $('#viewMode').textContent,
        daylight: $('#skyCondition').classList.contains('day'),
        targets,
      };
      report.textContent = JSON.stringify(evidence, null, 2);
      report.dataset.status = 'ready';
    } catch (error) {
      report.textContent = String(error);
      report.dataset.status = 'error';
    }
  });
}
