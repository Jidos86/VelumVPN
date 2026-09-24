import { useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor'
import MonacoEditor from 'react-monaco-editor'
import { configureMonacoYaml } from 'monaco-yaml'
import metaSchema from 'meta-json-schema/schemas/meta-json-schema.json'
import pac from 'types-pac/pac.d.ts?raw'
import { useTheme } from 'next-themes'
import { nanoid } from 'nanoid'
import React from 'react'
import { t } from 'i18next'
type Language = 'yaml' | 'javascript' | 'css' | 'json' | 'text'

interface Props {
  value: string
  originalValue?: string
  diffRenderSideBySide?: boolean
  readOnly?: boolean
  language: Language
  onChange?: (value: string) => void
}

let initialized = false
const monacoInitialization = (): void => {
  if (initialized) return

  const insertPrefixDescription = t('editor.schema.insertPrefix')
  const appendSuffixDescription = t('editor.schema.appendSuffix')
  const forceOverrideDescription = t('editor.schema.forceOverride')

  // configure yaml worker
  configureMonacoYaml(monaco, {
    validate: true,
    enableSchemaRequest: true,
    schemas: [
      {
        uri: 'http://example.com/meta-json-schema.json',
        fileMatch: ['**/*.clash.yaml'],
        // @ts-ignore // type JSONSchema7
        schema: {
          ...metaSchema,
          patternProperties: {
            '\\+rules': {
              type: 'array',
              $ref: '#/definitions/rules',
              description: insertPrefixDescription
            },
            'rules\\+': {
              type: 'array',
              $ref: '#/definitions/rules',
              description: appendSuffixDescription
            },
            '\\+proxies': {
              type: 'array',
              $ref: '#/definitions/proxies',
              description: insertPrefixDescription
            },
            'proxies\\+': {
              type: 'array',
              $ref: '#/definitions/proxies',
              description: appendSuffixDescription
            },
            '\\+proxy-groups': {
              type: 'array',
              $ref: '#/definitions/proxy-groups',
              description: insertPrefixDescription
            },
            'proxy-groups\\+': {
              type: 'array',
              $ref: '#/definitions/proxy-groups',
              description: appendSuffixDescription
            },
            '^\\+': {
              type: 'array',
              description: insertPrefixDescription
            },
            '\\+$': {
              type: 'array',
              description: appendSuffixDescription
            },
            '!$': {
              type: 'object',
              description: forceOverrideDescription
            }
          }
        }
      }
    ]
  })
  // configure PAC definition
  monaco.languages.typescript.javascriptDefaults.addExtraLib(pac, 'pac.d.ts')
  initialized = true
}

export const BaseEditor: React.FC<Props> = (props) => {
  const { theme, systemTheme } = useTheme()
  const trueTheme = theme === 'system' ? systemTheme : theme
  const {
    value,
    originalValue,
    diffRenderSideBySide = false,
    readOnly = false,
    language,
    onChange
  } = props

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor>(undefined)

  const editorWillMount = (): void => {
    monacoInitialization()
  }

  const editorDidMount = (editor: monaco.editor.IStandaloneCodeEditor): void => {
    editorRef.current = editor
    const uri = monaco.Uri.parse(`${nanoid()}.${language === 'yaml' ? 'clash' : ''}.${language}`)
    const model = monaco.editor.createModel(value, language, uri)
    editorRef.current.setModel(model)
  }

  const editorWillUnmount = (): void => {
    editorRef.current?.getModel()?.dispose()
    editorRef.current?.dispose()
  }

  const options = {
    tabSize: ['yaml', 'javascript', 'json'].includes(language) ? 2 : 4, // Set indentation by language.
    minimap: {
      enabled: document.documentElement.clientWidth >= 1500 // Show minimap scrollbar above a width threshold.
    },
    mouseWheelZoom: true, // Hold Ctrl + wheel to zoom.
    readOnly: readOnly, // Read-only mode.
    renderValidationDecorations: 'on' as 'off' | 'on' | 'editable', // Show validation in read-only mode.
    quickSuggestions: {
      strings: true, // Suggestions for strings.
      comments: true, // Suggestions for comments.
      other: true // Suggestions for other items.
    },
    fontFamily: `Maple Mono NF CN,Fira Code, JetBrains Mono, Roboto Mono, "Source Code Pro", Consolas, Menlo, Monaco, monospace, "Courier New", "Apple Color Emoji", "Noto Color Emoji"`,
    fontLigatures: true, // Enable ligatures.
    smoothScrolling: true, // Disable smooth scrolling when animations are off.
    pixelRatio: window.devicePixelRatio, // Use device pixel ratio.
    renderSideBySide: diffRenderSideBySide, // Side-by-side diff.
    glyphMargin: false, // Disable glyph margin.
    folding: true, // Enable code folding.
    scrollBeyondLastLine: false, // Prevent scrolling past last line.
    automaticLayout: true, // Auto layout.
    wordWrap: 'on' as const, // Word wrap.
    // Performance options when animations are disabled.
    cursorBlinking: 'blink' as const, // Disable cursor blinking.
    cursorSmoothCaretAnimation: 'off' as const, // Disable caret animation.
    scrollbar: {
      useShadows: true, // Disable scrollbar shadows.
      verticalScrollbarSize: 14, // Reduce scrollbar size.
      horizontalScrollbarSize: 14
    },
    suggest: {
      insertMode: 'insert' as const, // Simplify suggestion insert mode.
      showIcons: true // Disable suggestion icons to reduce rendering.
    },
    hover: {
      enabled: true, // Disable hover tooltips.
      delay: 300
    }
  }

  if (originalValue !== undefined) {
    return (
      <DiffEditor
        language={language}
        original={originalValue}
        value={value}
        theme={trueTheme?.includes('light') ? 'vs' : 'vs-dark'}
        options={options}
        onChange={onChange}
      />
    )
  }

  return (
    <MonacoEditor
      language={language}
      value={value}
      height="100%"
      theme={trueTheme?.includes('light') ? 'vs' : 'vs-dark'}
      options={options}
      editorWillMount={editorWillMount}
      editorDidMount={editorDidMount}
      editorWillUnmount={editorWillUnmount}
      onChange={onChange}
    />
  )
}

// A self-managed diff editor instead of react-monaco-editor's <MonacoDiffEditor>: its unmount
// cleanup calls dispose() on the editor and only then reads getModel() off it — which is null by
// then — crashing with "Cannot read properties of null (reading 'original')" every time the diff
// view closes (turning "Показать изменения" off, or closing the modal while it's on). This reimplements
// the same effects, in the same order, just with the model captured before disposal.
const DiffEditor: React.FC<{
  language: Language
  original: string
  value: string
  theme: string
  options: monaco.editor.IDiffEditorConstructionOptions
  onChange?: (value: string) => void
}> = ({ language, original, value, theme, options, onChange }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor>(undefined)
  const subscriptionRef = useRef<monaco.IDisposable>(undefined)
  const preventChangeEvent = useRef(false)
  // Read through a ref in the mount effect so it only runs once, like the library did.
  const latest = useRef({ language, original, value, theme, options, onChange })
  latest.current = { language, original, value, theme, options, onChange }

  useEffect(() => {
    if (!containerRef.current) return undefined
    monacoInitialization()
    const { language, original, value, theme, options } = latest.current
    const editor = monaco.editor.createDiffEditor(containerRef.current, { ...options, theme })
    editorRef.current = editor

    const originalUri = monaco.Uri.parse(
      `original-${nanoid()}.${language === 'yaml' ? 'clash' : ''}.${language}`
    )
    const modifiedUri = monaco.Uri.parse(
      `modified-${nanoid()}.${language === 'yaml' ? 'clash' : ''}.${language}`
    )
    const originalModel = monaco.editor.createModel(original, language, originalUri)
    const modifiedModel = monaco.editor.createModel(value, language, modifiedUri)
    editor.setModel({ original: originalModel, modified: modifiedModel })

    subscriptionRef.current = modifiedModel.onDidChangeContent(() => {
      if (!preventChangeEvent.current) latest.current.onChange?.(modifiedModel.getValue())
    })

    return () => {
      subscriptionRef.current?.dispose()
      // Model first, then the editor — the other way around leaves getModel() returning null.
      const model = editorRef.current?.getModel()
      model?.original?.dispose()
      model?.modified?.dispose()
      editorRef.current?.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    editorRef.current?.updateOptions(options)
  }, [options])

  useEffect(() => {
    monaco.editor.setTheme(theme)
  }, [theme])

  useEffect(() => {
    const model = editorRef.current?.getModel()
    if (!model) return
    monaco.editor.setModelLanguage(model.original, language)
    monaco.editor.setModelLanguage(model.modified, language)
  }, [language])

  useEffect(() => {
    const originalModel = editorRef.current?.getModel()?.original
    if (originalModel && original !== originalModel.getValue()) {
      originalModel.setValue(original)
    }
  }, [original])

  // Replace the content through an edit operation (not setValue) so the modified side keeps its
  // undo history and cursor position while the user types.
  useEffect(() => {
    const editor = editorRef.current
    const modified = editor?.getModel()?.modified
    if (!editor || !modified || value === modified.getValue()) return
    preventChangeEvent.current = true
    editor.getModifiedEditor().pushUndoStop()
    modified.pushEditOperations([], [{ range: modified.getFullModelRange(), text: value }], () => null)
    editor.getModifiedEditor().pushUndoStop()
    preventChangeEvent.current = false
  }, [value])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
