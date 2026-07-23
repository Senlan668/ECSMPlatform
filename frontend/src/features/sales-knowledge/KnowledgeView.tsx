import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, DatabaseZap, RefreshCw, Search, Send, Sparkles, Trash2 } from 'lucide-react'
import { DependencyNotice } from '../../components/WorkspaceShell'
import { useAuth } from '../../contexts/AuthContext'
import { useBusinessApi, useBusinessStreamApi } from '../../lib/businessApi'
import { jsonRequest } from '../../lib/http'
import type { KnowledgeArticle, KnowledgeStats, RagSource, RuntimeCapabilities } from './types'
import { ActionMessage, fieldClass, IconAction, InlineEmpty, MetricStrip, primaryButtonClass, secondaryButtonClass, SectionHeading } from './ui'

const API = '/api/v1/sales-knowledge'

interface RagEvent {
  type: 'sources' | 'content' | 'error'
  content?: string
  sources?: RagSource[]
}

interface SearchChunk {
  id: number
  topic_summary: string | null
  content_block: string
  session_id: string
  similarity: number
}

export default function KnowledgeView({ capabilities }: { capabilities: RuntimeCapabilities | null }) {
  const request = useBusinessApi()
  const streamRequest = useBusinessStreamApi()
  const { activeTenant } = useAuth()
  const streamController = useRef<AbortController | null>(null)
  const [stats, setStats] = useState<KnowledgeStats | null>(null)
  const [articles, setArticles] = useState<KnowledgeArticle[]>([])
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<RagSource[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchChunk[]>([])
  const [extractSource, setExtractSource] = useState('both')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [nextStats, nextArticles] = await Promise.all([
        request<KnowledgeStats>(`${API}/knowledge/stats`),
        request<KnowledgeArticle[]>(`${API}/extractor/articles?limit=50`),
      ])
      setStats(nextStats)
      setArticles(nextArticles)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '知识库状态加载失败')
    } finally {
      setLoading(false)
    }
  }, [request])

  useEffect(() => {
    streamController.current?.abort()
    setStats(null)
    setArticles([])
    setAnswer('')
    setSources([])
    void load()
    return () => streamController.current?.abort()
  }, [activeTenant?.id, load])

  async function buildKnowledge() {
    setActionLoading(true)
    setError('')
    setSuccess('')
    try {
      const result = await request<{ message: string }>(`${API}/knowledge/build-from-labeled?clear_existing=true`, jsonRequest('POST'))
      setSuccess(result.message)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '知识库构建失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function askQuestion() {
    if (!question.trim()) return
    streamController.current?.abort()
    const controller = new AbortController()
    streamController.current = controller
    setActionLoading(true)
    setError('')
    setSuccess('')
    setAnswer('')
    setSources([])
    try {
      const response = await streamRequest(`${API}/knowledge/ask/stream`, { ...jsonRequest('POST', { question: question.trim(), top_k: 5 }), signal: controller.signal })
      if (!response.body) throw new Error('RAG 服务未返回响应流')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split('\n\n')
        buffer = frames.pop() || ''
        for (const frame of frames) {
          const payload = frame.split('\n').find(line => line.startsWith('data:'))?.slice(5).trim()
          if (!payload || payload === '[DONE]') continue
          const event = JSON.parse(payload) as RagEvent
          if (event.type === 'sources') setSources(event.sources || [])
          if (event.type === 'content') setAnswer(current => current + (event.content || ''))
          if (event.type === 'error') throw new Error(event.content || 'RAG 生成失败')
        }
      }
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : 'RAG 问答失败')
    } finally {
      if (streamController.current === controller) streamController.current = null
      setActionLoading(false)
    }
  }

  async function semanticSearch() {
    if (!searchQuery.trim()) return
    setActionLoading(true)
    setError('')
    try {
      const result = await request<SearchChunk[]>(`${API}/knowledge/search`, jsonRequest('POST', { query: searchQuery.trim(), limit: 10 }))
      setSearchResults(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '语义检索失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function extractKnowledge() {
    setActionLoading(true)
    setError('')
    setSuccess('')
    try {
      const result = await request<{ message: string }>(`${API}/extractor/extract`, jsonRequest('POST', { source: extractSource }))
      setSuccess(`${result.message}。完成后刷新条目列表查看结果。`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '知识提炼启动失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function updateArticle(article: KnowledgeArticle, action: 'verify' | 'delete') {
    setActionLoading(true)
    setError('')
    try {
      if (action === 'delete') {
        await request(`${API}/extractor/articles/${article.id}`, jsonRequest('DELETE'))
      } else {
        await request(`${API}/extractor/articles/${article.id}`, jsonRequest('PUT', { is_verified: !article.is_verified }))
      }
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '知识条目更新失败')
    } finally {
      setActionLoading(false)
    }
  }

  const searchReady = capabilities?.capabilities.rag_search === true
  const answerReady = capabilities?.capabilities.rag_answer === true && searchReady

  return (
    <div className="space-y-8" data-testid="sales-knowledge-view">
      {!searchReady && <DependencyNotice title="Embedding 服务未配置" detail="知识构建、语义检索和知识提炼已停用；系统不会伪造向量或检索结果。" />}
      {searchReady && !answerReady && <DependencyNotice title="LLM 服务未配置" detail="现有知识可检索，但 RAG 回答、知识提炼与 AI 出题不会执行。" />}
      <ActionMessage loading={actionLoading} error={error} success={success} />

      <section>
        <SectionHeading title="知识索引" detail="从已审核并发布的对话构建租户知识库。SQLite 当前用于功能闭环，外部 pgvector 暂不接入。" action={<button className={primaryButtonClass} disabled={!searchReady || actionLoading} onClick={() => void buildKnowledge()}><DatabaseZap size={14} /> 重建索引</button>} />
        <div className="mt-4">{loading ? <ActionMessage loading /> : stats && <MetricStrip items={[
          { label: '知识分块', value: stats.total_chunks },
          { label: '原始会话', value: stats.total_sessions },
          { label: '已索引会话', value: stats.sessions_with_chunks },
          { label: '平均分块/会话', value: stats.avg_chunks_per_session.toFixed(1) },
        ]} />}</div>
      </section>

      <section>
        <SectionHeading title="RAG 问答" detail="回答以流式方式返回，并同时展示实际命中的知识来源。" />
        <form className="mt-4 flex gap-2" onSubmit={event => { event.preventDefault(); void askQuestion() }}>
          <input className={fieldClass} value={question} onChange={event => setQuestion(event.target.value)} placeholder="输入销售问题" aria-label="RAG 问题" />
          <button className={primaryButtonClass} type="submit" disabled={!answerReady || !question.trim() || actionLoading}><Send size={14} /> 提问</button>
        </form>
        {(answer || actionLoading) && <div className="mt-4 min-h-28 border-y border-border px-4 py-4"><div className="text-[11px] text-text-tertiary">回答</div><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-text-secondary">{answer || '正在检索并生成回答...'}</p></div>}
        {sources.length > 0 && <div className="mt-3 grid gap-3 md:grid-cols-2">{sources.map((source, index) => <div key={`${source.type}-${source.id}-${index}`} className="border-y border-border px-3 py-3"><div className="text-[11px] text-text-tertiary">来源 {index + 1} · {source.type || 'knowledge'} · 相似度 {source.similarity?.toFixed(3) || '-'}</div><p className="mt-1 line-clamp-4 text-xs leading-5 text-text-secondary">{source.scene || source.topic_summary || source.content_block || '无摘要'}</p></div>)}</div>}
      </section>

      <section>
        <SectionHeading title="语义检索" detail="只返回真实向量命中，不调用生成模型。" />
        <form className="mt-4 flex gap-2" onSubmit={event => { event.preventDefault(); void semanticSearch() }}><input className={fieldClass} value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="搜索销售场景或客户异议" aria-label="语义检索" /><button className={secondaryButtonClass} disabled={!searchReady || !searchQuery.trim()}><Search size={14} /> 检索</button></form>
        {searchResults.length > 0 && <div className="mt-4 border-y border-border">{searchResults.map(result => <div key={result.id} className="border-b border-border px-3 py-3 last:border-b-0"><div className="flex justify-between gap-3 text-[11px] text-text-tertiary"><span>{result.topic_summary || result.session_id}</span><span>{result.similarity.toFixed(3)}</span></div><p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-text-secondary">{result.content_block}</p></div>)}</div>}
      </section>

      <section>
        <SectionHeading title="结构化知识提炼" detail="从知识分块或已审核对话提取销售场景、客户原话、推荐回复和要点，必须由人工验证。" action={<div className="flex gap-2"><select className={`${fieldClass} w-32`} value={extractSource} onChange={event => setExtractSource(event.target.value)}><option value="both">全部来源</option><option value="labeled">已审核对话</option><option value="chat">知识分块</option></select><button className={secondaryButtonClass} disabled={!answerReady || actionLoading} onClick={() => void extractKnowledge()}><Sparkles size={14} /> 开始提炼</button><button className={secondaryButtonClass} onClick={() => void load()}><RefreshCw size={14} /> 刷新</button></div>} />
        <div className="mt-4 border-y border-border">
          {!articles.length ? <InlineEmpty>暂无结构化知识条目</InlineEmpty> : articles.map(article => (
            <article key={article.id} className="grid gap-3 border-b border-border px-3 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-sm text-text">{article.scene}</span><span className={`text-[11px] ${article.is_verified ? 'text-success' : 'text-text-tertiary'}`}>{article.is_verified ? '已验证' : '待验证'}</span><span className="text-[11px] text-text-tertiary">{article.scene_category || '未分类'} · 置信度 {article.confidence.toFixed(2)}</span></div>{article.customer_says && <p className="mt-2 text-xs leading-5 text-text-tertiary">客户：{article.customer_says}</p>}{article.recommended_response && <p className="mt-1 text-xs leading-5 text-text-secondary">建议：{article.recommended_response}</p>}</div>
              <div className="flex items-start gap-1"><IconAction icon={Check} label={article.is_verified ? '取消验证' : '人工验证'} onClick={() => void updateArticle(article, 'verify')} /><IconAction icon={Trash2} label="删除知识条目" danger onClick={() => void updateArticle(article, 'delete')} /></div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

