import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, Plus, Upload, Filter, MoreHorizontal, Edit2, Trash2, X, Loader2, Eye, Unlink2, Image as ImageIcon, Star } from 'lucide-react'
import { cn } from '../utils'
import { getErrorMessage } from '../utils/errorMessage'
import { useToast } from '../contexts/ToastContext'
import { addStudentReport, aiImportStudents, createStudent, deleteStudent, getMaterialPreviewUrl, getMaterials, getStudents, importStudents, proxyUploadMaterial, removeStudentReport, setStudentPrimaryReport, updateStudent } from '../api'
import type { Material } from '../types'
import type { StudentReportSummary, StudentView } from './studentManagementModel'
import { toStudentPayload, toViewStudent } from './studentManagementModel'
import { getImportPayloads, toImportedStudentDraft, type ImportedStudentDraft } from './studentImportModel'
import { canCloseStudentModal } from './studentModalClosePolicy'
import { studentFieldLabels } from './studentManagementFields'
import { getStudentPageState } from './studentPagination'

interface StudentManagementProps {
  onClose: () => void
}

const STUDENT_PAGE_SIZE = 10

type EditableStudent = Omit<StudentView, 'id'>

const EMPTY_STUDENT: EditableStudent = {
  name: '',
  channel: '微信',
  jobTitle: '',
  preSalary: '',
  postSalary: null,
  bday: '',
  city: '',
  education: '',
  graduationCohort: '',
  enrollDate: '',
  graduationDate: null,
  phone: '',
  douyinOrder: '',
  className: '',
  mainReportMaterialId: null,
  mainReportMaterial: null,
  reportMaterials: [],
  status: 'active',
}


