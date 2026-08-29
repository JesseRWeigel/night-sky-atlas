# Attribution and license audit

This audit records what the repository itself embeds or requests. It does not
invent licenses for remote material. Confirm current third-party terms before a
publication that adds or changes assets.

| Material | Repository evidence | Attribution / license handling |
| --- | --- | --- |
| Project code and locally authored content | `LICENSE` and `package.json` declare MIT. | The project is released under the [MIT License](../../LICENSE). |
| Typography | `styles.css` imports Google Fonts **DM Sans** and **Manrope**. | Fonts are fetched from Google Fonts at runtime; follow Google Fonts terms for their use and distribution. |
| WebXR renderer | `vr.html` imports Three.js **0.180.0** and addons from jsDelivr. | Remote dependency; retain the import/source attribution and comply with the upstream Three.js license/terms when redistributing. |
| Star facts | `src/catalog.js` curates public-domain Yale Bright Star Catalog and SIMBAD-derived literature values, as described in the in-app source list. | Attribute the data sources; the project does not claim ownership of catalog facts. |
| Deep-sky facts | In-app source list identifies OpenNGC; `src/catalog.js` contains curated Messier/OpenNGC-derived facts. | Attribute the source catalog and verify its current terms for new extraction or bulk reuse. |
| Survey delivery | `index.html` links to CDS HiPS2FITS; `src/app.js` requests surveys through it. | CDS delivers DSS2, Pan-STARRS DR1, and 2MASS imagery. Preserve the in-view credit for the active survey. |
| DSS2 survey credit | `src/app.js`: “DSS2 · STScI/NASA, ESO via CDS.” | Displayed in the viewer; source/archive terms govern the imagery. |
| Pan-STARRS survey credit | `src/app.js`: “Pan-STARRS1 Surveys · PS1 Science Consortium via CDS.” | Displayed in the viewer; source/archive terms govern the imagery. |
| 2MASS survey credit | `src/app.js`: “2MASS · UMass/IPAC-Caltech, NASA/NSF via CDS.” | Displayed in the viewer; source/archive terms govern the imagery. |
| Catalog object images | The `photo(file, credit, source)` helper in `src/catalog.js` stores each image file, credit, and source. `src/app.js` makes the details-panel image credit link point to the original file/license information. | Audit every non-null image record through its embedded metadata. Default source is Wikimedia Commons; individual credits identify NASA, ESA, ESO, or named creators and include any stated public-domain or Creative Commons designation. |

## Catalog-image metadata policy

Every image-bearing entry in `DEEP_SKY` and `SOLAR_SYSTEM_INFO` uses the
catalog's `photo()` metadata: a source filename, a credit string, and a source
(defaulting to Wikimedia Commons when no explicit source is passed). Entries
without an image are `null` and must not imply a photograph exists. The UI uses
the metadata as the image alt text and renders a credit link to the source file.

The repository contains 35 `photo(...)` records at this audit point. Their
embedded credit strings include, as applicable: Adam Evans / CC BY 2.0; ESO /
public release or CC BY 4.0; ESA/Gaia/DPAC / CC BY-SA 3.0 IGO; ESO/DSS2 / CC BY
4.0; NASA, ESA, CSA, STScI, JPL, SDO, AURA/Caltech, and named contributors,
with the explicit public-domain or Creative Commons terms carried by that
metadata. The source file link—not this summary—is the place to verify a
particular remote image's current license.

## Scope of the MIT License

The MIT License applies to this project's code and locally authored content. It
**does not relicense** Google Fonts, Three.js, catalog data, CDS-delivered
surveys, or catalog images fetched from remote sources. Remote image licenses
and source terms remain with the corresponding archives and rights holders.

## Pre-publication review

- Confirm each visible credit link opens the intended original source.
- Do not replace embedded credit/source metadata with a blanket “MIT” claim.
- Obtain permission before using any material outside its license or terms.
- Keep the attribution section and in-app credits visible in the public
  repository and live project.
