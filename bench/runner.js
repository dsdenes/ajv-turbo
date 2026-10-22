"use strict";

// Measures the replacement against the published ajv benchmark suite.
//
// The suite is json-schema-benchmark (https://github.com/ebdrup/json-schema-benchmark),
// the performance benchmark referenced from ajv's README. Its draft-07 run
// reads the JSON-Schema-Test-Suite cases vendored under test/fixtures at the
// exact submodule commit the benchmark pins, sets each validator up the way the
// suite's validators.js does, and measures with Benchmark.js. This runner keeps
// those cases and that measurement procedure, runs ajv and this package under
// identical settings, and reports per-case throughput alongside the aggregate.
//
// Cases whose schema either validator cannot compile carry no comparable
// verdict, so - exactly as the published runner does for a validator that
// fails a test - they are excluded and listed in the report.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {execFileSync} = require("node:child_process");
const Benchmark = require("benchmark");

const {readJsonFiles, readRemoteSchemas, SUITE_DIR} = require("../test/lib/cases");

const ROOT = path.join(__dirname, "..");

const BENCHMARK_SUITE = {
  name: "json-schema-benchmark",
  repository: "https://github.com/ebdrup/json-schema-benchmark",
  commit: "e9c884f9edd38438a150fef0e9a2a1173c0fcc50",
};

const TEST_SUITE = {
  name: "JSON-Schema-Test-Suite",
  repository: "https://github.com/json-schema/JSON-Schema-Test-Suite",
  commit: "bcf1dc81ae099ade2a9642c672c06ee1af1bb489",
  files: "tests/draft7 and remotes",
};

// The published validators.js constructs ajv with `{schemaId: "auto"}` and
// registers every remote schema under localhost:1234 before compiling.
const VALIDATOR_OPTIONS = {schemaId: "auto"};

function readPublishedCases() {
  const cases = [];
  for (const file of readJsonFiles(path.join(SUITE_DIR, "tests", "draft7"))) {
    const source = path.relative(SUITE_DIR, file).split(path.sep).join("/");
    for (const group of JSON.parse(fs.readFileSync(file, "utf8"))) {
      cases.push({
        source,
        description: group.description,
        schema: group.schema,
        tests: (group.tests || []).map((test) => ({
          description: test.description,
          data: test.data,
          valid: test.valid,
        })),
      });
    }
  }
  return cases;
}

function buildValidator(Ajv) {
  const ajv = new Ajv(VALIDATOR_OPTIONS);
  for (const remote of readRemoteSchemas()) {
    ajv.addSchema(remote.schema, remote.uri);
  }
  return ajv;
}

function compileCases() {
  const cases = readPublishedCases();
  const ajv = buildValidator(require("ajv-reference"));
  const replacement = buildValidator(require(".."));

  const included = [];
  const excluded = [];
  for (const testCase of cases) {
    let ajvValidate;
    try {
      ajvValidate = ajv.compile(testCase.schema);
    } catch (error) {
      excluded.push({...testCase, reason: "ajv", message: error.message});
      continue;
    }
    let replacementValidate;
    try {
      replacementValidate = replacement.compile(testCase.schema);
    } catch (error) {
      excluded.push({...testCase, reason: "replacement", message: error.message});
      continue;
    }
    included.push({...testCase, ajvValidate, replacementValidate});
  }
  return {cases, included, excluded};
}

function verifyVerdicts(included) {
  const mismatches = [];
  let documents = 0;
  for (const testCase of included) {
    for (const test of testCase.tests) {
      documents++;
      const expected = testCase.ajvValidate(structuredClone(test.data));
      const actual = testCase.replacementValidate(structuredClone(test.data));
      if (expected !== actual) {
        mismatches.push({
          case: `${testCase.source} :: ${testCase.description}`,
          document: test.description,
          ajv: expected,
          replacement: actual,
          declared: test.valid,
        });
      }
    }
  }
  return {documents, mismatches};
}

function caseName(testCase) {
  return `${testCase.source} :: ${testCase.description}`;
}

function throughputTargets(testCase) {
  const tests = testCase.tests;
  return {
    ajv: () => {
      for (let i = 0; i < tests.length; i++) testCase.ajvValidate(tests[i].data);
    },
    replacement: () => {
      for (let i = 0; i < tests.length; i++) testCase.replacementValidate(tests[i].data);
    },
  };
}

function measure(targets, options) {
  const suite = new Benchmark.Suite();
  suite.add("ajv", targets.ajv, options);
  suite.add("replacement", targets.replacement, options);
  suite.run({async: false});
  const results = {};
  for (let i = 0; i < suite.length; i++) {
    const target = suite[i];
    results[target.name] = {hz: target.hz, rme: target.stats.rme};
  }
  return results;
}

function geomean(values) {
  let sum = 0;
  for (const value of values) sum += Math.log(value);
  return Math.exp(sum / values.length);
}

function git(args) {
  try {
    return execFileSync("git", args, {cwd: ROOT, encoding: "utf8"}).trim();
  } catch {
    return "unknown";
  }
}

