import { Glob, spawn, spawnSync } from "bun";
import { describe, expect, it } from "bun:test";
import { bunEnv, bunExe, isBroken, isCI, isIntelMacOS, isMusl, isWindows } from "harness";
import { dirname, join } from "path";

const jsNativeApiRoot = join(__dirname, "node-napi-tests", "test", "js-native-api");
const nodeApiRoot = join(__dirname, "node-napi-tests", "test", "node-api");

const jsNativeApiTests = Array.from(new Glob("**/*.js").scanSync(jsNativeApiRoot));
const nodeApiTests = Array.from(new Glob("**/*.js").scanSync(nodeApiRoot));

// These js-native-api tests are known to fail and will be fixed in later PRs
let failingJsNativeApiTests: string[] = [
  // We skip certain parts of test_string/test.js because we don't support creating empty external
  // strings. We don't skip the entire thing because the other tests are useful to check.
  // "test_string/test.js",
];

// These are the tests from node-api that failed as of commit 83f536f4d, except for those that
// passed in Bun v1.1.34. It'll take some time to get all these to work, as we've been focusing more
// on js-native-api tests so far, and we don't want these tests to pollute CI. But we do want to
// know if we regressed any of the other tests.
let failingNodeApiTests = [
  "test_uv_threadpool_size/test.js",
  "test_uv_threadpool_size/node-options.js",
  "test_uv_loop/test.js",
  "test_callback_scope/test-resolve-async.js",
  "test_callback_scope/test-async-hooks.js",
  "test_fatal/test.js",
  "test_fatal/test2.js",
  "test_fatal/test_threads.js",
  "test_threadsafe_function/test.js",
  "test_threadsafe_function/test_legacy_uncaught_exception.js",
  "test_worker_buffer_callback/test.js",
  "test_worker_buffer_callback/test-free-called.js", // TODO(@heimskr)
  "test_make_callback_recurse/test.js",
  "test_buffer/test.js",
  "test_instance_data/test.js",
  "test_make_callback/test-async-hooks.js",
  "test_async_context/test.js",
  "test_async_context/test-gcable.js",
  "test_async_context/test-gcable-callback.js",
  "test_async_cleanup_hook/test.js",
  "test_async/test.js",
  "test_async/test-uncaught.js",
  "test_async/test-async-hooks.js",
  "test_general/test.js",
  "test_env_teardown_gc/test.js",
  "test_worker_terminate/test.js",
];

if (isBroken && isIntelMacOS) {
  // TODO(@190n)
  // these are flaky on Intel Mac
  failingJsNativeApiTests.push("test_reference/test.js");
  failingNodeApiTests.push("test_reference_by_node_api_version/test.js");
}

if (isWindows) {
  if (isBroken) {
    failingNodeApiTests.push("test_callback_scope/test.js"); // TODO: remove once #12827 is fixed
  }

  for (const i in failingJsNativeApiTests) {
    failingJsNativeApiTests[i] = failingJsNativeApiTests[i].replaceAll("/", "\\");
  }
  for (const i in failingNodeApiTests) {
    failingNodeApiTests[i] = failingNodeApiTests[i].replaceAll("/", "\\");
  }
}

if (isMusl) {
  failingNodeApiTests = nodeApiTests;
  failingJsNativeApiTests = jsNativeApiTests;
}

// Tests that intentionally abort and should not generate core dumps when they abort
// due to a Node-API error
const abortingJsNativeApiTests = ["test_finalizer/test_fatal_finalize.js"];

for (const t of failingJsNativeApiTests) {
  if (!jsNativeApiTests.includes(t)) {
    console.error(`attempt to skip ${t} which is not a real js-native-api test`);
    process.exit(1);
  }
}
for (const t of failingNodeApiTests) {
  if (!nodeApiTests.includes(t)) {
    console.error(`attempt to skip ${t} which is not a real node-api test`);
    process.exit(1);
  }
}

const directories = jsNativeApiTests
  .filter(t => !failingJsNativeApiTests.includes(t))
  .map(t => join(jsNativeApiRoot, t))
  .concat(nodeApiTests.filter(t => !failingNodeApiTests.includes(t)).map(t => join(nodeApiRoot, t)))
  .map(t => dirname(t));
const uniqueDirectories = Array.from(new Set(directories));

describe("build", () => {
  for (const dir of uniqueDirectories) {
    it(`${dir.slice(import.meta.dir.length + 1)}`, async () => {
      const child = spawn({
        cmd: [bunExe(), "x", "node-gyp@11", "rebuild", "--debug", "-j", "max"],
        cwd: dir,
        stderr: "pipe",
        stdout: "ignore",
        stdin: "inherit",
        env: {
          ...bunEnv,
          npm_config_target: "v24.3.0",
          CXXFLAGS: (bunEnv.CXXFLAGS ?? "") + (process.platform == "win32" ? " -std=c++20" : " -std=gnu++20"),
          // on linux CI, node-gyp will default to g++ and the version installed there is very old,
          // so we make it use clang instead
          ...(process.platform == "linux" && isCI
            ? { "CC": "/usr/lib/llvm-19/bin/clang", CXX: "/usr/lib/llvm-19/bin/clang++" }
            : {}),
        },
      });
      await child.exited;
      if (child.exitCode !== 0) {
        const stderr = await new Response(child.stderr).text();
        console.error(`node-gyp rebuild in ${dir} failed:\n${stderr}`);
        console.error("bailing out!");
        process.exit(1);
      }
    });
  }
});

describe("js-native-api tests", () => {
  for (const test of jsNativeApiTests) {
    describe.skipIf(failingJsNativeApiTests.includes(test))(`${test}`, () => {
      it("passes", () => {
        const env = abortingJsNativeApiTests.includes(test)
          ? { ...bunEnv, BUN_INTERNAL_SUPPRESS_CRASH_ON_NAPI_ABORT: "1" }
          : bunEnv;
        const result = spawnSync({
          cmd: [bunExe(), "run", test],
          cwd: jsNativeApiRoot,
          stderr: "inherit",
          stdout: "ignore",
          stdin: "inherit",
          env,
        });
        expect(result.success).toBeTrue();
        expect(result.exitCode).toBe(0);
      }, 60_000);
    });
  }
});

describe("node-api tests", () => {
  for (const test of nodeApiTests) {
    describe.skipIf(failingNodeApiTests.includes(test))(`${test}`, () => {
      it("passes", () => {
        const result = spawnSync({
          cmd: [bunExe(), "run", test],
          cwd: nodeApiRoot,
          stderr: "inherit",
          stdout: "ignore",
          stdin: "inherit",
          env: bunEnv,
        });
        expect(result.success).toBeTrue();
        expect(result.exitCode).toBe(0);
      }, 60_000);
    });
  }
});
