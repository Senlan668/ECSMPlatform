<template>
  <div class="h-full flex flex-col bg-slate-50/50">
    <!-- 顶部标题区 -->
    <div class="px-8 pt-8 pb-4">
      <div class="max-w-7xl mx-auto">
        <h2 class="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-2">
          <span class="text-3xl">🖼️</span> 作品库 & 素材中心
        </h2>
        <p class="text-slate-500 text-sm">
          管理所有由 AI 生成的海报、封面和图片素材。支持检索、标签归类与模板复用。
        </p>
      </div>
    </div>

    <!-- 筛选面板区 -->
    <div class="px-8 pb-4">
      <div class="max-w-7xl mx-auto">
        <GalleryFilter 
          :filters="currentFilters"
          @update:filters="onFiltersUpdate"
          @search="handleSearch"
        />
      </div>
    </div>

    <!-- 主体内容区 -->
    <div class="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar">
      <div class="max-w-7xl mx-auto relative px-2">
        <!-- 批量操作工具栏 (悬浮) -->
        <div class="sticky top-0 z-20 h-0 overflow-visible mt-2">
          <BatchToolbar
            :selectedCount="selectedIds.length"
            @select-all="selectAll"
            @clear-selection="selectedIds = []"
            @batch-delete="handleBatchDelete"
            @batch-tag="handleBatchTag"
          />
        </div>

        <!-- 作品网格 -->
        <div :class="[selectedIds.length > 0 ? 'pt-28 md:pt-24' : 'pt-2', 'transition-all duration-300 ease-out']">
          <GalleryGrid  
          :items="workList"
          :loading="loading"
          :has-more="hasMore"
          :selectedIds="selectedIds"
          @view-detail="openDetail"
          @toggle-favorite="handleToggleFavorite"
          @save-template="handleSaveTemplate"
          @load-more="loadNextPage"
          @toggle-selection="toggleItemSelection"
        />
        </div>
      </div>
    </div>

    <!-- 详情弹窗 -->
    <GalleryDetail 
      v-if="selectedItem"
      :item="selectedItem"
      @close="selectedItem = null"
      @toggle-favorite="handleToggleFavorite"
      @delete="handleDeleteWork"
      @remix="remixWork"
      @renamed="handleWorkRenamed"
    />

    <!-- 二次确认弹窗 -->
    <ConfirmModal 
      :is-open="confirmState.isOpen"
      :title="confirmState.title"
      :message="confirmState.message"
      :danger="confirmState.danger"
      @confirm="handleConfirmAccept"
      @cancel="confirmState.isOpen = false"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import GalleryFilter from './components/gallery/GalleryFilter.vue'
import GalleryGrid from './components/gallery/GalleryGrid.vue'
import GalleryDetail from './components/gallery/GalleryDetail.vue'
import BatchToolbar from './components/gallery/BatchToolbar.vue'
import ConfirmModal from './components/common/ConfirmModal.vue'
import {
  buildPosterRemixPayload,
  savePosterRemixPayload,
} from './utils/posterRemix.js'

import {
  getGalleryList,
  getGalleryDetail,
  deleteGalleryWork,
  toggleFavorite,
  saveAsTemplate,
  batchDeleteWorks,
  batchTagWorks,
} from './api.js'

const router = useRouter()

// ============== 状态 ==============
const loading = ref(false)
const selectedItem = ref(null)
const selectedIds = ref([])
const workList = ref([])
const totalCount = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const hasMore = ref(false)

const currentFilters = reactive({
  keyword: '',
  only_mine: true,
  is_favorite: false,
  is_template: false,
  mode: '',
  tags: '',
  sort_by: 'created_at_desc'
})

// ============== 弹窗确认状态 ==============
const confirmState = reactive({
  isOpen: false,
  title: '',
  message: '',
  danger: true,
  action: null
})

function showConfirm(title, message, danger, action) {
  confirmState.title = title
  confirmState.message = message
  confirmState.danger = danger
  confirmState.action = action
  confirmState.isOpen = true
}

function handleConfirmAccept() {
  if (confirmState.action) {
    confirmState.action()
  }
  confirmState.isOpen = false
}

// ============== 初始化 ==============
onMounted(() => {
  loadData()
})

