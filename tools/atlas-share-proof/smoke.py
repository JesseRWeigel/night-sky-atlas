"""WebDriver browser phase and fail-closed evidence validation, no package dependencies."""
from pathlib import Path
import json
import re
import sys
import time
from urllib.parse import unquote, urlsplit
from webdriver_support import command, serve

LOC_KEY = "night-sky-location"
EL = "element-6066-11e4-a52e-4f735466cecf"
CHECKS = ("boot", "export", "preview", "repeat", "malformed", "unsupported", "cancel", "escape",
          "back", "forward", "observer-switch", "network")
FIXED_TIME = "2026-11-16T11:00:00.000Z"
def require(ok, label):
    if not ok:
        raise AssertionError(label)

def validate(evidence, variant="fixed"):
    require(set(evidence) == {"checks", "version", "historyMode", "requestCount", "observerOutcome"}, "wrong evidence fields")
    require(evidence["version"] == 2, "wrong evidence schema")
    require(evidence["checks"] == list(CHECKS), "incomplete or misordered browser checks")
    require(evidence["historyMode"] in {"retained transient UI", "reloaded clean UI"}, "unknown history outcome")
    require(isinstance(evidence["requestCount"], int) and evidence["requestCount"] >= 3, "missing network evidence")
    expected = "cleared-and-rechecked" if variant == "fixed" else "stale-control-observed"
    require(evidence["observerOutcome"] == expected, "wrong observer outcome")

def observer_transition(north, south, fixture, variant):
    for snap in [north, south]:
        require(snap["plan"] == fixture["stored"] and snap["input"] == fixture["polarRecipe"] and
                snap["exported"] == fixture["exportedText"] and snap["exportHidden"] is False and
                snap["open"] and snap["rail"] == "true", "saved plan, pasted recipe, or export changed")
    require(north["hash"] == fixture["hash"] and north["url"] == south["url"] and south["hash"] == fixture["hash"],
            "observer switch changed URL")
    require(json.loads(north["loc"]) == {"latitude":90, "longitude":0, "name":"Custom location"} and
            json.loads(south["loc"]) == {"latitude":-90, "longitude":0, "name":"Custom location"},
            "location did not actually change")
    require("Preview for Custom location" in north["status"] and
            [t.split(" · ", 1)[0] for t in north["targets"]] == ["Vega", "Deneb"], "wrong north-pole preview")
    if variant == "negative":
        require(south["status"] == north["status"] and south["targets"] == north["targets"],
                "negative control did not preserve stale north rows")
    else:
        require(south["status"] == "Observing location changed. Preview again." and not south["targets"],
                "observer change did not clear stale north rows")


def network_validate(events, requests, expected_origin):
    counts = dict(app=0, sentinel=0, module=0)
    blocked_csp = {value["requestId"] for kind, value in events
                   if kind == "Network.loadingFailed" and value.get("blockedReason") == "csp"}
    markers = ("INERT_SYNTHETIC_FRAGMENT", "SYNTHETIC_BAD_INPUT", "SYNTHETIC_SAVED_NOTE", "night-sky-atlas/plan-recipe")
    seen = 0
    for kind, payload in events:
        if kind != "Network.requestWillBeSent":
            continue
        req = payload["request"]
        url = urlsplit(req["url"])
        # CDP sometimes shows the browser-document fragment on a navigation request; it is
        # not a request-target. The HTTP transcript below independently checks the wire path.
        raw = unquote(req["url"].split("#", 1)[0]) + unquote(req.get("postData", ""))
        require(not any(marker in raw for marker in markers), "request carried synthetic private data")
        if url.scheme in {"http", "https"}:
            same_origin = f"{url.scheme}://{url.netloc}" == expected_origin
            require(same_origin or payload.get("requestId") in blocked_csp, "unexpected non-blocked external request")
            if same_origin:
                require(req["method"] in {"GET", "HEAD"} and not req.get("hasPostData"), "unexpected app upload")
                seen += 1
    require(seen >= 3, "missing browser request evidence")
    for row in requests:
        target = unquote(row["target"])
        url = urlsplit(target)
        require(not url.netloc and not url.fragment and "#" not in target, "fragment or foreign host reached HTTP server")
        require(not any(marker in target for marker in markers), "server received synthetic private data")
        require(row["method"] in {"GET", "HEAD"}, "unexpected server write")
        if str(row["status"]) not in {"200", "304"}:
            continue
        if target == "/?scenario=portable": counts["app"] += 1
        elif target == "/nav.html": counts["sentinel"] += 1
        elif target == "/src/portable-plan-ui.js": counts["module"] += 1
    require(all(counts.values()), "app, sentinel, or patched module absent from HTTP transcript")
    return seen

