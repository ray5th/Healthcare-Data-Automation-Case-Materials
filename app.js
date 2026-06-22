const DATASETS = {
  provider: "4pq5-n9py",
  claims: "ijh5-nb2v",
  averages: "xcdc-v8bm",
};

const isVercel = window.location.hostname.endsWith(".vercel.app") || 
                 (window.location.hostname === "localhost" && window.location.port !== "5173") ||
                 (window.location.hostname === "127.0.0.1" && window.location.port !== "5173");

const API_BASE = isVercel
  ? "/api/cms"
  : "https://data.cms.gov/provider-data/api/1/datastore/query";
const REQUEST_TIMEOUT_MS = 15000;

const METRIC_DEFINITIONS = [
  {
    title: "Short Term Hospitalization",
    residentType: "STR",
    format: "percent",
    claimIncludes: ["short-stay", "rehospitalized"],
    stateAverageKey: "percentage_of_short_stay_residents_who_were_rehospitalized__1d02",
    nationalAverageKey: "percentage_of_short_stay_residents_who_were_rehospitalized__1d02",
    rows: {
      facility: "Short Term Hospitalization",
      national: "STR National Avg. for Hospitalization",
      state: "STR State National Avg. for Hospitalization",
    },
  },
  {
    title: "Short Term ED Visit",
    residentType: "STR",
    format: "percent",
    claimIncludes: ["short-stay", "emergency department"],
    stateAverageKey: "percentage_of_short_stay_residents_who_had_an_outpatient_em_d911",
    nationalAverageKey: "percentage_of_short_stay_residents_who_had_an_outpatient_em_d911",
    rows: {
      facility: "STR ED Visit",
      national: "STR ED Visits National Avg.",
      state: "STR ED Visits State Avg.",
    },
  },
  {
    title: "Long Term Hospitalization",
    residentType: "LT",
    format: "decimal",
    claimIncludes: ["hospitalizations per 1000", "long-stay"],
    stateAverageKey: "number_of_hospitalizations_per_1000_longstay_resident_days",
    nationalAverageKey: "number_of_hospitalizations_per_1000_longstay_resident_days",
    rows: {
      facility: "LT Hospitalization",
      national: "LT National Avg. for Hospitalization",
      state: "LT State National Avg. for Hospitalization",
    },
  },
  {
    title: "Long Term ED Visit",
    residentType: "LT",
    format: "decimal",
    claimIncludes: ["emergency department visits per 1000", "long-stay"],
    stateAverageKey: "number_of_outpatient_emergency_department_visits_per_1000_l_de9d",
    nationalAverageKey: "number_of_outpatient_emergency_department_visits_per_1000_l_de9d",
    rows: {
      facility: "ED Visit",
      national: "LT ED Visits National Avg.",
      state: "LT ED Visits State Avg.",
    },
  },
];

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
  wordBtn: document.querySelector("#wordBtn"),
  sampleBtn: document.querySelector("#sampleBtn"),
  stateBadge: document.querySelector("#stateBadge"),
  previewState: document.querySelector("#previewState"),
  emptyState: document.querySelector("#emptyState"),
  reportBody: document.querySelector("#reportBody"),
  profileRows: document.querySelector("#profileRows"),
  ratingRows: document.querySelector("#ratingRows"),
  metricCards: document.querySelector("#metricCards"),
  metricRows: document.querySelector("#metricRows"),
  medicareLink: document.querySelector("#medicareLink"),
};

let currentData = null;

