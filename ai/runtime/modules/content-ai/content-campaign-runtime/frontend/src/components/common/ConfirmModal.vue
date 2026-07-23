<template>
  <Transition name="modal">
    <div v-if="isOpen" class="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <!-- 遮罩层 -->
      <div 
        class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        @click="cancel"
      ></div>
      
      <!-- 弹窗主体 -->
      <div class="relative bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
        <!-- 弹窗头部装饰线 -->
        <div class="h-1.5 w-full bg-gradient-to-r" :class="danger ? 'from-red-500 to-rose-400' : 'from-blue-500 to-indigo-400'"></div>
        
        <div class="p-8 pb-6 space-y-4">
          <!-- 图标 -->
          <div class="w-14 h-14 rounded-2xl flex items-center justify-center mb-6" :class="danger ? 'bg-red-50 text-red-500 ring-4 ring-red-50' : 'bg-blue-50 text-blue-500 ring-4 ring-blue-50'">
            <svg v-if="danger" xmlns="http://www.w3.org/2000/svg" class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
          </div>
          
          <h3 class="text-2xl font-black text-slate-800 tracking-tight leading-tight">{{ title }}</h3>
          <p class="text-sm text-slate-500 leading-relaxed">{{ message }}</p>
        </div>
        
        <div class="px-8 py-5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3 rounded-b-[2.5rem]">
          <button 
            @click="cancel"
            class="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-200/50 hover:text-slate-800 transition-colors"
          >
            {{ cancelText }}
          </button>
          <button 
            @click="confirm"
            class="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all active:scale-95 flex items-center gap-2"
            :class="danger ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'"
          >
            <span v-if="danger">🗑️</span>
            <span>{{ confirmText }}</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
defineProps({
  isOpen: { type: Boolean, default: false },
  title: { type: String, default: '确认操作' },
  message: { type: String, default: '您确定要执行此操作吗？' },
  confirmText: { type: String, default: '确定执行' },
  cancelText: { type: String, default: '暂不' },
  danger: { type: Boolean, default: false }
})

const emit = defineEmits(['confirm', 'cancel'])

function confirm() {
  emit('confirm')
}

function cancel() {
  emit('cancel')
}
</script>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
