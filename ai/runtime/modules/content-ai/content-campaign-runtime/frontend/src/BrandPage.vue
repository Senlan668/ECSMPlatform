<template>
  <div class="min-h-full bg-slate-50/50 p-6 md:p-10">
    <!-- 页面头部 -->
    <div class="max-w-7xl mx-auto mb-10">
      <div class="flex flex-col gap-2">
        <h2 class="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
          <span class="p-2 bg-blue-600 rounded-2xl shadow-lg shadow-blue-200">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg>
          </span>
          品牌包设置 <span class="text-slate-400 font-light text-xl ml-1">Brand Kit</span>
        </h2>
        <p class="text-slate-500 max-w-2xl leading-relaxed">
          定义您的专属视觉规范与表达口吻。AI 在生成海报和文案时将自动学习这些基因，确保品牌输出始终如一。
        </p>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-[1fr,360px] gap-10 items-start">
      <!-- 左侧：编辑表单 -->
      <div class="space-y-6">
        <BrandForm 
          :initial-data="brandData" 
          :loading="saving"
          @save="handleSaveBrand"
          @reset="handleResetBrand"
        />
      </div>
      
      <!-- 右侧：品牌印象预览 (Sticky) -->
      <div class="hidden xl:block sticky top-10">
        <div class="bg-white/70 backdrop-blur-xl rounded-[2.5rem] border border-white/50 shadow-2xl shadow-blue-100 overflow-hidden min-h-[500px] flex flex-col items-center">
          <div class="w-full px-8 py-6 border-b border-slate-100/50 flex justify-between items-center bg-white/30">
            <span class="text-xs font-bold text-slate-400 tracking-widest uppercase">Brand Impression</span>
            <div class="flex gap-1">
              <div class="w-2 h-2 rounded-full bg-red-400"></div>
              <div class="w-2 h-2 rounded-full bg-yellow-400"></div>
              <div class="w-2 h-2 rounded-full bg-green-400"></div>
            </div>
          </div>

          <!-- 预览内容 -->
          <div class="p-8 w-full flex-1 flex flex-col items-center gap-10" v-if="hasData">
            <!-- Logo & 名称 -->
            <div class="flex flex-col items-center gap-4">
              <div class="w-24 h-24 rounded-[2rem] bg-white shadow-xl shadow-slate-200 border border-slate-50 flex items-center justify-center overflow-hidden group">
                <img v-if="brandData.logo_url" :src="brandData.logo_url" class="w-full h-full object-contain p-4 group-hover:scale-110 transition-transform duration-500" />
                <div v-else class="text-3xl grayscale opacity-20">🎨</div>
              </div>
              <div class="text-2xl font-black text-slate-800 tracking-tight">
                {{ brandData.brand_name || '您的品牌名称' }}
              </div>
            </div>
            
            <!-- 色彩规范 -->
            <div class="w-full space-y-4">
              <div class="text-[10px] font-bold text-slate-400 tracking-widest uppercase text-center border-b border-dashed border-slate-200 pb-2">Primary Palette</div>
              <div class="flex h-12 rounded-2xl overflow-hidden shadow-sm border border-white">
                <template v-if="brandData.colors && brandData.colors.length">
                  <div 
                    v-for="color in brandData.colors" 
                    :key="color" 
                    class="flex-1 hover:flex-[1.5] transition-all duration-300 cursor-pointer"
                    :style="{ backgroundColor: color }"
                    :title="color"
                  ></div>
                </template>
                <div v-else class="flex-1 bg-slate-100 flex items-center justify-center text-slate-300 italic text-xs">
                  待配置色彩
                </div>
              </div>
            </div>

            <!-- 性格标签云 -->
            <div class="w-full space-y-4">
              <div class="flex flex-wrap justify-center gap-2">
                <span class="px-3 py-1 bg-blue-50 text-blue-600 text-[11px] font-bold rounded-full border border-blue-100" v-if="brandData.font_style">
                  字体: {{ brandData.font_style.split(' ')[0] }}
                </span>
                <span class="px-3 py-1 bg-indigo-50 text-indigo-600 text-[11px] font-bold rounded-full border border-indigo-100" v-if="brandData.tone">
                  口吻: {{ brandData.tone }}
                </span>
              </div>
            </div>

            <!-- 禁用词提示 -->
            <div class="w-full mt-auto" v-if="brandData.banned_words && brandData.banned_words.length">
              <div class="bg-red-50/50 rounded-xl p-4 border border-red-100/50">
                <div class="text-[9px] font-bold text-red-400 tracking-widest uppercase mb-2">Banned Words Guide</div>
                <div class="flex flex-wrap gap-1.5 leading-none">
                  <span v-for="word in brandData.banned_words" :key="word" class="text-[10px] text-red-600/70 font-medium">
                    #{{ word }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 空状态预览 -->
          <div class="flex-1 flex flex-col items-center justify-center p-10 text-center space-y-4" v-else>
            <div class="w-20 h-20 bg-slate-100 rounded-[2rem] flex items-center justify-center text-4xl animate-pulse">
              ✨
            </div>
            <div>
              <p class="text-slate-500 font-bold">品牌印象尚处于虚无</p>
              <p class="text-slate-400 text-xs mt-1 leading-relaxed">完善左侧表单，AI 将实时为您编织<br/>这块独一无二的品牌视觉基石。</p>
            </div>
          </div>
          
          <!-- 装饰底部 -->
          <div class="w-full p-6 text-center text-[10px] text-slate-300 font-medium tracking-widest border-t border-slate-50">
            POWERED BY STITCH ENGINE
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import BrandForm from './components/brand/BrandForm.vue'
import { getBrandKit, saveBrandKit, resetBrandKit, uploadBrandLogo } from './api.js'

const brandData = ref({})
const saving = ref(false)

const hasData = computed(() => {
  return brandData.value.brand_name || brandData.value.logo_url || (brandData.value.colors && brandData.value.colors.length > 0) || brandData.value.tone_prompt
})

onMounted(async () => {
  try {
    const res = await getBrandKit()
    if (res && res.id) {
      brandData.value = res
    }
  } catch (e) {
    if (e.response?.status !== 404) {
      console.error('加载品牌包失败', e)
    }
  }
})

async function handleSaveBrand(data) {
  saving.value = true
  try {
    // 如果 logo_url 是 base64 Data URL，先上传获取服务端短 URL
    if (data.logo_url && data.logo_url.startsWith('data:')) {
      const match = data.logo_url.match(/^data:(image\/\w+);base64,(.+)$/)
      if (match) {
        const uploadRes = await uploadBrandLogo(match[2], match[1])
        data.logo_url = uploadRes.logo_url
      }
    }
    const res = await saveBrandKit(data)
    brandData.value = res
    console.log('✅ 品牌包设置已保存')
  } catch (e) {
    alert(`保存失败: ${e.response?.data?.detail || e.message}`)
  } finally {
    saving.value = false
  }
}

async function handleResetBrand() {
  if (!confirm('确定要清除所有品牌设置吗？此操作不可逆。')) return
  try {
    await resetBrandKit()
    brandData.value = {}
  } catch (e) {
    alert(`重置失败: ${e.response?.data?.detail || e.message}`)
  }
}
</script>
