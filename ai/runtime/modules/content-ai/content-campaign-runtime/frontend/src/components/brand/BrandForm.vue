<template>
  <div class="space-y-6">
    <!-- 基础信息卡片 -->
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300 hover:shadow-md">
      <div class="px-6 py-4 border-b border-slate-100 bg-slate-50/30 flex items-center gap-2">
        <div class="w-1 h-5 bg-blue-600 rounded-full"></div>
        <h3 class="font-bold text-slate-800">基础品牌信息</h3>
      </div>
      
      <div class="p-6 space-y-6">
        <!-- 品牌名称 -->
        <div class="space-y-1.5">
          <label class="block text-sm font-semibold text-slate-700">品牌名称</label>
          <input 
            type="text" 
            v-model="formData.brand_name" 
            class="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            placeholder="例如：极客时间、XX科技"
          />
          <p class="text-xs text-slate-400">向 AI 提供品牌名称，有助于在内容中自动融合品牌标识。</p>
        </div>
        
        <!-- Logo 上传 -->
        <div class="space-y-1.5">
          <label class="block text-sm font-semibold text-slate-700">品牌 Logo</label>
          <div 
            class="group relative w-32 h-32 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center cursor-pointer transition-all hover:border-blue-500 hover:bg-blue-50 overflow-hidden"
            @click="triggerLogoUpload"
          >
            <img v-if="formData.logo_url" :src="formData.logo_url" class="w-full h-full object-contain p-2" />
            <div v-else class="flex flex-col items-center gap-2 text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
              <span class="text-[10px] font-medium">点击上传 Logo</span>
            </div>
            
            <!-- 悬浮蒙层 (仅在有图时显示) -->
            <div v-if="formData.logo_url" class="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/10 transition-colors flex items-center justify-center">
              <div class="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 p-1.5 rounded-full shadow-lg">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
              </div>
            </div>

            <input 
              type="file" 
              ref="logoInput" 
              class="hidden" 
              accept="image/png, image/jpeg, image/webp"
              @change="handleLogoChange"
            />
          </div>
          <p class="text-xs text-slate-400">推荐使用透明背景的图片。Logo 将用于视觉海报的自动贴附。</p>
        </div>
      </div>
    </div>

    <!-- 视觉识别设定 (VI) 卡片 -->
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300 hover:shadow-md">
      <div class="px-6 py-4 border-b border-slate-100 bg-slate-50/30 flex items-center gap-2">
        <div class="w-1 h-5 bg-blue-600 rounded-full"></div>
        <h3 class="font-bold text-slate-800">视觉识别 (VI) 设定</h3>
      </div>
      
      <div class="p-6 space-y-6">
        <!-- 品牌色 -->
        <div class="space-y-3">
          <label class="block text-sm font-semibold text-slate-700">品牌色板 (Brand Colors)</label>
          <ColorPicker v-model="formData.colors" :max-colors="5" />
          <p class="text-xs text-slate-400 italic">选取 1-5 种品牌色，AI 绘图时将作为视觉风格的主旋律。</p>
        </div>
        
        <!-- 字体风格 -->
        <div class="space-y-1.5">
          <label class="block text-sm font-semibold text-slate-700">字体风格偏好</label>
          <div class="relative group">
            <select v-model="formData.font_style" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer">
              <option value="">由 AI 自动学习匹配</option>
              <option value="无衬线粗体 (现代感、科技)">无衬线粗体 (现代 / 科技)</option>
              <option value="优雅衬线体 (高端、时尚)">优雅衬线体 (高端 / 时尚)</option>
              <option value="手写书法体 (国潮、文化)">手写书法体 (国潮 / 文化)</option>
              <option value="可爱卡通体 (活泼、亲切)">可爱卡通体 (活泼 / 亲切)</option>
            </select>
            <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-hover:text-blue-500 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 声音与调性设定卡片 -->
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300 hover:shadow-md">
      <div class="px-6 py-4 border-b border-slate-100 bg-slate-50/30 flex items-center gap-2">
        <div class="w-1 h-5 bg-blue-600 rounded-full"></div>
        <h3 class="font-bold text-slate-800">品牌声音与调性</h3>
      </div>
      
      <div class="p-6 space-y-6">
        <div class="grid grid-cols-2 gap-6">
          <!-- 默认口吻 -->
          <div class="space-y-1.5">
            <label class="block text-sm font-semibold text-slate-700">默认口吻</label>
            <div class="relative group">
              <select v-model="formData.tone" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer">
                <option value="专业严谨">专业严谨</option>
                <option value="轻松活泼">轻松活泼</option>
                <option value="知性优雅">知性优雅</option>
                <option value="幽默风趣">幽默风趣</option>
                <option value="真诚亲切">真诚亲切</option>
                <option value="霸气硬朗">霸气硬朗</option>
              </select>
              <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </div>
            </div>
          </div>
        </div>

        <!-- 人设补充 -->
        <div class="space-y-1.5">
          <label class="block text-sm font-semibold text-slate-700 text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">人设深度指引 (AI System Prompt)</label>
          <textarea 
            v-model="formData.tone_prompt" 
            class="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-600 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all min-height-[100px] text-sm"
            rows="4"
            placeholder="例如：我是一个拥有3年经验的资深后端专家，沟通风格倾向于客观严谨，常用比喻来解释复杂概念，杜绝空洞的营销词组..."
          ></textarea>
          <p class="text-[11px] text-slate-400 leading-relaxed italic border-l-2 border-slate-200 pl-3">这段描述将赋予 AI 深度的角色意识。越具体的背景设定，生成的文案就越能体现品牌独特的“性格”。</p>
        </div>

        <!-- 禁用词 -->
        <div class="space-y-2">
          <label class="block text-sm font-semibold text-slate-700">内容规避清单 (Banned Words)</label>
          <TagEditor 
            v-model="formData.banned_words" 
            placeholder="输入不想出现的词汇，回车确认..."
            :suggestions="['最', '第一', '对比竞品', '标题党']"
          />
          <p class="text-xs text-slate-400">明确告诉 AI 必须避开的高危词汇，确保内容安全。 </p>
        </div>
      </div>
    </div>

    <!-- 全局操作 -->
    <div class="flex items-center justify-end gap-4 py-4">
      <button 
        v-if="hasData"
        @click="$emit('reset')" 
        class="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-500 font-medium hover:bg-slate-50 hover:text-slate-800 transition-all active:scale-95"
      >
        重置清空
      </button>
      <button 
        @click="handleSave" 
        :disabled="loading"
        class="px-8 py-2.5 rounded-xl bg-slate-900 text-white font-bold shadow-lg shadow-slate-200 hover:bg-black hover:shadow-slate-300 disabled:bg-slate-300 disabled:shadow-none transition-all active:scale-95 flex items-center gap-2"
      >
        <svg v-if="loading" class="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        {{ loading ? '同步配置中...' : '保存并应用品牌包' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, computed } from 'vue'
