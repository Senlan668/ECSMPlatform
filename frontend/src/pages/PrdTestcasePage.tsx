import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Check, Clipboard, ClipboardCheck, FileText, Play, ShieldCheck } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { MD } from '../components/Markdown'
import Spinner from '../components/Spinner'
import { generatePrdTestcases } from '../lib/api'
import type { PrdWorkflowResult } from '../types'

const SAMPLE_PRD = `# 用户登录功能需求文档

## 功能概述
实现基于手机号的用户登录系统，支持验证码登录与密码登录。

## 验证码登录
- 用户输入手机号后获取 6 位验证码，有效期 5 分钟
- 验证码连续错误 5 次锁定 30 分钟

## 密码登录
- 密码连续错误 5 次锁定账号
- 支持“记住我”7 天免登录

## 约束条件
- 验证码下发间隔不少于 60 秒
- 单手机号每日最多下发 10 次
- 登录响应时间不超过 2 秒`

type ResultTab = 'cases' | 'review' | 'markdown'

export default function PrdTestcasePage() {
  const location = useLocation()
  const routeState = (location.state || {}) as { initialPrd?: string }
  const [prd, setPrd] = useState(routeState.initialPrd || '')
  const [result, setResult] = useState<PrdWorkflowResult | null>(null)
  const [tab, setTab] = useState<ResultTab>('cases')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const generate = async () => {
    if (prd.trim().length < 20 || loading) return
    setLoading(true)
    setError('')
    try {
      setResult(await generatePrdTestcases(prd.trim()))
      setTab('cases')
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : '生成失败')
    } finally {
      setLoading(false)
    }
  }

  const copyMarkdown = async () => {
    if (!result) return
    await navigator.clipboard.writeText(result.markdown)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-page">
      <header className="sticky top-0 z-10 flex items-center pl-12 pr-4 md:px-6 h-14 border-b border-border/60 bg-page/95 backdrop-blur-sm">
        <ClipboardCheck size={17} className="mr-2.5" />
        <h1 className="text-sm font-medium">PRD 测试用例</h1>
      </header>

      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-7">
        <div className="grid lg:grid-cols-[minmax(320px,0.82fr)_minmax(0,1.5fr)] gap-7 items-start">
          <section className="lg:sticky lg:top-20">
            <div className="flex items-end justify-between mb-3">
              <div>
                <h2 className="font-display text-xl font-medium">输入产品需求</h2>
                <p className="mt-1 text-xs text-text-tertiary">支持 Markdown 或普通文本</p>
              </div>
              <button onClick={() => setPrd(SAMPLE_PRD)} className="text-xs text-text-secondary hover:text-text">载入示例</button>
            </div>
            <textarea value={prd} onChange={event => setPrd(event.target.value)} aria-label="PRD 内容" placeholder="粘贴 PRD，需包含功能、约束和验收标准..." className="w-full min-h-[390px] lg:min-h-[520px] resize-y bg-surface border border-border rounded-lg p-4 text-sm text-text leading-relaxed outline-none focus:border-accent/40 placeholder:text-text-tertiary" />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-text-tertiary">{prd.length.toLocaleString()} 字符</span>
              <button onClick={generate} disabled={prd.trim().length < 20 || loading} className="h-10 px-4 inline-flex items-center gap-2 rounded-lg bg-accent text-page text-sm font-medium disabled:opacity-35">
                {loading ? <Spinner size="sm" /> : <Play size={14} fill="currentColor" />}
                {loading ? '工作流执行中' : '生成测试用例'}
              </button>
            </div>
            {error && <p className="mt-3 text-xs text-danger" role="alert">{error}</p>}
          </section>

          <section className="min-w-0">
            {!result ? (
              <div className="min-h-[520px] border border-dashed border-border rounded-lg flex flex-col items-center justify-center text-center px-6">
                <FileText size={28} strokeWidth={1.4} className="text-text-tertiary mb-4" />
                <h2 className="text-sm font-medium mb-1.5">等待生成结果</h2>
                <p className="text-xs text-text-tertiary max-w-sm leading-relaxed">系统将解析功能点、选择执行模式、生成用例并完成覆盖率与质量预审。</p>
              </div>
            ) : (
              <div className="space-y-5 animate-enter">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <h2 className="font-display text-xl font-medium mr-auto">{result.title}</h2>
                    <span className="px-2 py-1 border border-border rounded-md text-[11px] text-text-secondary">{result.mode}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 border-y border-border">
                    {[
                      ['功能点', result.parsedPrd.features.length],
                      ['测试单元', result.testUnits.length],
                      ['测试用例', result.testcases.length],
                      ['功能覆盖', result.reviewReport.coverage.featureCoverageText],
                    ].map(([label, value]) => (
                      <div key={label} className="px-3 py-3 border-r border-border last:border-r-0 odd:border-r sm:odd:border-r">
                        <div className="text-lg font-medium text-text truncate">{value}</div>
                        <div className="text-[11px] text-text-tertiary mt-0.5">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex border-b border-border" role="tablist">
                  {([['cases', '测试用例'], ['review', '质量预审'], ['markdown', 'Markdown']] as const).map(([key, label]) => (
                    <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`px-4 py-2.5 text-xs border-b-2 transition-colors ${tab === key ? 'border-accent text-text' : 'border-transparent text-text-tertiary hover:text-text'}`}>{label}</button>
                  ))}
                </div>

                {tab === 'cases' && <div className="space-y-3">{result.testcases.map(testcase => (
                  <article key={testcase.caseId} className="border border-border rounded-lg p-4">
                    <div className="flex flex-wrap items-start gap-2 mb-3">
                      <span className="font-mono text-[11px] text-text-tertiary mt-0.5">{testcase.caseId}</span>
                      <h3 className="text-sm font-medium flex-1 min-w-40">{testcase.title}</h3>
                      <span className="text-[10px] border border-border rounded px-1.5 py-0.5">{testcase.priority}</span>
                      <span className="text-[10px] bg-surface rounded px-1.5 py-0.5 text-text-secondary">{testcase.testType}</span>
                    </div>
                    <dl className="grid sm:grid-cols-[90px_1fr] gap-x-3 gap-y-2 text-xs leading-relaxed">
                      <dt className="text-text-tertiary">前置条件</dt><dd>{testcase.precondition}</dd>
                      <dt className="text-text-tertiary">操作步骤</dt><dd><ol className="list-decimal pl-4 space-y-1">{testcase.steps.map(step => <li key={step}>{step}</li>)}</ol></dd>
                      <dt className="text-text-tertiary">预期结果</dt><dd className="text-success">{testcase.expected}</dd>
                    </dl>
                  </article>
                ))}</div>}

                {tab === 'review' && (
                  <div className="space-y-5">
                    <div className="flex items-center gap-3 text-sm"><ShieldCheck size={18} className="text-success" /><span>高置信通过 {result.reviewReport.highConfidencePass} 条</span><span className="text-text-tertiary">人工复核 {result.reviewReport.needHumanReview} 条</span></div>
                    <div><h3 className="text-xs font-medium mb-2">审查发现</h3><ul className="space-y-2 text-xs text-text-secondary">{result.reviewReport.findings.length ? result.reviewReport.findings.map(item => <li key={item} className="flex gap-2"><span>•</span><span>{item}</span></li>) : <li className="text-success">未发现明显质量问题</li>}</ul></div>
                    {result.reviewReport.needHumanReviewItems.map(item => <div key={item.id} className="border-l-2 border-border pl-3 text-xs"><div className="font-medium">{item.dimension} · {item.confidence}</div><p className="mt-1 text-text-secondary">{item.description}</p><p className="mt-1 text-text-tertiary">建议：{item.suggestion}</p></div>)}
                  </div>
                )}

                {tab === 'markdown' && (
                  <div>
                    <div className="flex justify-end mb-2"><button onClick={copyMarkdown} className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text">{copied ? <Check size={13} className="text-success" /> : <Clipboard size={13} />}{copied ? '已复制' : '复制 Markdown'}</button></div>
                    <div className="border border-border rounded-lg p-5 text-sm"><ReactMarkdown components={MD}>{result.markdown}</ReactMarkdown></div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
