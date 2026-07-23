<template>
  <Transition name="search-modal">
    <div v-if="isOpen" class="fixed inset-0 z-[3000] flex items-start justify-center pt-[12vh]">
      <!-- 遮罩 -->
      <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" @click="close"></div>

      <!-- 搜索弹窗 -->
      <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 slide-in-from-top-2 duration-200 border border-slate-200">
        <!-- 搜索输入 -->
        <div class="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <svg class="w-5 h-5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input 
            ref="searchInput"
            v-model="query"
            class="flex-1 text-base text-slate-800 placeholder-slate-400 outline-none bg-transparent font-medium"
            placeholder="搜索页面、工作流或作品..."
            @keydown.escape="close"
            @keydown.down.prevent="moveDown"
            @keydown.up.prevent="moveUp"
            @keydown.enter.prevent="selectCurrent"
          />
          <span class="text-[10px] text-slate-400 font-medium px-2 py-0.5 border border-slate-200 rounded bg-slate-50">ESC</span>
        </div>

        <!-- 搜索结果 -->
        <div class="max-h-[400px] overflow-y-auto custom-scrollbar">
          <!-- 无结果 -->
          <div v-if="query && filteredResults.length === 0" class="py-10 text-center">
            <div class="text-slate-200 text-3xl mb-2">🔍</div>
            <p class="text-sm text-slate-400">没有找到匹配的结果</p>
          </div>

          <!-- 结果列表 -->
          <div v-else>
            <!-- 快捷导航 -->
            <div v-if="filteredNavItems.length > 0" class="px-3 py-2">
              <div class="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">页面导航</div>
              <div 
                v-for="(item, idx) in filteredNavItems" 
                :key="'nav-' + item.path"
                @click="goToPage(item.path)"
                @mouseenter="activeIndex = idx"
                class="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors"
                :class="activeIndex === idx ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'"
              >
                <span class="text-lg">{{ item.icon }}</span>
                <span class="text-sm font-medium">{{ item.name }}</span>
                <span class="ml-auto text-[10px] text-slate-400">↵</span>
              </div>
            </div>

            <!-- 工作流历史 -->
            <div v-if="filteredThreads.length > 0" class="px-3 py-2 border-t border-slate-50">
              <div class="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">工作流历史</div>
              <div 
                v-for="(thread, idx) in filteredThreads" 
                :key="'thread-' + thread.thread_id"
                @click="goToThread(thread.thread_id)"
                @mouseenter="activeIndex = filteredNavItems.length + idx"
                class="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors"
                :class="activeIndex === (filteredNavItems.length + idx) ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'"
              >
                <span class="mt-0.5 shrink-0">
                  <span v-if="thread.is_completed" class="block w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span v-else class="block w-2 h-2 rounded-full bg-amber-400"></span>
                </span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">{{ thread.selected_topic || thread.topic_direction || '未命名' }}</p>
                  <p class="text-[11px] text-slate-400 truncate">{{ thread.topic_direction }}</p>
                </div>
                <span class="text-[10px] px-1.5 py-0.5 rounded-md shrink-0"
                  :class="thread.is_completed ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'">
                  {{ thread.is_completed ? '完成' : '进行中' }}
                </span>
              </div>
            </div>

            <!-- 作品库 -->
            <div v-if="filteredWorks.length > 0" class="px-3 py-2 border-t border-slate-50">
              <div class="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">作品库</div>
              <div 
                v-for="(work, idx) in filteredWorks" 
                :key="'work-' + work.id"
                @click="goToGallery(work)"
                @mouseenter="activeIndex = filteredNavItems.length + filteredThreads.length + idx"
                class="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors"
                :class="activeIndex === (filteredNavItems.length + filteredThreads.length + idx) ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'"
              >
                <img v-if="work.image_url" :src="work.image_url" class="w-9 h-9 rounded-lg object-cover ring-1 ring-slate-100 shrink-0" />
                <div v-else class="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-300 shrink-0">🖼️</div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">{{ work.title || '未命名作品' }}</p>
                  <p class="text-[11px] text-slate-400 truncate">{{ work.mode }} · {{ work.aspect_ratio }}</p>
                </div>
              </div>
            </div>

            <!-- 默认提示（无搜索词时） -->
            <div v-if="!query" class="px-5 py-6 text-center">
              <p class="text-xs text-slate-400">输入关键词搜索页面、工作流或作品</p>
              <div class="flex items-center justify-center gap-4 mt-3 text-[10px] text-slate-400">
                <span><kbd class="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono">↑↓</kbd> 导航</span>
                <span><kbd class="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono">↵</kbd> 选择</span>
                <span><kbd class="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono">ESC</kbd> 关闭</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { getAllThreads, getGalleryList } from '../../api.js'

