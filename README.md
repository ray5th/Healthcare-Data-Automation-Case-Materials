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

The app filters the CMS API by `cms_certification_number_ccn` for facility and claims data, then by `state_or_nation` for state and national averages. The Kendall Lakes validation target (`686123`) also uses live CMS Provider Data Catalog values.

## Bonus features included

- All 12 hospitalization/ED report rows: four facility claims measures, each paired with state and national averages.
- Editable Word export (`.docx`) in addition to PDF export.
- Responsive metric cards with facility/state/national comparison bars.
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
- The app is browser-only and depends on the public CMS API allowing CORS from the deployed host.
