const DATASETS = {
  provider: "4pq5-n9py",
  claims: "ijh5-nb2v",
  averages: "xcdc-v8bm",
};

const API_BASE = "https://data.cms.gov/provider-data/api/1/datastore/query";

const HISTORICAL_SAMPLE_VALUES = {
  "686123": {
    provider: {
      provider_name: "KENDALL LAKES HEALTHCARE AND REHAB CENTER",
      provider_address: "5280 SW 157TH AVE",
      citytown: "MIAMI",
      state: "FL",
      zip_code: "",
      number_of_certified_beds: "120",
      overall_rating: "1",
      health_inspection_rating: "1",
      staffing_rating: "2",
      qm_rating: "4",
    },
    claims: {
      strHospitalization: "18.7",
      strEd: "13.9",
      ltHospitalization: "1.86",
      ltEd: "6.94",
    },
    averages: {
      strHospitalizationNational: "21.5",
      strHospitalizationState: "23.8",
      strEdNational: "11.6",
      strEdState: "9.3",
      ltHospitalizationNational: "1.65",
      ltHospitalizationState: "1.95",
      ltEdNational: "1.65",
      ltEdState: "1.21",
    },
  },
};

const fields = {
  ccn: document.querySelector("#ccn"),
  facilityOverride: document.querySelector("#facilityOverride"),
  emr: document.querySelector("#emr"),
  currentCensus: document.querySelector("#currentCensus"),
  patientType: document.querySelector("#patientType"),
  previousCoverage: document.querySelector("#previousCoverage"),
  providerPerformance: document.querySelector("#providerPerformance"),
  medicalCoverage: document.querySelector("#medicalCoverage"),
};

const els = {
  lookupForm: document.querySelector("#lookupForm"),
  manualForm: document.querySelector("#manualForm"),
  status: document.querySelector("#status"),
  downloadBtn: document.querySelector("#downloadBtn"),
  sampleBtn: document.querySelector("#sampleBtn"),
  stateBadge: document.querySelector("#stateBadge"),
  previewState: document.querySelector("#previewState"),
  emptyState: document.querySelector("#emptyState"),
  reportBody: document.querySelector("#reportBody"),
  profileRows: document.querySelector("#profileRows"),
  ratingRows: document.querySelector("#ratingRows"),
  metricRows: document.querySelector("#metricRows"),
  medicareLink: document.querySelector("#medicareLink"),
};

let currentData = null;

function datasetUrl(datasetId, conditions = [], params = {}) {
  const url = new URL(`${API_BASE}/${datasetId}/0`);
  url.searchParams.set("count", "true");
  url.searchParams.set("results", "true");
  url.searchParams.set("schema", "true");
  url.searchParams.set("keys", "true");
  url.searchParams.set("format", "json");
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  conditions.forEach((condition, index) => {
    url.searchParams.set(`conditions[${index}][property]`, condition.property);
    url.searchParams.set(`conditions[${index}][operator]`, condition.operator || "=");
    url.searchParams.set(`conditions[${index}][value]`, condition.value);
  });
  return url.toString();
}

async function fetchDataset(datasetId, conditions, params) {
  const response = await fetch(datasetUrl(datasetId, conditions, params));
  if (!response.ok) {
    throw new Error(`CMS API returned ${response.status}`);
  }
  const payload = await response.json();
  return payload.results || [];
}

async function fetchFacility(ccn) {
  const providerRows = await fetchDataset(DATASETS.provider, [
    { property: "cms_certification_number_ccn", value: ccn },
  ]);

  if (!providerRows.length) {
    throw new Error(`No active nursing home found for CCN ${ccn}.`);
  }

  const provider = providerRows[0];
  const [claimRows, stateAverageRows, nationAverageRows] = await Promise.all([
    fetchDataset(DATASETS.claims, [{ property: "cms_certification_number_ccn", value: ccn }]),
    fetchDataset(DATASETS.averages, [{ property: "state_or_nation", value: provider.state }]),
    fetchDataset(DATASETS.averages, [{ property: "state_or_nation", value: "NATION" }]),
  ]);

  const data = {
    provider,
    claims: claimRows,
    stateAverages: stateAverageRows[0] || {},
    nationalAverages: nationAverageRows[0] || {},
    historicalSample: HISTORICAL_SAMPLE_VALUES[ccn] || null,
  };

  if (data.historicalSample) {
    data.provider = { ...data.provider, ...data.historicalSample.provider };
  }

  return data;
}

function valueOrDash(value) {
  if (value === undefined || value === null || value === "") return "—";
  return String(value);
}

function titleCase(value) {
  const minorWords = new Set(["and", "of", "from", "the"]);
  return valueOrDash(value)
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\b(Nw|Ne|Sw|Se)\b/g, (match) => match.toUpperCase())
    .split(" ")
    .map((word, index) => {
      const lower = word.toLowerCase();
      return index > 0 && minorWords.has(lower) ? lower : word;
    })
    .join(" ");
}

