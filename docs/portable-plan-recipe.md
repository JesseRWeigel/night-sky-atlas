# Portable observing plan recipe

The version 1 JSON recipe is intentionally separate from local saved-plan storage.
It contains an absolute UTC start instant, the audience, duration, ordered
catalog IDs and category requirements. The schedule starts at that instant and
the planner distributes duration across the ordered targets. The original
civil timezone is not tracked by the existing planner and is not encoded; a
preview labels the UTC instant and shows it in the browser’s local time.

The exporter does not include coordinates, location name, title, notes, local
IDs, creation or update times, tour progress, or location-derived altitude and
azimuth. Version 1 has no opt-in mechanism for exporting those fields. The
scheduled UTC instant is still shared; it is not intended as anonymization.

The decoder accepts only the declared version and shape under a size limit.
Successful parsing yields inert data, not permission to activate, save, or
replace any plan. Catalog membership, target availability and observing
constraints are checked by the existing planner when a caller builds a preview
with a separately chosen observer location. A valid recipe can be unsuitable
from that location. No network, browser storage, UI or WebMCP changes are
performed by the codec. The manual preview lists what would be shared and checks local feasibility.
It does not save or replace plans.

## Manual preview

Open **Plan → Share or preview a plan**. Choose **Preview saved plan export**
and copy the read-only JSON only if you want to share its time and catalog
targets. Paste that JSON into **Paste shared plan JSON** and choose **Preview
import**. The app shows the original UTC instant and converts it for display
in the browser’s time zone, which may differ from the observing location.
The imported route is checked locally against the horizon, not the original
minimum altitude, weather, darkness or visibility; nothing is saved, applied
or replaced. Close the share section or Plan panel to clear this temporary
preview. Observing history and agent-based imports are out of scope.
