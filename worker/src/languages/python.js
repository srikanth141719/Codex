/**
 * Python language handler for the judge worker
 */
module.exports = {
  image: 'codex-runner-python',
  extension: '.py',
  timeout: 10000,   // 10 seconds
  memoryMB: 256,
  
  getCommand(codeFile, inputFile) {
    return [
      'sh', '-c',
      `cd /sandbox && timeout 10 python3 ${codeFile} < ${inputFile}`
    ];
  },

  getCompileCommand(codeFile) {
    return [
      'sh', '-c',
      `cd /sandbox && python3 -m py_compile ${codeFile} 2>&1`
    ];
  }
};
