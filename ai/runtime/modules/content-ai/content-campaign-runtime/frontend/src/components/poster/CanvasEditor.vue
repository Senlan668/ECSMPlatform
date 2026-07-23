<template>
  <div class="canvas-editor">
    <div class="editor-toolbar">
      <div class="toolbar-group">
        <label>画笔粗细: {{ brushSize }}px</label>
        <input type="range" min="5" max="100" v-model.number="brushSize" @input="updateBrush" />
      </div>
      <div class="toolbar-group actions">
        <button class="btn btn-small btn-outline" @click="clearMask">🗑️ 清除</button>
      </div>
    </div>

    <!-- 画布容器 -->
    <div
      class="canvas-container"
      ref="containerRef"
      :style="{ width: containerWidth + 'px', height: containerHeight + 'px' }"
    >
      <!-- 背景层：显示原图 -->
      <canvas ref="bgCanvasRef" class="layer-bg"></canvas>
      <!-- 绘制层：用户涂抹 Mask -->
      <canvas
        ref="drawCanvasRef"
        class="layer-draw"
        @mousedown="startDrawing"
        @mousemove="draw"
        @mouseup="stopDrawing"
        @mouseleave="stopDrawing"
      ></canvas>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, nextTick } from 'vue'

const props = defineProps({
  imageUrl: { type: String, required: true },
})

const emit = defineEmits(['maskGenerated'])

// 画布和容器引用
const containerRef = ref(null)
const bgCanvasRef = ref(null)
const drawCanvasRef = ref(null)

// 尺寸约束 (最大显示区域：由于弹窗/面板较小，限制在 400x400 内等比缩放)
const MAX_WIDTH = 400
const MAX_HEIGHT = 400

const containerWidth = ref(300)
const containerHeight = ref(400)

// 绘图状态
const isDrawing = ref(false)
const brushSize = ref(20)

// Canvas Contexts
let bgCtx = null
let drawCtx = null
let originalImage = null

// 加载图片并初始化画布
async function initCanvas() {
  if (!props.imageUrl) return

  originalImage = new Image()
  originalImage.crossOrigin = 'Anonymous'
  originalImage.onload = () => {
    // 1. 计算自适应缩放尺寸
    const imgW = originalImage.width
    const imgH = originalImage.height

    let renderW = imgW
    let renderH = imgH

    if (imgW > MAX_WIDTH || imgH > MAX_HEIGHT) {
      const ratio = Math.min(MAX_WIDTH / imgW, MAX_HEIGHT / imgH)
      renderW = imgW * ratio
      renderH = imgH * ratio
    }

    containerWidth.value = renderW
    containerHeight.value = renderH

    nextTick(() => {
      const bgCanvas = bgCanvasRef.value
      const drawCanvas = drawCanvasRef.value
      if (!bgCanvas || !drawCanvas) return

      // 设置物理像素
      bgCanvas.width = renderW
      bgCanvas.height = renderH
      drawCanvas.width = renderW
      drawCanvas.height = renderH

      bgCtx = bgCanvas.getContext('2d')
      drawCtx = drawCanvas.getContext('2d')

      // 画背景原图
      bgCtx.drawImage(originalImage, 0, 0, renderW, renderH)

      // 初始化涂抹层属性 (红色半透明提示颜色)
      initDrawContext()
    })
  }
  originalImage.src = props.imageUrl
}

function initDrawContext() {
  if (!drawCtx) return
  drawCtx.lineCap = 'round'
  drawCtx.lineJoin = 'round'
  drawCtx.strokeStyle = 'rgba(255, 0, 0, 0.5)' // 半透明红
  drawCtx.lineWidth = brushSize.value
}

function updateBrush() {
  if (drawCtx) {
    drawCtx.lineWidth = brushSize.value
  }
}

// 绘制事件处理
function startDrawing(e) {
  isDrawing.value = true
  const rect = drawCanvasRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  drawCtx.beginPath()
  drawCtx.moveTo(x, y)
}

function draw(e) {
  if (!isDrawing.value) return
  const rect = drawCanvasRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  drawCtx.lineTo(x, y)
  drawCtx.stroke()
}

function stopDrawing() {
  if (!isDrawing.value) return
  isDrawing.value = false
  drawCtx.closePath()

  // 每次绘制完，抛出 Mask 数据
  exportMask()
}

function clearMask() {
  if (drawCtx && drawCanvasRef.value) {
    drawCtx.clearRect(0, 0, drawCanvasRef.value.width, drawCanvasRef.value.height)
    exportMask()
  }
}

// 提取 Mask 为 base64 (黑白图：黑色=不变，白色=重绘区域)
function exportMask() {
  if (!drawCanvasRef.value) return

  // 创建一个隐藏的离屏 canvas 用于生成黑白图
  const w = drawCanvasRef.value.width
  const h = drawCanvasRef.value.height

  const offscreen = document.createElement('canvas')
  offscreen.width = w
  offscreen.height = h
  const offCtx = offscreen.getContext('2d')

  // 1. 铺满黑色底 (未涂抹区域)
  offCtx.fillStyle = '#000000'
  offCtx.fillRect(0, 0, w, h)

  // 2. 将用户在 drawCtx 上绘制的有色像素（半透明红），替换为了白色 (白 = 修改区)
  // 获取刚刚绘制层的所有像素数据
  const drawData = drawCtx.getImageData(0, 0, w, h).data

  // 向 offCtx 绘制白色笔触
  offCtx.fillStyle = '#FFFFFF'
  for (let i = 0; i < drawData.length; i += 4) {
    const alpha = drawData[i + 3]
    if (alpha > 0) { // 如果透明度大于0，说明有涂抹
       const px = (i / 4) % w
       const py = Math.floor((i / 4) / w)
       // 画出白色像素点
       offCtx.fillRect(px, py, 1, 1)
    }
  }

  // 抛出 mask base64 (如果全黑则传 null 代表没有选区)
  const isClean = !drawData.some((a, i) => i % 4 === 3 && a > 0);
  if (isClean) {
    emit('maskGenerated', null)
  } else {
    emit('maskGenerated', offscreen.toDataURL('image/png'))
  }
}

watch(() => props.imageUrl, (newVal) => {
  initCanvas()
})

onMounted(() => {
  initCanvas()
})
</script>

<style scoped>
.canvas-editor {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 16px 0;
  padding: 16px;
  background: var(--bg-color-secondary);
  border-radius: 8px;
  border: 1px dashed var(--border-color);
}

.editor-toolbar {
  display: flex;
  justify-content: space-between;
  width: 100%;
  max-width: 400px;
  margin-bottom: 12px;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.canvas-container {
  position: relative;
  background: #333;
  margin: 0 auto;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  cursor: crosshair;
}

.layer-bg, .layer-draw {
  position: absolute;
  top: 0;
  left: 0;
}
.layer-bg {
  z-index: 1;
}
.layer-draw {
  z-index: 2;
}
</style>