class Smoke:
    def __init__(self, driver, sid, origin, fixture):
        self.driver, self.prefix, self.origin, self.fixture = driver, f"/session/{sid}", origin, fixture
        self.page = origin + "/" + fixture["query"] + fixture["hash"]
        self.sentinel = origin + "/nav.html"
        self.milestones = []

    def cmd(self, path, body=None, method=None):
        return command(self.driver, self.prefix + path, body, method)

    def js(self, script, *args):
        return self.cmd("/execute/sync", {"script":script,"args":args})

    def wait(self, cond, seconds=12):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if result := cond():
                return result
            time.sleep(0.15)
        raise TimeoutError("UI milestone not reached")

    def snapshot(self):
        return self.js("""
          const get = id => document.getElementById(id);
          return {url:location.href, hash:location.hash,
            plan:localStorage.getItem(arguments[0]), loc:localStorage.getItem(arguments[1]),
            savedText:get('planContent')?.innerText, count:get('planCount')?.textContent,
            receiver:get('locationName')?.textContent, time:get('dateTimeInput')?.value,
            playback:get('playToggle')?.getAttribute('aria-label'),
            focus:document.activeElement?.id, open:get('portablePlan')?.open,
            rail:get('planToggle')?.getAttribute('aria-expanded'),
            input:get('portableInput')?.value, status:get('portableResult')?.textContent,
            targets:Array.from(document.querySelectorAll('#portableTargets li'), n=>n.textContent),
            exported:get('portableOutput')?.value, exportHidden:get('portableOutputGroup')?.hidden,
            exportReadOnly:get('portableOutput')?.readOnly,
            portableButtons:Array.from(document.querySelectorAll('#portablePlan button'), n=>n.id)
          };
        """, self.fixture["planKey"], LOC_KEY)

    def elem(self, selector):
        return self.cmd("/element", {"using":"css selector","value":selector})[EL]

    def click(self, selector):
        self.cmd("/element/" + self.elem(selector) + "/click", {})

    def key(self, selector, code):
        self.cmd("/element/" + self.elem(selector) + "/value", {"text":code})

    def paste(self, value):
        # Synthetic paste without accessing the OS clipboard. The activation itself uses WebDriver.
        self.js("""const el=document.getElementById('portableInput');
          el.focus(); el.value=arguments[0]; el.dispatchEvent(new Event('input',{bubbles:true}));""", value)

    def protected(self, snap, stable_time=True):
        f = self.fixture
        require(snap["url"] == self.page and snap["hash"] == f["hash"], "receiver URL mutated")
        require(snap["plan"] == f["stored"] and snap["loc"] == f["loc"], "saved plan/location storage mutated")
        require(snap["receiver"] == "SYNTHETIC_RECEIVER" and snap["count"] == "2", "live observer/count changed")
        require("SYNTHETIC_SAVED_TITLE" in snap["savedText"] and
                "Mars" in snap["savedText"] and "Jupiter" in snap["savedText"] and
                snap["savedText"].index("Mars") < snap["savedText"].index("Jupiter"), "active plan replaced")
        if stable_time:
            require(snap["time"] == "2026-11-16T12:34" and snap["playback"] == "Resume time",
                    "observer time or playback changed")

    def clean(self, snap):
        require(not snap["open"] and snap["input"] == "" and snap["status"] == "" and not snap["targets"] and
                snap["exportHidden"] is True and snap["exported"] == "", "transient data not cleared")

    def expect_preview(self, snap):
        self.protected(snap)
        msg = snap["status"]
        require(FIXED_TIME in msg and "Pacific/Honolulu" in msg and "1:00 AM" in msg,
                "expected UTC and browser-zone labeling")
        require("SYNTHETIC_RECEIVER" in msg and "horizon only" in msg and "No plan was saved or replaced" in msg,
                "receiver or narrow-scope copy missing")
        require(len(snap["targets"]) == 2 and snap["targets"][0].startswith("Jupiter · ") and
                snap["targets"][1].startswith("Mars · ") and "11:13:00.000Z" in snap["targets"][1],
                "wrong order, repeated rows, or changed schedule")
        require(snap["portableButtons"] == ["portableExport", "portableImport"], "unexpected apply control")

    def open_share(self):
        if self.snapshot()["rail"] != "true":
            self.key("#planToggle", "\ue007")
            self.wait(lambda: self.snapshot()["focus"] == "planRailTitle")
        if not self.snapshot()["open"]:
            self.key("#portablePlan summary", "\ue007")
            self.wait(lambda: self.snapshot()["open"])

    def change_coordinates(self, latitude):
        # Drive the app's actual observer field event, not a direct test-only hook.
        self.js("""
          const lat=document.getElementById('latitudeInput'), lon=document.getElementById('longitudeInput');
          lat.value=arguments[0]; lon.value='0';
          lat.dispatchEvent(new Event('change',{bubbles:true}));
        """, str(latitude))
        self.wait(lambda: json.loads(self.snapshot()["loc"])["latitude"] == latitude)

    def check_observer_switch(self, variant):
        f = self.fixture
        self.open_share()
        self.key("#portableExport", "\ue007")
        exported = self.snapshot()["exported"]
        require(json.loads(exported) == json.loads(f["exported"]), "wrong observer test export")
        self.change_coordinates(90)
        self.paste(f["polarRecipe"])
        self.key("#portableImport", "\ue007")
        north = self.snapshot()
        self.change_coordinates(-90)
        south = self.snapshot()
        observer_transition(north, south, dict(f, exportedText=exported), variant)
        self.key("#portableImport", "\ue007")
        rescored = self.snapshot()
        require(rescored["status"].startswith("Cannot preview") and not rescored["targets"],
                "fresh preview did not use the changed observer")
        require(rescored["exported"] == exported and rescored["input"] == f["polarRecipe"] and
                rescored["plan"] == f["stored"], "re-preview lost data")
        self.milestones.append("observer-switch")
        return "stale-control-observed" if variant == "negative" else "cleared-and-rechecked"

    def run(self):
        f = self.fixture
        self.cmd("/url", {"url":self.sentinel})
        self.js("localStorage.setItem(arguments[0], arguments[1]); localStorage.setItem(arguments[2], arguments[3]);",
                f["planKey"], f["stored"], LOC_KEY, f["loc"])
        self.cmd("/goog/cdp/execute", {"cmd":"Emulation.setTimezoneOverride","params":{"timezoneId":"Pacific/Honolulu"}})
        self.cmd("/url", {"url":self.page})
        self.wait(lambda: self.js("return document.readyState==='complete' && document.getElementById('planCount')?.textContent==='2'"))
        if self.snapshot()["playback"] == "Pause time":
            self.click("#playToggle")
        self.js("""const el=document.getElementById('dateTimeInput');
              el.value='2026-11-16T12:34'; el.dispatchEvent(new Event('change',{bubbles:true}));""")
        self.open_share()
        self.protected(self.snapshot())
        self.milestones.append("boot")

        self.key("#portableExport", "\ue007")
        exported = self.snapshot()
        self.protected(exported)
        require(exported["focus"] == "portableOutput" and exported["exportReadOnly"] is True and
                not exported["exportHidden"] and json.loads(exported["exported"]) == json.loads(f["exported"]),
                "export focus or sanitized recipe wrong")
        self.milestones.append("export")

        self.paste(f["recipe"])
        require(self.snapshot()["status"] == "", "paste should not auto-preview")
        self.key("#portableImport", "\ue007")
        self.expect_preview(self.snapshot())
        self.milestones.append("preview")
        self.key("#portableImport", "\ue007")
        self.expect_preview(self.snapshot())
        self.milestones.append("repeat")

        for phase, key in [("malformed", "malformed"), ("unsupported", "unsupported")]:
            self.paste(f[key])
            require(not self.snapshot()["targets"], "editing did not clear previous rows")
            self.key("#portableImport", "\ue007")
            invalid = self.snapshot()
            self.protected(invalid)
            require(invalid["status"].startswith("Cannot preview") and not invalid["targets"], "invalid recipe did not fail closed")
            self.milestones.append(phase)

        self.paste(f["recipe"])
        self.key("#portableImport", "\ue007")
        self.key("#portablePlan summary", "\ue007")
        self.wait(lambda: not self.snapshot()["open"] and not self.snapshot()["input"])
        canceled = self.snapshot()
        self.protected(canceled)
        self.clean(canceled)
        require(canceled["rail"] == "true", "share Cancel closed parent rail")
        self.milestones.append("cancel")

        self.open_share()
        self.paste(f["recipe"])
        self.key("#portableImport", "\ue007")
        self.key("#portableInput", "\ue00c")
        escaped = self.snapshot()
        self.protected(escaped)
        self.clean(escaped)
        require(escaped["rail"] == "false" and escaped["focus"] == "planToggle", "Escape did not restore Plan opener focus")
        self.milestones.append("escape")

        self.open_share()
        self.paste(f["recipe"])
        self.key("#portableImport", "\ue007")
        self.expect_preview(self.snapshot())
        self.cmd("/back", {})
        self.wait(lambda: self.js("return location.href") == self.sentinel)
        require(self.js("return localStorage.getItem(arguments[0])", f["planKey"]) == f["stored"], "Back changed saved state")
        self.milestones.append("back")
        self.cmd("/forward", {})
        self.wait(lambda: self.js("return location.href===arguments[0] && document.getElementById('planCount')?.textContent==='2'", self.page))
        after = self.snapshot()
        self.protected(after, stable_time=False)
        if after["open"]:
            self.expect_preview(after)
            history = "retained transient UI"
        else:
            self.clean(after)
            history = "reloaded clean UI"
        self.milestones.append("forward")
        return history

