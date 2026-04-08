/**
 * C++ language handler for the judge worker
 */
module.exports = {
  image: 'codex-runner-cpp',
  extension: '.cpp',
  timeout: 5000,    // 5 seconds
  memoryMB: 256,
  
  /**
   * Build the command to compile and run C++ code inside the container
   */
  getCommand(codeFile, inputFile) {
    return [
      'sh', '-c',
      `cd /sandbox && g++ -O2 -std=c++17 -o solution ${codeFile} 2>&1 && timeout 5 ./solution < ${inputFile}`
    ];
  },

  /**
   * Get the compile-only command (for detecting compilation errors)
   */
  getCompileCommand(codeFile) {
    return [
      'sh', '-c',
      `cd /sandbox && g++ -O2 -std=c++17 -o solution ${codeFile} 2>&1`
    ];
  }
};
