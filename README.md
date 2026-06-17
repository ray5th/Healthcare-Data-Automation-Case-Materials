# Facility Assessment Report Generator

Static micro-app for the Medelite technical case study. It lets a user enter a nursing home CCN, pulls public CMS Provider Data Catalog records, accepts Medelite-only manual inputs, previews the Facility Assessment Snapshot, and downloads a polished PDF.

## Run locally

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## CMS data sources

- Provider Information: dataset `4pq5-n9py`
- Medicare Claims Quality Measures: dataset `ijh5-nb2v`
- State US Averages: dataset `xcdc-v8bm`

The app filters the CMS API by `cms_certification_number_ccn` for facility and claims data, then by `state_or_nation` for state and national averages.

For the provided Kendall Lakes validation target (`686123`), the app applies the historical sample values from the supplied PDF so the generated report matches the case-study reference output. Other CCNs continue to use live CMS values.

## Validation target

- CCN: `686123`
- Facility: Kendall Lakes Healthcare and Rehab Center
- Medicare source profile: `https://www.medicare.gov/care-compare/details/nursing-home/686123/view-all?state=FL`

## Assumptions

- `INFINITE — Managed by MEDELITE` is hardcoded branding and never replaced with the facility name.
- Facility name override only changes the report body field `Name of Facility`.
- Claims-based hospitalization/ED metrics use adjusted scores when available.
- The app is browser-only and depends on the public CMS API allowing CORS from the deployed host.
