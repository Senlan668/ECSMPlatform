import { useState, useCallback } from 'react'

interface UseFileUploadOptions {
  onText: (text: string) => void
}

/**
 * 文件上传解析 hook — 支持 PDF 和文本文件。
 */
export function useFileUpload({ onText }: UseFileUploadOptions) {
  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState('')

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFileName(f.name)
    setParsing(true)
    setError('')

    try {
      if (f.name.toLowerCase().endsWith('.pdf')) {
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString()
        const buf = await f.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise
        const pages: string[] = []
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const content = await page.getTextContent()
          pages.push(content.items.map((item: any) => item.str).join(' '))
        }
        onText(pages.join('\n\n'))
      } else {
        onText(await f.text())
      }
    } catch (err) {
      console.error('File parse error:', err)
      setError('文件解析失败，请检查文件格式')
    } finally {
      setParsing(false)
    }
  }, [onText])

  const clear = useCallback(() => {
    setFileName('')
    setParsing(false)
    setError('')
  }, [])

  return { fileName, parsing, error, handleFile, clear }
}
