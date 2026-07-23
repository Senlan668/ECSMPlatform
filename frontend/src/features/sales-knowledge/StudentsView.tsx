import { useCallback, useEffect, useRef, useState } from 'react'
import { FileJson, ImageUp, Pencil, Plus, Search, Trash2, Users } from 'lucide-react'
import Modal from '../../components/Modal'
import { DependencyNotice } from '../../components/WorkspaceShell'
import { useAuth } from '../../contexts/AuthContext'
import { useBusinessApi } from '../../lib/businessApi'
import { jsonRequest } from '../../lib/http'
import type { RuntimeCapabilities, Student, StudentList } from './types'
import { ActionMessage, fieldClass, IconAction, InlineEmpty, MetricStrip, Pager, primaryButtonClass, secondaryButtonClass, SectionHeading, textareaClass } from './ui'

const API = '/api/v1/sales-knowledge'

interface StudentStats {
  total: number
  active: number
  graduated: number
  dropped: number
  classes: Record<string, number>
}

interface StudentForm {
  name: string
  channel: string
  phone: string
  class_name: string
  job_title: string
  city: string
  education: string
  pre_salary: string
  post_salary: string
  status: string
  main_report_material_id: string
}

const EMPTY_FORM: StudentForm = {
  name: '', channel: '微信', phone: '', class_name: '', job_title: '', city: '', education: '',
  pre_salary: '', post_salary: '', status: 'active', main_report_material_id: '',
}

function toForm(student?: Student | null): StudentForm {
  if (!student) return { ...EMPTY_FORM }
  return {
    name: student.name,
    channel: student.channel,
    phone: student.phone || '',
    class_name: student.class_name || '',
    job_title: student.job_title || '',
    city: student.city || '',
    education: student.education || '',
    pre_salary: student.pre_salary || '',
    post_salary: student.post_salary || '',
    status: student.status,
    main_report_material_id: student.main_report_material_id ? String(student.main_report_material_id) : '',
  }
}

