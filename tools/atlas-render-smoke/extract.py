"""Read geometry evidence from Chrome's serialized DOM, never compute expected positions."""
from html.parser import HTMLParser
from pathlib import Path
import json
import sys

class Evidence(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.records = []
        self.reading = None
    def handle_starttag(self, tag, attributes):
        a = dict(attributes)
        if tag == "pre" and a.get("id") == "atlas-render-evidence":
            self.reading = (a.get("data-status"), [])
            self.records.append(self.reading)
    def handle_endtag(self, tag):
        if tag == "pre":
            self.reading = None
    def handle_data(self, data):
        if self.reading:
            self.reading[1].append(data)

def payload(html):
    p = Evidence()
    p.feed(html)
    if len(p.records) != 1:
        raise ValueError(f"expected one rendered evidence element, got {len(p.records)}")
    status, parts = p.records[0]
    report = "".join(parts)
    if status != "ready":
        raise ValueError(f"probe status {status!r}: {report[:500]}")
    result = json.loads(report)
    if not isinstance(result, dict):
        raise TypeError("probe JSON must be an object")
    return result

def self_test():
    assert payload('<pre id="atlas-render-evidence" hidden data-status="ready">{"encoded":"&lt;&amp;"}</pre>') == {"encoded":"<&"}
    for html in ("", '<pre id="atlas-render-evidence" data-status="error">bad canvas</pre>', '<pre id="atlas-render-evidence" data-status="ready">not json</pre>', '<pre id="atlas-render-evidence" data-status="ready">[]</pre>', '<pre id="atlas-render-evidence" data-status="ready">{}</pre>' * 2):
        try:
            payload(html)
        except (ValueError, TypeError):
            continue
        raise AssertionError(f"accepted invalid control: {html}")
    print("DOM extraction: one positive + five invalid controls")

if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    else:
        source, target = map(Path, sys.argv[1:])
        target.write_text(json.dumps(payload(source.read_text()), indent=2) + "\n")
