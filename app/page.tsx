"use client"

import { useEffect, useState } from "react"
import { z } from "zod"
import { FileExplorer } from "@/components/file-explorer"
import { CodePreview } from "@/components/code-preview"
import { Play, FileText, Info, AlertTriangle, CheckCircle, XCircle, Clock, MessageSquare } from "lucide-react"

// ---------------------------------------------------------------------------
// 1. Zod Schemas -------------------------------------------------------------
// ---------------------------------------------------------------------------
const file = z.object({
  path: z.string().min(1, "File path cannot be empty"),
  content: z.string(),
  type: z.string().min(1, "File type cannot be empty"),
})

const project = z.object({
  files: z.array(file).min(1, "At least one file is required"),
  description: z.string().optional(),
  instructions: z.string().optional(),
})

const flat = z.object({ type: z.literal("data"), data: project })
const span = z.object({ type: z.literal("data"), data: z.object({ output: z.object({ data: project }) }) })
const schema = z.union([flat, span])

// ---------------------------------------------------------------------------
// 2. Types -------------------------------------------------------------------
// ---------------------------------------------------------------------------
type Project = z.infer<typeof project>

interface Rejected {
  id: string
  time: string
  origin: string
  msg: unknown
  issues: z.ZodIssue[]
  summary: string
}

interface ConnectionStatus {
  listening: boolean
  messagesReceived: number
  lastMessageTime: string | null
  validMessages: number
  rejectedMessages: number
}

