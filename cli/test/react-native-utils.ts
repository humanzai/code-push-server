// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from "assert";
import * as childProcess from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import { getAndroidHermesEnabled, runHermesEmitBinaryCommand } from "../script/react-native-utils";

function getHermesOSBin(): string {
  switch (process.platform) {
    case "win32":
      return "win64-bin";
    case "darwin":
      return "osx-bin";
    case "freebsd":
    case "linux":
    case "sunos":
    default:
      return "linux64-bin";
  }
}

function getHermesOSExe(): string {
  return process.platform === "win32" ? "hermesc.exe" : "hermesc";
}

function writeFile(filePath: string, contents: string = ""): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function writeReactNativeProject(
  projectPath: string,
  gradleProperties: Record<string, string | boolean> = {},
  reactNativeVersion: string = "0.84.1",
  buildGradleContents?: string
): void {
  writeFile(
    path.join(projectPath, "package.json"),
    JSON.stringify({
      name: "TestApp",
      dependencies: {
        "react-native": reactNativeVersion,
      },
    })
  );

  writeFile(
    path.join(projectPath, "android", "app", "build.gradle"),
    buildGradleContents ||
      `
apply plugin: "com.android.application"

android {
    defaultConfig {
        versionName "1.0.0"
    }
}
`
  );

  const gradlePropertiesContents = Object.keys(gradleProperties)
    .map((key) => `${key}=${gradleProperties[key]}`)
    .join("\n");
  writeFile(path.join(projectPath, "android", "gradle.properties"), gradlePropertiesContents);
}

function writeHermesCompiler(projectPath: string): string {
  const hermesCompilerPath = path.join(
    projectPath,
    "node_modules",
    "hermes-compiler",
    "hermesc",
    getHermesOSBin(),
    getHermesOSExe()
  );
  writeFile(path.join(projectPath, "node_modules", "hermes-compiler", "package.json"), "{}");
  writeFile(hermesCompilerPath);
  return hermesCompilerPath;
}

function writeHermesEngine(projectPath: string): string {
  const hermesEnginePath = path.join("node_modules", "hermes-engine", getHermesOSBin(), getHermesOSExe());
  writeFile(path.join(projectPath, hermesEnginePath));
  return hermesEnginePath;
}

function stubHermesProcess(sandbox: sinon.SinonSandbox): sinon.SinonStub {
  const spawn = sandbox.stub(childProcess, "spawn").callsFake((): any => ({
    stdout: { on: () => {} },
    stderr: { on: () => {} },
    on: (event: string, callback: Function) => {
      if (event === "close") {
        callback(0, null);
      }
    },
  }));
  sandbox
    .stub(fs, "copyFile")
    .callsFake((...args: any[]): void => {
      const copyCallback = typeof args[2] === "function" ? args[2] : args[3];
      copyCallback(null);
    });
  sandbox.stub(fs, "unlink").callsFake((...args: any[]): void => {
    args[1](null);
  });

  return spawn;
}

describe("react-native-utils", () => {
  let sandbox: sinon.SinonSandbox;
  let projectPath: string;
  let originalCwd: string;
  let originalCodePushNodeArgs: string | undefined;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    originalCwd = process.cwd();
    originalCodePushNodeArgs = process.env.CODE_PUSH_NODE_ARGS;
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "code-push-cli-test-"));
    process.chdir(projectPath);
  });

  afterEach(() => {
    if (originalCodePushNodeArgs === undefined) {
      delete process.env.CODE_PUSH_NODE_ARGS;
    } else {
      process.env.CODE_PUSH_NODE_ARGS = originalCodePushNodeArgs;
    }
    process.chdir(originalCwd);
    sandbox.restore();
    fs.rmSync(projectPath, { recursive: true, force: true });
  });

  it("detects Android Hermes from gradle.properties in React Native projects", async () => {
    writeReactNativeProject(projectPath, { hermesEnabled: true }, "0.83.0");

    assert.equal(await getAndroidHermesEnabled(null), true);
  });

  it("treats React Native 0.84 Android projects as Hermes-enabled by default", async () => {
    writeReactNativeProject(projectPath);

    assert.equal(await getAndroidHermesEnabled(null), true);
  });

  it("keeps React Native 0.84 Android Hermes enabled when Hermes V1 is opted out", async () => {
    writeReactNativeProject(projectPath, { hermesV1Enabled: false });

    assert.equal(await getAndroidHermesEnabled(null), true);
  });

  it("keeps legacy enableHermes=false ahead of React Native 0.84 defaults", async () => {
    writeReactNativeProject(
      projectPath,
      {},
      "0.84.1",
      `
project.ext.react = [
    enableHermes: false
]

android {
    defaultConfig {
        versionName "1.0.0"
    }
}
`
    );

    assert.equal(await getAndroidHermesEnabled(null), false);
  });

  it("uses the hermes-compiler package before falling back to hermesvm", async () => {
    writeReactNativeProject(projectPath);
    process.env.CODE_PUSH_NODE_ARGS = "  --max-old-space-size=8192  ";

    const hermesCompilerPath = writeHermesCompiler(projectPath);

    const outputFolder = path.join(projectPath, "CodePush");
    fs.mkdirSync(outputFolder);

    const spawn = stubHermesProcess(sandbox);

    await runHermesEmitBinaryCommand("index.android.bundle", outputFolder, null, [], null);

    sinon.assert.calledOnce(spawn);
    assert.equal(spawn.args[0][0], fs.realpathSync(hermesCompilerPath));
    assert.deepEqual(spawn.args[0][1], [
      "-emit-binary",
      "-out",
      path.join(outputFolder, "index.android.bundle.hbc"),
      path.join(outputFolder, "index.android.bundle"),
    ]);
  });

  it("keeps hermes-engine ahead of hermes-compiler for legacy React Native projects", async () => {
    writeReactNativeProject(projectPath, { hermesEnabled: true }, "0.70.6");

    const hermesEnginePath = writeHermesEngine(projectPath);
    writeHermesCompiler(projectPath);

    const outputFolder = path.join(projectPath, "CodePush");
    fs.mkdirSync(outputFolder);

    const spawn = stubHermesProcess(sandbox);

    await runHermesEmitBinaryCommand("index.android.bundle", outputFolder, null, [], null);

    sinon.assert.calledOnce(spawn);
    assert.equal(spawn.args[0][0], hermesEnginePath);
    assert.deepEqual(spawn.args[0][1], [
      "-emit-binary",
      "-out",
      path.join(outputFolder, "index.android.bundle.hbc"),
      path.join(outputFolder, "index.android.bundle"),
    ]);
  });
});