const router = useRouter()

const props = defineProps({
  isOpen: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'switch-thread'])

const searchInput = ref(null)
const query = ref('')
const activeIndex = ref(0)
const threadList = ref([])
const workList = ref([])

// 页面导航数据
const navItems = [
  { name: '内容工作流', icon: '⚡️', path: 'workflow' },
  { name: '海报生成', icon: '🎨', path: 'poster' },
  { name: '多平台适配', icon: '🌐', path: 'platform' },
  { name: '智能排期', icon: '📅', path: 'calendar' },
  { name: '作品库', icon: '🖼️', path: 'gallery' },
  { name: '预设模板', icon: '📋', path: 'template_center' },
  { name: '品牌包设置', icon: '💎', path: 'brand' },
  { name: '个人中心', icon: '👤', path: 'profile' },
]

// 本地过滤
const filteredNavItems = computed(() => {
  if (!query.value) return navItems
  const q = query.value.toLowerCase()
  return navItems.filter(item => item.name.toLowerCase().includes(q))
})

const filteredThreads = computed(() => {
  if (!query.value) return threadList.value.slice(0, 5)
  const q = query.value.toLowerCase()
  return threadList.value.filter(t => 
    (t.selected_topic || '').toLowerCase().includes(q) ||
    (t.topic_direction || '').toLowerCase().includes(q)
  ).slice(0, 8)
})

const filteredWorks = computed(() => {
  if (!query.value) return []
  const q = query.value.toLowerCase()
  return workList.value.filter(w =>
    (w.title || '').toLowerCase().includes(q) ||
    (w.prompt || '').toLowerCase().includes(q) ||
    (w.mode || '').toLowerCase().includes(q)
  ).slice(0, 6)
})

const filteredResults = computed(() => [
  ...filteredNavItems.value,
  ...filteredThreads.value,
  ...filteredWorks.value
])

// 键盘导航
function moveDown() {
  if (activeIndex.value < filteredResults.value.length - 1) {
    activeIndex.value++
  }
}

function moveUp() {
  if (activeIndex.value > 0) {
    activeIndex.value--
  }
}

function selectCurrent() {
  const total = filteredResults.value.length
  if (total === 0) return

  const idx = activeIndex.value
  const navLen = filteredNavItems.value.length
  const threadLen = filteredThreads.value.length

  if (idx < navLen) {
    goToPage(filteredNavItems.value[idx].path)
  } else if (idx < navLen + threadLen) {
    goToThread(filteredThreads.value[idx - navLen].thread_id)
  } else {
    goToGallery(filteredWorks.value[idx - navLen - threadLen])
  }
}

// 导航动作
function goToPage(path) {
  router.push({ name: path })
  close()
}

function goToThread(threadId) {
  router.push({ name: 'workflow' })
  emit('switch-thread', threadId)
  close()
}

function goToGallery(work) {
  router.push({ name: 'gallery' })
  close()
}

function close() {
  query.value = ''
  activeIndex.value = 0
  emit('close')
}

// 自动聚焦
watch(() => props.isOpen, async (val) => {
  if (val) {
    await loadData()
    await nextTick()
    searchInput.value?.focus()
  }
})

// 重置高亮
watch(query, () => {
  activeIndex.value = 0
})

// 加载数据
async function loadData() {
  try {
    const [threads, works] = await Promise.all([
      getAllThreads().catch(() => ({ threads: [] })),
      getGalleryList({ page: 1, page_size: 50 }).catch(() => ({ items: [] }))
    ])
    threadList.value = threads.threads || []
    workList.value = works.items || []
  } catch (e) {
    console.error('搜索数据加载失败:', e)
  }
}

// 全局 ⌘K 快捷键
function handleGlobalKeydown(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    if (props.isOpen) {
      close()
    } else {
      emit('close') // trigger parent to toggle
    }
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<style scoped>
.search-modal-enter-active,
.search-modal-leave-active {
  transition: opacity 0.15s ease;
}
.search-modal-enter-from,
.search-modal-leave-to {
  opacity: 0;
}
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: #e2e8f0; border-radius: 20px; }
</style>
