# Facility Assessment Report Generator

Static micro-app for the Medelite technical case study. It lets a user enter a nursing home CCN, pulls public CMS Provider Data Catalog records, accepts Medelite-only manual inputs, previews the Facility Assessment Snapshot, and downloads a polished PDF.

## Run locally with the Netlify proxy

```bash
npx netlify dev
```

Open the local URL printed by Netlify CLI, normally `http://localhost:8888`.

## Deploy on Netlify

1. In Netlify, select **Add new project** and **Import an existing project**.
2. Connect the GitHub repository.
3. Leave the build command empty.
4. Set the publish directory to `.`.
5. Deploy the project.

`netlify.toml` rewrites `/api/cms/*` to the CMS Provider Data Catalog API. The browser only calls the Netlify site’s own origin, avoiding the CMS browser CORS restriction. This uses a CDN proxy rewrite rather than a Netlify Function.

## CMS data sources

- Provider Information: dataset `4pq5-n9py`
- Medicare Claims Quality Measures: dataset `ijh5-nb2v`
- State US Averages: dataset `xcdc-v8bm`

The app filters the CMS API by `cms_certification_number_ccn` for facility and claims data, then by `state_or_nation` for state and national averages. The Kendall Lakes validation target (`686123`) also uses live CMS Provider Data Catalog values.

## Included features

- All 12 hospitalization/ED report rows: four facility claims measures, each paired with state and national averages.
- A focused report preview matching the supplied Facility Assessment Snapshot structure.
- Advanced error handling for invalid CCNs, CMS timeouts, unreachable CMS API responses, missing facilities, and incomplete CMS fields.

## Validation target

- CCN: `686123`
- Facility: Kendall Lakes Healthcare and Rehab Center
- Medicare source profile: `https://www.medicare.gov/care-compare/details/nursing-home/686123/view-all?state=FL`

## Assumptions

- `INFINITE — Managed by MEDELITE` is hardcoded branding and never replaced with the facility name.
- Facility name override only changes the report body field `Name of Facility`.
- Claims-based hospitalization/ED metrics use adjusted scores when available.
- The supplied Kendall Lakes PDF contains historical sample values, so its star ratings may differ from the current CMS API response.
- The app depends on the Netlify proxy rewrite in `netlify.toml`; serving it with a basic static server will not provide the `/api/cms/*` endpoint.
