"""Bounded real render wait using the hosted image's built-in ChromeDriver."""
from contextlib import contextmanager
from pathlib import Path
import json
import re
import subprocess
import sys
import time
from urllib.error import HTTPError
from urllib.request import Request, build_opener, ProxyHandler

opener = build_opener(ProxyHandler({}))
SCRIPT = """const m=document.getElementById('atlas-render-evidence');
return {page:document.readyState, state:m?.dataset.status??'missing',
  detail:m?.textContent??'', url:location.href};"""

def command(origin, path, data=None, method=None):
    req = Request(origin + path, data=None if data is None else json.dumps(data).encode(),
                  headers={"Content-Type":"application/json"}, method=method)
    try:
        with opener.open(req, timeout=12) as res:
            reply = json.load(res)
    except HTTPError as err:
        raise RuntimeError(f"WebDriver {path}: {err.read().decode(errors='replace')[:1800]}") from err
    return reply["value"]

def ready(driver, session, expected_url, seconds=15):
    deadline = time.monotonic() + seconds
    result = {}
    while time.monotonic() < deadline:
        result = command(driver, f"/session/{session}/execute/sync", {"script":SCRIPT, "args":[]})
        state = result.get("state")
        if result.get("url") != expected_url:
            raise RuntimeError(f"browser did not remain on exact loopback page: {result}")
        if state == "error":
            raise RuntimeError(f"Atlas probe failed: {result}")
        if state == "ready":
            record = json.loads(result["detail"])
            if not isinstance(record, dict):
                raise TypeError("Atlas ready marker must contain an evidence object")
            return record
        time.sleep(0.15)
    raise TimeoutError(f"Atlas probe did not become ready: {result}")

def render(origin, chrome, base, root, variant):
    args = ["--headless", "--no-first-run", "--disable-background-networking",
            "--window-size=1366,900", "--force-device-scale-factor=1",
            "--user-data-dir=" + str(root / (variant + "-profile"))]
    value = command(origin, "/session", {"capabilities":{"alwaysMatch":{
        "browserName":"chrome", "pageLoadStrategy":"eager",
        "goog:chromeOptions":{"binary":chrome, "args":args}}}})
    sid = value["sessionId"]
    try:
        prefix = f"/session/{sid}"
        command(origin, prefix + "/timeouts", {"implicit":0, "pageLoad":8500, "script":2000})
        url = base + "/" + variant + "/"
        command(origin, prefix + "/url", {"url":url})
        record = ready(origin, sid, url)
        (root / (variant + ".json")).write_text(json.dumps(record, indent=2) + "\n")
    finally:
        try:
            command(origin, f"/session/{sid}", method="DELETE")
        except Exception as exc:
            print(f"Chrome session cleanup failed: {exc}", file=sys.stderr)

@contextmanager
def serve(driver, log):
    with log.open("w") as fd, subprocess.Popen([driver, "--port=0"], stdout=fd, stderr=fd) as proc:
        try:
            for _ in range(70):
                if proc.poll() is not None:
                    raise RuntimeError(f"ChromeDriver exited before readiness: {proc.returncode}")
                if m := re.search(r"started successfully on port (\d+)\b", log.read_text(), re.I):
                    origin = "http://127.0.0.1:" + m[1]
                    if command(origin, "/status").get("ready"):
                        yield origin
                        return
                time.sleep(0.1)
            raise TimeoutError("ChromeDriver did not report a ready loopback listener")
        finally:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    proc.kill()

if __name__ == "__main__":
    driver, chrome, base, root = sys.argv[1:]
    if not re.fullmatch(r"http://127\.0\.0\.1:[0-9]+", base):
        raise ValueError("only literal loopback test origin is supported")
    root = Path(root).resolve()
    with serve(driver, root / "driver.log") as origin:
        for variant in ("baseline", "patched"):
            render(origin, chrome, base, root, variant)
