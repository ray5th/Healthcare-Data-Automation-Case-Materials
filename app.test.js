const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const appSource = fs.readFileSync(`${__dirname}/app.js`, "utf8");

function makeElement() {
  return {
    value: "",
    textContent: "",
    className: "",
    disabled: false,
    href: "",
    innerHTML: "",
    classList: {
      add() {},
      remove() {},
    },
    addEventListener() {},
    append() {},
    remove() {},
    requestSubmit() {},
    setAttribute() {},
    style: { setProperty() {} },
  };
}

function loadApp(hostname = "localhost", port = "8000") {
  const elements = new Map();
  const document = {
    body: makeElement(),
    createElement: makeElement,
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, makeElement());
      return elements.get(selector);
    },
  };
  const window = {
    location: { hostname, port, origin: `http://${hostname}:${port}` },
    setTimeout,
    clearTimeout,
  };
  const context = vm.createContext({
    AbortController,
    URL,
    console,
    document,
    fetch: async () => {
      throw new Error("Unexpected fetch");
    },
    setTimeout,
    clearTimeout,
    window,
  });

  vm.runInContext(
    `${appSource}
      globalThis.__test = {
        apiBase: API_BASE,
        buildReportRows,
        getCurrentData: () => currentData,
        handleLookup,
        optionalTitleCase,
        setCurrentData: (data) => { currentData = data; },
        setFetchFacility: (replacement) => { fetchFacility = replacement; },
      };`,
    context,
  );

  return { api: context.__test, elements };
}

function facilityData(name, state = "FL") {
  return {
    provider: {
      provider_name: name,
      state,
      cms_certification_number_ccn: "123456",
    },
    claims: [],
    stateAverages: {},
    nationalAverages: {},
    warnings: [],
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

test("localhost uses the direct CMS API on any port", () => {
  const { api } = loadApp("localhost", "8000");
  assert.equal(api.apiBase, "https://data.cms.gov/provider-data/api/1/datastore/query");
});

test("missing address fields are omitted instead of rendered as dashes", () => {
  const { api } = loadApp();
  api.setCurrentData({
    ...facilityData("TEST FACILITY"),
    provider: {
      ...facilityData("TEST FACILITY").provider,
      citytown: "MIAMI",
      provider_address: "",
      zip_code: "33101",
    },
  });

  const location = api.buildReportRows().profile.find(([label]) => label === "Location")[1];
  assert.equal(location, "Miami, FL, 33101");
  assert.equal(api.optionalTitleCase(null), "");
});

test("the app initializes when Lucide fails to load", () => {
  assert.doesNotThrow(() => loadApp());
});

test("a stale lookup cannot overwrite a newer result", async () => {
  const { api, elements } = loadApp();
  const first = deferred();
  const second = deferred();
  let calls = 0;
  api.setFetchFacility(() => (++calls === 1 ? first.promise : second.promise));

  const ccn = elements.get("#ccn");
  ccn.value = "111111";
  const firstLookup = api.handleLookup({ preventDefault() {} });
  ccn.value = "222222";
  const secondLookup = api.handleLookup({ preventDefault() {} });

  second.resolve(facilityData("NEW FACILITY"));
  await secondLookup;
  first.resolve(facilityData("OLD FACILITY"));
  await firstLookup;

  assert.equal(api.getCurrentData().provider.provider_name, "NEW FACILITY");
  assert.match(elements.get("#status").textContent, /New Facility/);
});
