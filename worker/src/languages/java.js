/**
 * Java language handler for the judge worker
 */
module.exports = {
  image: 'codex-runner-java',
  extension: '.java',
  timeout: 10000,   // 10 seconds
  memoryMB: 512,
  
  getCommand(codeFile, inputFile) {
    return [
      'sh', '-c',
      `cd /sandbox && javac Main.java 2>&1 && timeout 10 java -Xmx256m Main < ${inputFile}`
    ];
  },

  getCompileCommand(codeFile) {
    return [
      'sh', '-c',
      `cd /sandbox && javac Main.java 2>&1`
    ];
  }
};