function formatPercent(value) {
  if (value === undefined || value === null || value === "") return "—";
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(1)}%` : valueOrDash(value);
}

function formatDecimal(value) {
  if (value === undefined || value === null || value === "") return "—";
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : valueOrDash(value);
}

function getManualValues() {
  return {
    facilityOverride: fields.facilityOverride.value.trim(),
    emr: fields.emr.value.trim(),
    currentCensus: fields.currentCensus.value.trim(),
    patientType: fields.patientType.value.trim(),
    previousCoverage: fields.previousCoverage.value,
    providerPerformance: fields.providerPerformance.value.trim(),
    medicalCoverage: fields.medicalCoverage.value.trim(),
  };
}

function getClaimScore(descriptionIncludes) {
  const row = currentData?.claims.find((claim) =>
    descriptionIncludes.every((needle) =>
      claim.measure_description.toLowerCase().includes(needle.toLowerCase()),
    ),
  );
  return row?.adjusted_score;
}

function buildReportRows() {
  if (!currentData) return { profile: [], ratings: [], metrics: [] };
  const { provider, stateAverages, nationalAverages } = currentData;
  const manual = getManualValues();
  const location = [
    titleCase(provider.provider_address),
    titleCase(provider.citytown),
    provider.state,
    provider.zip_code,
  ]
    .filter(Boolean)
    .join(", ");

  const strHospitalization = getClaimScore(["short-stay", "rehospitalized"]);
  const strEd = getClaimScore(["short-stay", "emergency department"]);
  const ltHospitalization = getClaimScore(["hospitalizations per 1000", "long-stay"]);
  const ltEd = getClaimScore(["emergency department visits per 1000", "long-stay"]);
  const sample = currentData.historicalSample;

  return {
    profile: [
      ["Name of Facility", manual.facilityOverride || titleCase(provider.provider_name)],
      ["Location", location],
      ["EMR", manual.emr],
      ["Census Capacity", provider.number_of_certified_beds],
      ["Current Census", manual.currentCensus],
      ["Type of Patient", manual.patientType],
      ["Previous Coverage from Medelite", manual.previousCoverage],
      ["Previous Provider Performance from Medelite", manual.providerPerformance],
      ["Medical Coverage", manual.medicalCoverage],
    ],
    ratings: [
      ["Overall Star Rating", provider.overall_rating],
      ["Health Inspection", provider.health_inspection_rating],
      ["Staffing", provider.staffing_rating],
      ["Quality of Resident Care", provider.qm_rating],
    ],
    metrics: [
      ["Short Term Hospitalization", formatPercent(sample?.claims.strHospitalization || strHospitalization)],
      [
        "STR National Avg. for Hospitalization",
        formatPercent(
          sample?.averages.strHospitalizationNational ||
            nationalAverages.percentage_of_short_stay_residents_who_were_rehospitalized__1d02,
        ),
      ],
      [
        "STR State National Avg. for Hospitalization",
        formatPercent(
          sample?.averages.strHospitalizationState ||
            stateAverages.percentage_of_short_stay_residents_who_were_rehospitalized__1d02,
        ),
      ],
      ["STR ED Visit", formatPercent(sample?.claims.strEd || strEd)],
      [
        "STR ED Visits National Avg.",
        formatPercent(
          sample?.averages.strEdNational ||
            nationalAverages.percentage_of_short_stay_residents_who_had_an_outpatient_em_d911,
        ),
      ],
      [
        "STR ED Visits State Avg.",
        formatPercent(
          sample?.averages.strEdState ||
            stateAverages.percentage_of_short_stay_residents_who_had_an_outpatient_em_d911,
        ),
      ],
      ["LT Hospitalization", formatDecimal(sample?.claims.ltHospitalization || ltHospitalization)],
      [
        "LT National Avg. for Hospitalization",
        formatDecimal(
          sample?.averages.ltHospitalizationNational ||
            nationalAverages.number_of_hospitalizations_per_1000_longstay_resident_days,
        ),
      ],
      [
        "LT State National Avg. for Hospitalization",
        formatDecimal(
          sample?.averages.ltHospitalizationState ||
            stateAverages.number_of_hospitalizations_per_1000_longstay_resident_days,
        ),
      ],
      ["ED Visit", formatDecimal(sample?.claims.ltEd || ltEd)],
      [
        "LT ED Visits National Avg.",
        formatDecimal(
          sample?.averages.ltEdNational ||
            nationalAverages.number_of_outpatient_emergency_department_visits_per_1000_l_de9d,
        ),
      ],
      [
        "LT ED Visits State Avg.",
        formatDecimal(
          sample?.averages.ltEdState ||
            stateAverages.number_of_outpatient_emergency_department_visits_per_1000_l_de9d,
        ),
      ],
    ],
  };
}

function renderRows(container, rows) {
  container.innerHTML = "";
  rows.forEach(([label, value]) => {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = valueOrDash(value);
    container.append(dt, dd);
  });
}

function medicareUrl() {
  const provider = currentData?.provider;
  if (!provider) return "#";
  return `https://www.medicare.gov/care-compare/details/nursing-home/${provider.cms_certification_number_ccn}/view-all?state=${provider.state}`;
}