def main(driver, chrome, base, stage, result_root, variant):
    require(variant in {"fixed","negative"}, "unknown candidate variant")
    require(re.fullmatch(r"http://127\.0\.0\.1:[0-9]+", base), "Only literal loopback is allowed")
    stage, root = Path(stage), Path(result_root)
    fixture = json.loads((stage / "smoke-fixture.json").read_text())
    args = ["--headless=new", "--no-first-run", "--disable-background-networking", "--window-size=1200,800",
            "--user-data-dir=" + str(root / "profile")]
    with serve(driver, root / "driver.log") as url:
        started = time.monotonic()
        print(f"{variant}: requesting Chrome session with 40s startup limit", flush=True)
        session = command(url, "/session", {"capabilities":{"alwaysMatch":{
             "browserName":"chrome","pageLoadStrategy":"eager",
             "goog:chromeOptions":{"binary":chrome,"args":args},
             "goog:loggingPrefs":{"performance":"ALL"}}}}, timeout=40)
        print(f"{variant}: Chrome session ready after {time.monotonic() - started:.2f}s", flush=True)
        sid = session["sessionId"]
        test = Smoke(url, sid, base, fixture)
        try:
            test.cmd("/timeouts", {"implicit":0, "pageLoad":9000, "script":2000})
            try:
                mode = test.run()
                outcome = test.check_observer_switch(variant)
            except Exception:
                print("Completed browser phases:", ", ".join(test.milestones) or "none", file=sys.stderr)
                raise
            logs = test.cmd("/se/log", {"type":"performance"})
            events = [(message["method"], message["params"])
                      for entry in logs if "message" in (obj := json.loads(entry["message"]))
                      for message in [obj["message"]]]
            requests = [json.loads(line) for line in (root / "server.log").read_text().splitlines() if line]
            count = network_validate(events, requests, base)
            test.milestones.append("network")
            evidence = dict(checks=test.milestones, version=2, historyMode=mode, requestCount=count, observerOutcome=outcome)
            validate(evidence, variant)
            (root / "evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
        finally:
            test.cmd("", method="DELETE")

if __name__ == "__main__":
    main(*sys.argv[1:])
