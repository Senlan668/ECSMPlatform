<template>
  <div class="w-64 bg-white border-r border-slate-100 flex flex-col h-screen shrink-0 relative transition-all duration-300 ease-in-out"
       :class="modelValue ? 'w-64' : 'w-20'">
    <!-- Collapse Toggle Button -->
    <button @click="toggleCollapse" 
            class="absolute -right-3 top-8 bg-white border border-slate-200 rounded-full w-6 h-6 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-300 hover:shadow-sm transition-all z-10">
      <span class="transform transition-transform text-xs" :class="modelValue ? '' : 'rotate-180'">◀</span>
    </button>

    <!-- Header Logo -->
    <div class="p-6 border-b border-slate-100 flex items-center justify-between overflow-hidden shrink-0 h-[89px]">
      <div class="flex items-center space-x-2 w-full">
        <div class="w-8 h-8 rounded flex items-center justify-center shrink-0 transition-all overflow-hidden"
             :class="modelValue ? 'p-0.5' : 'p-1 opacity-80'">
          <img src="/logo.png" alt="Logo" class="w-full h-full object-contain" />
        </div>
        <span class="font-bold text-lg tracking-tight whitespace-nowrap transition-opacity duration-200"
              :class="modelValue ? 'opacity-100' : 'opacity-0 w-0'">内容运营助手</span>
      </div>
    </div>

    <!-- New Workflow Button -->
    <div class="p-4 shrink-0">
      <button 
        class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-xl flex items-center justify-center transition-colors shadow-sm shadow-blue-200 overflow-hidden"
        :class="modelValue ? 'px-4 space-x-2' : 'px-0'"
        @click="handleNewCreation"
      >
        <span class="text-lg shrink-0">✨</span>
        <span class="whitespace-nowrap transition-opacity duration-200" v-if="modelValue">新建创作</span>
      </button>
    </div>

    <!-- Navigation Area: Scrollable -->
    <nav class="flex-1 px-4 py-2 space-y-1 overflow-y-auto min-h-0 custom-scrollbar">
      <div class="mb-6">
        <div class="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider px-3 overflow-hidden whitespace-nowrap"
             :class="modelValue ? 'opacity-100' : 'opacity-0 h-0 mb-0'">
          核心创作
        </div>
        <a v-for="item in mainNavItems" :key="item.name"
           @click="navigateTo(item.path)"
           data-nav-item
           class="flex items-center space-x-3 px-3 py-2.5 rounded-xl mb-1 cursor-pointer transition-colors relative group overflow-hidden"
           :class="[
             isActive(item.path) 
               ? 'bg-blue-50 text-blue-700' 
               : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
             !modelValue && 'justify-center px-0'
           ]"
           :title="!modelValue ? item.name : ''">
          <span class="text-xl shrink-0" :class="isActive(item.path) ? 'scale-110 transition-transform' : ''">{{ item.icon }}</span>
          <span class="font-medium whitespace-nowrap transition-opacity duration-200" v-show="modelValue">{{ item.name }}</span>
          
          <!-- Tooltip for collapsed state -->
          <div v-if="!modelValue" class="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
            {{ item.name }}
          </div>
        </a>
      </div>

      <div>
        <div class="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider px-3 overflow-hidden whitespace-nowrap"
             :class="modelValue ? 'opacity-100' : 'opacity-0 h-0 mb-0'">
          品牌资产
        </div>
        <a v-for="item in assetNavItems" :key="item.name"
           @click="navigateTo(item.path)"
           data-nav-item
           class="flex items-center space-x-3 px-3 py-2.5 rounded-xl mb-1 cursor-pointer transition-colors relative group overflow-hidden"
           :class="[
             isActive(item.path) 
               ? 'bg-blue-50 text-blue-700' 
               : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
             !modelValue && 'justify-center px-0'
           ]"
           :title="!modelValue ? item.name : ''">
          <span class="text-xl shrink-0" :class="isActive(item.path) ? 'scale-110 transition-transform' : ''">{{ item.icon }}</span>
          <span class="font-medium whitespace-nowrap transition-opacity duration-200" v-show="modelValue">{{ item.name }}</span>
          
          <div v-if="!modelValue" class="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
            {{ item.name }}
          </div>
        </a>
      </div>

      <div v-if="canManageUsers" class="pt-4">
        <div class="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider px-3 overflow-hidden whitespace-nowrap"
             :class="modelValue ? 'opacity-100' : 'opacity-0 h-0 mb-0'">
          系统管理
        </div>
        <a v-for="item in adminNavItems" :key="item.name"
           @click="navigateTo(item.path)"
           data-nav-item
           class="flex items-center space-x-3 px-3 py-2.5 rounded-xl mb-1 cursor-pointer transition-colors relative group overflow-hidden"
           :class="[
             isActive(item.path)
               ? 'bg-blue-50 text-blue-700'
               : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
             !modelValue && 'justify-center px-0'
           ]"
           :title="!modelValue ? item.name : ''">
          <span class="text-xl shrink-0" :class="isActive(item.path) ? 'scale-110 transition-transform' : ''">{{ item.icon }}</span>
          <span class="font-medium whitespace-nowrap transition-opacity duration-200" v-show="modelValue">{{ item.name }}</span>

          <div v-if="!modelValue" class="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
            {{ item.name }}
          </div>
        </a>
      </div>
    </nav>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true
  },
  activePage: {
    type: String,
    required: true
  },
  loading: {
    type: Boolean,
    default: false
  },
  threadList: {
    type: Array,
    default: () => []
  },
  currentThreadId: {
    type: String,
    default: ''
  },
  canManageUsers: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'update:modelValue', 
  'update:activePage', 
  'new-workflow',
  'switch-thread',
  'delete-thread',
  'refresh-list'
])

const mainNavItems = [
  { name: '内容工作流', icon: '⚡️', path: 'workflow' },
  { name: '海报生成', icon: '🎨', path: 'poster' },
  { name: '多平台适配', icon: '🌐', path: 'platform' },
  { name: '智能排期', icon: '📅', path: 'calendar' },
  { name: '视频生成', icon: '🎬', path: 'video' },
]

const assetNavItems = [
  { name: '作品库', icon: '🖼️', path: 'gallery' },
  { name: '预设模板', icon: '📋', path: 'template_center' },
  { name: '提示词库', icon: '📝', path: 'prompt_library' },
  { name: '品牌包设置', icon: '💎', path: 'brand' },
]

const adminNavItems = [
  { name: '人员管理', icon: '👥', path: 'admin_users' },
]

const isActive = (path) => props.activePage === path || (props.activePage === null && path === 'workflow')

const navigateTo = (path) => {
  emit('update:activePage', path)
}

const handleNewCreation = () => {
  emit('new-workflow')
  emit('update:activePage', 'workflow')
}

const toggleCollapse = () => {
  emit('update:modelValue', !props.modelValue)
}
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 20px;
}
.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: #cbd5e1; /* slate-300 */
}
</style>
