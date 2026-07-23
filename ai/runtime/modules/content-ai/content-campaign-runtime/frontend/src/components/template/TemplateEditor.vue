<template>
  <div class="fixed inset-0 z-[1000] flex items-center justify-center p-4 md:p-6 bg-slate-900/40 backdrop-blur-md">
    <div class="bg-white w-full max-w-3xl max-h-[90vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300">
      <!-- 头部 -->
      <div class="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
        <div>
          <h3 class="text-xl font-black text-slate-800 tracking-tight">{{ isEdit ? '编辑模板资产' : '创建创意模板' }}</h3>
          <p class="text-xs text-slate-400 mt-0.5">定义结构化的 AI 生成范式</p>
        </div>
        <button 
          @click="$emit('close')" 
          aria-label="关闭模板编辑器"
          class="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-slate-800 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
        <!-- 第一块：基础属性 -->
        <section class="space-y-6">
          <div class="flex items-center gap-3">
            <span class="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">1</span>
            <h4 class="text-sm font-black text-slate-800 uppercase tracking-widest">基础定义 / Basic Definition</h4>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <label class="text-xs font-bold text-slate-500 ml-1">模板名称 <span class="text-red-500">*</span></label>
              <input 
                type="text" 
                v-model="formData.name" 
                class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none text-sm placeholder:text-slate-300" 
                placeholder="例如：ins风穿搭封面" 
              />
            </div>
            <div class="space-y-2">
              <label class="text-xs font-bold text-slate-500 ml-1">业务分类</label>
              <select 
                v-model="formData.category" 
                class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:bg-white focus:border-blue-500 transition-all outline-none text-sm appearance-none cursor-pointer"
              >
                <option value="通用">通用模板</option>
                <option value="穿搭">穿搭分享</option>
                <option value="美食">美食探店</option>
                <option value="知识">知识干货</option>
              </select>
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-xs font-bold text-slate-500 ml-1">核心卖点描述</label>
            <input 
              type="text" 
              v-model="formData.description" 
              class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:bg-white focus:border-blue-500 transition-all outline-none text-sm placeholder:text-slate-300" 
              placeholder="一句话描述这个模板将为用户解决什么制图需求..." 
            />
          </div>

          <div class="space-y-2">
            <label class="text-xs font-bold text-slate-500 ml-1">默认风格标签 (Style Tag)</label>
            <input 
              type="text" 
              v-model="formData.style_tag" 
              class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:bg-white focus:border-blue-500 transition-all outline-none text-sm placeholder:text-slate-300" 
              placeholder="如：极简、高对比度、电影感..." 
            />
          </div>
        </section>

        <!-- 第二块：技术规范 -->
        <section class="space-y-6">
          <div class="flex items-center gap-3">
            <span class="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">2</span>
            <h4 class="text-sm font-black text-slate-800 uppercase tracking-widest">AI 制图规范 / AI Specification</h4>
          </div>

          <div class="space-y-3">
            <label class="text-xs font-bold text-slate-500 ml-1 flex justify-between items-center">
              <span>Prompt 提示词模板 <span class="text-red-500">*</span></span>
              <span class="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-400">支持 {vars} 语法</span>
            </label>
            <div class="relative group">
              <textarea 
                v-model="formData.config.ai_prompt_template" 
                class="w-full px-5 py-5 bg-slate-900 text-blue-100 font-mono text-sm leading-relaxed rounded-3xl min-h-[140px] focus:ring-4 focus:ring-blue-500/20 transition-all outline-none"
                placeholder="生成一张 {title} 主题的背景，要求 {style_desc}..."
              ></textarea>
              <div class="absolute bottom-4 right-4 text-[10px] text-slate-600 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                Prompt Lab V2.0
              </div>
            </div>
            <div class="px-4 py-3 bg-blue-50/50 rounded-2xl border border-blue-100/50">
              <p class="text-[11px] text-blue-800 leading-normal">
                <strong class="font-bold">贴士：</strong> 模板系统会自动映射全局变量，如 <code class="bg-blue-100 px-1 rounded text-blue-900">{style_desc}</code> 和 <code class="bg-blue-100 px-1 rounded text-blue-900">{color_desc}</code>。您还可以定义自定义槽位。
              </p>
            </div>
          </div>

          <div class="space-y-4">
            <div class="flex items-center justify-between px-1">
              <label class="text-xs font-bold text-slate-500 leading-none">开放输入字段 (Prompt Slots)</label>
              <button 
                @click="addTextSlot"
                class="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-7-7v14"/></svg>
                添加新字段
              </button>
            </div>
            
            <div v-if="formData.config.text_slots.length > 0" class="space-y-3">
              <div 
                v-for="(slot, idx) in formData.config.text_slots" 
                :key="idx"
                class="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-2xl hover:border-blue-200 hover:shadow-sm transition-all group"
              >
                <div class="flex-1 grid grid-cols-2 gap-3">
                  <input type="text" v-model="slot.name" class="px-3 py-2 bg-slate-50 rounded-xl text-xs outline-none focus:bg-white" placeholder="变量名" />
                  <input type="text" v-model="slot.label" class="px-3 py-2 bg-slate-50 rounded-xl text-xs outline-none focus:bg-white" placeholder="前端显示名" />
                </div>
                <div class="flex items-center gap-4 px-2">
                  <label class="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" v-model="slot.required" class="w-3.5 h-3.5 rounded-md text-blue-600 border-slate-300 focus:ring-blue-500" />
                    <span class="text-[10px] font-bold text-slate-500">必填</span>
                  </label>
                  <button @click="removeTextSlot(idx)" class="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                </div>
              </div>
            </div>
            <div v-else class="text-center py-6 border-2 border-dashed border-slate-100 rounded-3xl text-xs text-slate-300 italic">
              当前模板暂无自定义字段
            </div>
          </div>
        </section>
      </div>

      <!-- 底部按钮 -->
      <div class="px-8 py-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 sticky bottom-0 z-10">
        <button 
          @click="handleSave" 
          :disabled="!isValid"
          class="px-10 py-2.5 bg-blue-600 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-100 hover:bg-blue-700 disabled:opacity-50 disabled:grayscale transition-all active:scale-95"
        >
          保存并同步模板
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'

