const Docker = require('dockerode');
const { v4: uuidv4 } = require('uuid');
const os = require('os');

// Auto-detect Docker connection based on OS
function createDockerClient() {
  // Explicit env var takes priority
  if (process.env.DOCKER_HOST) {
    const host = process.env.DOCKER_HOST;
    if (host.startsWith('tcp://')) {
      const url = new URL(host);
      return new Docker({ host: url.hostname, port: url.port });
    }
    return new Docker({ socketPath: host.replace('unix://', '') });
  }

  // Windows: use named pipe
  if (os.platform() === 'win32') {
    return new Docker({ socketPath: '//./pipe/docker_engine' });
  }

  // Linux/Mac: use Unix socket
  return new Docker({ socketPath: '/var/run/docker.sock' });
}

const docker = createDockerClient();

// Language handlers
const languages = {
  cpp: require('./languages/cpp'),
  python: require('./languages/python'),
  java: require('./languages/java'),
};

/**
 * Execute code against test cases inside a Docker container.
 * Returns { verdict, runtime_ms, memory_kb, stdout, stderr, passed_count, total_count }
 */
async function judgeSubmission(submission, testcases) {
  const lang = languages[submission.language];
  if (!lang) {
    return {
      verdict: 'Internal Error',
      runtime_ms: 0,
      memory_kb: 0,
      stdout: '',
      stderr: `Unsupported language: ${submission.language}`,
      passed_count: 0,
      total_count: testcases.length,
    };
  }

  const containerName = `codex-judge-${uuidv4().slice(0, 8)}`;
  let container;

  try {
    // Prepare code file content
    const codeFileName = submission.language === 'java' ? 'Main.java' : `solution${lang.extension}`;

    // Create container
    container = await docker.createContainer({
      Image: lang.image,
      name: containerName,
      Cmd: ['sleep', '30'], // Keep alive for multiple test case runs
      WorkingDir: '/sandbox',
      HostConfig: {
        Memory: lang.memoryMB * 1024 * 1024,
        MemorySwap: lang.memoryMB * 1024 * 1024, // No swap
        CpuPeriod: 100000,
        CpuQuota: 100000, // 1 CPU
        NetworkMode: 'none',
        AutoRemove: false,
      },
      Tty: false,
    });

    await container.start();

    // Write code file into container
    await execInContainer(container, ['sh', '-c', `cat > /sandbox/${codeFileName} << 'CODEX_EOF'\n${submission.code}\nCODEX_EOF`]);

    // Compile first (if applicable)
    if (submission.language === 'cpp' || submission.language === 'java') {
      const compileResult = await execInContainer(container, lang.getCompileCommand(codeFileName));
      if (compileResult.exitCode !== 0) {
        return {
          verdict: 'Compilation Error',
          runtime_ms: 0,
          memory_kb: 0,
          stdout: '',
          stderr: compileResult.output,
          passed_count: 0,
          total_count: testcases.length,
        };
      }
    }

    // Run against each test case
    let passed = 0;
    let totalRuntime = 0;
    let firstFailOutput = '';
    let firstFailStderr = '';
    let verdict = 'Accepted';

    for (let i = 0; i < testcases.length; i++) {
      const tc = testcases[i];
      const inputFile = `input_${i}.txt`;

      // Write input file
      const escapedInput = tc.input.replace(/'/g, "'\\''");
      await execInContainer(container, ['sh', '-c', `printf '%s' '${escapedInput}' > /sandbox/${inputFile}`]);

      // Run
      const startTime = Date.now();
      const runResult = await execWithTimeout(
        container,
        lang.getCommand(
          submission.language === 'java' ? 'Main.java' : `solution${lang.extension}`,
          inputFile
        ),
        lang.timeout
      );
      const elapsed = Date.now() - startTime;
      totalRuntime += elapsed;

      if (runResult.timedOut) {
        verdict = 'Time Limit Exceeded';
        firstFailStderr = `Test case ${i + 1}: Exceeded ${lang.timeout / 1000}s time limit`;
        break;
      }

      if (runResult.exitCode !== 0 && !runResult.timedOut) {
        verdict = 'Runtime Error';
        firstFailStderr = runResult.output;
        break;
      }

      // Compare output (trim whitespace)
      const actualOutput = runResult.output.trim();
      const expectedOutput = tc.expected_output.trim();

      if (actualOutput === expectedOutput) {
        passed++;
      } else {
        verdict = 'Wrong Answer';
        firstFailOutput = `Test case ${i + 1}:\nExpected: ${expectedOutput}\nGot: ${actualOutput}`;
        break;
      }
    }

    if (passed === testcases.length) {
      verdict = 'Accepted';
    }

    return {
      verdict,
      runtime_ms: totalRuntime,
      memory_kb: lang.memoryMB * 1024,
      stdout: firstFailOutput || (verdict === 'Accepted' ? 'All test cases passed!' : ''),
      stderr: firstFailStderr,
      passed_count: passed,
      total_count: testcases.length,
    };
  } catch (err) {
    console.error('Judge execution error:', err);
    return {
      verdict: 'Internal Error',
      runtime_ms: 0,
      memory_kb: 0,
      stdout: '',
      stderr: err.message,
      passed_count: 0,
      total_count: testcases.length,
    };
  } finally {
    // Cleanup container
    if (container) {
      try {
        await container.stop({ t: 1 }).catch(() => {});
        await container.remove({ force: true }).catch(() => {});
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Execute a command inside a container and capture output
 */
async function execInContainer(container, cmd) {
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await exec.start({ hijack: true, stdin: false });

  return new Promise((resolve) => {
    let output = '';
    stream.on('data', (chunk) => {
      // Docker multiplexed stream - strip header bytes
      output += chunk.toString('utf8');
    });
    stream.on('end', async () => {
      const inspect = await exec.inspect();
      // Clean up docker stream header bytes (first 8 bytes of each frame)
      const cleanOutput = output.replace(/[\x00-\x08]/g, '').trim();
      resolve({ output: cleanOutput, exitCode: inspect.ExitCode });
    });
    stream.on('error', (err) => {
      resolve({ output: err.message, exitCode: 1 });
    });
  });
}

/**
 * Execute with a timeout wrapper
 */
async function execWithTimeout(container, cmd, timeoutMs) {
  return new Promise(async (resolve) => {
    const timer = setTimeout(() => {
      resolve({ output: '', exitCode: 1, timedOut: true });
    }, timeoutMs + 2000); // Extra buffer beyond the command timeout

    try {
      const result = await execInContainer(container, cmd);
      clearTimeout(timer);
      resolve({ ...result, timedOut: false });
    } catch (err) {
      clearTimeout(timer);
      resolve({ output: err.message, exitCode: 1, timedOut: false });
    }
  });
}

/**
 * Run code against a custom input (no test case comparison)
 */
async function runWithCustomInput(submission, customInput) {
  const lang = languages[submission.language];
  if (!lang) {
    return {
      verdict: 'Internal Error',
      stdout: '',
      stderr: `Unsupported language: ${submission.language}`,
    };
  }

  const containerName = `codex-run-${uuidv4().slice(0, 8)}`;
  let container;

  try {
    const codeFileName = submission.language === 'java' ? 'Main.java' : `solution${lang.extension}`;

    container = await docker.createContainer({
      Image: lang.image,
      name: containerName,
      Cmd: ['sleep', '30'],
      WorkingDir: '/sandbox',
      HostConfig: {
        Memory: lang.memoryMB * 1024 * 1024,
        MemorySwap: lang.memoryMB * 1024 * 1024,
        CpuPeriod: 100000,
        CpuQuota: 100000,
        NetworkMode: 'none',
        AutoRemove: false,
      },
      Tty: false,
    });

    await container.start();

    // Write code
    await execInContainer(container, ['sh', '-c', `cat > /sandbox/${codeFileName} << 'CODEX_EOF'\n${submission.code}\nCODEX_EOF`]);

    // Compile
    if (submission.language === 'cpp' || submission.language === 'java') {
      const compileResult = await execInContainer(container, lang.getCompileCommand(codeFileName));
      if (compileResult.exitCode !== 0) {
        return { verdict: 'Compilation Error', stdout: '', stderr: compileResult.output };
      }
    }

    // Write input
    const input = customInput || '';
    const escapedInput = input.replace(/'/g, "'\\''");
    await execInContainer(container, ['sh', '-c', `printf '%s' '${escapedInput}' > /sandbox/input.txt`]);

    // Run
    const result = await execWithTimeout(
      container,
      lang.getCommand(codeFileName, 'input.txt'),
      lang.timeout
    );

    if (result.timedOut) {
      return { verdict: 'Time Limit Exceeded', stdout: '', stderr: 'Time limit exceeded' };
    }

    return {
      verdict: result.exitCode === 0 ? 'Success' : 'Runtime Error',
      stdout: result.output,
      stderr: result.exitCode !== 0 ? result.output : '',
    };
  } catch (err) {
    return { verdict: 'Internal Error', stdout: '', stderr: err.message };
  } finally {
    if (container) {
      try {
        await container.stop({ t: 1 }).catch(() => {});
        await container.remove({ force: true }).catch(() => {});
      } catch (e) {}
    }
  }
}

module.exports = { judgeSubmission, runWithCustomInput };