import ColorPicker from './ColorPicker.vue'
import TagEditor from '../gallery/TagEditor.vue'

const props = defineProps({
  initialData: {
    type: Object,
    default: () => ({})
  },
  loading: Boolean
})

const emit = defineEmits(['save', 'reset'])

const formData = reactive({
  brand_name: '',
  logo_url: '',
  colors: [],
  font_style: '',
  tone: '专业严谨',
  tone_prompt: '',
  banned_words: []
})

const logoInput = ref(null)

const hasData = computed(() => {
  return formData.brand_name || formData.logo_url || formData.colors.length > 0 || formData.tone_prompt || formData.banned_words.length > 0
})

watch(() => props.initialData, (newVal) => {
  if (newVal) {
    Object.assign(formData, {
      brand_name: newVal.brand_name || '',
      logo_url: newVal.logo_url || '',
      colors: newVal.colors ? [...newVal.colors] : [],
      font_style: newVal.font_style || '',
      tone: newVal.tone || '专业严谨',
      tone_prompt: newVal.tone_prompt || '',
      banned_words: newVal.banned_words ? [...newVal.banned_words] : []
    })
  }
}, { deep: true, immediate: true })

function triggerLogoUpload() {
  logoInput.value.click()
}

function handleLogoChange(e) {
  const file = e.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (evt) => {
    formData.logo_url = evt.target.result
  }
  reader.readAsDataURL(file)
}

function handleSave() {
  emit('save', JSON.parse(JSON.stringify(formData)))
}
</script>
