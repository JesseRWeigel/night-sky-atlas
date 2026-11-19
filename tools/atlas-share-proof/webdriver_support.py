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
def command(origin, path, data=None, method=None, *, timeout=12):
    req = Request(origin + path, data=None if data is None else json.dumps(data).encode(),
                  headers={"Content-Type":"application/json"}, method=method)
    try:
        with opener.open(req, timeout=timeout) as res:
            reply = json.load(res)
    except HTTPError as err:
        raise RuntimeError(f"WebDriver {path}: {err.read().decode(errors='replace')[:1800]}") from err
    except TimeoutError as err:
        raise TimeoutError(f"WebDriver {req.get_method()} {path}: no reply within {timeout}s") from err
    return reply["value"]

@contextmanager
def serve(driver, log):
    with log.open("w") as fd, subprocess.Popen([driver, "--port=0", "--verbose"], stdout=fd, stderr=fd) as proc:
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

