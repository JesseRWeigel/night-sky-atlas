import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root=resolve(process.argv[2]);
const load=(name)=>import(pathToFileURL(resolve(root,'src',name)));
const { buildCatalogAt, previewObservingPlan }=await load('observing.js');
const { savePlan, PLAN_STORAGE_KEY }=await load('plan-store.js');
const { encodePortablePlan, decodePortablePlan }=await load('portable-plan.js');
const { previewPortableAtLocation }=await load('portable-plan-ui.js');
const date='2026-11-16T11:00:00.000Z';
const receiver={latitude:40,longitude:-80,locationName:'SYNTHETIC_RECEIVER'};
const source={latitude:40.031,longitude:-80.091,locationName:'SYNTHETIC_EXPORT_LOCATION'};
const context={...source,date};
const settings={context, now:date, minAltitude:0, audience:'general', durationMinutes:25, categoryRequirements:{planet:2, bright_star:0, deep_sky:0}};
const catalog=buildCatalogAt(date);
const seed=previewObservingPlan(catalog,{...settings,previewId:'SYNTHETIC_SAVED_ID',title:'SYNTHETIC_SAVED_TITLE',notes:'SYNTHETIC_SAVED_NOTE',targetIds:['planet-mars','planet-jupiter']});
const imported=previewObservingPlan(catalog,{...settings,previewId:'SYNTHETIC_IMPORT_ID',title:'SYNTHETIC_IMPORT_TITLE',targetIds:['planet-jupiter','planet-mars']});
const recipe=encodePortablePlan(imported,catalog);
const exported=encodePortablePlan(seed,catalog);
assert.match(recipe,/planet-jupiter.*planet-mars/s);
assert.doesNotMatch(exported,/SYNTHETIC|latitude|longitude|notes|title|80\.091|40\.031/);
const {targets}=previewPortableAtLocation(recipe,receiver);
assert.deepEqual(targets.map(x=>x.name),['Jupiter','Mars']);
assert.deepEqual(targets.map(x=>x.scheduledTime),[date,'2026-11-16T11:13:00.000Z']);
let stored;
savePlan({setItem:(key,value)=>{assert.equal(key,PLAN_STORAGE_KEY);stored=value;}},{...seed,status:'saved'});
const loc=JSON.stringify({latitude:receiver.latitude,longitude:receiver.longitude,name:receiver.locationName});
const unsupported=JSON.stringify({...decodePortablePlan(recipe),version:2});
const polarRecipe=JSON.stringify({
  format:'night-sky-atlas/plan-recipe',version:1,startTimeUtc:'2026-08-29T01:00:00.000Z',
  audience:'general',durationMinutes:25,targetIds:['star-vega','star-deneb'],
  categoryRequirements:{planet:0,bright_star:2,deep_sky:0}
});
assert.deepEqual(previewPortableAtLocation(polarRecipe,{latitude:90,longitude:0}).targets.map(t=>t.name), ['Vega','Deneb']);
assert.throws(()=>previewPortableAtLocation(polarRecipe,{latitude:-90,longitude:0}));
const fixture={polarRecipe, date, planKey:PLAN_STORAGE_KEY, stored, loc, recipe, exported, unsupported, malformed:'{"SYNTHETIC_BAD_INPUT":', hash:'#received=INERT_SYNTHETIC_FRAGMENT', query:'?scenario=portable'};
await writeFile(resolve(root,'smoke-fixture.json'),JSON.stringify(fixture));
