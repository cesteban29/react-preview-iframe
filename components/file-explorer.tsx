"use client"

import { ChevronRight, ChevronDown, File, Folder } from "lucide-react"
import { useState } from "react"

interface ProjectFile {
  path: string
  content: string
  type: string
}

interface FileExplorerProps {
  files: ProjectFile[]
  selectedFile: ProjectFile | null
  onFileSelect: (file: ProjectFile) => void
}

export function FileExplorer({ files, selectedFile, onFileSelect }: FileExplorerProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["app"]))

  // Build file tree structure
  const buildFileTree = () => {
    const tree: any = {}

    files.forEach((file) => {
      const parts = file.path.split("/")
      let current = tree

      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          // This is a file
          current[part] = file
        } else {
          // This is a folder
          if (!current[part]) {
            current[part] = {}
          }
          current = current[part]
        }
      })
    })

    return tree
  }

  const toggleFolder = (folderPath: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(folderPath)) {
      newExpanded.delete(folderPath)
    } else {
      newExpanded.add(folderPath)
    }
    setExpandedFolders(newExpanded)
  }

  const renderTree = (node: any, path = "", depth = 0) => {
    return Object.entries(node).map(([name, value]) => {
      const currentPath = path ? `${path}/${name}` : name
      const isFile = value && typeof value === "object" && "content" in value
      const isExpanded = expandedFolders.has(currentPath)

      if (isFile) {
        const file = value as ProjectFile
        return (
          <div
            key={currentPath}
            className={`flex items-center px-2 py-1 cursor-pointer hover:bg-gray-100 ${
              selectedFile?.path === file.path ? "bg-blue-50 text-blue-600" : ""
            }`}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => onFileSelect(file)}
          >
            <File className="w-4 h-4 mr-2" />
            <span className="text-sm">{name}</span>
          </div>
        )
      } else {
        return (
          <div key={currentPath}>
            <div
              className="flex items-center px-2 py-1 cursor-pointer hover:bg-gray-100"
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              onClick={() => toggleFolder(currentPath)}
            >
              {isExpanded ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
              <Folder className="w-4 h-4 mr-2" />
              <span className="text-sm font-medium">{name}</span>
            </div>
            {isExpanded && <div>{renderTree(value, currentPath, depth + 1)}</div>}
          </div>
        )
      }
    })
  }

  const fileTree = buildFileTree()

  return (
    <div className="h-full overflow-auto bg-gray-50 p-2">
      <div className="text-xs font-semibold text-gray-500 mb-2 px-2">FILES</div>
      {renderTree(fileTree)}
    </div>
  )
}