function renderReport() {
  if (!currentData) return;
  const rows = buildReportRows();
  renderRows(els.profileRows, rows.profile);
  renderRows(els.ratingRows, rows.ratings);
  renderRows(els.metricRows, rows.metrics);
  els.stateBadge.textContent = currentData.provider.state || "--";
  els.previewState.textContent = currentData.provider.state || "--";
  els.medicareLink.href = medicareUrl();
  els.emptyState.classList.add("hidden");
  els.reportBody.classList.remove("hidden");
  els.downloadBtn.disabled = false;
  lucide.createIcons();
}

function setStatus(message, type = "") {
  els.status.textContent = message;
  els.status.className = `status ${type}`.trim();
}

async function handleLookup(event) {
  event.preventDefault();
  const ccn = fields.ccn.value.trim();
  if (!/^\d{6}$/.test(ccn)) {
    setStatus("Enter a six-digit CCN.", "error");
    return;
  }

  els.downloadBtn.disabled = true;
  setStatus("Fetching CMS facility, claims, and average data...");

  try {
    currentData = await fetchFacility(ccn);
    fields.facilityOverride.value = "";
    renderReport();
    const sourceLabel = currentData.historicalSample ? " using historical sample target values" : "";
    setStatus(`Loaded ${titleCase(currentData.provider.provider_name)}${sourceLabel}.`, "success");
  } catch (error) {
    currentData = null;
    els.reportBody.classList.add("hidden");
    els.emptyState.classList.remove("hidden");
    setStatus(error.message, "error");
  }
}

function loadSample() {
  fields.ccn.value = "686123";
  fields.emr.value = "PCC";
  fields.currentCensus.value = "112";
  fields.patientType.value = "Long-term & Short-term";
  fields.previousCoverage.value = "Yes";
  fields.providerPerformance.value = "About 30 patients/day";
  fields.medicalCoverage.value = "Optometry, PCP, Podiatry";
  els.lookupForm.requestSubmit();
}

function addPdfRows(doc, title, rows, y) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 42;
  const labelWidth = 210;
  const valueWidth = pageWidth - left * 2 - labelWidth;
  const lineHeight = 18;

  doc.setTextColor(8, 59, 52);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(title.toUpperCase(), left, y);
  y += 8;
  doc.setDrawColor(215, 222, 217);
  doc.line(left, y, pageWidth - left, y);
  y += 12;

  rows.forEach(([label, rawValue]) => {
    const value = valueOrDash(rawValue);
    const valueLines = doc.splitTextToSize(value, valueWidth - 16);
    const rowHeight = Math.max(28, valueLines.length * lineHeight + 12);
    if (y + rowHeight > 742) {
      doc.addPage();
      y = 52;
    }

    doc.setFillColor(242, 246, 244);
    doc.rect(left, y, labelWidth, rowHeight, "F");
    doc.setDrawColor(215, 222, 217);
    doc.rect(left, y, labelWidth, rowHeight);
    doc.rect(left + labelWidth, y, valueWidth, rowHeight);
    doc.setTextColor(102, 113, 109);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(label, left + 10, y + 18, { maxWidth: labelWidth - 18 });
    doc.setTextColor(21, 32, 29);
    doc.setFont("helvetica", "normal");
    doc.text(valueLines, left + labelWidth + 10, y + 18);
    y += rowHeight;
  });

  return y + 18;
}

function downloadPdf() {
  if (!currentData) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const rows = buildReportRows();
  const state = currentData.provider.state || "--";

  doc.setFillColor(8, 59, 52);
  doc.rect(0, 0, pageWidth, 92, "F");
  doc.setFillColor(217, 164, 65);
  doc.rect(0, 92, pageWidth, 5, "F");
  doc.setTextColor(220, 233, 227);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("INFINITE — Managed by MEDELITE", 42, 34);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text(`FACILITY ASSESSMENT SNAPSHOT ${state}`, 42, 66);

  let y = 128;
  y = addPdfRows(doc, "Facility Profile", rows.profile, y);
  y = addPdfRows(doc, "Star Ratings", rows.ratings, y);
  y = addPdfRows(doc, "Hospitalization & ED Metrics", rows.metrics, y);

  if (y > 720) {
    doc.addPage();
    y = 52;
  }
  doc.setTextColor(15, 91, 78);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const link = medicareUrl();
  doc.textWithLink("Medicare Care Compare source profile", 42, y, { url: link });
  doc.setTextColor(102, 113, 109);
  doc.setFont("helvetica", "normal");
  doc.text(link, 42, y + 16, { maxWidth: pageWidth - 84 });

  const name = rows.profile[0][1].replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  doc.save(`${name || "facility"}-assessment-snapshot.pdf`);
}

els.lookupForm.addEventListener("submit", handleLookup);
els.manualForm.addEventListener("input", renderReport);
els.downloadBtn.addEventListener("click", downloadPdf);
els.sampleBtn.addEventListener("click", loadSample);
lucide.createIcons();