export default function StudentsView({ capabilities }: { capabilities: RuntimeCapabilities | null }) {
  const request = useBusinessApi()
  const { activeTenant } = useAuth()
  const imageRef = useRef<HTMLInputElement>(null)
  const [records, setRecords] = useState<StudentList | null>(null)
  const [stats, setStats] = useState<StudentStats | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [channel, setChannel] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Student | null | undefined>(undefined)
  const [form, setForm] = useState<StudentForm>(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null)
  const [importDialog, setImportDialog] = useState(false)
  const [importJson, setImportJson] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async (nextPage: number, nextSearch: string, nextStatus: string, nextChannel: string) => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ page: String(nextPage), page_size: '20' })
      if (nextSearch.trim()) query.set('search', nextSearch.trim())
      if (nextStatus) query.set('status', nextStatus)
      if (nextChannel) query.set('channel', nextChannel)
      const [nextRecords, nextStats] = await Promise.all([
        request<StudentList>(`${API}/students/list?${query}`),
        request<StudentStats>(`${API}/students/stats/overview`),
      ])
      setRecords(nextRecords)
      setStats(nextStats)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '学员档案加载失败')
    } finally {
      setLoading(false)
    }
  }, [request])

  useEffect(() => {
    setPage(1)
    void load(1, '', '', '')
  }, [activeTenant?.id, load])

  function startCreate() {
    setEditing(null)
    setForm(toForm())
  }

  function startEdit(student: Student) {
    setEditing(student)
    setForm(toForm(student))
  }

  function formPayload() {
    return {
      name: form.name.trim(),
      channel: form.channel,
      phone: form.phone.trim() || null,
      class_name: form.class_name.trim() || null,
      job_title: form.job_title.trim() || null,
      city: form.city.trim() || null,
      education: form.education.trim() || null,
      pre_salary: form.pre_salary.trim() || null,
      post_salary: form.post_salary.trim() || null,
      status: form.status,
    }
  }

  async function saveStudent() {
    if (!form.name.trim()) return
    setActionLoading(true)
    setError('')
    setSuccess('')
    try {
      const student = editing
        ? await request<Student>(`${API}/students/${editing.id}`, jsonRequest('PUT', formPayload()))
        : await request<Student>(`${API}/students/`, jsonRequest('POST', formPayload()))
      const reportId = Number(form.main_report_material_id)
      if (form.main_report_material_id && Number.isInteger(reportId) && reportId > 0 && student.main_report_material_id !== reportId) {
        await request(`${API}/students/${student.id}/main-report`, jsonRequest('PUT', { material_id: reportId }))
      }
      if (!form.main_report_material_id && editing?.main_report_material_id) {
        await request(`${API}/students/${student.id}/main-report`, jsonRequest('DELETE'))
      }
      setEditing(undefined)
      setSuccess(editing ? '学员档案已更新' : '学员档案已创建')
      await load(page, search, status, channel)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '学员档案保存失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function deleteStudent() {
    if (!deleteTarget) return
    setActionLoading(true)
    setError('')
    try {
      await request(`${API}/students/${deleteTarget.id}`, jsonRequest('DELETE'))
      setDeleteTarget(null)
      setSuccess('学员档案已删除')
      await load(page, search, status, channel)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '学员档案删除失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function importStudents() {
    setError('')
    let parsed: unknown
    try {
      parsed = JSON.parse(importJson)
      if (!Array.isArray(parsed) || parsed.some(item => !item || typeof item !== 'object' || typeof (item as { name?: unknown }).name !== 'string')) throw new Error()
    } catch {
      setError('导入内容必须是包含 name 字段的 JSON 数组')
      return
    }
    setActionLoading(true)
    try {
      const result = await request<{ detail: string }>(`${API}/students/import`, jsonRequest('POST', parsed))
      setImportDialog(false)
      setImportJson('')
      setSuccess(result.detail)
      await load(1, search, status, channel)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '学员批量导入失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function recognizeImage(file: File | null) {
    if (!file) return
    setActionLoading(true)
    setError('')
    setSuccess('')
    try {
      const formData = new FormData()
      formData.append('file', file, file.name)
      const result = await request<{ students: Array<Record<string, unknown>>; count: number }>(`${API}/students/import/ai`, { method: 'POST', body: formData })
      setImportJson(JSON.stringify(result.students, null, 2))
      setImportDialog(true)
      setSuccess(`识别到 ${result.count} 名学员，请核对后入库`)
      if (imageRef.current) imageRef.current.value = ''
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '学员图片识别失败')
    } finally {
      setActionLoading(false)
    }
  }

  const visionReady = capabilities?.capabilities.vision_import === true
  const updateForm = (field: keyof StudentForm, value: string) => setForm(current => ({ ...current, [field]: value }))

  return (
    <div className="space-y-7" data-testid="sales-students-view">
      {!visionReady && <DependencyNotice title="视觉识别模型未配置" detail="学员 CRUD 与 JSON 批量导入正常可用；截图识别导入已停用。" />}
      <ActionMessage loading={actionLoading} error={error} success={success} />

      <section>
        <SectionHeading title="学员档案" detail="管理销售训练学员、班级、渠道、就业前后状态，并可绑定素材库中的喜报。" action={<div className="flex gap-2"><input ref={imageRef} id="student-image" className="sr-only" type="file" accept="image/*" disabled={!visionReady} onChange={event => void recognizeImage(event.target.files?.[0] || null)} /><label htmlFor="student-image" className={`${secondaryButtonClass} ${!visionReady ? 'pointer-events-none opacity-40' : 'cursor-pointer'}`}><ImageUp size={14} /> 图片识别</label><button className={secondaryButtonClass} onClick={() => { setImportJson(''); setImportDialog(true) }}><FileJson size={14} /> JSON 导入</button><button className={primaryButtonClass} onClick={startCreate}><Plus size={14} /> 新建学员</button></div>} />
        <div className="mt-4">{loading ? <ActionMessage loading /> : stats && <MetricStrip items={[
          { label: '学员总数', value: stats.total },
          { label: '在读', value: stats.active },
          { label: '已毕业', value: stats.graduated },
          { label: '已退出', value: stats.dropped },
        ]} />}</div>

        <form className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_140px_140px_auto]" onSubmit={event => { event.preventDefault(); setPage(1); void load(1, search, status, channel) }}>
          <input className={fieldClass} value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索姓名或电话" aria-label="学员搜索" />
          <select className={fieldClass} value={status} onChange={event => setStatus(event.target.value)} aria-label="学员状态"><option value="">全部状态</option><option value="active">在读</option><option value="graduated">已毕业</option><option value="dropped">已退出</option></select>
          <select className={fieldClass} value={channel} onChange={event => setChannel(event.target.value)} aria-label="学员渠道"><option value="">全部渠道</option><option value="微信">微信</option><option value="抖音">抖音</option><option value="其他">其他</option></select>
          <button className={secondaryButtonClass} type="submit"><Search size={14} /> 筛选</button>
        </form>

        <div className="mt-4 border-y border-border">
          {!loading && !records?.items.length ? <InlineEmpty>暂无学员档案</InlineEmpty> : records?.items.map(student => (
            <article key={student.id} className="grid gap-3 border-b border-border px-3 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Users size={14} className="text-text-tertiary" /><span className="text-sm text-text">{student.name}</span><span className={`text-[11px] ${student.status === 'active' ? 'text-success' : 'text-text-tertiary'}`}>{student.status === 'active' ? '在读' : student.status === 'graduated' ? '已毕业' : '已退出'}</span></div><div className="mt-1 text-[11px] text-text-tertiary">{student.channel} · {student.class_name || '未分班'} · {student.phone || '未录电话'} · {student.city || '未填城市'}</div><div className="mt-2 text-xs text-text-secondary">{student.job_title || '未填职位'}{student.pre_salary || student.post_salary ? ` · 薪资 ${student.pre_salary || '-'} → ${student.post_salary || '-'}` : ''}{student.main_report_material_id ? ` · 主喜报 #${student.main_report_material_id}` : ''}</div></div>
              <div className="flex items-start gap-1"><IconAction icon={Pencil} label="编辑学员" onClick={() => startEdit(student)} /><IconAction icon={Trash2} label="删除学员" danger onClick={() => setDeleteTarget(student)} /></div>
            </article>
          ))}
        </div>
        {records && <Pager page={page} hasMore={records.has_more} onChange={next => { setPage(next); void load(next, search, status, channel) }} />}
      </section>

      <Modal open={editing !== undefined} onClose={() => setEditing(undefined)} title={editing ? '编辑学员档案' : '新建学员档案'}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs text-text-secondary sm:col-span-2">姓名<input autoFocus className={`${fieldClass} mt-2`} value={form.name} onChange={event => updateForm('name', event.target.value)} /></label>
          <label className="text-xs text-text-secondary">渠道<select className={`${fieldClass} mt-2`} value={form.channel} onChange={event => updateForm('channel', event.target.value)}><option>微信</option><option>抖音</option><option>其他</option></select></label>
          <label className="text-xs text-text-secondary">状态<select className={`${fieldClass} mt-2`} value={form.status} onChange={event => updateForm('status', event.target.value)}><option value="active">在读</option><option value="graduated">已毕业</option><option value="dropped">已退出</option></select></label>
          <label className="text-xs text-text-secondary">电话<input className={`${fieldClass} mt-2`} value={form.phone} onChange={event => updateForm('phone', event.target.value)} /></label>
          <label className="text-xs text-text-secondary">班级<input className={`${fieldClass} mt-2`} value={form.class_name} onChange={event => updateForm('class_name', event.target.value)} /></label>
          <label className="text-xs text-text-secondary">当前职位<input className={`${fieldClass} mt-2`} value={form.job_title} onChange={event => updateForm('job_title', event.target.value)} /></label>
          <label className="text-xs text-text-secondary">城市<input className={`${fieldClass} mt-2`} value={form.city} onChange={event => updateForm('city', event.target.value)} /></label>
          <label className="text-xs text-text-secondary">学历<input className={`${fieldClass} mt-2`} value={form.education} onChange={event => updateForm('education', event.target.value)} /></label>
          <label className="text-xs text-text-secondary">入学前薪资<input className={`${fieldClass} mt-2`} value={form.pre_salary} onChange={event => updateForm('pre_salary', event.target.value)} /></label>
          <label className="text-xs text-text-secondary">毕业后薪资<input className={`${fieldClass} mt-2`} value={form.post_salary} onChange={event => updateForm('post_salary', event.target.value)} /></label>
          <label className="text-xs text-text-secondary">主喜报素材 ID<input className={`${fieldClass} mt-2`} type="number" min="1" value={form.main_report_material_id} onChange={event => updateForm('main_report_material_id', event.target.value)} placeholder="可选" /></label>
          <button className={`${primaryButtonClass} sm:col-span-2`} disabled={!form.name.trim() || actionLoading} onClick={() => void saveStudent()}><Plus size={14} /> 保存档案</button>
        </div>
      </Modal>

      <Modal open={importDialog} onClose={() => setImportDialog(false)} title="批量导入学员"><label className="block text-xs text-text-secondary">JSON 数组<textarea className={`${textareaClass} mt-2 min-h-72 font-mono`} value={importJson} onChange={event => setImportJson(event.target.value)} placeholder={'[\n  {"name": "张三", "channel": "微信", "class_name": "AI 1班"}\n]'} /></label><button className={`${primaryButtonClass} mt-4 w-full`} disabled={!importJson.trim() || actionLoading} onClick={() => void importStudents()}><FileJson size={14} /> 校验并导入</button></Modal>

      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="删除学员档案"><p className="text-sm leading-6 text-text-secondary">确认删除“{deleteTarget?.name}”的学员档案？绑定记录会一并解除。</p><button className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-danger text-sm text-white" onClick={() => void deleteStudent()}><Trash2 size={15} /> 确认删除</button></Modal>
    </div>
  )
}