const statusPresentation: Record<EditableStudent['status'], { label: string; className: string }> = {
  active: {
    label: '在读',
    className: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  graduated: {
    label: '已结业',
    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  dropped: {
    label: '已退课',
    className: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
  },
}

export default function StudentManagement({ onClose }: StudentManagementProps) {
  const { showToast } = useToast()

  const [searchQuery, setSearchQuery] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingStudent, setEditingStudent] = useState<StudentView | null>(null)
  const [students, setStudents] = useState<StudentView[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importRecognizing, setImportRecognizing] = useState(false)
  const [importSaving, setImportSaving] = useState(false)
  const [importSourceName, setImportSourceName] = useState('')
  const [importDrafts, setImportDrafts] = useState<ImportedStudentDraft[]>([])
  const [importRawText, setImportRawText] = useState('')
  const importFileInputRef = useRef<HTMLInputElement>(null)

  // 删除确认相关状态
  const [deletingStudent, setDeletingStudent] = useState<StudentView | null>(null)

  const applyStudentUpdate = useCallback((updatedStudent: StudentView) => {
    setStudents(prev => prev.map(student => student.id === updatedStudent.id ? updatedStudent : student))
    setEditingStudent(prev => prev && prev.id === updatedStudent.id ? updatedStudent : prev)
  }, [])

  const fetchStudents = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getStudents({ page: 1, page_size: 100 })
      const items = Array.isArray(res.items) ? res.items : []
      setStudents(items.map(toViewStudent))
    } catch (err: any) {
      showToast(getErrorMessage(err, '学员列表加载失败'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    fetchStudents()
  }, [fetchStudents])

  const classOptions = useMemo(
    () => Array.from(new Set(students.map(s => s.className).filter(Boolean))),
    [students],
  )

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return students.filter((s) => {
      const nameText = (s.name || '').toLowerCase()
      const phoneText = (s.phone || '').toLowerCase()
      const matchSearch = !q || nameText.includes(q) || phoneText.includes(q)
      const matchClass = classFilter === 'all' || s.className === classFilter
      const matchStatus = statusFilter === 'all' || s.status === statusFilter
      return matchSearch && matchClass && matchStatus
    })
  }, [students, searchQuery, classFilter, statusFilter])

  const studentPage = useMemo(
    () => getStudentPageState(filteredStudents, currentPage, STUDENT_PAGE_SIZE),
    [filteredStudents, currentPage],
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, classFilter, statusFilter])

  useEffect(() => {
    if (currentPage !== studentPage.currentPage) {
      setCurrentPage(studentPage.currentPage)
    }
  }, [currentPage, studentPage.currentPage])

  const handleAdd = () => {
    setEditingStudent(null)
    setIsModalOpen(true)
  }

  const handleEdit = (student: StudentView) => {
    setEditingStudent(student)
    setIsModalOpen(true)
  }

  const handleDelete = (student: StudentView) => {
    setDeletingStudent(student)
  }

  const confirmDelete = async () => {
    if (!deletingStudent) return
    try {
      await deleteStudent(deletingStudent.id)
      showToast('删除成功', 'success')
      await fetchStudents()
    } catch (err: any) {
      showToast(getErrorMessage(err, '删除失败'), 'error')
    } finally {
      setDeletingStudent(null)
    }
  }

  const handleSave = async (data: EditableStudent) => {
    if (!data.name.trim()) {
      showToast('姓名不能为空', 'error')
      return
    }

    setSaving(true)
    try {
      const payload = toStudentPayload(data)
      if (editingStudent) {
        await updateStudent(editingStudent.id, payload)
        showToast('学员信息已更新', 'success')
      } else {
        await createStudent(payload)
        showToast('学员已创建', 'success')
      }
      setIsModalOpen(false)
      setEditingStudent(null)
      await fetchStudents()
    } catch (err: any) {
      showToast(getErrorMessage(err, '保存失败'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const resetImportState = useCallback(() => {
    setImportSourceName('')
    setImportDrafts([])
    setImportRawText('')
    setImportRecognizing(false)
    setImportSaving(false)
    if (importFileInputRef.current) {
      importFileInputRef.current.value = ''
    }
  }, [])

  const closeImportModal = useCallback(() => {
    if (importRecognizing || importSaving) return
    setImportModalOpen(false)
    resetImportState()
  }, [importRecognizing, importSaving, resetImportState])

  const handleImportImage = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('导入学员仅支持图片文件', 'error')
      return
    }

    setImportRecognizing(true)
    setImportSourceName(file.name)
    try {
      const result = await aiImportStudents(file)
      setImportDrafts(result.students.map(toImportedStudentDraft))
      setImportRawText(result.raw_text)
      if (result.count === 0) {
        showToast('未识别到学员数据，请更换更清晰的截图', 'warning')
      } else {
        showToast(`已识别 ${result.count} 条学员记录，请确认后导入`, 'success')
      }
    } catch (err: any) {
      showToast(getErrorMessage(err, '学员图片识别失败'), 'error')
    } finally {
      setImportRecognizing(false)
      if (importFileInputRef.current) {
        importFileInputRef.current.value = ''
      }
    }
  }, [showToast])

  const updateImportDraft = useCallback(<K extends keyof ImportedStudentDraft>(
    index: number,
    key: K,
    value: ImportedStudentDraft[K],
  ) => {
    setImportDrafts((prev) => prev.map((draft, draftIndex) => (
      draftIndex === index ? { ...draft, [key]: value } : draft
    )))
  }, [])

  const removeImportDraft = useCallback((index: number) => {
    setImportDrafts((prev) => prev.filter((_, draftIndex) => draftIndex !== index))
  }, [])

  const confirmImportStudents = useCallback(async () => {
    const payloads = getImportPayloads(importDrafts)
    if (payloads.length === 0) {
      showToast('没有可导入的有效学员，请先补全姓名或手机号', 'error')
      return
    }

    setImportSaving(true)
    try {
      const result = await importStudents(payloads)
      showToast(result.detail, 'success')
      setImportModalOpen(false)
      resetImportState()
      await fetchStudents()
    } catch (err: any) {
      showToast(getErrorMessage(err, '批量导入学员失败'), 'error')
    } finally {
      setImportSaving(false)
    }
  }, [fetchStudents, importDrafts, resetImportState, showToast])

  return (
    <div className="flex-1 flex flex-col h-full bg-dark-950 relative overflow-hidden animate-fade-in z-20">
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-accent-primary/5 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />

      <header className="flex-shrink-0 px-8 py-6 border-b border-dark-600/50 bg-dark-900/50 backdrop-blur-xl relative z-10 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-white tracking-tight">学生管理</h1>
            <span className="px-2.5 py-1 rounded-full bg-accent-primary/20 text-accent-primary text-xs font-medium border border-accent-primary/20">
              数据看板 (高级版)
            </span>
          </div>
          <p className="text-gray-400 text-sm mt-1">学员档案与学习周期追踪，掌控全局数据</p>
        </div>

        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-dark-600/50 transition-colors"
        >
          <X size={20} />
        </button>
      </header>

      <div className="px-8 py-6 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-accent-primary transition-colors" />
            <input
              type="text"
              placeholder="搜索姓名 / 手机号..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-80 pl-11 pr-4 py-2.5 bg-dark-800/80 border border-dark-600 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent-primary/50 focus:ring-1 focus:ring-accent-primary/50 transition-all shadow-inner"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="appearance-none pl-10 pr-10 py-2.5 bg-dark-800/80 border border-dark-600 rounded-xl text-sm text-gray-300 focus:outline-none focus:border-accent-primary/50 transition-all"
              >
                <option value="all">所有班级</option>
                {classOptions.map((className) => (
                  <option key={className} value={className}>{className}</option>
                ))}
              </select>
              <Filter size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
            </div>

            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="appearance-none pl-4 pr-10 py-2.5 bg-dark-800/80 border border-dark-600 rounded-xl text-sm text-gray-300 focus:outline-none focus:border-accent-primary/50 transition-all"
              >
                <option value="all">所有状态</option>
                <option value="active">在读学员</option>
                <option value="graduated">已结业</option>
                <option value="dropped">已退课</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            ref={importFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                void handleImportImage(file)
              }
            }}
          />
          <button
            onClick={() => setImportModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-dark-500 text-gray-300 hover:text-white hover:border-gray-500 hover:bg-dark-700/50 transition-all text-sm font-medium shadow-sm"
          >
            <Upload size={18} />
            导入学员数据
          </button>
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white hover:shadow-lg hover:shadow-accent-primary/25 hover:opacity-90 transition-all text-sm font-medium border border-white/10 shadow-lg"
          >
            <Plus size={18} />
            新增学员
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-8 pb-8 flex flex-col relative z-10">
        <div className="flex-1 bg-dark-900/60 backdrop-blur-md border border-dark-600/80 rounded-2xl overflow-hidden flex flex-col shadow-2xl relative">
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-accent-primary/50 to-transparent opacity-50" />

          <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-dark-800/50 text-xs uppercase tracking-wider text-gray-400 border-b border-dark-600/50 sticky top-0 backdrop-blur-xl z-20">
                  <th className="px-6 py-5 font-medium">姓名</th>
                  <th className="px-6 py-5 font-medium">状态</th>
                  <th className="px-6 py-5 font-medium">班级</th>
                  <th className="px-6 py-5 font-medium">渠道</th>
                  <th className="px-6 py-5 font-medium">城市</th>
                  <th className="px-6 py-5 font-medium">学历</th>
                  <th className="px-6 py-5 font-medium">毕业届</th>
                  <th className="px-6 py-5 font-medium">岗位</th>
                  <th className="px-6 py-5 font-medium">薪资情况</th>
                  <th className="px-6 py-5 font-medium">电话号码</th>
                  <th className="px-6 py-5 font-medium">入学 / 结业日期</th>
                  <th className="px-6 py-5 font-medium">抖音订单号</th>
                  <th className="px-6 py-5 font-medium">主喜报</th>
                  <th className="px-6 py-5 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-600/30">
                {loading && (
                  <tr>
                    <td colSpan={14} className="px-6 py-16 text-center text-gray-400">
                      <div className="inline-flex items-center gap-2">
                        <Loader2 size={16} className="animate-spin" />
                        加载学员数据中...
                      </div>
                    </td>
                  </tr>
                )}
                {!loading && filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan={14} className="px-6 py-16 text-center text-gray-500">
                      暂无符合条件的学员
                    </td>
                  </tr>
                )}
                {!loading && studentPage.items.map((student) => (
                  <tr key={student.id} className="hover:bg-dark-700/30 transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-dark-700 flex items-center justify-center text-accent-primary font-bold shadow-inner border border-dark-500">
                          {student.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-white font-medium text-sm">{student.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {(() => {
                        const statusMeta = statusPresentation[student.status]
                        return (
                      <span className={cn(
                        'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border',
                        statusMeta.className,
                      )}>
                        {statusMeta.label}
                      </span>
                        )
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm border border-dark-500 bg-dark-800 text-gray-300 px-3 py-1 rounded-lg">
                        {student.className || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-1.5">
                        {student.channel === '微信' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">微信</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">抖音</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {student.city || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {student.education || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {student.graduationCohort || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {student.jobTitle || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center flex-col items-start gap-1">
                        <span className="text-gray-400 text-[11px]">来之前: <span className="text-gray-200">{student.preSalary || '未填写'}</span></span>
                        {student.postSalary ? (
                          <span className="text-accent-primary text-[11px] font-medium bg-accent-primary/10 px-1.5 py-0.5 rounded">
                            结业后: {student.postSalary}
                          </span>
                        ) : (
                          <span className="text-gray-600 text-[11px]">结业后: 未定</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">
                      {student.phone ? student.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm text-gray-300 flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div> {student.enrollDate || '-'}
                        </span>
                        {student.graduationDate && (
                          <span className="text-sm text-gray-500 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> {student.graduationDate}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-mono">
                      {student.douyinOrder || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {student.reportMaterials.length > 0 ? (
                        <div className="max-w-[220px]">
                          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/20 text-[11px] font-medium">
                            <ImageIcon size={12} />
                            {student.reportMaterials.length} 张喜报
                          </div>
                          {student.mainReportMaterial && (
                            <p className="text-sm text-gray-200 truncate mt-2" title={student.mainReportMaterial.title || student.mainReportMaterial.filename}>
                              ⭐ {student.mainReportMaterial.title || student.mainReportMaterial.filename}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500">未关联</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleEdit(student)}
                          className="p-2 text-gray-400 hover:text-accent-primary hover:bg-accent-primary/10 rounded-lg transition-colors tooltip"
                          title="编辑"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(student)}
                          className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors tooltip"
                          title="删除"
                        >
                          <Trash2 size={16} />
                        </button>
                        <button className="p-2 text-gray-400 hover:text-white hover:bg-dark-600 rounded-lg transition-colors">
                          <MoreHorizontal size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-4 border-t border-dark-600/50 bg-dark-800/30 flex items-center justify-between text-sm">
            <p className="text-gray-400">显示 {studentPage.startIndex} 到 {studentPage.endIndex} 条数据，共 {filteredStudents.length} 条</p>
            <div className="flex gap-2">
              <button
                className="px-3 py-1.5 rounded-lg border border-dark-600 text-gray-400 disabled:opacity-50 hover:bg-dark-700 transition-colors disabled:hover:bg-transparent"
                disabled={!studentPage.hasPrevious}
                onClick={() => setCurrentPage(studentPage.currentPage - 1)}
              >
                上一页
              </button>
              <button className="px-3 py-1.5 rounded-lg bg-accent-primary text-white border border-accent-primary/50 shadow-sm">
                {studentPage.currentPage} / {studentPage.totalPages}
              </button>
              <button
                className="px-3 py-1.5 rounded-lg border border-dark-600 text-gray-400 disabled:opacity-50 hover:bg-dark-700 transition-colors disabled:hover:bg-transparent"
                disabled={!studentPage.hasNext}
                onClick={() => setCurrentPage(studentPage.currentPage + 1)}
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      </div>

      <StudentModal
        isOpen={isModalOpen}
        onClose={() => {
          if (saving) return
          setIsModalOpen(false)
        }}
        student={editingStudent}
        onSave={handleSave}
        isSaving={saving}
        onStudentChange={applyStudentUpdate}
        showToast={showToast}
      />

      <StudentImportModal
        isOpen={importModalOpen}
        drafts={importDrafts}
        sourceName={importSourceName}
        rawText={importRawText}
        isRecognizing={importRecognizing}
        isSaving={importSaving}
        onClose={closeImportModal}
        onPickImage={() => importFileInputRef.current?.click()}
        onUpdateDraft={updateImportDraft}
        onRemoveDraft={removeImportDraft}
        onConfirm={() => void confirmImportStudents()}
      />

      {/* 删除确认弹窗 */}
      <ConfirmDialog
        isOpen={!!deletingStudent}
        title="确认删除学员"
        message={`您确定要删除学员「${deletingStudent?.name}」吗？此操作不可恢复。`}
        onConfirm={confirmDelete}
        onCancel={() => setDeletingStudent(null)}
      />
    </div>
  )
}

interface StudentModalProps {
  isOpen: boolean
  onClose: () => void
  student: StudentView | null
  onSave: (data: EditableStudent) => void
  isSaving: boolean
  onStudentChange: (student: StudentView) => void
  showToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void
}

function StudentModal({ isOpen, onClose, student, onSave, isSaving, onStudentChange, showToast }: StudentModalProps) {
  const [form, setForm] = useState<EditableStudent>(EMPTY_STUDENT)
  const [reportMaterials, setReportMaterials] = useState<StudentReportSummary[]>([])
  const [reportBusy, setReportBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerLoading, setPickerLoading] = useState(false)
  const [availableReports, setAvailableReports] = useState<Material[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    if (!student) {
      setForm(EMPTY_STUDENT)
      setReportMaterials([])
      return
    }
    setForm({
      name: student.name,
      channel: student.channel,
      jobTitle: student.jobTitle,
      preSalary: student.preSalary,
      postSalary: student.postSalary,
      bday: student.bday,
      city: student.city,
      education: student.education,
      graduationCohort: student.graduationCohort,
      enrollDate: student.enrollDate,
      graduationDate: student.graduationDate,
      phone: student.phone,
      douyinOrder: student.douyinOrder,
      className: student.className,
      mainReportMaterialId: student.mainReportMaterialId,
      mainReportMaterial: student.mainReportMaterial,
      reportMaterials: student.reportMaterials,
      status: student.status,
    })
    setReportMaterials(student.reportMaterials)
  }, [isOpen, student?.id])

  if (!isOpen) return null

  const requestClose = (source: 'header' | 'backdrop') => {
    if (canCloseStudentModal(source, isSaving)) {
      onClose()
    }
  }

  const updateField = <K extends keyof EditableStudent>(key: K, value: EditableStudent[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  /** 从后端响应同步学生喜报列表到本地状态 */
  const syncStudentReports = (updatedStudent: StudentView) => {
    setReportMaterials(updatedStudent.reportMaterials)
    setForm(prev => ({
      ...prev,
      mainReportMaterialId: updatedStudent.mainReportMaterialId,
      mainReportMaterial: updatedStudent.mainReportMaterial,
      reportMaterials: updatedStudent.reportMaterials,
    }))
    onStudentChange(updatedStudent)
  }

  const handlePreviewReport = async (report: StudentReportSummary) => {
    try {
      const preview = await getMaterialPreviewUrl(report.id)
      window.open(preview.url, '_blank', 'noopener,noreferrer')
    } catch (err: any) {
      showToast(getErrorMessage(err, '预览喜报失败'), 'error')
    }
  }

  const handleUploadReport = async (file: File) => {
    if (!student) {
      showToast('请先保存学员，再上传喜报', 'warning')
      return
    }
    if (!file.type.startsWith('image/')) {
      showToast('喜报只支持图片文件', 'error')
      return
    }
    setReportBusy(true)
    try {
      const material = await proxyUploadMaterial(
        file,
        'report',
        file.name.replace(/\.[^/.]+$/, ''),
        null,
        student.id,
      )
      // 上传成功后通过新接口绑定
      const updated = toViewStudent(await addStudentReport(student.id, material.id, reportMaterials.length === 0))
      syncStudentReports(updated)
      showToast('喜报已上传并关联', 'success')
    } catch (err: any) {
      showToast(getErrorMessage(err, '上传喜报失败'), 'error')
    } finally {
      setReportBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const openReportPicker = async () => {
    setPickerOpen(true)
    setPickerLoading(true)
    try {
      const res = await getMaterials({
        category: 'report',
        unbound_only: true,
        all_folders: true,
        page_size: 200,
      })
      setAvailableReports(res.items)
    } catch (err: any) {
      showToast(getErrorMessage(err, '未关联喜报加载失败'), 'error')
      setPickerOpen(false)
    } finally {
      setPickerLoading(false)
    }
  }

  const handleBindExistingReport = async (material: Material) => {
    if (!student) return
    setReportBusy(true)
    try {
      const updated = toViewStudent(await addStudentReport(student.id, material.id, reportMaterials.length === 0))
      syncStudentReports(updated)
      setPickerOpen(false)
      showToast('喜报已关联', 'success')
    } catch (err: any) {
      showToast(getErrorMessage(err, '关联喜报失败'), 'error')
    } finally {
      setReportBusy(false)
    }
  }

  const handleUnbindReport = async (materialId: number) => {
    if (!student) return
    setReportBusy(true)
    try {
      const updated = toViewStudent(await removeStudentReport(student.id, materialId))
      syncStudentReports(updated)
      showToast('喜报已解绑', 'success')
    } catch (err: any) {
      showToast(getErrorMessage(err, '解绑喜报失败'), 'error')
    } finally {
      setReportBusy(false)
    }
  }

  const handleSetPrimary = async (materialId: number) => {
    if (!student) return
    setReportBusy(true)
    try {
      const updated = toViewStudent(await setStudentPrimaryReport(student.id, materialId))
      syncStudentReports(updated)
      showToast('已设为主喜报', 'success')
    } catch (err: any) {
      showToast(getErrorMessage(err, '设置主喜报失败'), 'error')
    } finally {
      setReportBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={() => requestClose('backdrop')}
      />

      <div className="relative w-full max-w-2xl bg-dark-900 border border-dark-600 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-scale-in">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-accent-primary/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="flex items-center justify-between px-8 py-6 border-b border-dark-600/50 relative z-10">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              {student ? '修改学员信息' : '新增学员信息'}
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              更新学员的档案资料与学习状态
            </p>
          </div>
          <button
            onClick={() => requestClose('header')}
            disabled={isSaving}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-dark-800 text-gray-400 hover:text-white hover:bg-dark-700 transition-colors disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar relative z-10">
          <div className="grid grid-cols-2 gap-x-6 gap-y-6">
            <FormItem label={studentFieldLabels.name}>
              <input type="text" value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="学员真实姓名" className="form-input" />
            </FormItem>
            <FormItem label={studentFieldLabels.channel}>
              <select value={form.channel} onChange={(e) => updateField('channel', e.target.value as EditableStudent['channel'])} className="form-select">
                <option value="微信">微信</option>
                <option value="抖音">抖音</option>
              </select>
            </FormItem>
            <FormItem label={studentFieldLabels.city}>
              <input type="text" value={form.city || ''} onChange={(e) => updateField('city', e.target.value)} placeholder="如：杭州" className="form-input" />
            </FormItem>
            <FormItem label={studentFieldLabels.education}>
              <input type="text" value={form.education || ''} onChange={(e) => updateField('education', e.target.value)} placeholder="如：本科" className="form-input" />
            </FormItem>
            <FormItem label={studentFieldLabels.graduationCohort}>
              <input type="text" value={form.graduationCohort || ''} onChange={(e) => updateField('graduationCohort', e.target.value)} placeholder="如：2022届" className="form-input" />
            </FormItem>
            <FormItem label={studentFieldLabels.phone}>
              <input type="tel" value={form.phone || ''} onChange={(e) => updateField('phone', e.target.value)} placeholder="11位手机号码" className="form-input" />
            </FormItem>
            <FormItem label={studentFieldLabels.className}>
              <input type="text" value={form.className || ''} onChange={(e) => updateField('className', e.target.value)} placeholder="如：销售特训一期" className="form-input" />
            </FormItem>
            <FormItem label={studentFieldLabels.jobTitle}>
              <input type="text" value={form.jobTitle || ''} onChange={(e) => updateField('jobTitle', e.target.value)} placeholder="如：销售总监" className="form-input" />
            </FormItem>
            <FormItem label={studentFieldLabels.preSalary}>
              <input type="text" value={form.preSalary || ''} onChange={(e) => updateField('preSalary', e.target.value)} placeholder="如：5k" className="form-input" />
            </FormItem>
            <FormItem label={studentFieldLabels.postSalary}>
              <input type="text" value={form.postSalary || ''} onChange={(e) => updateField('postSalary', e.target.value)} placeholder="如：15k (未结业留空)" className="form-input" />
            </FormItem>
            <FormItem label={studentFieldLabels.enrollDate}>
              <input type="date" value={form.enrollDate || ''} onChange={(e) => updateField('enrollDate', e.target.value)} className="form-input" />
            </FormItem>
            <FormItem label={studentFieldLabels.graduationDate}>
              <input type="date" value={form.graduationDate || ''} onChange={(e) => updateField('graduationDate', e.target.value)} className="form-input" />
            </FormItem>
            <FormItem label={studentFieldLabels.douyinOrder}>
              <input type="text" value={form.douyinOrder || ''} onChange={(e) => updateField('douyinOrder', e.target.value)} placeholder="订单编号 (选填)" className="form-input" />
            </FormItem>
            <FormItem label={studentFieldLabels.status}>
              <select value={form.status} onChange={(e) => updateField('status', e.target.value as EditableStudent['status'])} className="form-select">
                <option value="active">在读学员</option>
                <option value="graduated">已结业</option>
                <option value="dropped">退课学员</option>
              </select>
            </FormItem>
          </div>

          <div className="mt-8 border border-dark-600/60 rounded-2xl bg-dark-800/30 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-white text-sm font-semibold">喜报管理</h3>
                <p className="text-xs text-gray-500 mt-1">
                  可绑定多张喜报，带 ⭐ 的为主喜报（用于直播展示）。点击星标可切换主喜报。
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    void handleUploadReport(file)
                  }
                }}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!student || reportBusy}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-2 rounded-lg bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/25 hover:bg-fuchsia-500/25 transition-colors text-sm disabled:opacity-40"
                >
                  上传喜报
                </button>
                <button
                  type="button"
                  disabled={!student || reportBusy}
                  onClick={() => void openReportPicker()}
                  className="px-3 py-2 rounded-lg bg-dark-700 text-gray-200 border border-dark-500 hover:bg-dark-600 transition-colors text-sm disabled:opacity-40"
                >
                  选择已有
                </button>
              </div>
            </div>

            {!student ? (
              <div className="mt-4 rounded-xl border border-dashed border-dark-500 px-4 py-5 text-sm text-gray-500">
                新增学员需要先保存，保存后才能上传或关联喜报。
              </div>
            ) : reportMaterials.length > 0 ? (
              <div className="mt-4 grid grid-cols-1 gap-3">
                {reportMaterials.map((report) => (
                  <div
                    key={report.id}
                    className={cn(
                      'flex items-center justify-between gap-4 rounded-xl px-4 py-3 border transition-colors',
                      report.isPrimary
                        ? 'border-fuchsia-500/25 bg-fuchsia-500/5'
                        : 'border-dark-500/50 bg-dark-800/30 hover:border-dark-400/50'
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {report.isPrimary && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-fuchsia-500/10 text-fuchsia-300 text-[10px] border border-fuchsia-500/20 shrink-0">
                            <Star size={10} fill="currentColor" />
                            主喜报
                          </span>
                        )}
                        <p className="text-sm text-white font-medium truncate">
                          {report.title || report.filename}
                        </p>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 truncate">{report.filename}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!report.isPrimary && (
                        <button
                          type="button"
                          onClick={() => void handleSetPrimary(report.id)}
                          disabled={reportBusy}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-amber-400 hover:bg-amber-400/10 transition-colors disabled:opacity-40"
                          title="设为主喜报"
                        >
                          <Star size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handlePreviewReport(report)}
                        disabled={reportBusy}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 transition-colors disabled:opacity-40"
                        title="查看"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleUnbindReport(report.id)}
                        disabled={reportBusy}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40"
                        title="解绑"
                      >
                        <Unlink2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-dark-500 px-4 py-5 text-sm text-gray-500">
                当前还没有喜报。可以直接上传一张新的喜报，或从素材库未关联喜报中选择一张绑定。
              </div>
            )}
          </div>
        </div>

        <div className="px-8 py-5 border-t border-dark-600/50 bg-dark-800/50 flex items-center justify-end gap-3 relative z-10">
          <button
            onClick={() => onSave(form)}
            disabled={isSaving}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white hover:shadow-lg hover:shadow-accent-primary/25 hover:opacity-90 transition-all text-sm font-medium shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSaving ? '保存中...' : '保存修改'}
          </button>
        </div>

        <style dangerouslySetInnerHTML={{ __html: `
          .form-input, .form-select {
            width: 100%;
            background: rgba(30, 30, 32, 0.8);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 0.75rem;
            padding: 0.625rem 1rem;
            color: white;
            font-size: 0.875rem;
            transition: all 0.2s;
          }
          .form-input:focus, .form-select:focus {
            outline: none;
            border-color: rgba(99, 102, 241, 0.5);
            box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.2);
          }
          .form-select {
            appearance: none;
            background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
            background-position: right 0.5rem center;
            background-repeat: no-repeat;
            background-size: 1.5em 1.5em;
            padding-right: 2.5rem;
          }
          .form-input::placeholder {
            color: rgba(156, 163, 175, 0.5);
          }
        ` }} />
      </div>

      {pickerOpen && student && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-dark-600 bg-dark-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-600/50">
              <div>
                <h3 className="text-white text-lg font-semibold">选择未关联喜报</h3>
                <p className="text-xs text-gray-500 mt-1">绑定到学员「{student.name}」后，这张图会成为他的主喜报。</p>
              </div>
              <button onClick={() => setPickerOpen(false)} className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-6 custom-scrollbar">
              {pickerLoading ? (
                <div className="py-12 text-center text-gray-400">
                  <Loader2 size={18} className="animate-spin inline mr-2" />
                  正在加载未关联喜报...
                </div>
              ) : availableReports.length === 0 ? (
                <div className="py-12 text-center text-gray-500">暂无未关联喜报</div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {availableReports.map((material) => (
                    <button
                      key={material.id}
                      type="button"
                      disabled={reportBusy}
                      onClick={() => void handleBindExistingReport(material)}
                      className="text-left rounded-xl border border-dark-600 bg-dark-800/50 p-4 hover:border-fuchsia-500/40 hover:bg-dark-800 transition-colors disabled:opacity-40"
                    >
                      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-dark-700 text-gray-300 text-[11px]">
                        <ImageIcon size={12} />
                        未关联喜报
                      </div>
                      <p className="mt-3 text-sm text-white font-medium truncate">{material.title || material.filename}</p>
                      <p className="mt-1 text-xs text-gray-500 truncate">{material.filename}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface StudentImportModalProps {
  isOpen: boolean
  drafts: ImportedStudentDraft[]
  sourceName: string
  rawText: string
  isRecognizing: boolean
  isSaving: boolean
  onClose: () => void
  onPickImage: () => void
  onUpdateDraft: <K extends keyof ImportedStudentDraft>(index: number, key: K, value: ImportedStudentDraft[K]) => void
  onRemoveDraft: (index: number) => void
  onConfirm: () => void
}

function StudentImportModal({
  isOpen,
  drafts,
  sourceName,
  rawText,
  isRecognizing,
  isSaving,
  onClose,
  onPickImage,
  onUpdateDraft,
  onRemoveDraft,
  onConfirm,
}: StudentImportModalProps) {
  if (!isOpen) return null

  const requestClose = (source: 'header' | 'backdrop') => {
    if (canCloseStudentModal(source, isRecognizing || isSaving)) {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="absolute inset-0" onClick={() => requestClose('backdrop')} />

      <div className="relative w-full max-w-6xl max-h-[90vh] rounded-2xl border border-dark-600 bg-dark-900 shadow-2xl overflow-hidden animate-scale-in">
        <div className="flex items-center justify-between px-6 py-5 border-b border-dark-600/50">
          <div>
            <h3 className="text-xl font-bold text-white">导入学员数据</h3>
            <p className="text-sm text-gray-400 mt-1">
              上传学员截图，AI 先识别，再由你确认后批量入库。
            </p>
          </div>
          <button
            onClick={() => requestClose('header')}
            disabled={isRecognizing || isSaving}
            className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-dark-700/60 transition-colors disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-86px)] custom-scrollbar">
          <div className="rounded-2xl border border-dark-600/60 bg-dark-800/30 p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-white font-medium">第 1 步：上传学员截图</p>
              <p className="text-sm text-gray-500 mt-1">
                目前支持图片识别导入。建议上传内容清晰、字段对齐的截图。
              </p>
              {sourceName && (
                <p className="text-xs text-accent-primary mt-2">
                  当前文件：{sourceName}
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={isRecognizing || isSaving}
              onClick={onPickImage}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white hover:opacity-90 transition-all text-sm font-medium disabled:opacity-40"
            >
              {drafts.length > 0 ? '重新选择图片' : '选择图片开始识别'}
            </button>
          </div>

          {isRecognizing ? (
            <div className="rounded-2xl border border-dark-600/60 bg-dark-800/30 py-16 text-center text-gray-300">
              <Loader2 size={20} className="animate-spin inline mr-2" />
              AI 正在识别学员信息...
            </div>
          ) : drafts.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">第 2 步：确认识别结果</p>
                  <p className="text-sm text-gray-500 mt-1">
                    已识别 {drafts.length} 条学员记录。可以直接修改后再导入。
                  </p>
                </div>
                <div className="text-xs text-gray-500">
                  空白行不会入库，当前不会自动去重。
                </div>
              </div>

              <div className="rounded-2xl border border-dark-600/60 overflow-hidden">
                <div className="grid grid-cols-[120px_120px_100px_150px_150px_140px_120px_48px] gap-px bg-dark-600/50 text-xs uppercase tracking-wider text-gray-400">
                  <div className="bg-dark-800 px-3 py-3">姓名</div>
                  <div className="bg-dark-800 px-3 py-3">手机号</div>
                  <div className="bg-dark-800 px-3 py-3">渠道</div>
                  <div className="bg-dark-800 px-3 py-3">班级</div>
                  <div className="bg-dark-800 px-3 py-3">岗位</div>
                  <div className="bg-dark-800 px-3 py-3">入学日期</div>
                  <div className="bg-dark-800 px-3 py-3">抖音订单号</div>
                  <div className="bg-dark-800 px-3 py-3 text-center">删</div>
                </div>
                <div className="max-h-[42vh] overflow-y-auto custom-scrollbar">
                  {drafts.map((draft, index) => (
                    <div
                      key={`${index}-${draft.name}-${draft.phone}`}
                      className="grid grid-cols-[120px_120px_100px_150px_150px_140px_120px_48px] gap-px bg-dark-600/30 border-t border-dark-600/40"
                    >
                      <input value={draft.name} onChange={(e) => onUpdateDraft(index, 'name', e.target.value)} className="bg-dark-900 px-3 py-3 text-sm text-white outline-none focus:bg-dark-800" placeholder="姓名" />
                      <input value={draft.phone} onChange={(e) => onUpdateDraft(index, 'phone', e.target.value)} className="bg-dark-900 px-3 py-3 text-sm text-white outline-none focus:bg-dark-800" placeholder="手机号" />
                      <select value={draft.channel} onChange={(e) => onUpdateDraft(index, 'channel', e.target.value as ImportedStudentDraft['channel'])} className="bg-dark-900 px-3 py-3 text-sm text-white outline-none focus:bg-dark-800">
                        <option value="微信">微信</option>
                        <option value="抖音">抖音</option>
                      </select>
                      <input value={draft.className} onChange={(e) => onUpdateDraft(index, 'className', e.target.value)} className="bg-dark-900 px-3 py-3 text-sm text-white outline-none focus:bg-dark-800" placeholder="班级" />
                      <input value={draft.jobTitle} onChange={(e) => onUpdateDraft(index, 'jobTitle', e.target.value)} className="bg-dark-900 px-3 py-3 text-sm text-white outline-none focus:bg-dark-800" placeholder="岗位" />
                      <input value={draft.enrollDate} onChange={(e) => onUpdateDraft(index, 'enrollDate', e.target.value)} className="bg-dark-900 px-3 py-3 text-sm text-white outline-none focus:bg-dark-800" placeholder="YYYY-MM-DD" />
                      <input value={draft.douyinOrder} onChange={(e) => onUpdateDraft(index, 'douyinOrder', e.target.value)} className="bg-dark-900 px-3 py-3 text-sm text-white outline-none focus:bg-dark-800" placeholder="订单号" />
                      <button
                        type="button"
                        onClick={() => onRemoveDraft(index)}
                        className="bg-dark-900 text-gray-500 hover:text-red-300 transition-colors flex items-center justify-center"
                        title="删除本行"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {rawText && (
                <details className="rounded-2xl border border-dark-600/60 bg-dark-800/20 p-4">
                  <summary className="cursor-pointer text-sm text-gray-300">查看模型原始识别结果</summary>
                  <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-gray-500">{rawText}</pre>
                </details>
              )}

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white hover:opacity-90 transition-all text-sm font-medium disabled:opacity-40"
                >
                  {isSaving ? '导入中...' : `确认导入 ${drafts.length} 条`}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-dark-600 px-6 py-16 text-center">
              <p className="text-white font-medium">还没有待导入的数据</p>
              <p className="text-sm text-gray-500 mt-2">先上传一张学员截图，识别成功后会在这里显示可编辑的导入列表。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FormItem({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-300">{label}</label>
      {children}
    </div>
  )
}

function ConfirmDialog({ 
  isOpen, 
  title, 
  message, 
  onConfirm, 
  onCancel 
}: { 
  isOpen: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center animate-fade-in">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      
      <div className="relative w-full max-w-sm bg-dark-900 border border-dark-600 rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
        <div className="p-6">
          <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
          <p className="text-gray-400 text-sm leading-relaxed">
            {message}
          </p>
        </div>
        
        <div className="px-6 py-4 border-t border-dark-600/50 bg-dark-800/50 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
          <button
            onClick={onCancel}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-dark-500 text-gray-300 hover:text-white hover:bg-dark-700/50 transition-all text-sm font-medium"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 border border-red-500/20 hover:border-red-500 hover:text-white transition-all text-sm font-medium shadow-sm"
          >
            确认删除
          </button>
        </div>
      </div>
    </div>
  )
}