function machine() {
  const cpus = os.cpus();
  return {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpu: cpus.length > 0 ? cpus[0].model : "unknown",
    cores: cpus.length,
    memoryBytes: os.totalmem(),
  };
}

function environment(benchOptions) {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  // Only the code the measurement runs counts: the validator and the harness.
  // Uncommitted fixtures or documentation do not change what was measured.
  const dirty =
    git(["status", "--porcelain", "--", "lib", "index.js", "index.mjs", "dist", "package.json", "bench"]).trim() !== "";
  return {
    node: process.versions.node,
    v8: process.versions.v8,
    replacement: {
      name: pkg.name,
      version: pkg.version,
      commit: git(["rev-parse", "HEAD"]),
      dirty,
    },
    benchmarkSuite: BENCHMARK_SUITE,
    testSuite: TEST_SUITE,
    machine: machine(),
    procedure: {
      tool: `Benchmark.js ${require("benchmark/package.json").version}`,
      run: "Suite.run({async: false})",
      minTimeSeconds: benchOptions.minTime,
      maxTimeSeconds: benchOptions.maxTime,
      minSamples: benchOptions.minSamples,
      target: "validate every document of the case per iteration",
    },
  };
}

function formatNumber(value) {
  return Math.round(value).toLocaleString("en-US");
}

function formatRatio(value) {
  return value.toFixed(3);
}