function datasetUrl(datasetId, conditions = [], params = {}) {
  const url = new URL(`${API_BASE}/${datasetId}/0`, window.location.origin);
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
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(datasetUrl(datasetId, conditions, params), { signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("CMS API request timed out. Please try again.");
    }
    throw new Error("Unable to reach the CMS Provider Data Catalog API.");
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`CMS API returned ${response.status}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("CMS API returned an unreadable response.");
  }

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
  if (!provider.state) {
    throw new Error(`CMS returned facility data for CCN ${ccn}, but the state field is missing.`);
  }

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
    warnings: [
      provider.provider_name ? "" : "CMS facility name is missing.",
      provider.provider_address ? "" : "CMS facility address is missing.",
      provider.overall_rating ? "" : "CMS overall rating is missing.",
      provider.health_inspection_rating ? "" : "CMS health inspection rating is missing.",
      provider.staffing_rating ? "" : "CMS staffing rating is missing.",
      provider.qm_rating ? "" : "CMS quality rating is missing.",
      claimRows.length >= METRIC_DEFINITIONS.length
        ? ""
        : "Some CMS claims-based hospitalization/ED measures were not available for this CCN.",
      stateAverageRows.length ? "" : `CMS state averages were not available for ${provider.state}.`,
      nationAverageRows.length ? "" : "CMS national averages were not available.",
    ].filter(Boolean),
  };

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

function formatMetric(value, format) {
  return format === "percent" ? formatPercent(value) : formatDecimal(value);
}

function numericValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
      valueOrDash(claim.measure_description).toLowerCase().includes(needle.toLowerCase()),
    ),
  );
  return row?.adjusted_score;
}

function buildMetricGroups() {
  if (!currentData) return [];
  const { stateAverages, nationalAverages } = currentData;

  return METRIC_DEFINITIONS.map((definition) => {
    const facility = getClaimScore(definition.claimIncludes);
    const state = stateAverages[definition.stateAverageKey];
    const national = nationalAverages[definition.nationalAverageKey];
    const values = [facility, state, national].map(numericValue).filter((value) => value !== null);
    const max = Math.max(...values, 1);

    return {
      ...definition,
      values: {
        facility,
        state,
        national,
      },
      formatted: {
        facility: formatMetric(facility, definition.format),
        state: formatMetric(state, definition.format),
        national: formatMetric(national, definition.format),
      },
      barWidths: {
        facility: numericValue(facility) === null ? 0 : Math.max(4, (numericValue(facility) / max) * 100),
        state: numericValue(state) === null ? 0 : Math.max(4, (numericValue(state) / max) * 100),
        national: numericValue(national) === null ? 0 : Math.max(4, (numericValue(national) / max) * 100),
      },
    };
  });
}

function buildMetricRows() {
  return buildMetricGroups().flatMap((group) => [
    [group.rows.facility, group.formatted.facility],
    [group.rows.national, group.formatted.national],
    [group.rows.state, group.formatted.state],
  ]);
}

function buildReportRows() {
  if (!currentData) return { profile: [], ratings: [], metrics: [] };
  const { provider } = currentData;
  const manual = getManualValues();
  const location = [
    titleCase(provider.provider_address),
    titleCase(provider.citytown),
    provider.state,
    provider.zip_code,
  ]
    .filter(Boolean)
    .join(", ");

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
    metrics: buildMetricRows(),
  };
}

function renderRows(container, rows) {
  container.innerHTML = "";
  rows.forEach(([label, value]) => {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = valueOrDash(value);
    if (dd.textContent === "—") dd.classList.add("unavailable");
    container.append(dt, dd);
  });
}

function renderMetricCards(groups) {
  els.metricCards.innerHTML = "";
  groups.forEach((group) => {
    const card = document.createElement("article");
    card.className = "metric-card";
    const title = document.createElement("h3");
    title.textContent = `${group.title} (${group.residentType})`;
    card.append(title);

    [
      ["Facility", group.formatted.facility, group.barWidths.facility],
      ["State Avg.", group.formatted.state, group.barWidths.state],
      ["National", group.formatted.national, group.barWidths.national],
    ].forEach(([label, value, width]) => {
      const row = document.createElement("div");
      row.className = "metric-bar";
      const labelEl = document.createElement("span");
      const track = document.createElement("span");
      const fill = document.createElement("span");
      const valueEl = document.createElement("span");

      labelEl.textContent = label;
      track.className = "bar-track";
      fill.className = "bar-fill";
      fill.style.setProperty("--bar-width", `${width}%`);
      valueEl.textContent = value;
      if (value === "—") valueEl.classList.add("unavailable");

      track.append(fill);
      row.append(labelEl, track, valueEl);
      card.append(row);
    });

    els.metricCards.append(card);
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
  renderMetricCards(buildMetricGroups());
  renderRows(els.metricRows, rows.metrics);
  els.stateBadge.textContent = currentData.provider.state || "--";
  els.previewState.textContent = currentData.provider.state || "--";
  els.medicareLink.href = medicareUrl();
  els.emptyState.classList.add("hidden");
  els.reportBody.classList.remove("hidden");
  els.downloadBtn.disabled = false;
  els.wordBtn.disabled = false;
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
  els.wordBtn.disabled = true;
  setStatus("Fetching CMS facility, claims, and average data...");

  try {
    currentData = await fetchFacility(ccn);
    fields.facilityOverride.value = "";
    renderReport();
    const warningText = currentData.warnings.length ? ` ${currentData.warnings.join(" ")}` : "";
    setStatus(
      `Loaded ${titleCase(currentData.provider.provider_name)} from CMS Provider Data Catalog.${warningText}`,
      currentData.warnings.length ? "warning" : "success",
    );
  } catch (error) {
    currentData = null;
    els.downloadBtn.disabled = true;
    els.wordBtn.disabled = true;
    els.metricCards.innerHTML = "";
    els.reportBody.classList.add("hidden");
    els.emptyState.classList.remove("hidden");
    setStatus(error.message, "error");
  }
}

function loadSample() {
  fields.ccn.value = "686123";
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

function reportFilename(extension) {
  const rows = buildReportRows();
  const name = rows.profile[0]?.[1] || "facility";
  const slug = name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  return `${slug || "facility"}-assessment-snapshot.${extension}`;
}

function makeTableRows(rows) {
  const { TableRow, TableCell, Paragraph, TextRun, WidthType } = window.docx;
  return rows.map(
    ([label, value]) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 38, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })],
          }),
          new TableCell({
            width: { size: 62, type: WidthType.PERCENTAGE },
            children: [new Paragraph(valueOrDash(value))],
          }),
        ],
      }),
  );
}

function makeSection(title, rows) {
  const { Paragraph, TextRun, Table, WidthType } = window.docx;
  return [
    new Paragraph({
      spacing: { before: 240, after: 100 },
      children: [new TextRun({ text: title.toUpperCase(), bold: true, color: "083B34" })],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: makeTableRows(rows),
    }),
  ];
}

async function downloadWord() {
  if (!currentData) return;
  if (!window.docx) {
    setStatus("Word export library did not load. Check your connection and refresh.", "error");
    return;
  }

  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    ExternalHyperlink,
    AlignmentType,
  } = window.docx;
  const rows = buildReportRows();
  const state = currentData.provider.state || "--";
  const link = medicareUrl();

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            children: [new TextRun({ text: "INFINITE — Managed by MEDELITE", bold: true, color: "083B34" })],
          }),
          new Paragraph({
            spacing: { after: 240 },
            children: [
              new TextRun({
                text: `FACILITY ASSESSMENT SNAPSHOT ${state}`,
                bold: true,
                size: 32,
                color: "083B34",
              }),
            ],
          }),
          ...makeSection("Facility Profile", rows.profile),
          ...makeSection("Star Ratings", rows.ratings),
          ...makeSection("Hospitalization & ED Metrics", rows.metrics),
          new Paragraph({
            spacing: { before: 240 },
            alignment: AlignmentType.LEFT,
            children: [
              new ExternalHyperlink({
                link,
                children: [
                  new TextRun({
                    text: "Medicare Care Compare source profile",
                    style: "Hyperlink",
                  }),
                ],
              }),
            ],
          }),
          new Paragraph(link),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = reportFilename("docx");
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

els.lookupForm.addEventListener("submit", handleLookup);
els.manualForm.addEventListener("input", renderReport);
els.downloadBtn.addEventListener("click", downloadPdf);
els.wordBtn.addEventListener("click", downloadWord);
els.sampleBtn.addEventListener("click", loadSample);
lucide.createIcons();