const props = defineProps({
  initialData: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'save'])

const isEdit = computed(() => !!props.initialData?.id)

const formData = reactive({
  name: '',
  description: '',
  category: '通用',
  style_tag: '',
  config: {
    ai_prompt_template: "生成一张 '{title}' 主题的背景，要求 {style_desc}，配色 {color_desc}，不要包含文字。",
    text_slots: [
      { name: 'title', label: '主标题', required: true }
    ],
    default_aspect_ratio: '3:4'
  }
})

onMounted(() => {
  if (props.initialData) {
    formData.id = props.initialData.id
    formData.name = props.initialData.name || ''
    formData.description = props.initialData.description || ''
    formData.category = props.initialData.category || '通用'
    formData.style_tag = props.initialData.style_tag || ''
    if (props.initialData.config) {
      formData.config = JSON.parse(JSON.stringify(props.initialData.config))
      if (!formData.config.text_slots) formData.config.text_slots = []
    }
  }
})

const isValid = computed(() => {
  return formData.name.trim() !== '' && formData.config && formData.config.ai_prompt_template && formData.config.ai_prompt_template.trim() !== ''
})

function addTextSlot() {
  if (!formData.config.text_slots) formData.config.text_slots = []
  formData.config.text_slots.push({
    name: 'new_var',
    label: '新字段',
    required: false
  })
}

function removeTextSlot(index) {
  formData.config.text_slots.splice(index, 1)
}

function handleSave() {
  if (!isValid.value) return
  emit('save', JSON.parse(JSON.stringify(formData)))
}
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #e2e8f0;
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #cbd5e1;
}
</style>