function report({environment, summary, rows, whole, excluded}) {
  const lines = [];
  lines.push("# ajv benchmark suite: replacement versus ajv");
  lines.push("");
  lines.push(`Measured ${new Date().toISOString()} on Node.js ${environment.node}.`);
  lines.push("");
  lines.push("## Environment");
  lines.push("");
  lines.push(`- Node.js: ${environment.node} (V8 ${environment.v8})`);
  lines.push(
    `- Replacement: ${environment.replacement.name} ${environment.replacement.version} ` +
      `at commit ${environment.replacement.commit}${environment.replacement.dirty ? " (working tree)" : ""}`,
  );
  lines.push(
    `- Benchmark suite: ${environment.benchmarkSuite.name} at commit ` +
      `${environment.benchmarkSuite.commit} (${environment.benchmarkSuite.repository})`,
  );
  lines.push(
    `- Cases: ${environment.testSuite.name} ${environment.testSuite.files} at commit ` +
      `${environment.testSuite.commit} (${environment.testSuite.repository})`,
  );
  const machine = environment.machine;
  lines.push(
    `- Machine: ${machine.cpu}, ${machine.cores} cores, ${machine.arch}, ` +
      `${machine.platform} ${machine.release}, ${Math.round(machine.memoryBytes / 2 ** 30)} GiB`,
  );
  const procedure = environment.procedure;
  lines.push(
    `- Procedure: ${procedure.tool}, ${procedure.run}, minTime ${procedure.minTimeSeconds}s, ` +
      `maxTime ${procedure.maxTimeSeconds}s, minSamples ${procedure.minSamples}; ` +
      `${procedure.target}`,
  );
  lines.push("");
  lines.push("## Result");
  lines.push("");
  lines.push(`- Cases included: ${summary.cases}`);
  lines.push(`- Documents verified: ${summary.documents}`);
  lines.push(`- Verdict mismatches: ${summary.mismatches.length}`);
  lines.push(`- Cases excluded (schema failed to compile): ${excluded.length}`);
  lines.push(
    `- Aggregate: geometric mean of per-case throughput ratios ` +
      `(replacement / ajv) = **${summary.geomean.toFixed(4)}**`,
  );
  lines.push(
    `- Whole-suite throughput: ajv ${formatNumber(whole.ajv.docsPerSecond)} documents/sec, ` +
      `replacement ${formatNumber(whole.replacement.docsPerSecond)} documents/sec, ` +
      `ratio ${formatRatio(whole.ratio)}`,
  );
  lines.push("");
  lines.push("## Per case");
  lines.push("");
  lines.push("| Case | Documents | ajv (docs/sec) | Replacement (docs/sec) | Ratio |");
  lines.push("|---|--:|--:|--:|--:|");
  for (const row of rows) {
    lines.push(
      `| ${row.case.replace(/\|/g, "\\|")} | ${row.documents} | ${formatNumber(row.ajv.docsPerSecond)} | ` +
        `${formatNumber(row.replacement.docsPerSecond)} | ${formatRatio(row.ratio)} |`,
    );
  }
  if (excluded.length > 0) {
    lines.push("");
    lines.push("## Excluded cases");
    lines.push("");
    lines.push("Schemas that a validator could not compile carry no comparable verdict.");
    lines.push("");
    for (const testCase of excluded) {
      lines.push(`- ${testCase.source} :: ${testCase.description} (${testCase.reason}: ${testCase.message})`);
    }
  }
  if (summary.mismatches.length > 0) {
    lines.push("");
    lines.push("## Mismatches");
    lines.push("");
    for (const mismatch of summary.mismatches) {
      lines.push(
        `- ${mismatch.case} :: ${mismatch.document}: ajv=${mismatch.ajv} ` +
          `replacement=${mismatch.replacement} declared=${mismatch.declared}`,
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

function parseOptions(argv) {
  const options = {
    minTime: Benchmark.options.minTime,
    maxTime: Benchmark.options.maxTime,
    minSamples: Benchmark.options.minSamples,
    minimum: 1.2,
    filter: null,
    markdown: null,
    json: null,
    quiet: false,
  };
  for (const argument of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(argument);
    if (match === null) continue;
    const [, name, value] = match;
    switch (name) {
      case "min-time":
        options.minTime = Number(value);
        break;
      case "max-time":
        options.maxTime = Number(value);
        break;
      case "min-samples":
        options.minSamples = Number(value);
        break;
      case "minimum":
        options.minimum = Number(value);
        break;
      case "filter":
        options.filter = new RegExp(value);
        break;
      case "markdown":
        options.markdown = path.resolve(value);
        break;
      case "json":
        options.json = path.resolve(value);
        break;
      case "quiet":
        options.quiet = true;
        break;
      default:
        throw new Error(`unknown option --${name}`);
    }
  }
  return options;
}

function main(argv) {
  const options = parseOptions(argv);
  const benchOptions = {
    minTime: options.minTime,
    maxTime: options.maxTime,
    minSamples: options.minSamples,
  };

  const {cases, included: allIncluded, excluded} = compileCases();
  const included =
    options.filter === null
      ? allIncluded
      : allIncluded.filter((testCase) => options.filter.test(caseName(testCase)));
  if (included.length === 0) throw new Error("no benchmark case matches the filter");
  const verdicts = verifyVerdicts(included);

  const rows = [];
  for (const testCase of included) {
    const result = measure(throughputTargets(testCase), benchOptions);
    const documents = testCase.tests.length;
    const ajvDocs = result.ajv.hz * documents;
    const replacementDocs = result.replacement.hz * documents;
    rows.push({
      case: caseName(testCase),
      documents,
      ajv: {hz: result.ajv.hz, rme: result.ajv.rme, docsPerSecond: ajvDocs},
      replacement: {
        hz: result.replacement.hz,
        rme: result.replacement.rme,
        docsPerSecond: replacementDocs,
      },
      ratio: replacementDocs / ajvDocs,
    });
    if (!options.quiet) {
      process.stderr.write(
        `${caseName(testCase)}: ajv ${formatNumber(ajvDocs)} docs/sec, ` +
          `replacement ${formatNumber(replacementDocs)} docs/sec, ` +
          `ratio ${formatRatio(replacementDocs / ajvDocs)}\n`,
      );
    }
  }

  const allDocuments = included.reduce((total, testCase) => total + testCase.tests.length, 0);
  const wholeResult = measure(
    {
      ajv: () => {
        for (const testCase of included) {
          const tests = testCase.tests;
          for (let i = 0; i < tests.length; i++) testCase.ajvValidate(tests[i].data);
        }
      },
      replacement: () => {
        for (const testCase of included) {
          const tests = testCase.tests;
          for (let i = 0; i < tests.length; i++) testCase.replacementValidate(tests[i].data);
        }
      },
    },
    benchOptions,
  );
  const whole = {
    ajv: {hz: wholeResult.ajv.hz, docsPerSecond: wholeResult.ajv.hz * allDocuments},
    replacement: {
      hz: wholeResult.replacement.hz,
      docsPerSecond: wholeResult.replacement.hz * allDocuments,
    },
  };
  whole.ratio = whole.replacement.docsPerSecond / whole.ajv.docsPerSecond;

  const geomeanValue = geomean(rows.map((row) => row.ratio));
  const summary = {
    cases: rows.length,
    totalCases: cases.length,
    documents: verdicts.documents,
    mismatches: verdicts.mismatches,
    geomean: geomeanValue,
    minimum: options.minimum,
  };
  const runEnvironment = environment(benchOptions);

  const markdown = report({
    environment: runEnvironment,
    summary,
    rows,
    whole,
    excluded: excluded.map((testCase) => ({
      source: testCase.source,
      description: testCase.description,
      reason: testCase.reason,
      message: testCase.message.replace(/\n/g, " "),
    })),
  });

  if (!options.quiet) {
    process.stdout.write(markdown);
  }
  if (options.markdown !== null) {
    fs.mkdirSync(path.dirname(options.markdown), {recursive: true});
    fs.writeFileSync(options.markdown, markdown);
  }
  if (options.json !== null) {
    const json = {environment, summary, whole, rows, excluded};
    fs.mkdirSync(path.dirname(options.json), {recursive: true});
    fs.writeFileSync(options.json, JSON.stringify(json, null, 2) + "\n");
  }

  if (verdicts.mismatches.length > 0) {
    process.stderr.write(`${verdicts.mismatches.length} verdict mismatches\n`);
    process.exitCode = 1;
  } else if (geomeanValue < options.minimum) {
    process.stderr.write(
      `geometric mean ${geomeanValue.toFixed(4)} is below the required ${options.minimum}\n`,
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = {compileCases, verifyVerdicts, readPublishedCases, geomean};
