<template>
  <div v-if="isOpen" class="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 backdrop-blur-sm px-4">
    <div class="w-full max-w-xl bg-white rounded-[2rem] shadow-2xl border border-white/80 overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="sales-sync-title">
      <div class="px-7 py-5 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 id="sales-sync-title" class="text-lg font-black text-slate-900">关联销售系统</h3>
          <p class="text-xs text-slate-400 font-bold mt-1">按学员姓名或手机号搜索并同步喜报</p>
        </div>
        <button class="w-10 h-10 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors text-2xl leading-none" @click="$emit('close')" title="关闭">
          ×
        </button>
      </div>

      <div class="p-7 space-y-5">
        <div v-if="salesResult?.success" class="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
          <div class="text-emerald-700 font-black">已同步到销售系统</div>
          <div class="text-sm text-emerald-700/80 mt-2">
            {{ salesResult.student?.name || salesQuery }} · 素材 ID {{ salesResult.material?.id }}
          </div>
        </div>

        <template v-else>
          <label class="block">
            <span class="text-sm font-black text-slate-600">学员姓名 / 手机号</span>
            <input
              v-model.trim="salesQuery"
              type="text"
              class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all"
              placeholder="例如：张三 或 13800138000"
              :disabled="salesLoading"
              @keyup.enter="submitSalesSync()"
            />
          </label>

          <div v-if="salesError" class="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
            {{ salesError }}
          </div>

          <div v-if="salesCandidates.length" class="space-y-3">
            <div class="text-xs font-black text-slate-400 uppercase tracking-widest">匹配学员</div>
            <div class="space-y-2 max-h-64 overflow-y-auto pr-1">
              <div
                v-for="student in salesCandidates"
                :key="student.id"
                class="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
              >
                <div class="min-w-0">
                  <div class="font-black text-slate-800 truncate">{{ student.name || `学员 ${student.id}` }}</div>
                  <div class="text-xs text-slate-400 font-bold mt-1 truncate">
                    {{ student.phone || '未填写手机号' }}<span v-if="student.class_name"> · {{ student.class_name }}</span>
                  </div>
                </div>
                <button
                  class="shrink-0 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black hover:bg-blue-600 transition-colors disabled:opacity-50"
                  :disabled="salesLoading"
                  @click="submitSalesSync(student.id)"
                >
                  关联
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div v-if="!salesResult?.success" class="px-7 py-5 bg-slate-50 border-t border-slate-100 flex justify-end">
        <button
          class="px-7 py-3 rounded-2xl bg-blue-600 text-white text-sm font-black shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          :disabled="salesLoading"
          @click="submitSalesSync()"
        >
          {{ salesLoading ? '同步中...' : '搜索并关联' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { syncPosterToSalesSystem } from '../../api.js'

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  imageUrl: { type: String, required: true },
  defaultTitle: { type: String, default: '' },
})

defineEmits(['close'])

const salesQuery = ref('')
const salesLoading = ref(false)
const salesError = ref('')
const salesCandidates = ref([])
const salesResult = ref(null)

function resetSalesState() {
  salesQuery.value = ''
  salesLoading.value = false
  salesError.value = ''
  salesCandidates.value = []
  salesResult.value = null
}

function readErrorMessage(error) {
  const detail = error.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (detail?.message) return detail.message
  if (detail) return JSON.stringify(detail)
  return error.message || '同步失败，请稍后重试'
}

async function submitSalesSync(studentId = null) {
  if (!props.imageUrl) return
  if (!studentId && !salesQuery.value.trim()) {
    salesError.value = '请输入学员姓名或手机号'
    return
  }

  salesLoading.value = true
  salesError.value = ''
  try {
    const query = salesQuery.value.trim()
    const data = await syncPosterToSalesSystem({
      image_url: props.imageUrl,
      query: query || undefined,
      student_id: studentId || undefined,
      title: props.defaultTitle || (query ? `${query} 喜报` : undefined),
    })

    if (data.success) {
      salesResult.value = data
      salesCandidates.value = []
      return
    }

    salesResult.value = null
    salesCandidates.value = data.candidates || []
    salesError.value = data.message || '没有完成同步'
  } catch (error) {
    salesResult.value = null
    salesError.value = readErrorMessage(error)
  } finally {
    salesLoading.value = false
  }
}

watch(() => props.isOpen, (isOpen) => {
  if (isOpen) resetSalesState()
})
</script>
