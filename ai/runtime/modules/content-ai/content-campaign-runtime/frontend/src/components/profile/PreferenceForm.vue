<template>
  <div class="preference-card">
    <h3>偏好设置</h3>

    <div class="form-container">
      <div class="form-group row">
        <label>默认生成比例</label>
        <select v-model="form.default_aspect_ratio" class="select" @change="debouncedSave">
          <option value="3:4">小红书竖图 (3:4)</option>
          <option value="1:1">朋友圈头图 (1:1)</option>
          <option value="9:16">抖音/视频号 (9:16)</option>
          <option value="2.35:1">公众号封面 (2.35:1)</option>
          <option value="4:3">网页横图 (4:3)</option>
        </select>
      </div>

      <div class="form-group row">
        <label>默认生成模式</label>
        <select v-model="form.default_mode" class="select" @change="debouncedSave">
          <option value="custom">提示词自定义</option>
          <option value="template">模板生成</option>
        </select>
      </div>

      <div class="form-group row">
        <label>自动保存到库</label>
        <div class="toggle-wrapper">
          <input
            id="auto_save_to_gallery"
            v-model="form.auto_save_to_gallery"
            type="checkbox"
            class="hidden-cb"
            @change="debouncedSave"
          />
          <label for="auto_save_to_gallery" class="toggle"></label>
          <span class="hint">生成成功的图片自动存入作品库</span>
        </div>
      </div>

      <div class="divider"></div>

      <div class="form-group">
        <label class="section-label">
          <svg xmlns="http://www.w3.org/2000/svg" class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
          图片生成引擎
        </label>

        <div class="engine-options">
          <label
            v-for="engine in engineOptions"
            :key="engine.value === null ? 'system' : engine.value"
            class="engine-option"
            :class="{ active: selectedEngine === engine.value, inactive: engine.isInactive }"
          >
            <input
              v-model="selectedEngine"
              type="radio"
              :value="engine.value"
              class="hidden-radio"
              @change="handleEngineChange"
            />
            <span class="engine-icon">{{ engine.icon }}</span>
            <span class="engine-info">
              <span class="engine-name">
                {{ engine.label }}
                <span v-if="engine.isDefault" class="mini-badge">默认</span>
              </span>
              <span class="engine-desc">{{ engine.desc }}</span>
            </span>
            <span v-if="selectedEngine === engine.value" class="check-icon">✓</span>
          </label>
        </div>
      </div>

      <template v-if="canManageModels">
        <div class="divider"></div>

        <div class="model-admin">
          <div class="admin-title-row">
            <div>
              <h4>公共模型管理</h4>
              <p>管理员添加后，全站用户都可以在上方选择。</p>
            </div>
            <button type="button" class="ghost-btn" @click="openCreateModelDialog">新增模型</button>
          </div>

          <div v-if="imageModels.length" class="model-list">
            <div v-for="model in imageModels" :key="model.id" class="model-row">
              <div class="model-main">
                <div class="model-name-line">
                  <span class="model-name">{{ model.name }}</span>
                  <span class="type-badge">{{ providerLabel(model.provider_type) }}</span>
                  <span v-if="model.is_default" class="default-badge">默认</span>
                  <span v-if="!model.is_active" class="off-badge">停用</span>
                </div>
                <div class="model-meta">{{ model.model_name }} · {{ model.base_url }}</div>
                <div class="model-key">Key: {{ model.api_key || '未配置' }}</div>
              </div>
              <div class="row-actions">
                <button type="button" class="text-btn" @click="openEditModelDialog(model)">编辑</button>
                <button
                  type="button"
                  class="text-btn"
                  :disabled="model.is_default"
                  @click="markDefaultModel(model)"
                >
                  设默认
                </button>
                <button type="button" class="danger-btn" @click="removeModel(model)">删除</button>
              </div>
            </div>
          </div>
          <p v-else class="empty-hint">还没有公共模型，新增后用户即可选择。</p>

          <p v-if="modelMsg" :class="['save-msg', modelMsgError ? 'error' : '']">{{ modelMsg }}</p>
        </div>
      </template>

      <p v-if="saveMsg" :class="['save-msg', saveMsgError ? 'error' : '']">{{ saveMsg }}</p>
    </div>

    <div v-if="showModelDialog" class="modal-backdrop" role="presentation">
      <div class="model-dialog" role="dialog" aria-modal="true" :aria-label="modelDialogTitle">
        <div class="dialog-header">
          <div>
            <h4>{{ modelDialogTitle }}</h4>
            <p>配置全站用户可选的图片生成模型。</p>
          </div>
          <button type="button" class="icon-btn" aria-label="关闭" @click="closeModelDialog">×</button>
        </div>

        <form class="model-form" @submit.prevent="submitModel">
          <div class="grid-two">
            <label>
              模型显示名称
              <input v-model.trim="modelForm.name" class="input" placeholder="例如：GPT Image 2" />
            </label>
            <label>
              接口类型
              <select v-model="modelForm.provider_type" class="select full">
                <option
                  v-for="type in providerTypes"
                  :key="type.value"
                  :value="type.value"
                >
                  {{ type.label }}
                </option>
              </select>
            </label>
          </div>

          <label>
            Base URL
            <input v-model.trim="modelForm.base_url" class="input" placeholder="https://api.example.com" />
          </label>

          <div class="grid-two">
            <label>
              Model
              <input v-model.trim="modelForm.model_name" class="input" placeholder="gpt-image-2" />
            </label>
            <label>
              API Key
              <input
                v-model.trim="modelForm.api_key"
                type="password"
                class="input"
                :placeholder="editingModelId ? '留空表示不修改' : 'sk-xxxxxxxxxxxxxxxx'"
              />
            </label>
          </div>

          <label>
            备注
            <textarea v-model.trim="modelForm.description" class="textarea" placeholder="可选：渠道、用途或注意事项"></textarea>
          </label>

          <div class="model-flags">
            <label class="flag-inline">
              排序
              <input v-model.number="modelForm.sort_order" type="number" class="small-input" />
            </label>
            <label class="check-inline">
              <input v-model="modelForm.is_active" type="checkbox" />
              启用
            </label>
            <label class="check-inline">
              <input v-model="modelForm.is_default" type="checkbox" />
              设为系统默认
            </label>
          </div>

          <p v-if="modelMsg" :class="['save-msg', 'dialog-msg', modelMsgError ? 'error' : '']">{{ modelMsg }}</p>

          <div class="form-actions">
            <button type="button" class="ghost-btn" @click="clearModelForm">清空</button>
            <button type="submit" class="primary-btn" :disabled="submittingModel">
              {{ editingModelId ? '保存修改' : '新增公共模型' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import {
  createImageModel,
  deleteImageModel,
  getImageModels,
  setDefaultImageModel,
  updateImageModel,
} from '../../api'

const props = defineProps({
  prefs: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['update-prefs'])

const builtinEngines = [
  { value: null, icon: '⚙️', label: '跟随系统默认', desc: '使用管理员默认公共模型或 .env 全局配置' },
  { value: 'gemini', icon: '💎', label: 'Gemini (xunruijie)', desc: 'gemini-3-pro-image-preview' },
  { value: 'gpt_image', icon: '🖼️', label: 'GPT Image 2', desc: 'OpenAI GPT Image 2 生图 (scdn)' },
  { value: 'doubao', icon: '🎨', label: '豆包 Seedream', desc: '火山方舟 doubao-seedream 生图' },
]
const validBuiltinValues = new Set(builtinEngines.map(engine => engine.value))

const form = ref({
  default_aspect_ratio: '3:4',
  default_mode: 'custom',
  auto_save_to_gallery: true,
  image_provider: null,
  image_model_config_id: null,
})

const selectedEngine = ref(null)
const imageModels = ref([])
const canManageModels = ref(false)
const providerTypes = ref([
  { value: 'openai_image', label: 'OpenAI Image 兼容' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'doubao', label: '豆包 Seedream' },
])

const engineOptions = computed(() => {
  const publicModels = imageModels.value
    .filter(model => model.is_active)
    .map(model => ({
      value: `model:${model.id}`,
      icon: providerIcon(model.provider_type),
      label: model.name,
      desc: `${providerLabel(model.provider_type)} · ${model.model_name}`,
      isDefault: model.is_default,
      isInactive: !model.is_active,
    }))
  return [...builtinEngines, ...publicModels]
})

const blankModelForm = () => ({
  name: '',
  provider_type: 'openai_image',
  base_url: '',
  model_name: '',
  api_key: '',
  description: '',
  is_active: true,
  is_default: false,
  sort_order: 0,
})

const modelForm = ref(blankModelForm())
const editingModelId = ref(null)
const showModelDialog = ref(false)
const submittingModel = ref(false)
const saveMsg = ref('')
const saveMsgError = ref(false)
const modelMsg = ref('')
const modelMsgError = ref(false)
const modelDialogTitle = computed(() => editingModelId.value ? '编辑公共模型' : '新增公共模型')
let timer = null

watch(() => props.prefs, (newVal) => {
  if (newVal && Object.keys(newVal).length > 0) {
    form.value = {
      ...form.value,
      ...newVal,
      auto_save_to_gallery: newVal.auto_save_to_gallery ?? newVal.auto_save ?? true,
      image_provider: validBuiltinValues.has(newVal.image_provider) ? newVal.image_provider : null,
      image_model_config_id: newVal.image_model_config_id || null,
    }
    selectedEngine.value = form.value.image_model_config_id
      ? `model:${form.value.image_model_config_id}`
      : form.value.image_provider
  }
}, { immediate: true })

onMounted(() => {
  loadImageModels()
})

async function loadImageModels() {
  try {
    const data = await getImageModels(true)
    imageModels.value = data.items || []
    canManageModels.value = Boolean(data.can_manage)
    providerTypes.value = data.provider_types?.length ? data.provider_types : providerTypes.value
  } catch (err) {
    imageModels.value = []
    canManageModels.value = false
  }
}

function handleEngineChange() {
  if (typeof selectedEngine.value === 'string' && selectedEngine.value.startsWith('model:')) {
    form.value.image_model_config_id = selectedEngine.value.replace('model:', '')
    form.value.image_provider = null
  } else {
    form.value.image_model_config_id = null
    form.value.image_provider = validBuiltinValues.has(selectedEngine.value) ? selectedEngine.value : null
  }
  debouncedSave()
}

function debouncedSave() {
  saveMsg.value = '正在保存...'
  saveMsgError.value = false
  clearTimeout(timer)
  timer = setTimeout(() => {
    emit('update-prefs', { ...form.value }, (err) => {
      if (err) {
        saveMsg.value = '保存失败: ' + err
        saveMsgError.value = true
      } else {
        saveMsg.value = '✓ 已自动保存'
        saveMsgError.value = false
        setTimeout(() => saveMsg.value = '', 2000)
      }
    })
  }, 500)
}

function providerLabel(type) {
  return providerTypes.value.find(item => item.value === type)?.label || type
}

function providerIcon(type) {
  if (type === 'gemini') return '💎'
  if (type === 'doubao') return '🎨'
  return '🖼️'
}

function editModel(model) {
  editingModelId.value = model.id
  modelForm.value = {
    name: model.name || '',
    provider_type: model.provider_type || 'openai_image',
    base_url: model.base_url || '',
    model_name: model.model_name || '',
    api_key: '',
    description: model.description || '',
    is_active: Boolean(model.is_active),
    is_default: Boolean(model.is_default),
    sort_order: Number(model.sort_order || 0),
  }
  modelMsg.value = ''
}

function openCreateModelDialog() {
  resetModelForm()
  showModelDialog.value = true
}

function openEditModelDialog(model) {
  editModel(model)
  showModelDialog.value = true
}

function closeModelDialog() {
  showModelDialog.value = false
  resetModelForm()
}

function clearModelForm() {
  modelForm.value = blankModelForm()
  modelMsg.value = ''
  modelMsgError.value = false
}

function resetModelForm() {
  editingModelId.value = null
  modelForm.value = blankModelForm()
  modelMsg.value = ''
  modelMsgError.value = false
}

function buildModelPayload() {
  const payload = {
    ...modelForm.value,
    name: modelForm.value.name.trim(),
    base_url: modelForm.value.base_url.trim(),
    model_name: modelForm.value.model_name.trim(),
    api_key: modelForm.value.api_key.trim(),
    description: modelForm.value.description.trim(),
    sort_order: Number(modelForm.value.sort_order || 0),
  }
  if (editingModelId.value && !payload.api_key) {
    delete payload.api_key
  }
  return payload
}

async function submitModel() {
  const payload = buildModelPayload()
  if (!payload.name || !payload.base_url || !payload.model_name || (!editingModelId.value && !payload.api_key)) {
    modelMsg.value = '请填写名称、Base URL、Model 和 API Key'
    modelMsgError.value = true
    return
  }

  submittingModel.value = true
  modelMsg.value = '正在保存模型...'
  modelMsgError.value = false
  try {
    if (editingModelId.value) {
      await updateImageModel(editingModelId.value, payload)
    } else {
      await createImageModel(payload)
    }
    await loadImageModels()
    showModelDialog.value = false
    resetModelForm()
    modelMsg.value = '模型已保存'
    modelMsgError.value = false
  } catch (err) {
    modelMsg.value = err.response?.data?.detail || err.message || '保存模型失败'
    modelMsgError.value = true
  } finally {
    submittingModel.value = false
  }
}

async function markDefaultModel(model) {
  modelMsg.value = '正在设置默认模型...'
  modelMsgError.value = false
  try {
    await setDefaultImageModel(model.id)
    await loadImageModels()
    modelMsg.value = '默认模型已更新'
  } catch (err) {
    modelMsg.value = err.response?.data?.detail || err.message || '设置默认失败'
    modelMsgError.value = true
  }
}

async function removeModel(model) {
  if (!window.confirm(`确定删除公共模型「${model.name}」吗？`)) return
  modelMsg.value = '正在删除模型...'
  modelMsgError.value = false
  try {
    await deleteImageModel(model.id)
    if (form.value.image_model_config_id === model.id) {
      selectedEngine.value = null
      handleEngineChange()
    }
    await loadImageModels()
    modelMsg.value = '模型已删除'
  } catch (err) {
    modelMsg.value = err.response?.data?.detail || err.message || '删除模型失败'
    modelMsgError.value = true
  }
}
</script>

<style scoped>
.preference-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.05);
  height: 100%;
}

h3 {
  margin: 0 0 20px 0;
  font-size: 16px;
  color: #303133;
  border-left: 4px solid #409eff;
  padding-left: 10px;
}

.form-container {
  max-width: 560px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

label {
  font-size: 14px;
  color: #606266;
}

.section-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
}

.section-label .icon {
  width: 16px;
  height: 16px;
  color: #409eff;
}

.select,
.input,
.textarea {
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 14px;
  color: #606266;
  width: 220px;
  background: #fff;
  box-sizing: border-box;
}

.select.full,
.input,
.textarea {
  width: 100%;
  margin-top: 8px;
}

.textarea {
  min-height: 68px;
  resize: vertical;
  font-family: inherit;
}

.hint {
  font-size: 12px;
  color: #909399;
  margin: 6px 0 0 0;
}

.divider {
  height: 1px;
  background: #ebeef5;
  margin: 24px 0;
}

.save-msg {
  color: #67c23a;
  font-size: 12px;
  text-align: right;
  margin-top: 10px;
}

.save-msg.error {
  color: #f56c6c;
}

.engine-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hidden-radio {
  display: none;
}

.engine-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 2px solid #ebeef5;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: #fafafa;
}

