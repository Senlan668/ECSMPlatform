<template>
  <div class="quick-links">
    <div class="link-card" @click="$emit('nav', 'gallery')">
      <div class="icon-wrap bg-purple">🖼️</div>
      <div class="link-info">
        <h4>我的作品</h4>
        <p>查看生成的全部海报与收藏</p>
      </div>
      <div class="arrow">→</div>
    </div>
    
    <div class="link-card" @click="$emit('nav', 'template_center')">
      <div class="icon-wrap bg-blue">🎨</div>
      <div class="link-info">
        <h4>模板中心</h4>
        <p>管理我的专属排版与提示词</p>
      </div>
      <div class="arrow">→</div>
    </div>
    
    <div class="link-card" @click="$emit('nav', 'brand')">
      <div class="icon-wrap bg-orange">✨</div>
      <div class="link-info">
        <h4>品牌识别</h4>
        <p>设置品牌 Logo、色板与提示词调性</p>
      </div>
      <div class="arrow">→</div>
    </div>
  </div>
</template>

<script setup>
defineEmits(['nav'])
</script>

<style scoped>
.quick-links {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 24px;
}

.link-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  box-shadow: 0 2px 12px rgba(0,0,0,0.05);
  transition: transform 0.2s, box-shadow 0.2s;
}

.link-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.1);
}

.icon-wrap {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.bg-purple { background: #f3e8ff; }
.bg-blue { background: #e0f2fe; }
.bg-orange { background: #ffedd5; }

.link-info {
  flex: 1;
}

.link-info h4 {
  margin: 0 0 4px 0;
  font-size: 16px;
  color: #303133;
}

.link-info p {
  margin: 0;
  font-size: 13px;
  color: #909399;
}

.arrow {
  color: #c0c4cc;
  font-size: 20px;
  transition: transform 0.2s;
}

.link-card:hover .arrow {
  transform: translateX(4px);
  color: #409eff;
}
</style>
