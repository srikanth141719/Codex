import React, { useRef } from 'react';
import Editor from '@monaco-editor/react';

const BOILERPLATES = {
  cpp: `#include <iostream>
using namespace std;

int main() {
    return 0;
}`,
  python: '',
  java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
    }
}`,
};

const LANG_MAP = {
  cpp: 'cpp',
  python: 'python',
  java: 'java',
};

export default function CodeEditor({ language, code, onChange, readOnly = false }) {
  const editorRef = useRef(null);

  function handleEditorMount(editor) {
    editorRef.current = editor;
    editor.focus();
  }

  return (
    <div className="h-full border border-gray-200 rounded-lg overflow-hidden">
      <Editor
        height="100%"
        language={LANG_MAP[language]}
        value={code || BOILERPLATES[language] || ''}
        onChange={(value) => onChange(value || '')}
        onMount={handleEditorMount}
        theme="vs-light"
        options={{
          fontSize: 14,
          fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          lineNumbers: 'on',
          renderLineHighlight: 'gutter',
          wordWrap: 'on',
          tabSize: 4,
          insertSpaces: true,
          automaticLayout: true,
          readOnly,
          padding: { top: 12 },
          bracketPairColorization: { enabled: true },
          suggestOnTriggerCharacters: true,
          quickSuggestions: true,
        }}
      />
    </div>
  );
}

export { BOILERPLATES };
