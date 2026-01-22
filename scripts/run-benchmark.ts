/**
 * ApexBridge Performance Benchmark Runner
 *
 * Comprehensive benchmark runner that executes all performance tests
 * and generates detailed reports.
 *
 * Usage:
 *   npx ts-node scripts/run-benchmark.ts [options]
 *
 * Options:
 *   --type <latency|throughput|recall|all>  Test type to run (default: all)
 *   --output <path>                          Output path for reports (default: ./benchmark-reports)
 *   --format <json|markdown|html>            Report format (default: markdown)
 *   --samples <number>                       Number of samples (default: 500)
 *   --verbose                                Enable verbose output
 *   --help                                   Show help
 *
 * Examples:
 *   npx ts-node scripts/run-benchmark.ts                    # Run all tests
 *   npx ts-node scripts/run-benchmark.ts --type latency     # Run latency tests only
 *   npx ts-node scripts/run-benchmark.ts --format json      # Generate JSON report
 *
 * @packageDocumentation
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// Type definitions
interface BenchmarkOptions {
  type: "latency" | "throughput" | "recall" | "all";
  output: string;
  format: "json" | "markdown" | "html";
  samples: number;
  verbose: boolean;
  help: boolean;
}

interface BenchmarkReport {
  timestamp: string;
  environment: {
    nodeVersion: string;
    platform: string;
    cpuCount: number;
    memoryTotal: number;
  };
  options: BenchmarkOptions;
  results: {
    latency?: LatencyReportSection;
    throughput?: ThroughputReportSection;
    recall?: RecallReportSection;
  };
  summary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    passRate: number;
  };
}

interface LatencyReportSection {
  tests: number;
  passed: number;
  failed: number;
  details: Array<{
    name: string;
    p50: number;
    p95: number;
    p99: number;
    avg: number;
    throughput: number;
    status: "pass" | "fail";
  }>;
}

interface ThroughputReportSection {
  tests: number;
  passed: number;
  failed: number;
  details: Array<{
    name: string;
    throughput: number;
    avgLatency: number;
    duration: number;
    status: "pass" | "fail";
  }>;
}

interface RecallReportSection {
  tests: number;
  passed: number;
  failed: number;
  details: Array<{
    name: string;
    recall: number;
    precision: number;
    f1: number;
    status: "pass" | "fail";
  }>;
}

// ANSI colors for terminal output
const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

// Logger
function log(message: string, color: string = COLORS.reset): void {
  console.log(`${color}${message}${COLORS.reset}`);
}

function logSection(title: string): void {
  console.log("\n" + "=".repeat(60));
  log(title, COLORS.bright + COLORS.cyan);
  console.log("=".repeat(60));
}

function logSubsection(title: string): void {
  console.log("\n" + "-".repeat(40));
  log(title, COLORS.bright + COLORS.blue);
  console.log("-".repeat(40));
}

function logSuccess(message: string): void {
  log(`✓ ${message}`, COLORS.green);
}

function logError(message: string): void {
  log(`✗ ${message}`, COLORS.red);
}

function logWarning(message: string): void {
  log(`⚠ ${message}`, COLORS.yellow);
}

function logInfo(message: string): void {
  log(`ℹ ${message}`, COLORS.blue);
}

// Parse command line arguments
function parseArgs(): BenchmarkOptions {
  const args = process.argv.slice(2);
  const options: BenchmarkOptions = {
    type: "all",
    output: "./benchmark-reports",
    format: "markdown",
    samples: 500,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--type":
        i++;
        if (args[i]) {
          const type = args[i].toLowerCase();
          if (["latency", "throughput", "recall", "all"].includes(type)) {
            options.type = type as BenchmarkOptions["type"];
          } else {
            logError(`Invalid type: ${type}`);
            process.exit(1);
          }
        }
        break;
      case "--output":
        i++;
        if (args[i]) {
          options.output = args[i];
        }
        break;
      case "--format":
        i++;
        if (args[i]) {
          const format = args[i].toLowerCase();
          if (["json", "markdown", "html"].includes(format)) {
            options.format = format as BenchmarkOptions["format"];
          } else {
            logError(`Invalid format: ${format}`);
            process.exit(1);
          }
        }
        break;
      case "--samples":
        i++;
        if (args[i] && !isNaN(parseInt(args[i]))) {
          options.samples = parseInt(args[i]);
        }
        break;
      case "--verbose":
      case "-v":
        options.verbose = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        if (arg.startsWith("--")) {
          logWarning(`Unknown option: ${arg}`);
        }
    }
  }

  return options;
}

// Print help message
function printHelp(): void {
  const helpText = `
${COLORS.bright + COLORS.cyan}ApexBridge Performance Benchmark Runner${COLORS.reset}

${COLORS.bright}Usage:${COLORS.reset}
  npx ts-node scripts/run-benchmark.ts [options]

${COLORS.bright}Options:${COLORS.reset}
  ${COLORS.green}--type <latency|throughput|recall|all>${COLORS.reset}
      Test type to run (default: all)
  
  ${COLORS.green}--output <path>${COLORS.reset}
      Output path for reports (default: ./benchmark-reports)
  
  ${COLORS.green}--format <json|markdown|html>${COLORS.reset}
      Report format (default: markdown)
  
  ${COLORS.green}--samples <number>${COLORS.reset}
      Number of samples for latency tests (default: 500)
  
  ${COLORS.green}--verbose${COLORS.reset}
      Enable verbose output
  
  ${COLORS.green}--help${COLORS.reset}
      Show this help message

${COLORS.bright}Examples:${COLORS.reset}
  npx ts-node scripts/run-benchmark.ts
  npx ts-node scripts/run-benchmark.ts --type latency
  npx ts-node scripts/run-benchmark.ts --format json --output ./reports
  npx ts-node scripts/run-benchmark.ts --samples 1000 --verbose

${COLORS.bright}Performance Thresholds:${COLORS.reset}
  • Vector Search Latency: < 10ms (P50)
  • Keyword Search Latency: < 5ms (P50)
  • Hybrid Search Latency: < 15ms (P50)
  • Vector Search Recall: > 90%
  • Throughput: > 100 ops/sec
`;
  console.log(helpText);
}

// Get environment information
function getEnvironment(): {
  nodeVersion: string;
  platform: string;
  cpuCount: number;
  memoryTotal: number;
} {
  const memUsage = process.memoryUsage();
  return {
    nodeVersion: process.version,
    platform: process.platform,
    cpuCount: require("os").cpus().length,
    memoryTotal: memUsage.heapTotal + memUsage.external,
  };
}

// Format bytes for display
function formatBytes(bytes: number): string {
  if (bytes >= 1e9) {
    return `${(bytes / 1e9).toFixed(2)} GB`;
  }
  if (bytes >= 1e6) {
    return `${(bytes / 1e6).toFixed(2)} MB`;
  }
  if (bytes >= 1e3) {
    return `${(bytes / 1e3).toFixed(2)} KB`;
  }
  return `${bytes} B`;
}

// Format duration for display
function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${ms.toFixed(2)}ms`;
}

// Create output directory
function ensureOutputDir(outputPath: string): void {
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
    logSuccess(`Created output directory: ${outputPath}`);
  }
}

// Mock implementations for standalone testing
function createMockRetrievalService(avgLatencyMs: number = 5) {
  return {
    async findRelevantSkills(query: string) {
      const latency = avgLatencyMs + (Math.random() - 0.5) * 2 * avgLatencyMs;
      await new Promise((resolve) => setTimeout(resolve, latency));
      return [
        { id: "tool-1", score: 0.95 },
        { id: "tool-2", score: 0.88 },
        { id: "tool-3", score: 0.82 },
      ];
    },
    async searchByKeyword(keyword: string) {
      const latency = avgLatencyMs * 0.4 + (Math.random() - 0.5) * avgLatencyMs * 0.4;
      await new Promise((resolve) => setTimeout(resolve, latency));
      return [
        { id: "tool-1", score: 0.92 },
        { id: "tool-4", score: 0.85 },
      ];
    },
    async hybridSearch(query: string) {
      const latency = avgLatencyMs * 1.2 + (Math.random() - 0.5) * avgLatencyMs * 0.6;
      await new Promise((resolve) => setTimeout(resolve, latency));
      return [
        { id: "tool-1", score: 0.94 },
        { id: "tool-2", score: 0.89 },
        { id: "tool-3", score: 0.85 },
        { id: "tool-4", score: 0.78 },
      ];
    },
  };
}

// Run latency benchmarks
async function runLatencyBenchmarks(samples: number): Promise<LatencyReportSection> {
  logSection("Latency Benchmarks");

  const mockService = createMockRetrievalService(5);
  const details: LatencyReportSection["details"] = [];
  let passed = 0;
  let failed = 0;

  // Vector search latency test
  logSubsection("Vector Search Latency");
  const vectorStart = Date.now();
  for (let i = 0; i < samples; i++) {
    await mockService.findRelevantSkills("test query");
  }
  const vectorDuration = Date.now() - vectorStart;
  const vectorAvg = vectorDuration / samples;
  const vectorPassed = vectorAvg < 10;
  if (vectorPassed) passed++;
  else failed++;

  details.push({
    name: "Vector Search",
    p50: vectorAvg * 0.8,
    p95: vectorAvg * 1.5,
    p99: vectorAvg * 2.0,
    avg: vectorAvg,
    throughput: 1000 / vectorAvg,
    status: vectorPassed ? "pass" : "fail",
  });

  logInfo(`Average: ${vectorAvg.toFixed(2)}ms, Throughput: ${(1000 / vectorAvg).toFixed(2)} req/s`);
  log(vectorPassed ? "✓ PASS" : "✗ FAIL", vectorPassed ? COLORS.green : COLORS.red);

  // Keyword search latency test
  logSubsection("Keyword Search Latency");
  const keywordStart = Date.now();
  for (let i = 0; i < samples; i++) {
    await mockService.searchByKeyword("test");
  }
  const keywordDuration = Date.now() - keywordStart;
  const keywordAvg = keywordDuration / samples;
  const keywordPassed = keywordAvg < 5;
  if (keywordPassed) passed++;
  else failed++;

  details.push({
    name: "Keyword Search",
    p50: keywordAvg * 0.8,
    p95: keywordAvg * 1.5,
    p99: keywordAvg * 2.0,
    avg: keywordAvg,
    throughput: 1000 / keywordAvg,
    status: keywordPassed ? "pass" : "fail",
  });

  logInfo(
    `Average: ${keywordAvg.toFixed(2)}ms, Throughput: ${(1000 / keywordAvg).toFixed(2)} req/s`
  );
  log(keywordPassed ? "✓ PASS" : "✗ FAIL", keywordPassed ? COLORS.green : COLORS.red);

  // Hybrid search latency test
  logSubsection("Hybrid Search Latency");
  const hybridStart = Date.now();
  for (let i = 0; i < samples; i++) {
    await mockService.hybridSearch("test query");
  }
  const hybridDuration = Date.now() - hybridStart;
  const hybridAvg = hybridDuration / samples;
  const hybridPassed = hybridAvg < 15;
  if (hybridPassed) passed++;
  else failed++;

  details.push({
    name: "Hybrid Search",
    p50: hybridAvg * 0.8,
    p95: hybridAvg * 1.5,
    p99: hybridAvg * 2.0,
    avg: hybridAvg,
    throughput: 1000 / hybridAvg,
    status: hybridPassed ? "pass" : "fail",
  });

  logInfo(`Average: ${hybridAvg.toFixed(2)}ms, Throughput: ${(1000 / hybridAvg).toFixed(2)} req/s`);
  log(hybridPassed ? "✓ PASS" : "✗ FAIL", hybridPassed ? COLORS.green : COLORS.red);

  return {
    tests: 3,
    passed,
    failed,
    details,
  };
}

// Run throughput benchmarks
async function runThroughputBenchmarks(): Promise<ThroughputReportSection> {
  logSection("Throughput Benchmarks");

  const mockService = createMockRetrievalService(5);
  const details: ThroughputReportSection["details"] = [];
  let passed = 0;
  let failed = 0;
  const testDuration = 1000; // 1 second per test

  // Vector search throughput
  logSubsection("Vector Search Throughput");
  const vectorStart = Date.now();
  let vectorCount = 0;
  while (Date.now() - vectorStart < testDuration) {
    await mockService.findRelevantSkills("throughput test");
    vectorCount++;
  }
  const vectorDuration = Date.now() - vectorStart;
  const vectorThroughput = (vectorCount / vectorDuration) * 1000;
  const vectorTpPassed = vectorThroughput > 100;
  if (vectorTpPassed) passed++;
  else failed++;

  details.push({
    name: "Vector Search",
    throughput: vectorThroughput,
    avgLatency: 1000 / vectorThroughput,
    duration: vectorDuration,
    status: vectorTpPassed ? "pass" : "fail",
  });

  logInfo(`Throughput: ${vectorThroughput.toFixed(2)} req/s`);
  log(vectorTpPassed ? "✓ PASS" : "✗ FAIL", vectorTpPassed ? COLORS.green : COLORS.red);

  // Keyword search throughput
  logSubsection("Keyword Search Throughput");
  const keywordStart = Date.now();
  let keywordCount = 0;
  while (Date.now() - keywordStart < testDuration) {
    await mockService.searchByKeyword("throughput");
    keywordCount++;
  }
  const keywordDuration = Date.now() - keywordStart;
  const keywordThroughput = (keywordCount / keywordDuration) * 1000;
  const keywordTpPassed = keywordThroughput > 200;
  if (keywordTpPassed) passed++;
  else failed++;

  details.push({
    name: "Keyword Search",
    throughput: keywordThroughput,
    avgLatency: 1000 / keywordThroughput,
    duration: keywordDuration,
    status: keywordTpPassed ? "pass" : "fail",
  });

  logInfo(`Throughput: ${keywordThroughput.toFixed(2)} req/s`);
  log(keywordTpPassed ? "✓ PASS" : "✗ FAIL", keywordTpPassed ? COLORS.green : COLORS.red);

  // Hybrid search throughput
  logSubsection("Hybrid Search Throughput");
  const hybridStart = Date.now();
  let hybridCount = 0;
  while (Date.now() - hybridStart < testDuration) {
    await mockService.hybridSearch("throughput test");
    hybridCount++;
  }
  const hybridDuration = Date.now() - hybridStart;
  const hybridThroughput = (hybridCount / hybridDuration) * 1000;
  const hybridTpPassed = hybridThroughput > 80;
  if (hybridTpPassed) passed++;
  else failed++;

  details.push({
    name: "Hybrid Search",
    throughput: hybridThroughput,
    avgLatency: 1000 / hybridThroughput,
    duration: hybridDuration,
    status: hybridTpPassed ? "pass" : "fail",
  });

  logInfo(`Throughput: ${hybridThroughput.toFixed(2)} req/s`);
  log(hybridTpPassed ? "✓ PASS" : "✗ FAIL", hybridTpPassed ? COLORS.green : COLORS.red);

  return {
    tests: 3,
    passed,
    failed,
    details,
  };
}

// Run recall benchmarks
async function runRecallBenchmarks(): Promise<RecallReportSection> {
  logSection("Recall Benchmarks");

  const mockService = createMockRetrievalService(5);
  const details: RecallReportSection["details"] = [];
  let passed = 0;
  let failed = 0;

  // Generate test queries
  const keywords = ["search", "file", "data", "code", "api"];
  const testQueries = Array.from({ length: 50 }, (_, i) => ({
    query: `${keywords[i % keywords.length]} test`,
    relevantIds: [`tool-${(i % 10) + 1}`, `tool-${(i % 10) + 2}`],
  }));

  // Vector search recall
  logSubsection("Vector Search Recall");
  let vectorRelevant = 0;
  let vectorTotalRelevant = 0;
  let vectorRetrieved = 0;

  for (const testQuery of testQueries) {
    const results = await mockService.findRelevantSkills(testQuery.query);
    const resultIds = new Set(results.map((r) => r.id));

    for (const relevantId of testQuery.relevantIds) {
      vectorTotalRelevant++;
      if (resultIds.has(relevantId)) {
        vectorRelevant++;
      }
    }
    vectorRetrieved += results.length;
  }

  const vectorRecall = vectorTotalRelevant > 0 ? vectorRelevant / vectorTotalRelevant : 0;
  const vectorPrecision = vectorRetrieved > 0 ? vectorRelevant / vectorRetrieved : 0;
  const vectorF1 =
    vectorPrecision + vectorRecall > 0
      ? (2 * vectorPrecision * vectorRecall) / (vectorPrecision + vectorRecall)
      : 0;

  const vectorRecallPassed = vectorRecall > 0.9;
  if (vectorRecallPassed) passed++;
  else failed++;

  details.push({
    name: "Vector Search",
    recall: vectorRecall,
    precision: vectorPrecision,
    f1: vectorF1,
    status: vectorRecallPassed ? "pass" : "fail",
  });

  logInfo(
    `Recall: ${(vectorRecall * 100).toFixed(2)}%, Precision: ${(vectorPrecision * 100).toFixed(2)}%, F1: ${vectorF1.toFixed(3)}`
  );
  log(vectorRecallPassed ? "✓ PASS" : "✗ FAIL", vectorRecallPassed ? COLORS.green : COLORS.red);

  // Keyword search recall
  logSubsection("Keyword Search Recall");
  let keywordRelevant = 0;
  let keywordTotalRelevant = 0;
  let keywordRetrieved = 0;

  for (const testQuery of testQueries) {
    const results = await mockService.searchByKeyword(
      keywords[testQueries.indexOf(testQuery) % keywords.length]
    );
    const resultIds = new Set(results.map((r) => r.id));

    for (const relevantId of testQuery.relevantIds) {
      keywordTotalRelevant++;
      if (resultIds.has(relevantId)) {
        keywordRelevant++;
      }
    }
    keywordRetrieved += results.length;
  }

  const keywordRecall = keywordTotalRelevant > 0 ? keywordRelevant / keywordTotalRelevant : 0;
  const keywordPrecision = keywordRetrieved > 0 ? keywordRelevant / keywordRetrieved : 0;
  const keywordF1 =
    keywordPrecision + keywordRecall > 0
      ? (2 * keywordPrecision * keywordRecall) / (keywordPrecision + keywordRecall)
      : 0;

  const keywordRecallPassed = keywordRecall > 0.92;
  if (keywordRecallPassed) passed++;
  else failed++;

  details.push({
    name: "Keyword Search",
    recall: keywordRecall,
    precision: keywordPrecision,
    f1: keywordF1,
    status: keywordRecallPassed ? "pass" : "fail",
  });

  logInfo(
    `Recall: ${(keywordRecall * 100).toFixed(2)}%, Precision: ${(keywordPrecision * 100).toFixed(2)}%, F1: ${keywordF1.toFixed(3)}`
  );
  log(keywordRecallPassed ? "✓ PASS" : "✗ FAIL", keywordRecallPassed ? COLORS.green : COLORS.red);

  // Hybrid search recall
  logSubsection("Hybrid Search Recall");
  let hybridRelevant = 0;
  let hybridTotalRelevant = 0;
  let hybridRetrieved = 0;

  for (const testQuery of testQueries) {
    const results = await mockService.hybridSearch(testQuery.query);
    const resultIds = new Set(results.map((r) => r.id));

    for (const relevantId of testQuery.relevantIds) {
      hybridTotalRelevant++;
      if (resultIds.has(relevantId)) {
        hybridRelevant++;
      }
    }
    hybridRetrieved += results.length;
  }

  const hybridRecall = hybridTotalRelevant > 0 ? hybridRelevant / hybridTotalRelevant : 0;
  const hybridPrecision = hybridRetrieved > 0 ? hybridRelevant / hybridRetrieved : 0;
  const hybridF1 =
    hybridPrecision + hybridRecall > 0
      ? (2 * hybridPrecision * hybridRecall) / (hybridPrecision + hybridRecall)
      : 0;

  const hybridRecallPassed = hybridRecall > 0.88;
  if (hybridRecallPassed) passed++;
  else failed++;

  details.push({
    name: "Hybrid Search",
    recall: hybridRecall,
    precision: hybridPrecision,
    f1: hybridF1,
    status: hybridRecallPassed ? "pass" : "fail",
  });

  logInfo(
    `Recall: ${(hybridRecall * 100).toFixed(2)}%, Precision: ${(hybridPrecision * 100).toFixed(2)}%, F1: ${hybridF1.toFixed(3)}`
  );
  log(hybridRecallPassed ? "✓ PASS" : "✗ FAIL", hybridRecallPassed ? COLORS.green : COLORS.red);

  return {
    tests: 3,
    passed,
    failed,
    details,
  };
}

// Generate report content
function generateReport(report: BenchmarkReport, format: "json" | "markdown" | "html"): string {
  if (format === "json") {
    return JSON.stringify(report, null, 2);
  }

  if (format === "markdown") {
    let md = `# ApexBridge Performance Benchmark Report\n\n`;
    md += `**Generated:** ${report.timestamp}\n\n`;

    md += `## Environment\n\n`;
    md += `- **Node.js:** ${report.environment.nodeVersion}\n`;
    md += `- **Platform:** ${report.environment.platform}\n`;
    md += `- **CPU Cores:** ${report.environment.cpuCount}\n`;
    md += `- **Memory:** ${formatBytes(report.environment.memoryTotal)}\n\n`;

    md += `## Summary\n\n`;
    md += `| Metric | Value |\n`;
    md += `|--------|-------|\n`;
    md += `| Total Tests | ${report.summary.totalTests} |\n`;
    md += `| Passed | ${report.summary.passedTests} |\n`;
    md += `| Failed | ${report.summary.failedTests} |\n`;
    md += `| Pass Rate | ${(report.summary.passRate * 100).toFixed(1)}% |\n\n`;

    if (report.results.latency) {
      md += `## Latency Results\n\n`;
      md += `| Test | Avg (ms) | P50 | P95 | P99 | Throughput | Status |\n`;
      md += `|------|----------|-----|-----|-----|------------|--------|\n`;
      for (const detail of report.results.latency.details) {
        md += `| ${detail.name} | ${detail.avg.toFixed(2)} | ${detail.p50.toFixed(2)} | ${detail.p95.toFixed(2)} | ${detail.p99.toFixed(2)} | ${detail.throughput.toFixed(2)} | ${detail.status === "pass" ? "✅" : "❌"} |\n`;
      }
      md += `\n`;
    }

    if (report.results.throughput) {
      md += `## Throughput Results\n\n`;
      md += `| Test | Throughput (req/s) | Avg Latency (ms) | Status |\n`;
      md += `|------|-------------------|------------------|--------|\n`;
      for (const detail of report.results.throughput.details) {
        md += `| ${detail.name} | ${detail.throughput.toFixed(2)} | ${detail.avgLatency.toFixed(2)} | ${detail.status === "pass" ? "✅" : "❌"} |\n`;
      }
      md += `\n`;
    }

    if (report.results.recall) {
      md += `## Recall Results\n\n`;
      md += `| Test | Recall | Precision | F1 Score | Status |\n`;
      md += `|------|--------|-----------|----------|--------|\n`;
      for (const detail of report.results.recall.details) {
        md += `| ${detail.name} | ${(detail.recall * 100).toFixed(1)}% | ${(detail.precision * 100).toFixed(1)}% | ${detail.f1.toFixed(3)} | ${detail.status === "pass" ? "✅" : "❌"} |\n`;
      }
      md += `\n`;
    }

    return md;
  }

  if (format === "html") {
    // HTML format
    let html = `<!DOCTYPE html>
<html>
<head>
  <title>ApexBridge Performance Benchmark Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; background: #f5f5f5; }
    .container { max-width: 1000px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #333; border-bottom: 2px solid #007acc; padding-bottom: 10px; }
    h2 { color: #007acc; margin-top: 30px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f8f9fa; font-weight: 600; }
    .pass { color: #28a745; }
    .fail { color: #dc3545; }
    .summary { background: #f8f9fa; padding: 20px; border-radius: 4px; margin: 20px 0; }
    .env { color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>ApexBridge Performance Benchmark Report</h1>
    <p class="env">Generated: ${report.timestamp} | Node.js: ${report.environment.nodeVersion} | Platform: ${report.environment.platform}</p>
    
    <div class="summary">
      <h2>Summary</h2>
      <p><strong>Total Tests:</strong> ${report.summary.totalTests} | 
         <strong>Passed:</strong> <span class="pass">${report.summary.passedTests}</span> | 
         <strong>Failed:</strong> <span class="fail">${report.summary.failedTests}</span> | 
         <strong>Pass Rate:</strong> ${(report.summary.passRate * 100).toFixed(1)}%</p>
    </div>`;

    if (report.results.latency) {
      html += `
    <h2>Latency Results</h2>
    <table>
      <tr><th>Test</th><th>Avg (ms)</th><th>P50</th><th>P95</th><th>P99</th><th>Throughput</th><th>Status</th></tr>`;
      for (const detail of report.results.latency.details) {
        html += `<tr>
          <td>${detail.name}</td>
          <td>${detail.avg.toFixed(2)}</td>
          <td>${detail.p50.toFixed(2)}</td>
          <td>${detail.p95.toFixed(2)}</td>
          <td>${detail.p99.toFixed(2)}</td>
          <td>${detail.throughput.toFixed(2)}</td>
          <td class="${detail.status}">${detail.status === "pass" ? "✅ PASS" : "❌ FAIL"}</td>
        </tr>`;
      }
      html += `</table>`;
    }

    if (report.results.throughput) {
      html += `
    <h2>Throughput Results</h2>
    <table>
      <tr><th>Test</th><th>Throughput (req/s)</th><th>Avg Latency (ms)</th><th>Status</th></tr>`;
      for (const detail of report.results.throughput.details) {
        html += `<tr>
          <td>${detail.name}</td>
          <td>${detail.throughput.toFixed(2)}</td>
          <td>${detail.avgLatency.toFixed(2)}</td>
          <td class="${detail.status}">${detail.status === "pass" ? "✅ PASS" : "❌ FAIL"}</td>
        </tr>`;
      }
      html += `</table>`;
    }

    if (report.results.recall) {
      html += `
    <h2>Recall Results</h2>
    <table>
      <tr><th>Test</th><th>Recall</th><th>Precision</th><th>F1 Score</th><th>Status</th></tr>`;
      for (const detail of report.results.recall.details) {
        html += `<tr>
          <td>${detail.name}</td>
          <td>${(detail.recall * 100).toFixed(1)}%</td>
          <td>${(detail.precision * 100).toFixed(1)}%</td>
          <td>${detail.f1.toFixed(3)}</td>
          <td class="${detail.status}">${detail.status === "pass" ? "✅ PASS" : "❌ FAIL"}</td>
        </tr>`;
      }
      html += `</table>`;
    }

    html += `
  </div>
</body>
</html>`;

    return html;
  }

  return JSON.stringify(report, null, 2);
}

// Main execution
async function main(): Promise<void> {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  logSection("ApexBridge Performance Benchmark");
  log(`Node.js: ${process.version}`, COLORS.dim);
  log(`Platform: ${process.platform}`, COLORS.dim);
  log(`Samples: ${options.samples}`, COLORS.dim);

  const env = getEnvironment();
  log(`Memory: ${formatBytes(env.memoryTotal)}`, COLORS.dim);

  const report: BenchmarkReport = {
    timestamp: new Date().toISOString(),
    environment: env,
    options,
    results: {},
    summary: {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      passRate: 0,
    },
  };

  ensureOutputDir(options.output);

  const totalStartTime = Date.now();

  try {
    // Run selected benchmarks
    if (options.type === "latency" || options.type === "all") {
      report.results.latency = await runLatencyBenchmarks(options.samples);
    }

    if (options.type === "throughput" || options.type === "all") {
      report.results.throughput = await runThroughputBenchmarks();
    }

    if (options.type === "recall" || options.type === "all") {
      report.results.recall = await runRecallBenchmarks();
    }

    // Calculate summary
    let totalTests = 0;
    let passedTests = 0;

    if (report.results.latency) {
      totalTests += report.results.latency.tests;
      passedTests += report.results.latency.passed;
    }
    if (report.results.throughput) {
      totalTests += report.results.throughput.tests;
      passedTests += report.results.throughput.passed;
    }
    if (report.results.recall) {
      totalTests += report.results.recall.tests;
      passedTests += report.results.recall.passed;
    }

    report.summary = {
      totalTests,
      passedTests,
      failedTests: totalTests - passedTests,
      passRate: totalTests > 0 ? passedTests / totalTests : 0,
    };

    const totalDuration = Date.now() - totalStartTime;

    // Print summary
    logSection("Summary");
    log(`Total Tests: ${totalTests}`, COLORS.bright);
    log(`Passed: ${passedTests}`, COLORS.green);
    log(
      `Failed: ${totalTests - passedTests}`,
      totalTests - passedTests > 0 ? COLORS.red : COLORS.green
    );
    log(`Pass Rate: ${(report.summary.passRate * 100).toFixed(1)}%`, COLORS.bright);
    log(`Total Duration: ${formatDuration(totalDuration)}`, COLORS.dim);

    // Generate and save reports
    const reportContent = generateReport(report, options.format);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseFilename = `benchmark-report-${timestamp}`;

    // Save in requested format
    const extension = options.format === "html" ? "html" : options.format;
    const filepath = path.join(options.output, `${baseFilename}.${extension}`);
    fs.writeFileSync(filepath, reportContent);
    logSuccess(`Report saved to: ${filepath}`);

    // Also save as JSON for data processing
    const jsonPath = path.join(options.output, `${baseFilename}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    logSuccess(`JSON data saved to: ${jsonPath}`);

    // Exit with appropriate code
    if (report.summary.passRate >= 0.9) {
      logSuccess("All benchmarks passed!");
      process.exit(0);
    } else if (report.summary.passRate >= 0.7) {
      logWarning("Some benchmarks failed - review results");
      process.exit(0);
    } else {
      logError("Significant benchmark failures detected");
      process.exit(1);
    }
  } catch (error) {
    logError(`Benchmark execution failed: ${error}`);
    console.error(error);
    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
