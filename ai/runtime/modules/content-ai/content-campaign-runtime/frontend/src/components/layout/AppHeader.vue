<template>
  <header class="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0" data-purpose="main-header">
    <div class="flex-1 max-w-xl">
      <div class="relative group cursor-pointer" @click="$emit('open-search')">
        <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 group-hover:text-blue-500 transition-colors">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
          </svg>
        </span>
        <div 
          class="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-sm text-slate-400 group-hover:border-blue-300 group-hover:bg-white transition-all shadow-sm select-none"
        >
          搜索工作流或内容...
        </div>
        <div class="absolute inset-y-0 right-0 pr-2 flex items-center">
          <span class="text-[10px] text-slate-400 font-medium px-2 py-0.5 border border-slate-200 rounded bg-white shadow-sm">⌘K</span>
        </div>
      </div>
    </div>
    
    <div class="flex items-center space-x-4">
      <!-- 消息通知占位 (暂时隐藏)
      <button class="relative p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
        <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
        </svg>
        <span class="absolute top-2 right-2 w-2 h-2 bg-red-500 border-2 border-white rounded-full"></span>
      </button>

      <div class="w-px h-6 bg-slate-200 mx-2"></div>
      -->

      <!-- 用户信息与退出 -->
      <div class="flex items-center space-x-3">
        <button 
          class="flex items-center space-x-2 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all font-medium text-slate-700 shadow-sm"
          title="个人中心"
          @click="goToProfile"
        >
          <span class="bg-blue-100 text-blue-600 w-6 h-6 rounded flex items-center justify-center text-xs">👤</span>
          <span class="text-sm">{{ currentUsername }}</span>
        </button>
        <button 
          class="px-4 py-1.5 text-sm font-medium text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors shadow-sm"
          @click="$emit('logout')"
        >
          退出
        </button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

defineProps({
  currentUsername: { type: String, required: true },
  activePage: { type: String, required: false }
})

defineEmits(['logout', 'open-search'])

function goToProfile() {
  router.push({ name: 'profile' })
}
</script>