// ---------------------------------------------------------------------------
// 3. Helpers -----------------------------------------------------------------
// ---------------------------------------------------------------------------
const stripTS = (code: string): string =>
  code
    // Remove imports/exports
    .replace(/import[^;]+;?/g, "")
    .replace(/export default function\s+(\w+)/g, "function $1")
    .replace(/export default class\s+(\w+)/g, "class $1")
    .replace(/export default const\s+(\w+)/g, "const $1")
    .replace(/export default\s+/g, "")
    .replace(/export (const|function|class|let|var) /g, "$1 ")
    .replace(/export \{[^}]+\};?/g, "")
    // Remove TypeScript syntax
    .replace(/\b([A-Za-z_$][\w$]*)<[^>]+>\s*\(/g, "$1(")
    .replace(/interface\s+\w+\s*\{[^}]*\}/g, "")
    .replace(/type\s+\w+\s*=[^;]+;/g, "")
    .replace(/:\s*\w+(\[\])?(\s*\|\s*\w+)*\s*[=,;)]/g, (match) => match.replace(/:\s*[^=,;)]+/, ""))
    // Remove `"use client"` / `"use server"` directives without writing them literally
    .replace(/['"]use\s+(?:client|server)['"];?\s*/g, "")

const getErrorSummary = (issues: z.ZodIssue[]): string => {
  const mainIssue = issues[0]
  if (!mainIssue) return "Unknown validation error"

  switch (mainIssue.code) {
    case "invalid_type":
      return `Expected ${mainIssue.expected}, got ${mainIssue.received}`
    case "invalid_literal":
      return `Expected "${mainIssue.expected}", got "${mainIssue.received}"`
    case "too_small":
      return `Array too small: minimum ${mainIssue.minimum} items required`
    case "invalid_union":
      return "Message format doesn't match expected structure"
    default:
      return mainIssue.message || "Validation failed"
  }
}

// ---------------------------------------------------------------------------
// 4. Component ---------------------------------------------------------------
// ---------------------------------------------------------------------------
export default function BraintrustCodeRenderer() {
  const [proj, setProj] = useState<Project | null>(null)
  const [selected, setSelected] = useState<Project["files"][number] | null>(null)
  const [tab, setTab] = useState<"preview" | "files" | "info">("preview")
  const [html, setHtml] = useState("")
  const [rej, setRej] = useState<Rejected[]>([])
  const [banner, setBanner] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>({
    listening: true,
    messagesReceived: 0,
    lastMessageTime: null,
    validMessages: 0,
    rejectedMessages: 0,
  })

  // ---------------- message listener ----------------
  useEffect(() => {
    const listener = (e: MessageEvent) => {
      setStatus((prev) => ({
        ...prev,
        messagesReceived: prev.messagesReceived + 1,
        lastMessageTime: new Date().toISOString(),
      }))

      const parsed = schema.safeParse(e.data)
      if (!parsed.success) {
        const rejectedMsg: Rejected = {
          id: Date.now().toString(),
          time: new Date().toISOString(),
          origin: e.origin,
          msg: e.data,
          issues: parsed.error.issues,
          summary: getErrorSummary(parsed.error.issues),
        }

        setRej((p) => [rejectedMsg, ...p.slice(0, 9)])
        setStatus((prev) => ({ ...prev, rejectedMessages: prev.rejectedMessages + 1 }))
        setBanner(true)
        setTimeout(() => setBanner(false), 10000)
        return
      }

      const data = "files" in parsed.data.data ? parsed.data.data : parsed.data.data.output.data
      setProj(data)
      setStatus((prev) => ({ ...prev, validMessages: prev.validMessages + 1 }))
      setPreviewError(null)
    }

    window.addEventListener("message", listener)
    return () => window.removeEventListener("message", listener)
  }, [])

  // ---------------- build preview html ----------------
  const buildPreview = (): string => {
    if (!proj) return ""

    try {
      // Find CSS/styles
      const cssFiles = proj.files.filter(
        (f) =>
          f.type === "style" ||
          f.path.includes("globals.css") ||
          f.path.includes("styles.css") ||
          f.path.endsWith(".css"),
      )
      const css = cssFiles.map((f) => f.content).join("\n")

      // Find JavaScript/TypeScript files
      const jsFiles = proj.files.filter((f) => /\.(t|j)sx?$/.test(f.path))

      if (jsFiles.length === 0) {
        return `<!DOCTYPE html><html><head><meta charset='utf-8'/></head><body>
          <div style="padding:24px;font-family:system-ui;text-align:center;">
            <h2>No React Components Found</h2>
            <p>Upload files with .js, .jsx, .ts, or .tsx extensions to see a preview.</p>
            <p>Available files: ${proj.files.map((f) => f.path).join(", ")}</p>
          </div></body></html>`
      }

      // Process all JS/TS files
      const userJs = jsFiles
        .map((f) => {
          try {
            return `// File: ${f.path}\n${stripTS(f.content)}`
          } catch (err) {
            return `// Error processing ${f.path}: ${err}`
          }
        })
        .join("\n\n")

      // React hooks and common utilities
      const reactSetup = `
        const { 
          useState, useEffect, useRef, useMemo, useCallback, useReducer, 
          useContext, createContext, Fragment, Component, PureComponent,
          forwardRef, memo, lazy, Suspense
        } = React;
        
        // Common utilities that might be used
        const cn = (...classes) => classes.filter(Boolean).join(' ');
        const clsx = cn;
        const classNames = cn;
      `

      return `<!DOCTYPE html><html><head>
        <meta charset='utf-8'/>
        <meta name='viewport' content='width=device-width,initial-scale=1'/>
        <title>React App Preview</title>
        <script crossorigin src='https://unpkg.com/react@18/umd/react.development.js'></script>
        <script crossorigin src='https://unpkg.com/react-dom@18/umd/react-dom.development.js'></script>
        <script src='https://unpkg.com/@babel/standalone/babel.min.js'></script>
        <script src='https://cdn.tailwindcss.com'></script>
        <style>
          body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
          .error-display { 
            background: #fee; border: 1px solid #fcc; color: #c33; 
            padding: 16px; margin: 16px; border-radius: 8px; 
            white-space: pre-wrap; font-family: monospace; font-size: 14px;
            max-height: 400px; overflow-y: auto;
          }
          .component-list {
            background: #f8f9fa; border: 1px solid #dee2e6; 
            padding: 12px; margin: 8px 0; border-radius: 6px;
            font-family: monospace; font-size: 12px;
          }
          ${css}
        </style>
      </head><body>
        <div id='root'></div>
        <script>
          window.onerror = (msg, url, line, col, error) => {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-display';
            errorDiv.textContent = 'Runtime Error:\\n' + (error && error.stack ? error.stack : msg);
            document.getElementById('root').innerHTML = '';
            document.getElementById('root').appendChild(errorDiv);
            return true;
          };
          
          window.addEventListener('unhandledrejection', (event) => {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-display';
            errorDiv.textContent = 'Promise Rejection:\\n' + (event.reason && event.reason.stack ? event.reason.stack : event.reason);
            document.getElementById('root').innerHTML = '';
            document.getElementById('root').appendChild(errorDiv);
          });
        </script>
        <script type='text/babel' data-presets='typescript,react'>
          try {
            ${reactSetup}
            ${userJs}
            
            // Auto-detect root component from common patterns
            const findRootComponent = () => {
              // Common component names in order of preference
              const candidates = [
                'App', 'HomePage', 'Home', 'Page', 'Main', 'Root', 'Index',
                'Dashboard', 'Layout', 'Component', 'MyComponent'
              ];
              
              for (const name of candidates) {
                if (typeof window[name] === 'function') {
                  return window[name];
                }
              }
              
              // Look for any function that starts with uppercase (likely a component)
              const componentNames = Object.getOwnPropertyNames(window).filter(name => 
                typeof window[name] === 'function' && 
                name[0] === name[0].toUpperCase() &&
                name !== 'Component' && name !== 'PureComponent' // Exclude React base classes
              );
              
              if (componentNames.length > 0) {
                return window[componentNames[0]];
              }
              
              return null;
            };
            
            const RootComponent = findRootComponent();
            
            if (!RootComponent) {
              // Show available components for debugging
              const allFunctions = Object.getOwnPropertyNames(window).filter(name => 
                typeof window[name] === 'function'
              );
              
              ReactDOM.createRoot(document.getElementById('root')).render(
                <div style={{fontFamily:'system-ui',padding:24,textAlign:'center'}}>
                  <h2>No Root Component Detected</h2>
                  <p>Could not find a React component to render.</p>
                  <details style={{marginTop:16,textAlign:'left'}}>
                    <summary>Looking for components named:</summary>
                    <div className="component-list">
                      App, HomePage, Home, Page, Main, Root, Index, Dashboard, Layout, Component, MyComponent
                    </div>
                  </details>
                  <details style={{marginTop:8,textAlign:'left'}}>
                    <summary>Available functions ({allFunctions.length}):</summary>
                    <div className="component-list">
                      {allFunctions.join(', ') || 'None found'}
                    </div>
                  </details>
                  <div style={{marginTop:16,fontSize:14,color:'#666'}}>
                    Make sure your component is exported as a function and follows React naming conventions.
                  </div>
                </div>
              );
            } else {
              class ErrorBoundary extends React.Component {
                constructor(props) {
                  super(props);
                  this.state = { hasError: false, error: null };
                }
                
                static getDerivedStateFromError(error) {
                  return { hasError: true, error };
                }
                
                componentDidCatch(error, errorInfo) {
                  console.error('React Error Boundary:', error, errorInfo);
                }
                
                render() {
                  if (this.state.hasError) {
                    return (
                      <div className="error-display">
                        <strong>React Component Error:</strong>\\n
                        {this.state.error && this.state.error.stack ? this.state.error.stack : this.state.error}
                        \\n\\n<strong>Component:</strong> {RootComponent.name || 'Unknown'}
                      </div>
                    );
                  }
                  return this.props.children;
                }
              }
              
              ReactDOM.createRoot(document.getElementById('root')).render(
                <ErrorBoundary>
                  <RootComponent />
                </ErrorBoundary>
              );
            }
          } catch (error) {
            document.getElementById('root').innerHTML = 
              '<div class="error-display"><strong>Compilation Error:</strong>\\n' + (error.stack || error) + '</div>';
          }
        </script>
      </body></html>`
    } catch (err) {
      setPreviewError(`Failed to build preview: ${err}`)
      return `<!DOCTYPE html><html><body><div class="error-display">Preview Build Error: ${err}</div></body></html>`
    }
  }

  useEffect(() => {
    if (proj && tab === "preview") {
      setHtml(buildPreview())
    }
  }, [proj, tab])

  useEffect(() => {
    if (proj && !selected) {
      // Smart file selection priority
      const priorities = [
        (f: any) => f.path === "app/page.tsx",
        (f: any) => f.path === "src/App.tsx",
        (f: any) => f.path === "App.tsx",
        (f: any) => f.path.includes("page.") && f.path.includes(".tsx"),
        (f: any) => f.path.includes("App.") && f.path.includes(".tsx"),
        (f: any) => f.path.includes("index.") && f.path.includes(".tsx"),
        (f: any) => f.path.endsWith(".tsx"),
        (f: any) => f.path.endsWith(".jsx"),
      ]

      let selectedFile = proj.files[0]
      for (const priority of priorities) {
        const found = proj.files.find(priority)
        if (found) {
          selectedFile = found
          break
        }
      }

      setSelected(selectedFile)
    }
  }, [proj, selected])

  // ---------------- Default State UI ----------------
  if (!proj) {
    return (
      <div className="h-screen flex flex-col bg-gray-50">
        {/* Connection Status Header */}
        <div className="bg-white border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${status.listening ? "bg-green-500" : "bg-red-500"}`}></div>
              <span className="font-medium text-gray-700">React App Preview</span>
            </div>
            <div className="text-sm text-gray-500">
              {status.messagesReceived > 0 ? `${status.messagesReceived} messages` : "Ready"}
            </div>
          </div>
        </div>

        {/* Rejected Messages Banner */}
        {banner && rej.length > 0 && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4">
            <div className="flex items-center">
              <XCircle className="w-5 h-5 text-red-400 mr-2" />
              <div>
                <p className="text-sm font-medium text-red-800">Message Rejected</p>
                <p className="text-sm text-red-700">{rej[0]?.summary}</p>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-2xl text-center">
            <div className="mb-8">
              <MessageSquare className="w-16 h-16 text-blue-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Waiting for React App Data</h1>
              <p className="text-gray-600">
                This iframe is listening for React application code from Braintrust traces.
              </p>
            </div>

            {/* Connection Status */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-white p-4 rounded-lg shadow-sm border">
                <div className="flex items-center justify-center mb-2">
                  {status.listening ? (
                    <CheckCircle className="w-6 h-6 text-green-500" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-500" />
                  )}
                </div>
                <div className="text-sm font-medium text-gray-900">Connection</div>
                <div className="text-xs text-gray-500">{status.listening ? "Listening" : "Disconnected"}</div>
              </div>

              <div className="bg-white p-4 rounded-lg shadow-sm border">
                <div className="flex items-center justify-center mb-2">
                  <MessageSquare className="w-6 h-6 text-blue-500" />
                </div>
                <div className="text-sm font-medium text-gray-900">Messages</div>
                <div className="text-xs text-gray-500">{status.messagesReceived} received</div>
              </div>

              <div className="bg-white p-4 rounded-lg shadow-sm border">
                <div className="flex items-center justify-center mb-2">
                  {status.lastMessageTime ? (
                    <Clock className="w-6 h-6 text-gray-500" />
                  ) : (
                    <Clock className="w-6 h-6 text-gray-300" />
                  )}
                </div>
                <div className="text-sm font-medium text-gray-900">Last Message</div>
                <div className="text-xs text-gray-500">
                  {status.lastMessageTime ? new Date(status.lastMessageTime).toLocaleTimeString() : "None"}
                </div>
              </div>
            </div>

            {/* Troubleshooting */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-left">
              <h3 className="font-semibold text-blue-900 mb-3">Expected Message Format</h3>
              <pre className="text-xs bg-white p-3 rounded border overflow-auto">
                {`{
  "type": "data",
  "data": {
    "files": [
      {
        "path": "App.tsx",
        "content": "export default function App() { return <div>Hello</div>; }",
        "type": "component"
      },
      {
        "path": "styles.css", 
        "content": "body { margin: 0; }",
        "type": "style"
      }
    ],
    "description": "Optional description",
    "instructions": "Optional instructions"
  }
}`}
              </pre>

              {rej.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-medium text-red-800 mb-2">Recent Errors ({rej.length})</h4>
                  <div className="space-y-2">
                    {rej.slice(0, 3).map((r) => (
                      <div key={r.id} className="text-xs bg-red-50 p-2 rounded border border-red-200">
                        <div className="font-medium text-red-800">{r.summary}</div>
                        <div className="text-red-600 mt-1">
                          Origin: {r.origin || "unknown"} • {new Date(r.time).toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ---------------- Main UI ----------------
  return (
    <div className="h-screen flex flex-col">
      {/* Status Banner */}
      {banner && rej.length > 0 && (
        <div className="bg-red-50 border-l-4 border-red-400 p-3">
          <div className="flex items-center">
            <AlertTriangle className="w-4 h-4 text-red-400 mr-2" />
            <div className="text-sm">
              <span className="font-medium text-red-800">Invalid message: </span>
              <span className="text-red-700">{rej[0]?.summary}</span>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b text-sm bg-gray-50">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span>React App Preview</span>
          {status.rejectedMessages > 0 && (
            <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs">
              {status.rejectedMessages} rejected
            </span>
          )}
        </div>
        <span className="text-gray-500">{proj.files.length} files</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b text-sm font-medium">
        {(["preview", "files", "info"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 border-r flex items-center gap-1 ${
              tab === t ? "bg-white border-b-2 border-blue-500 text-blue-600" : "hover:bg-gray-100"
            }`}
          >
            {t === "preview" && <Play className="w-4 h-4" />}
            {t === "files" && <FileText className="w-4 h-4" />}
            {t === "info" && <Info className="w-4 h-4" />}
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === "info" && rej.length > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {rej.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === "preview" && (
          <div className="h-full">
            {previewError ? (
              <div className="p-4 bg-red-50 border border-red-200 m-4 rounded">
                <h3 className="font-medium text-red-800 mb-2">Preview Error</h3>
                <pre className="text-sm text-red-700 whitespace-pre-wrap">{previewError}</pre>
              </div>
            ) : (
              <iframe
                title="React App Preview"
                srcDoc={html}
                sandbox="allow-scripts allow-same-origin"
                className="w-full h-full border-0"
              />
            )}
          </div>
        )}

        {tab === "files" && (
          <div className="flex h-full">
            <div className="w-1/3 border-r bg-gray-50">
              <FileExplorer files={proj.files} selectedFile={selected} onFileSelect={setSelected} />
            </div>
            <div className="flex-1">
              <CodePreview file={selected} />
            </div>
          </div>
        )}

        {tab === "info" && (
          <div className="p-4 overflow-auto h-full bg-gray-50">
            <div className="max-w-4xl">
              {/* Connection Status */}
              <div className="mb-6">
                <h3 className="font-semibold mb-3">Connection Status</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="bg-white p-3 rounded border">
                    <div className="font-medium">Total Messages</div>
                    <div className="text-lg">{status.messagesReceived}</div>
                  </div>
                  <div className="bg-white p-3 rounded border">
                    <div className="font-medium">Valid</div>
                    <div className="text-lg text-green-600">{status.validMessages}</div>
                  </div>
                  <div className="bg-white p-3 rounded border">
                    <div className="font-medium">Rejected</div>
                    <div className="text-lg text-red-600">{status.rejectedMessages}</div>
                  </div>
                  <div className="bg-white p-3 rounded border">
                    <div className="font-medium">Last Message</div>
                    <div className="text-sm">
                      {status.lastMessageTime ? new Date(status.lastMessageTime).toLocaleString() : "None"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Rejected Messages */}
              {rej.length > 0 && (
                <div className="mb-6">
                  <h3 className="font-semibold mb-3 text-red-800">Rejected Messages ({rej.length})</h3>
                  <div className="space-y-3">
                    {rej.map((r) => (
                      <div key={r.id} className="bg-white border border-red-200 rounded p-4">
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-medium text-red-800">{r.summary}</span>
                          <span className="text-xs text-gray-500">{new Date(r.time).toLocaleString()}</span>
                        </div>
                        <div className="text-sm text-gray-600 mb-2">Origin: {r.origin || "unknown"}</div>
                        <details className="text-xs">
                          <summary className="cursor-pointer text-blue-600 hover:text-blue-800">Show details</summary>
                          <div className="mt-2 space-y-2">
                            <div>
                              <strong>Received data:</strong>
                              <pre className="bg-gray-100 p-2 rounded mt-1 overflow-auto max-h-32">
                                {JSON.stringify(r.msg, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <strong>Validation errors:</strong>
                              <pre className="bg-gray-100 p-2 rounded mt-1 overflow-auto max-h-32">
                                {JSON.stringify(r.issues, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </details>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Project Data */}
              <div>
                <h3 className="font-semibold mb-3">Project Data</h3>
                <pre className="text-xs bg-white p-4 rounded border overflow-auto">{JSON.stringify(proj, null, 2)}</pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
