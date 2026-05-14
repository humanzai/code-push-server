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

function writeReactNativeProject(projectPath: string, hermesEnabled: boolean): void {
  writeFile(
    path.join(projectPath, "package.json"),
    JSON.stringify({
      name: "TestApp",
      dependencies: {
        "react-native": "0.84.1",
      },
    })
  );

  writeFile(
    path.join(projectPath, "android", "app", "build.gradle"),
    `
apply plugin: "com.android.application"

android {
    defaultConfig {
        versionName "1.0.0"
    }
}
`
  );

  writeFile(path.join(projectPath, "android", "gradle.properties"), `hermesEnabled=${hermesEnabled}`);
}

describe("react-native-utils", () => {
  let sandbox: sinon.SinonSandbox;
  let projectPath: string;
  let originalCwd: string;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    originalCwd = process.cwd();
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "code-push-cli-test-"));
    process.chdir(projectPath);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    sandbox.restore();
    fs.rmSync(projectPath, { recursive: true, force: true });
  });

  it("detects Android Hermes from gradle.properties in modern React Native projects", async () => {
    writeReactNativeProject(projectPath, true);

    assert.equal(await getAndroidHermesEnabled(null), true);
  });

  it("uses the hermes-compiler package before falling back to hermesvm", async () => {
    writeReactNativeProject(projectPath, true);

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

    const outputFolder = path.join(projectPath, "CodePush");
    fs.mkdirSync(outputFolder);

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
});
