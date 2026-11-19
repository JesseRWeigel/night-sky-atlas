"""Positive and negative oracle controls independent of a browser binary."""
from copy import deepcopy
from smoke import CHECKS, Smoke, network_validate, validate, observer_transition
from urllib.parse import quote

origin = "http://127.0.0.1:18181"
def request(url, method="GET", **kwargs):
    return ("Network.requestWillBeSent", {"requestId":url, "request":dict(url=url, method=method, **kwargs)})
def row(target, method="GET", status=200):
    return dict(target=target, method=method, status=status)
app = origin + "/?scenario=portable#received=INERT_SYNTHETIC_FRAGMENT"
sentinel = origin + "/nav.html"
module = origin + "/src/portable-plan-ui.js"
blocked = "https://fixture.invalid/mock.css"
events = [request(app), request(sentinel), request(module), request(blocked),
          ("Network.loadingFailed", {"requestId":blocked, "blockedReason":"csp"})]
rows = [row("/?scenario=portable"), row("/nav.html"), row("/src/portable-plan-ui.js")]
assert network_validate(events, rows, origin) == 3
evidence = dict(version=2, checks=list(CHECKS), historyMode="reloaded clean UI", requestCount=3, observerOutcome="cleared-and-rechecked")
validate(evidence)
validate(dict(evidence, historyMode="retained transient UI"))
def rejects(fn, phrase):
    try:
        fn()
    except AssertionError as err:
        assert phrase in str(err),(phrase, str(err))
    else:
        raise AssertionError("expected rejection: "+phrase)
for a,b,why in [
    (events[:-1], rows, "unexpected non-blocked external request"),
    (events + [request(origin+"/?x="+quote("night-sky-atlas/plan-recipe",safe=""))], rows, "request carried"),
    (events + [request(origin+"/upload","POST",hasPostData=True)], rows, "unexpected app upload"),
    (events + [request(origin+"/upload","POST",postData="{ \"SYNTHETIC_SAVED_NOTE\": 1 }")], rows, "request carried"),
    (events, rows+[row("/?payload=SYNTHETIC_BAD_INPUT")], "received synthetic private"),
    (events, rows+[row("/?scenario=portable#received=INERT_SYNTHETIC_FRAGMENT")], "fragment"),
    (events, rows[1:], "absent from HTTP transcript"),
    (events, rows+[row("/write","POST",501)], "unexpected server write"),
    (events[:2], rows, "missing browser request evidence"),
]:
    rejects(lambda: network_validate(a,b,origin), why)
for altered,why in [
    (dict(evidence, checks=list(CHECKS[:-1])), "incomplete"),
    (dict(evidence, version=1), "schema"),
    (dict(evidence, requestCount=1), "missing network"),
    (dict(evidence, historyMode="unknown"), "unknown history"),
]:
    rejects(lambda: validate(altered),why)
fixture=dict(query="?scenario=portable",hash="#received=INERT_SYNTHETIC_FRAGMENT",stored="saved",loc="receiver")
model=Smoke("unused","unused",origin,fixture)
snapshot=dict(url=app,hash=fixture["hash"],plan="saved",loc="receiver",savedText="SYNTHETIC_SAVED_TITLE Mars Jupiter",
              receiver="SYNTHETIC_RECEIVER",count="2",time="2026-11-16T12:34",playback="Resume time",
              status="UTC: 2026-11-16T11:00:00.000Z · Browser time (Pacific/Honolulu): 1:00 AM. Preview for SYNTHETIC_RECEIVER, checked against the horizon only. No plan was saved or replaced.",
              targets=["Jupiter · 11:00:00.000Z","Mars · 11:13:00.000Z"],portableButtons=["portableExport","portableImport"])
model.expect_preview(snapshot)
for diff,why in [
    (dict(time="2026-11-16T11:00"), "observer time"),
    (dict(plan="replaced"), "storage mutated"),
    (dict(receiver="wrong"), "observer/count"),
    (dict(url=app.split("#")[0]), "receiver URL mutated"),
    (dict(targets=snapshot["targets"]*2), "wrong order"),
    (dict(portableButtons=snapshot["portableButtons"]+["apply"]), "apply control"),
]:
    rejects(lambda: model.expect_preview(dict(snapshot,**diff)),why)

polar = dict(stored="saved",polarRecipe="polar",exportedText="export",hash="#marker")
north = dict(plan="saved",input="polar",exported="export",exportHidden=False,open=True,rail="true",
             status="Preview for Custom location",targets=["Vega · midnight","Deneb · midnight"],hash="#marker",url=app,
             loc='{"latitude":90,"longitude":0,"name":"Custom location"}')
negative = dict(north, loc='{"latitude":-90,"longitude":0,"name":"Custom location"}')
fixed = dict(negative, status="Observing location changed. Preview again.", targets=[])
observer_transition(north, fixed, polar, "fixed")
observer_transition(north, negative, polar, "negative")
validate(dict(evidence, observerOutcome="stale-control-observed"), "negative")
rejects(lambda: validate(evidence, "negative"), "wrong observer outcome")
rejects(lambda: observer_transition(north, negative, polar, "fixed"), "did not clear stale")
rejects(lambda: observer_transition(north, fixed, polar, "negative"), "did not preserve stale")
rejects(lambda: observer_transition(north, dict(fixed, input=""), polar, "fixed"), "pasted recipe")
rejects(lambda: observer_transition(north, dict(fixed, exported=""), polar, "fixed"), "or export changed")
rejects(lambda: observer_transition(north, dict(fixed, loc=north["loc"]), polar, "fixed"), "did not actually change")
print("PASS: 7 positive and 25 negative synthetic evidence controls; not browser evidence")