.engine-option:hover {
  border-color: #c0d4f0;
  background: #f5f8ff;
}

.engine-option.active {
  border-color: #409eff;
  background: linear-gradient(135deg, #f0f6ff 0%, #e8f0fe 100%);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.15);
}

.engine-icon {
  font-size: 22px;
  flex-shrink: 0;
  width: 32px;
  text-align: center;
}

.engine-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.engine-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.engine-desc {
  font-size: 11px;
  color: #909399;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.check-icon {
  color: #409eff;
  font-weight: 700;
  font-size: 16px;
  flex-shrink: 0;
}

.mini-badge,
.default-badge,
.type-badge,
.off-badge {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 20px;
}

.mini-badge,
.default-badge {
  color: #1f7a43;
  background: #e8f7ee;
}

.type-badge {
  color: #3363a6;
  background: #eef4ff;
}

.off-badge {
  color: #9a3412;
  background: #fff2e8;
}

.hidden-cb {
  display: none;
}

.toggle-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toggle {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 20px;
  background-color: #dcdfe6;
  border-radius: 20px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.toggle::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background-color: white;
  border-radius: 50%;
  transition: transform 0.3s;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.hidden-cb:checked + .toggle {
  background-color: #409eff;
}

.hidden-cb:checked + .toggle::after {
  transform: translateX(20px);
}

.model-admin {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.admin-title-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.admin-title-row h4 {
  margin: 0;
  color: #303133;
  font-size: 15px;
}

.admin-title-row p,
.empty-hint {
  margin: 4px 0 0;
  color: #909399;
  font-size: 12px;
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.model-row {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding: 12px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fbfcff;
}

.model-main {
  min-width: 0;
}

.model-name-line {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.model-name {
  color: #303133;
  font-weight: 600;
  font-size: 14px;
}

.model-meta,
.model-key {
  margin-top: 5px;
  color: #909399;
  font-size: 12px;
  word-break: break-all;
}

.row-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.model-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 4px;
}

.model-form label {
  display: block;
}

.grid-two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.model-flags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
}

.flag-inline,
.check-inline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.small-input {
  width: 78px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  padding: 6px 8px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.45);
}

.model-dialog {
  width: min(720px, 100%);
  max-height: min(760px, calc(100vh - 48px));
  overflow-y: auto;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.22);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  padding: 22px 24px 16px;
  border-bottom: 1px solid #ebeef5;
}

.dialog-header h4 {
  margin: 0;
  color: #303133;
  font-size: 18px;
}

.dialog-header p {
  margin: 4px 0 0;
  color: #909399;
  font-size: 12px;
}

.model-dialog .model-form {
  padding: 20px 24px 24px;
}

.dialog-msg {
  text-align: left;
  margin: 0;
}

.primary-btn,
.ghost-btn,
.text-btn,
.danger-btn,
.icon-btn {
  border: 0;
  border-radius: 6px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
}

.primary-btn {
  color: #fff;
  background: #2563eb;
}

.primary-btn:disabled,
.text-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ghost-btn {
  color: #3f5f8a;
  background: #eef4ff;
}

.text-btn {
  color: #2563eb;
  background: #eef4ff;
}

.danger-btn {
  color: #b42318;
  background: #fff1f0;
}

.icon-btn {
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: 50%;
  color: #64748b;
  background: #f3f6fb;
  font-size: 22px;
  line-height: 1;
}

.icon-btn:hover {
  color: #1f2937;
  background: #e8eef8;
}

@media (max-width: 680px) {
  .form-group.row,
  .admin-title-row,
  .model-row {
    flex-direction: column;
    align-items: stretch;
  }

  .select {
    width: 100%;
  }

  .grid-two {
    grid-template-columns: 1fr;
  }

  .row-actions {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .modal-backdrop {
    align-items: flex-end;
    padding: 12px;
  }

  .model-dialog {
    max-height: calc(100vh - 24px);
    border-radius: 12px;
  }

  .dialog-header,
  .model-dialog .model-form {
    padding-left: 16px;
    padding-right: 16px;
  }
}
</style>
