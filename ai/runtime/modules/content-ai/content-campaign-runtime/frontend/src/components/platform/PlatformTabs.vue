<template>
  <div class="platform-tabs">
    <button
      v-for="platform in platforms"
      :key="platform.id"
      class="tab-btn"
      :class="{ active: modelValue === platform.id }"
      @click="$emit('update:modelValue', platform.id)"
    >
      <span class="platform-icon">{{ platform.icon }}</span>
      <span class="platform-name">{{ platform.name }}</span>
    </button>
  </div>
</template>

<script setup>
/**
 * PlatformTabs - 平台选择器组件
 * 用于在不同平台之间切换预览和编辑状态
 */
defineProps({
  /** 当前选中的平台 ID */
  modelValue: {
    type: String,
    required: true
  },
  /** 支持的平台列表 (由后端 /api/v1/platform/rules 提供) */
  platforms: {
    type: Array,
    required: true,
    // default: () => [{id: 'xiaohongshu', name: '小红书', icon: '📕'}]
  }
})

defineEmits(['update:modelValue'])
</script>

<style scoped>
.platform-tabs {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  border-bottom: 2px solid #f0f0f0;
  padding-bottom: 12px;
  overflow-x: auto;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: transparent;
  border: 1px solid #d9d9d9;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
  color: #666;
  white-space: nowrap;
}

.tab-btn:hover {
  border-color: #1890ff;
  color: #1890ff;
  background: #f0f7ff;
}

.tab-btn.active {
  background: #1890ff;
  border-color: #1890ff;
  color: white;
  font-weight: 500;
}

.platform-icon {
  font-size: 16px;
}
</style>
