<template>
  <div class="platform-page">
    <div class="page-header">
      <div class="header-left">
        <button class="btn btn-back" @click="goBack">← 返回工作流</button>
        <h2>多平台内容适配</h2>
      </div>
      <div class="header-right">
        <button 
          class="btn btn-primary btn-adapt-all" 
          @click="handleAdaptAll"
          :disabled="isAdaptingAll || !sourceArticle"
        >
          <span v-if="isAdaptingAll" class="loading-spinner-small"></span>
          <span v-else>🔄 一键全平台适配</span>
        </button>
      </div>
    </div>

    <!-- 原文区域 -->
    <div class="source-info card">
      <!-- 已有原文：折叠展示 -->
      <div v-if="sourceArticle">
        <div class="source-header" @click="showSource = !showSource">
          <span class="card-title" style="margin-bottom:0;">📄 原文内容 (字数: {{ sourceArticle.length }})</span>
          <span class="toggle-icon">{{ showSource ? '▼' : '▶' }}</span>
        </div>
        <div v-show="showSource" class="source-body">
          <div class="article-content">{{ sourceArticle }}</div>
        </div>
      </div>
      <!-- 无原文：手动输入区域 -->
      <div v-else>
        <div class="card-title">📝 请输入要适配的原文</div>
        <div v-if="sourceError" class="message message-error" style="margin-bottom:12px;">{{ sourceError }}</div>
        <textarea
          class="textarea"
          v-model="manualArticle"
          placeholder="从工作流获取原文失败，请在此粘贴需要多平台适配的文章内容..."
          style="min-height: 160px;"
        ></textarea>
        <div class="btn-group" style="margin-top:12px;">
          <button class="btn btn-primary" @click="applyManualArticle" :disabled="!manualArticle.trim()">
            ✅ 确认使用此原文
          </button>
        </div>
      </div>
    </div>

    <!-- 骨架屏 / 加载态 -->
    <div v-if="loadingRules || (loadingVariants && !variantsInitialized)" class="loading-state">
      <div class="loading-spinner"></div>
      <p>正在拉取平台数据...</p>
    </div>

    <div v-else class="platform-workspace">
      <!-- 左侧：工作区（平台切换 & 编辑）-->
      <div class="workspace-left">
        <PlatformTabs 
          v-model="currentPlatformId" 
          :platforms="platformRules" 
        />
        
        <div class="editor-section card" v-if="currentRule">
          <!-- 缺省态：未生成该平台版本 -->
          <div v-if="!currentVariant" class="empty-variant">
            <p>尚未生成{{ currentRule.name }}版本的文案</p>
            <button 
              class="btn btn-primary" 
              @click="handleAdaptSingle"
              :disabled="isAdaptingSingle"
            >
              <span v-if="isAdaptingSingle" class="loading-spinner-small"></span>
              <span v-else>✨ 生成{{ currentRule.name }}版本</span>
            </button>
          </div>
          
          <!-- 编辑态：已生成该平台版本 -->
          <div v-else class="editor-container">
            <div class="editor-meta">
              <!-- 标题输入框 (有些平台不需要，但为了兼容都提供) -->
              <input 
                v-model="currentVariant.suggested_title" 
                class="input title-input" 
                placeholder="在此输入标题..."
                @change="handleVariantUpdate(currentPlatformId)"
              />
            </div>
            
            <div class="editor-main">
              <ContentEditor 
                v-model="currentVariant.adapted_content"
                :minWords="currentRule.min_words"
                :maxWords="currentRule.max_words"
                @change="handleVariantUpdate(currentPlatformId)"
              />
            </div>

            <!-- 标签推荐 -->
            <div class="editor-tags" v-if="currentRule.tag_format !== '无标签'">
              <TagSuggestion 
                v-model="currentVariant.suggested_tags"
                :tags="currentVariant.suggested_tags"
                @change="handleVariantUpdate(currentPlatformId)"
                @copy="showMessage('标签已复制到剪贴板！', 'success')"
              />
            </div>

            <!-- 底部操作栏 -->
            <div class="editor-actions">
              <button class="btn btn-outline" @click="handleCopyContent">
                📋 复制文案
              </button>
              <button class="btn btn-outline-danger" @click="handleAdaptSingle" :disabled="isAdaptingSingle">
                🔄 重新生成
              </button>
              <!-- TODO: 如果需要下载图片可以加上 -->
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：预览区 -->
      <div class="workspace-right">
        <div class="preview-sticky">
          <PlatformPreview 
            v-if="currentRule"
            :platformId="currentRule.id"
            :platformName="currentRule.name"
            :content="currentVariant?.adapted_content || '暂无内容...'"
            :title="currentVariant?.suggested_title || '暂无标题'"
            :tags="currentVariant?.suggested_tags || []"
            :imageRatio="currentVariant?.image_ratio || currentRule.recommended_ratio"
            :tagFormat="currentRule.tag_format"
          />
        </div>
      </div>
    </div>

    <!-- 提示消息 -->
    <div v-if="message" :class="['global-message', `message-${messageType}`]">
      {{ message }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import PlatformTabs from './components/platform/PlatformTabs.vue'
import PlatformPreview from './components/platform/PlatformPreview.vue'
import ContentEditor from './components/platform/ContentEditor.vue'
import TagSuggestion from './components/platform/TagSuggestion.vue'
import {
  getPlatformRules,
  getPlatformVariantsByThread,
  adaptSinglePlatform,
  adaptAllPlatforms,
  updatePlatformVariant,
  getWorkflowState
} from './api.js'

const router = useRouter()
const route = useRoute()
const threadId = route.params.thread_id

// ========== 状态 ==========
const loadingRules = ref(true)
const loadingVariants = ref(true)
const variantsInitialized = ref(false)
const isAdaptingAll = ref(false)
const isAdaptingSingle = ref(false)

const showSource = ref(false)
const sourceArticle = ref('')
const sourceTitle = ref('')
const sourceError = ref('')
const manualArticle = ref('')

const platformRules = ref([])
const variantsMap = ref({}) // key: platform_id, value: variant object
const currentPlatformId = ref('')

// ========== 提示消息 ==========
const message = ref('')
const messageType = ref('info')

function showMessage(msg, type = 'info') {
  message.value = msg
  messageType.value = type
  setTimeout(() => {
    message.value = ''
  }, 3000)
}

// ========== 计算属性 ==========
const currentRule = computed(() => {
  return platformRules.value.find(r => r.id === currentPlatformId.value) || null
})

const currentVariant = computed(() => {
  return variantsMap.value[currentPlatformId.value] || null
})

// ========== 生命周期 & 初始化 ==========
onMounted(async () => {
  // 无论是否有 threadId，都先加载平台规则
  await fetchRules()
  
  if (threadId) {
    // 有工作流 ID 时，拉取原文和已适配版本
    await fetchSourceArticle()
    await fetchVariants()
  } else {
    // 没有 threadId，关闭加载状态，让用户手动粘贴原文
    loadingVariants.value = false
    variantsInitialized.value = true
    sourceError.value = '直接进入适配页面，请手动粘贴需要适配的原文内容。'
  }
})

function goBack() {
  router.push({ name: 'workflow' })
}

// 获取平台规则
async function fetchRules() {
  try {
    const res = await getPlatformRules()
    platformRules.value = res.platforms
    if (platformRules.value.length > 0) {
      currentPlatformId.value = platformRules.value[0].id
    }
  } catch (err) {
    console.error('获取规则失败:', err)
    showMessage('获取平台规则失败', 'error')
  } finally {
    loadingRules.value = false
  }
}

// 获取原文（从工作流状态拉取）
async function fetchSourceArticle() {
  try {
    const state = await getWorkflowState(threadId)
    if (state && state.values) {
      sourceArticle.value = state.values.article_content || ''
      sourceTitle.value = state.values.selected_topic || ''
    }
    if (!sourceArticle.value) {
      sourceError.value = '未能从工作流获取到文章内容，请手动粘贴原文。'
    }
  } catch (err) {
    console.error('获取原文失败:', err)
    sourceError.value = `获取原文失败: ${err.message || '请检查后端服务是否正常运行'}`
  }
}

// 用户手动输入原文后确认使用
function applyManualArticle() {
  if (manualArticle.value.trim()) {
    sourceArticle.value = manualArticle.value.trim()
    sourceError.value = ''
    showMessage('原文已确认，现在可以开始适配了！', 'success')
  }
}

// 获取已有的改写版本
async function fetchVariants() {
  loadingVariants.value = true
  try {
    const res = await getPlatformVariantsByThread(threadId)
    const map = {}
    if (res.items && res.items.length > 0) {
      res.items.forEach(v => {
        map[v.platform] = v
      })
    }
    variantsMap.value = map
    variantsInitialized.value = true
  } catch (err) {
    console.error('获取已适配版本失败:', err)
  } finally {
    loadingVariants.value = false
  }
}

// ========== 操作逻辑 ==========

// 单平台改写
async function handleAdaptSingle() {
  if (!currentPlatformId.value) return
  if (!sourceArticle.value) {
    showMessage('请先输入或确认原文内容后再生成', 'error')
    return
  }
  
  isAdaptingSingle.value = true
  try {
    const res = await adaptSinglePlatform({
      platform_id: currentPlatformId.value,
      source_article: sourceArticle.value,
      source_title: sourceTitle.value,
      source_thread_id: threadId,
      include_tags: true
    })
    
    // 更新本地 Map
    if (res.variant) {
      variantsMap.value = {
        ...variantsMap.value,
        [currentPlatformId.value]: res.variant
      }
      showMessage(`已生成 ${currentRule.value.name} 版本`, 'success')
    }
  } catch (err) {
    showMessage(`生成失败: ${err.message || '未知错误'}`, 'error')
  } finally {
    isAdaptingSingle.value = false
  }
}

// 全平台一键改写
async function handleAdaptAll() {
  if (!sourceArticle.value) return
  
  isAdaptingAll.value = true
  try {
    const res = await adaptAllPlatforms({
      source_article: sourceArticle.value,
      source_title: sourceTitle.value,
      source_thread_id: threadId
    })
    
    // 更新本地 Map
    if (res.variants && res.variants.length > 0) {
      const map = { ...variantsMap.value }
      res.variants.forEach(v => {
        map[v.platform] = v
      })
      variantsMap.value = map
      showMessage(`成功适配了 ${res.total} 个平台!`, 'success')
    }
  } catch (err) {
    showMessage(`适配失败: ${err.message || '未知错误'}`, 'error')
  } finally {
    isAdaptingAll.value = false
  }
}

// 更新变体（防抖组件已处理输入延迟）
async function handleVariantUpdate(platformId) {
  const variant = variantsMap.value[platformId]
  if (!variant || !variant.id) return
  
  try {
    await updatePlatformVariant(variant.id, {
      adapted_content: variant.adapted_content,
      suggested_title: variant.suggested_title,
      suggested_tags: variant.suggested_tags
    })
  } catch (err) {
    console.error('自动保存失败:', err)
  }
}

// 复制文案功能
function handleCopyContent() {
  if (!currentVariant.value || !currentVariant.value.adapted_content) return
  
  let contentToCopy = currentVariant.value.adapted_content
  // 如果有标题，包含标题
  if (currentVariant.value.suggested_title && currentRule.value.id !== 'wechat') {
    contentToCopy = currentVariant.value.suggested_title + '\n\n' + contentToCopy
  }
  
  // 如果有标签且不包含在正文末尾，可以拼接（这里假定有些标签不需要手动拼，但稳妥起见我们简单拼一下）
  const tagsText = (currentVariant.value.suggested_tags || []).join(' ')
  if (tagsText && currentRule.value.id !== 'wechat') {
    contentToCopy += '\n\n' + tagsText
  }

  navigator.clipboard.writeText(contentToCopy).then(() => {
    showMessage('文案已复制到剪贴板！', 'success')
  }).catch(() => {
    showMessage('复制失败，请重试', 'error')
  })
}

</script>

<style scoped>
.platform-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-left h2 {
  font-size: 20px;
  margin: 0;
  color: #1a1a1a;
}

.btn-back {
  background: white;
  border: 1px solid #d9d9d9;
  color: #666;
}

.btn-back:hover {
  border-color: #1890ff;
  color: #1890ff;
}

.source-header {
  display: flex;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
}

.toggle-icon {
  color: #999;
  font-size: 12px;
}

.source-body {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
}

.platform-workspace {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.workspace-left {
  flex: 1;
  min-width: 0;
}

.workspace-right {
  width: 375px; /* 匹配手机预览区宽度 */
  flex-shrink: 0;
}

.preview-sticky {
  position: sticky;
  top: 24px;
}

.editor-section {
  min-height: 500px;
  display: flex;
  flex-direction: column;
}

.empty-variant {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 400px;
  color: #999;
  gap: 16px;
}

.editor-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
}

.title-input {
  font-size: 16px;
  font-weight: 500;
  padding: 12px;
}

.editor-main {
  flex: 1;
  min-height: 300px;
  display: flex;
  flex-direction: column;
}

.editor-actions {
  display: flex;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
}

.btn-outline {
  background: transparent;
  border: 1px solid #1890ff;
  color: #1890ff;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}

.btn-outline:hover {
  background: #e6f4ff;
}

.btn-outline-danger {
  background: transparent;
  border: 1px solid #d9d9d9;
  color: #666;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}

.btn-outline-danger:hover {
  border-color: #ff4d4f;
  color: #ff4d4f;
}

.global-message {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  padding: 12px 24px;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
</style>
