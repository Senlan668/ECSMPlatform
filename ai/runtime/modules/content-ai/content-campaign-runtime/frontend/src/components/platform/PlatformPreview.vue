<template>
  <div class="phone-mockup">
    <!-- 手机顶部状态栏模拟 -->
    <div class="phone-header">
      <div class="time">12:00</div>
      <div class="notch"></div>
      <div class="icons">📶 🔋</div>
    </div>
    
    <!-- 平台内页导航栏 -->
    <div class="app-header" :class="'header-' + platformId">
      <span class="back-btn">←</span>
      <span class="app-title">{{ platformName }}</span>
      <span class="more-btn">...</span>
    </div>

    <!-- 滚动内容区 -->
    <div class="phone-content custom-scrollbar">
      
      <!-- 用户头像和关注 -->
      <div class="post-author" v-if="['xiaohongshu', 'weibo', 'bilibili'].includes(platformId)">
        <div class="author-avatar">😎</div>
        <div class="author-info">
          <div class="author-name">AI内容主理人</div>
          <div class="post-time">刚刚</div>
        </div>
        <button class="follow-btn" :class="'btn-' + platformId">关注</button>
      </div>
      <div class="post-author-wechat" v-if="platformId === 'wechat'">
        <div class="wechat-title">{{ title || '请输入标题' }}</div>
        <div class="wechat-meta">
          <span class="wechat-author">AI运营助手</span>
          <span class="wechat-date">今天</span>
        </div>
      </div>

      <!-- 配图预览 (如果有图片就显示，否则占位) -->
      <div class="post-images" v-if="platformId !== 'wechat'">
        <div 
          class="image-placeholder" 
          :style="{ paddingBottom: getAspectRatioPadding(imageRatio) }"
        >
          <span class="placeholder-text">配图预览区 ({{ imageRatio || '16:9' }})</span>
        </div>
      </div>

      <!-- 文案内容区 -->
      <div class="post-body">
        <h3 class="post-title" v-if="platformId === 'xiaohongshu' || platformId === 'bilibili'">
          {{ title }}
        </h3>
        
        <!-- 使用 pre-wrap 保持换行格式 -->
        <div class="post-text">{{ content }}</div>

        <!-- 标签展示 -->
        <div class="post-tags" v-if="tags && tags.length > 0 && platformId !== 'wechat'">
          <span v-for="tag in tags" :key="tag" class="tag" :class="'tag-' + platformId">
            {{ formatTag(tag) }}
          </span>
        </div>
      </div>

      <!-- 底部互动模拟 -->
      <div class="post-interactions">
        <div class="interaction-item">❤️ 赞 (128)</div>
        <div class="interaction-item">💬 评 (32)</div>
        <div class="interaction-item">⭐ 藏 (89)</div>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * PlatformPreview - 手机模拟器平台预览组件
 * 根据不同平台的 UI 风格渲染内容
 */
const props = defineProps({
  platformId: { type: String, required: true },
  platformName: { type: String, default: '发布预览' },
  content: { type: String, default: '' },
  title: { type: String, default: '' },
  tags: { type: Array, default: () => [] },
  imageRatio: { type: String, default: '3:4' },
  tagFormat: { type: String, default: '#话题#' }
})

// 根据请求的比例计算 padding-bottom 模拟高宽比
function getAspectRatioPadding(ratio_str) {
  if (!ratio_str) return '133.33%' // default 3:4
  const parts = ratio_str.split(':')
  if (parts.length === 2) {
    const w = parseFloat(parts[0])
    const h = parseFloat(parts[1])
    return `${(h / w) * 100}%`
  }
  return '100%' // fallback 1:1
}

// 格式化标签显示（有些标签平台会要求双井号有些单井号），虽然后端生成的本身已经带了井号，
// 但这里确保我们直接用它或者按需格式化
function formatTag(tag) {
  if (!tag) return ''
  return tag
}
</script>

<style scoped>
.phone-mockup {
  width: 375px;
  height: 750px;
  background: white;
  border-radius: 40px;
  border: 12px solid #1a1a1a;
  box-shadow: 0 20px 40px rgba(0,0,0,0.1), inset 0 0 0 2px #d9d9d9;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.phone-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  font-size: 12px;
  font-weight: 500;
  color: #333;
  background: white;
}

.notch {
  width: 120px;
  height: 25px;
  background: #1a1a1a;
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  border-bottom-left-radius: 16px;
  border-bottom-right-radius: 16px;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  font-weight: 600;
  background: white;
  position: sticky;
  top: 0;
  z-index: 10;
}

.phone-content {
  flex: 1;
  overflow-y: auto;
  background: #f8f8f8;
}

.post-author {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: white;
}

.author-avatar {
  width: 36px;
  height: 36px;
  background: #f0f0f0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  margin-right: 10px;
}

.author-info {
  flex: 1;
}

.author-name {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.post-time {
  font-size: 11px;
  color: #999;
}

.follow-btn {
  padding: 4px 12px;
  border-radius: 15px;
  border: none;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

/* 各平台特征色 */
.btn-xiaohongshu { background: #ff2442; color: white; }
.btn-douyin { background: #fe2c55; color: white; }
.btn-bilibili { background: #fb7299; color: white; }
.btn-weibo { background: #ff8200; color: white; }

.post-author-wechat {
  padding: 20px 16px;
  background: white;
}

.wechat-title {
  font-size: 20px;
  font-weight: bold;
  line-height: 1.4;
  margin-bottom: 12px;
}

.wechat-meta {
  font-size: 14px;
  color: #576b95; /* 微信经典蓝 */
}

.wechat-date {
  color: #999;
  margin-left: 10px;
}

.post-images {
  background: white;
}

.image-placeholder {
  width: 100%;
  position: relative;
  background: #e6f7ff;
}

.placeholder-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #1890ff;
  font-weight: 500;
  font-size: 14px;
}

.post-body {
  padding: 16px;
  background: white;
  margin-bottom: 8px;
}

.post-title {
  font-size: 16px;
  margin-bottom: 12px;
  line-height: 1.4;
}

.post-text {
  font-size: 15px;
  line-height: 1.6;
  color: #333;
  white-space: pre-wrap;
  word-wrap: break-word;
  margin-bottom: 12px;
}

.post-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.tag {
  font-size: 14px;
  cursor: pointer;
}

.tag-xiaohongshu { color: #133a8c; font-weight: 500; }
.tag-douyin { color: #ffeb3b; background: #fe2c55; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;}
.tag-weibo { color: #507daf; }
.tag-bilibili { color: #00a1d6; }

.post-interactions {
  display: flex;
  justify-content: space-around;
  padding: 12px 16px;
  background: white;
  border-top: 1px solid #f0f0f0;
  color: #666;
  font-size: 13px;
}

/* 隐藏滚动条但可滚 */
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #d9d9d9;
  border-radius: 2px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
</style>