// ============== 核心数据加载 ==============
async function loadData() {
  loading.value = true
  try {
    // 解析排序参数
    let sort_by = 'created_at'
    let order = 'desc'
    if (currentFilters.sort_by === 'created_at_asc') {
      order = 'asc'
    }

    const params = {
      page: currentPage.value,
      page_size: pageSize.value,
      sort_by,
      order,
      only_mine: currentFilters.only_mine,
    }

    // 可选筛选参数
    if (currentFilters.mode) params.mode = currentFilters.mode
    if (currentFilters.is_favorite) params.is_favorite = true
    if (currentFilters.is_template) params.is_template = true
    if (currentFilters.tags) params.tags = currentFilters.tags
    if (currentFilters.keyword) params.keyword = currentFilters.keyword

    const data = await getGalleryList(params)

    if (currentPage.value === 1) {
      workList.value = data.items || []
    } else {
      // 追加加载
      workList.value.push(...(data.items || []))
    }
    totalCount.value = data.total || 0
    hasMore.value = data.has_more || false
  } catch (e) {
    console.error('加载作品列表失败:', e)
  } finally {
    loading.value = false
  }
}

function onFiltersUpdate(newFilters) {
  Object.assign(currentFilters, newFilters)
}

function handleSearch() {
  currentPage.value = 1
  workList.value = []
  loadData()
}

function loadNextPage() {
  if (loading.value || !hasMore.value) return
  currentPage.value++
  loadData()
}

// ============== 作品操作 ==============
async function openDetail(item) {
  try {
    // 从后端拉取完整详情（含 prompt、ai_prompt_used 等）
    const detail = await getGalleryDetail(item.id)
    selectedItem.value = detail
  } catch (e) {
    // 降级使用列表数据
    selectedItem.value = item
  }
}

async function handleToggleFavorite(id) {
  try {
    const result = await toggleFavorite(id)
    // 同步本地列表状态
    const item = workList.value.find(w => w.id === id)
    if (item) item.is_favorite = result.is_favorite
    // 同步详情弹窗
    if (selectedItem.value && selectedItem.value.id === id) {
      selectedItem.value.is_favorite = result.is_favorite
    }
  } catch (e) {
    console.error('收藏操作失败:', e)
  }
}

async function handleSaveTemplate(id) {
  try {
    const result = await saveAsTemplate(id)
    alert(`✅ 已保存为个人模板「${result.name}」，可在模板生成面板中使用。`)
  } catch (e) {
    alert(`保存模板失败: ${e.response?.data?.detail || e.message}`)
  }
}

async function handleDeleteWork(id) {
  showConfirm(
    '删除作品',
    '确定要永久删除这份作品记录吗？相关图片文件也将被一并清理，此操作不可撤销。',
    true,
    async () => {
      try {
        await deleteGalleryWork(id)
        workList.value = workList.value.filter(w => w.id !== id)
        totalCount.value = Math.max(0, totalCount.value - 1)
        selectedItem.value = null
      } catch (e) {
        alert(`删除失败: ${e.response?.data?.detail || e.message}`)
      }
    }
  )
}

function remixWork(item) {
  const payload = buildPosterRemixPayload(item)
  savePosterRemixPayload(sessionStorage, payload)
  selectedItem.value = null
  router.push({ name: 'poster', query: { tab: payload.target_tab, remix: item.id } })
}

function handleWorkRenamed({ id, title }) {
  // 同步列表中的标题
  const item = workList.value.find(w => w.id === id)
  if (item) item.title = title
}

// ============== 批量操作 ==============
function selectAll() {
  selectedIds.value = workList.value.map(w => w.id)
}

function toggleItemSelection(id) {
  const index = selectedIds.value.indexOf(id)
  if (index > -1) {
    selectedIds.value.splice(index, 1)
  } else {
    selectedIds.value.push(id)
  }
}

async function handleBatchDelete() {
  if (!selectedIds.value.length) return
  
  showConfirm(
    '批量删除素材',
    `确定要彻底删除选中的 ${selectedIds.value.length} 项作品吗？此操作不可撤销。`,
    true,
    async () => {
      try {
        const result = await batchDeleteWorks(selectedIds.value)
        workList.value = workList.value.filter(w => !selectedIds.value.includes(w.id))
        totalCount.value = Math.max(0, totalCount.value - result.deleted_count)
        selectedIds.value = []
      } catch (e) {
        alert(`批量删除失败: ${e.response?.data?.detail || e.message}`)
      }
    }
  )
}

async function handleBatchTag(tags) {
  if (!selectedIds.value.length || !tags.length) return
  try {
    const result = await batchTagWorks(selectedIds.value, tags)
    // 刷新列表获取最新标签
    handleSearch()
    selectedIds.value = []
  } catch (e) {
    alert(`批量打标签失败: ${e.response?.data?.detail || e.message}`)
  }
}
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  display: none;
}
.custom-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
