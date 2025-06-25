"use client"

interface ProjectFile {
  path: string
  content: string
  type: string
}

interface CodePreviewProps {
  file: ProjectFile | null
}

export function CodePreview({ file }: CodePreviewProps) {
  if (!file) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">Select a file to view its content</div>
    )
  }

  const getLanguage = (path: string) => {
    const ext = path.split(".").pop()
    switch (ext) {
      case "tsx":
      case "ts":
        return "typescript"
      case "js":
      case "jsx":
        return "javascript"
      case "css":
        return "css"
      case "json":
        return "json"
      default:
        return "text"
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 bg-gray-50 border-b text-sm font-medium text-gray-700">{file.path}</div>
      <div className="flex-1 overflow-auto">
        <pre className="p-4 text-sm bg-white h-full overflow-auto">
          <code className={`language-${getLanguage(file.path)}`}>{file.content}</code>
        </pre>
      </div>
    </div>
  )
}
