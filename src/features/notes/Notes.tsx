import { useEffect, useMemo, useRef, useState } from 'react'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import { Icon } from '../../app/icons'
import { EmptyState, PageHeader, SectionLabel } from '../../app/ui'
import { db, softDelete } from '../../db/db'
import { useCourses, useFiles, useNotes, useTopics } from '../../db/hooks'
import { stamp, touch, uid, type InkStroke, type Note, type StoredFile } from '../../db/types'
import { download } from '../../lib/download'
import { dayKey } from '../../lib/dates'
import { InkCanvas, type InkTool } from './InkCanvas'
import { dictationSupported, startDictation } from './dictation'

const COLORS = ['#d6401f', '#1a1916', '#3e5c76', '#3f6b4a']
const TOOLS: { id: InkTool; label: string }[] = [
  { id: 'pen', label: 'Pen' },
  { id: 'highlighter', label: 'Highlight' },
  { id: 'eraser', label: 'Erase' },
]

function PdfView({ file, page, onPages, strokes, onInk, tool, color, width, inkEnabled }: {
  file: StoredFile
  page: number
  onPages: (n: number) => void
  strokes: InkStroke[]
  onInk: (s: InkStroke[]) => void
  tool: InkTool
  color: string
  width: number
  inkEnabled: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderRef = useRef<{ cancel: () => void } | null>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    let task: PDFDocumentLoadingTask | null = null
    void (async () => {
      try {
        const pdf = await import('pdfjs-dist')
        pdf.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
        task = pdf.getDocument({ data: new Uint8Array(await file.blob.arrayBuffer()) })
        const loaded = await task.promise
        if (!cancelled) { setDoc(loaded); onPages(loaded.numPages) }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not open this PDF')
      }
    })()
    return () => {
      cancelled = true
      void task?.destroy()
      renderRef.current?.cancel()
    }
    // The file blob is immutable; a new note id remounts this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id])

  useEffect(() => {
    if (!doc) return
    let cancelled = false
    void (async () => {
      try {
        const pdfPage = await doc.getPage(page)
        const viewport = pdfPage.getViewport({ scale: 1.7 })
        const canvas = canvasRef.current
        if (!canvas || cancelled) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        renderRef.current?.cancel()
        canvas.width = Math.round(viewport.width)
        canvas.height = Math.round(viewport.height)
        const render = pdfPage.render({ canvas, canvasContext: ctx, viewport })
        renderRef.current = render
        await render.promise
      } catch (e) {
        if (!cancelled && !(e && typeof e === 'object' && 'name' in e && e.name === 'RenderingCancelledException')) {
          setError(e instanceof Error ? e.message : 'Could not render this page')
        }
      }
    })()
    return () => { cancelled = true }
  }, [doc, page])

  if (error) return <p className="muted p-8 text-[13px]">{error}</p>
  return (
    <div className="pdf-stage">
      <canvas ref={canvasRef} className="pdf-canvas" aria-label={`PDF page ${page}`} />
      <InkCanvas strokes={strokes} page={page} tool={tool} color={color} width={width} enabled={inkEnabled} onChange={onInk} />
    </div>
  )
}

function ImageView({ url, page, strokes, onInk, tool, color, width, inkEnabled }: {
  url: string
  page: number
  strokes: InkStroke[]
  onInk: (s: InkStroke[]) => void
  tool: InkTool
  color: string
  width: number
  inkEnabled: boolean
}) {
  return (
    <div className="pdf-stage">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Imported page" className="pdf-canvas" />
      <InkCanvas strokes={strokes} page={page} tool={tool} color={color} width={width} enabled={inkEnabled} onChange={onInk} />
    </div>
  )
}

export function Notes() {
  const notes = useNotes()
  const files = useFiles()
  const courses = useCourses()
  const topics = useTopics()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [courseId, setCourseId] = useState('all')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [tool, setTool] = useState<InkTool>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [width, setWidth] = useState(3)
  const [inkEnabled, setInkEnabled] = useState(true)
  const [selectedText, setSelectedText] = useState('')
  const [interim, setInterim] = useState('')
  const [dictating, setDictating] = useState(false)
  const [message, setMessage] = useState('')
  const [storage, setStorage] = useState('')
  const [fileUrl, setFileUrl] = useState('')
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const dictationRef = useRef<{ stop: () => void } | null>(null)

  const note = notes.find((n) => n.id === selectedId) ?? notes[0] ?? null
  const file = note?.fileId ? files.find((f) => f.id === note.fileId) ?? null : null

  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => {
      if (e.usage != null) setStorage(`${(e.usage / 1024 / 1024).toFixed(1)} MB used on this device`)
    })
  }, [notes, files])

  useEffect(() => () => dictationRef.current?.stop(), [])

  useEffect(() => {
    if (!file || file.mime === 'application/pdf') { setFileUrl(''); return }
    const url = URL.createObjectURL(file.blob)
    setFileUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file?.id, file?.mime])

  const visible = useMemo(() => notes
    .filter((n) => courseId === 'all' || n.courseId === courseId)
    .filter((n) => !query.trim() || `${n.title} ${n.body} ${n.tags.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b.pinned - a.pinned || b.updatedAt - a.updatedAt), [notes, courseId, query])

  async function patch(next: Partial<Note>) {
    if (!note) return
    const current = await db.notes.get(note.id)
    if (current) await db.notes.put(touch({ ...current, ...next }))
  }

  async function createNote() {
    const n = stamp({
      id: uid(), title: 'Untitled page', body: '', courseId: null, topicId: null,
      kind: 'text' as const, fileId: null, mime: '', name: '',
      ink: [] as InkStroke[], pinned: 0, tags: [] as string[],
    })
    await db.notes.add(n)
    setSelectedId(n.id)
    setPage(1)
  }

  async function importFiles(list: FileList | null) {
    if (!list?.length) return
    for (const f of Array.from(list)) {
      const id = uid()
      const record = stamp({
        id, name: f.name, mime: f.type || 'application/octet-stream',
        size: f.size, blob: f as Blob, noteId: null,
      })
      await db.files.add(record)
      const isText = f.type.startsWith('text/') || /\.(md|txt|csv|json)$/i.test(f.name)
      const n = stamp({
        id: uid(), title: f.name.replace(/\.[^.]+$/, ''),
        body: isText ? (await f.text()).slice(0, 200_000) : '',
        courseId: null, topicId: null, kind: 'file' as const, fileId: id,
        mime: record.mime, name: f.name, ink: [] as InkStroke[],
        pinned: 0, tags: [] as string[],
      })
      await db.notes.add(n)
      await db.files.put(touch({ ...record, noteId: n.id }))
      setSelectedId(n.id)
    }
    setMessage(`${list.length} file${list.length > 1 ? 's' : ''} added to the binder.`)
    if (fileRef.current) fileRef.current.value = ''
  }

  function insertMarkdown(before: string, after = '') {
    const ta = bodyRef.current
    if (!ta || !note) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = note.body.slice(start, end)
    const next = `${note.body.slice(0, start)}${before}${selected}${after}${note.body.slice(end)}`
    void patch({ body: next })
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + before.length, start + before.length + selected.length)
    })
  }

  function toggleDictation() {
    if (dictating) {
      dictationRef.current?.stop()
      dictationRef.current = null
      setDictating(false)
      setInterim('')
      return
    }
    const session = startDictation({
      lang: navigator.language,
      onText: (text, final) => {
        if (!final) { setInterim(text); return }
        setInterim('')
        const ta = bodyRef.current
        if (!ta || !note) return
        const pos = ta.selectionStart
        const next = `${note.body.slice(0, pos)}${text}${note.body.slice(ta.selectionEnd)}`
        void patch({ body: next })
        requestAnimationFrame(() => {
          ta.focus()
          ta.setSelectionRange(pos + text.length, pos + text.length)
        })
      },
      onError: () => { setMessage('Dictation was blocked by the browser.'); setDictating(false); setInterim('') },
      onEnd: () => { setDictating(false); setInterim('') },
    })
    if (!session) { setMessage('This browser has no dictation service.'); return }
    dictationRef.current = session
    setDictating(true)
  }

  async function addToReview() {
    const text = selectedText.trim()
    if (!text || !note) return
    if (!note.topicId) { setMessage('Link this page to a chapter first, then add a recall prompt.'); return }
    const due = Date.now() + 86_400_000
    await db.tasks.add(stamp({
      id: uid(), title: `Recall: ${text.slice(0, 68)}`, courseId: note.courseId,
      topicId: note.topicId, dueAt: due, priority: 2, estimateMin: 5,
      done: 0, note: text, source: `note:${note.id}`,
    }))
    setMessage('Added as a 5-minute recall task for tomorrow.')
    setSelectedText('')
  }

  async function exportPage() {
    if (!note) return
    const text = `${note.title}\n\n${note.body}\n\n${note.tags.map((t) => `#${t}`).join(' ')}`
    download(`${note.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'meridian-note'}.md`, text, 'text/markdown')
  }

  return (
    <div className="fade-in">
      <PageHeader eyebrow="The binder · notes and sources" title="Everything you write, in one place." subtitle="Import a PDF or a photo, write on it, dictate a thought — then send the important lines into review." />

      <div className="notes-toolbar">
        <button className="btn btn-primary" onClick={() => void createNote()}><Icon name="plus" size={15} /> New page</button>
        <button className="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" size={15} /> Add a file</button>
        <input ref={fileRef} type="file" multiple accept="application/pdf,image/*,text/*,.md,.txt,.pdf,.docx,.pptx" className="hidden" onChange={(e) => void importFiles(e.target.files)} />
        <div className="setting-search ml-auto"><input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your notes…" aria-label="Search notes" /></div>
      </div>
      {message && <div className="data-sm mt-4" role="status" style={{ color: 'var(--accent)' }}>{message}</div>}

      <div className="notes-layout">
        <aside className="notes-index">
          <div className="field">
            <label>Filter by course</label>
            <select className="select" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="all">All courses</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <SectionLabel>{visible.length} page{visible.length === 1 ? '' : 's'}</SectionLabel>
          <div className="notes-list">
            {visible.map((n) => (
              <button key={n.id} className={`notes-item${n.id === note?.id ? ' is-active' : ''}`} onClick={() => { setSelectedId(n.id); setPage(1); setSelectedText('') }}>
                <span className="notes-item-icon"><Icon name={n.kind === 'file' ? 'ledger' : 'sun'} size={15} /></span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[13px]">{n.title || 'Untitled page'}</span>
                  <span className="data-sm dim block truncate">{n.fileId ? n.name : n.body.slice(0, 54) || 'Empty page'}</span>
                </span>
                {n.pinned === 1 && <Icon name="spark" size={12} className="dim" />}
              </button>
            ))}
          </div>
          <div className="data-sm dim mt-5">{storage || 'Files stay on this device.'}</div>
          <p className="dim mt-3 text-[11px]">Attachments are not included in backups. Export important pages as text.</p>
        </aside>

        <section className="notes-page">
          {!note ? (
            <EmptyState icon="ledger" title="The binder is empty." hint="Write a page or drop in a PDF. It stays on this device, offline." action={<button className="btn btn-primary" onClick={() => void createNote()}>New page</button>} />
          ) : (
            <>
              <div className="notes-page-head">
                <input className="notes-title" value={note.title} onChange={(e) => void patch({ title: e.target.value })} aria-label="Page title" placeholder="Untitled page" />
                <div className="notes-meta">
                  <select className="select w-auto" value={note.courseId ?? ''} onChange={(e) => void patch({ courseId: e.target.value || null })} aria-label="Course">
                    <option value="">No course</option>
                    {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select className="select w-auto" value={note.topicId ?? ''} onChange={(e) => void patch({ topicId: e.target.value || null })} aria-label="Chapter">
                    <option value="">No chapter</option>
                    {topics.filter((t) => !note.courseId || t.courseId === note.courseId).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                  <button className="btn btn-icon btn-quiet" onClick={() => void patch({ pinned: note.pinned ? 0 : 1 })} aria-label="Pin page" title="Pin"><Icon name="spark" size={15} /></button>
                  <button className="btn btn-sm" onClick={() => void exportPage()}><Icon name="download" size={13} /> Export</button>
                  <button className="btn btn-quiet btn-icon" onClick={() => { void softDelete('notes', note.id); setSelectedId(null) }} aria-label="Delete page"><Icon name="trash" size={14} /></button>
                </div>
              </div>

              {file && (
                <div className="notes-tools">
                  {TOOLS.map((t) => (
                    <button key={t.id} className={`btn btn-sm${tool === t.id ? ' btn-primary' : ''}`} onClick={() => setTool(t.id)}>{t.label}</button>
                  ))}
                  {COLORS.map((c) => (
                    <button key={c} className="ink-swatch" style={{ background: c, outline: color === c ? `2px solid ${c}` : 'none' }} onClick={() => setColor(c)} aria-label={`Ink colour ${c}`} />
                  ))}
                  <input type="range" min={1} max={10} value={width} onChange={(e) => setWidth(Number(e.target.value))} aria-label="Ink width" className="ink-width" />
                  <button className={`btn btn-sm${inkEnabled ? '' : ' btn-primary'}`} onClick={() => setInkEnabled(!inkEnabled)}>{inkEnabled ? 'Hide ink' : 'Show ink'}</button>
                  <button className="btn btn-sm btn-quiet" onClick={() => void patch({ ink: [] })}>Clear ink</button>
                </div>
              )}

              {file && (
                <div className="notes-reader">
                  <div className="pdf-nav">
                    <button className="btn btn-sm btn-quiet" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Previous</button>
                    <span className="data-sm dim">Page {page} / {pages}</span>
                    <button className="btn btn-sm btn-quiet" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>Next →</button>
                  </div>
                  {file.mime === 'application/pdf' ? (
                    <PdfView key={file.id} file={file} page={page} onPages={setPages} strokes={note.ink} onInk={(ink) => void patch({ ink })} tool={tool} color={color} width={width} inkEnabled={inkEnabled} />
                  ) : file.mime.startsWith('image/') ? (
                    fileUrl
                      ? <ImageView url={fileUrl} page={page} strokes={note.ink} onInk={(ink) => void patch({ ink })} tool={tool} color={color} width={width} inkEnabled={inkEnabled} />
                      : <p className="muted p-8 text-[13px]">Loading image…</p>
                  ) : (
                    <div className="notes-fallback">
                      <p className="muted text-[13px]">{file.name} is stored here but this browser cannot display that format inline.</p>
                      <button className="btn" onClick={() => { const u = URL.createObjectURL(file.blob); window.open(u, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(u), 60_000) }}><Icon name="link" size={14} /> Open file</button>
                    </div>
                  )}
                </div>
              )}

              <div className="notes-editor">
                <div className="notes-format">
                  <button className="btn btn-sm btn-quiet" onClick={() => insertMarkdown('**', '**')} title="Bold">B</button>
                  <button className="btn btn-sm btn-quiet italic" onClick={() => insertMarkdown('*', '*')} title="Italic">I</button>
                  <button className="btn btn-sm btn-quiet" onClick={() => insertMarkdown('## ', '')} title="Heading">H</button>
                  <button className="btn btn-sm btn-quiet" onClick={() => insertMarkdown('- ', '')} title="List">•</button>
                  <button className="btn btn-sm btn-quiet" onClick={() => insertMarkdown('> ', '')} title="Quote">❝</button>
                  <button className={`btn btn-sm${dictating ? ' btn-primary' : ''}`} onClick={toggleDictation} disabled={!dictationSupported()} title={dictationSupported() ? 'Dictate' : 'Dictation is not available in this browser'}>
                    <Icon name="spark" size={13} /> {dictating ? 'Listening…' : 'Dictate'}
                  </button>
                  <span className="data-sm dim ml-auto">Markdown · saved as you type</span>
                </div>
                {interim && <div className="dictation-interim" aria-live="polite">{interim}</div>}
                <textarea
                  ref={bodyRef}
                  className="notes-body"
                  value={note.body}
                  onChange={(e) => void patch({ body: e.target.value })}
                  onSelect={(e) => setSelectedText(e.currentTarget.value.slice(e.currentTarget.selectionStart, e.currentTarget.selectionEnd))}
                  placeholder="Write the explanation you will want to remember…"
                  aria-label="Page text"
                />
                <div className="notes-foot">
                  <input className="input w-auto" value={note.tags.join(', ')} onChange={(e) => void patch({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} placeholder="tags, separated" aria-label="Tags" />
                  <button className="btn btn-sm" disabled={!selectedText || !note.topicId} onClick={() => void addToReview()} title={!note.topicId ? 'Link a chapter first' : 'Add the selected text as a recall task'}>
                    <Icon name="ledger" size={13} /> Send selection to Review
                  </button>
                  {selectedText && <span className="data-sm dim truncate" style={{ maxWidth: 240 }}>“{selectedText.slice(0, 40)}…”</span>}
                  <span className="data-sm dim ml-auto">Edited {new Date(note.updatedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
