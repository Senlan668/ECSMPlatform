<template>
  <div class="flex flex-col h-full bg-white">
    <!-- 周导航栏 -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
      <button
        class="p-1.5 hover:bg-white border border-transparent hover:border-slate-200 rounded-lg transition-all"
        @click="goToPrevWeek"
      >
        <svg class="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <span class="text-sm font-semibold text-slate-600">
        {{ weekRangeLabel }}
      </span>
      <button
        class="p-1.5 hover:bg-white border border-transparent hover:border-slate-200 rounded-lg transition-all"
        @click="goToNextWeek"
      >
        <svg class="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    <!-- 星期列头 -->
    <div class="week-header shrink-0">
      <!-- 左上角时间列占位 -->
      <div class="time-gutter border-b border-r border-slate-200 bg-slate-50"></div>
      <!-- 7 天日期列头 -->
      <div
        v-for="(day, idx) in weekDays"
        :key="idx"
        class="day-header-cell border-b border-r border-slate-200 py-3 text-center transition-colors"
        :class="{
          'bg-blue-50': day.isToday,
          'bg-slate-50': !day.isToday
        }"
      >
        <div class="text-[11px] font-bold text-slate-400 uppercase mb-1">{{ day.weekdayLabel }}</div>
        <div
          class="inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold transition-colors"
          :class="{
            'bg-blue-600 text-white': day.isToday,
            'text-slate-700': !day.isToday
          }"
        >
          {{ day.dayNum }}
        </div>
        <div v-if="day.isToday" class="text-[10px] text-blue-600 font-bold mt-0.5">今天</div>
      </div>
    </div>

    <!-- 时间网格（可滚动区域） -->
    <div class="flex-1 overflow-y-auto min-h-0" ref="scrollContainer">
      <div class="week-grid">
        <!-- 时间刻度列 -->
        <div class="time-column">
          <div
            v-for="hour in timeSlots"
            :key="hour"
            class="time-slot-label border-r border-b border-slate-100 flex items-start justify-end pr-2 pt-1"
          >
            <span class="text-[11px] text-slate-400 font-medium">{{ formatHour(hour) }}</span>
          </div>
        </div>

        <!-- 7 天事件列 -->
        <div
          v-for="(day, idx) in weekDays"
          :key="idx"
          class="day-column"
        >
          <div
            v-for="hour in timeSlots"
            :key="hour"
            class="time-slot border-r border-b border-slate-100 relative group hover:bg-slate-50/60 cursor-pointer transition-colors"
            :class="{ 'bg-blue-50/20': day.isToday }"
            @click="handleSlotClick(day, hour)"
          >
            <!-- 当前时间指示线 -->
            <div
              v-if="day.isToday && isCurrentHour(hour)"
              class="absolute left-0 right-0 h-0.5 bg-red-500 z-10 pointer-events-none"
              :style="{ top: currentMinuteOffset + '%' }"
            >
              <div class="absolute -left-1 -top-1 w-2.5 h-2.5 bg-red-500 rounded-full"></div>
            </div>
          </div>

          <!-- 事件卡片叠加层 -->
          <div class="events-overlay">
            <div
              v-for="event in getEventsForDay(day)"
              :key="event.id"
              class="event-block"
              :style="getEventStyle(event)"
            >
              <EventCard :event="event" @select="onEventSelect" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import EventCard from './EventCard.vue'

const props = defineProps({
  year: { type: Number, required: true },
  month: { type: Number, required: true },
  events: { type: Array, default: () => [] }
})

const emit = defineEmits(['edit-event', 'day-click', 'week-change'])

const scrollContainer = ref(null)

// ==================== 当前周偏移量 ====================
// weekOffset = 0 表示包含"今天"的那一周
const weekOffset = ref(0)

// ==================== 时间刻度配置 ====================
const START_HOUR = 6      // 起始时间 6:00
const END_HOUR = 23       // 结束时间 23:00
const SLOT_HEIGHT = 60    // 每个时间槽的高度（像素）

const timeSlots = computed(() => {
  const slots = []
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    slots.push(h)
  }
  return slots
})

// ==================== 周日期计算 ====================

/**
 * 计算当前周的起始日（周一）
 * 基于今天 + weekOffset 计算
 */
const weekStartDate = computed(() => {
  const today = new Date()
  const dayOfWeek = today.getDay() // 0=周日, 1=周一, ...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(today)
  monday.setDate(today.getDate() + mondayOffset + weekOffset.value * 7)
  monday.setHours(0, 0, 0, 0)
  return monday
})

/**
 * 生成本周 7 天的日期数组
 */
const weekDays = computed(() => {
  const labels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return labels.map((label, idx) => {
    const d = new Date(weekStartDate.value)
    d.setDate(d.getDate() + idx)
    const isToday =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()

    return {
      weekdayLabel: label,
      dayNum: d.getDate(),
      dateObj: new Date(d),
      dateString: formatDate(d),
      isToday
    }
  })
})

/**
 * 周导航栏显示的日期范围文字
 */
const weekRangeLabel = computed(() => {
  const first = weekDays.value[0]
  const last = weekDays.value[6]
  const fDate = first.dateObj
  const lDate = last.dateObj

  if (fDate.getMonth() === lDate.getMonth()) {
    return `${fDate.getFullYear()}年${fDate.getMonth() + 1}月${first.dayNum}日 - ${last.dayNum}日`
  }
  return `${fDate.getMonth() + 1}月${first.dayNum}日 - ${lDate.getMonth() + 1}月${last.dayNum}日`
})

// ==================== 当前时间指示 ====================

const currentMinuteOffset = computed(() => {
  const now = new Date()
  return (now.getMinutes() / 60) * 100
})

function isCurrentHour(hour) {
  const now = new Date()
  return now.getHours() === hour
}

// ==================== 事件过滤与渲染 ====================

function getEventsForDay(day) {
  return props.events.filter(e => e.scheduled_date === day.dateString)
}

/**
 * 计算事件卡片的定位样式
 * 根据 scheduled_time 确定 top 值，默认高度固定
 */
function getEventStyle(event) {
  const timeStr = event.scheduled_time || '12:00'
  const [hours, minutes] = timeStr.split(':').map(Number)
  const topOffset = (hours - START_HOUR) * SLOT_HEIGHT + (minutes / 60) * SLOT_HEIGHT
  return {
    position: 'absolute',
    top: `${Math.max(0, topOffset)}px`,
    left: '2px',
    right: '2px',
    zIndex: 5
  }
}

// ==================== 导航 ====================

function goToPrevWeek() {
  weekOffset.value--
  emitWeekChange()
}

function goToNextWeek() {
  weekOffset.value++
  emitWeekChange()
}

/**
 * 当周发生变化时，通知父组件更新数据（可能跨月）
 */
function emitWeekChange() {
  const first = weekDays.value[0].dateObj
  const last = weekDays.value[6].dateObj
  emit('week-change', {
    startDate: formatDate(first),
    endDate: formatDate(last),
    // 用于父组件切换 year/month 加载数据
    year: first.getFullYear(),
    month: first.getMonth() + 1,
    // 如果跨月，还需要加载下个月的数据
    endYear: last.getFullYear(),
    endMonth: last.getMonth() + 1,
  })
}

// ==================== 交互 ====================

function handleSlotClick(day, hour) {
  emit('day-click', {
    day: day.dayNum,
    currentMonth: true,
    dateString: day.dateString,
    suggestedTime: `${String(hour).padStart(2, '0')}:00`
  })
}

function onEventSelect(eventData) {
  emit('edit-event', eventData)
}

// ==================== 工具函数 ====================

function formatDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function formatHour(hour) {
  return `${String(hour).padStart(2, '0')}:00`
}

// ==================== 初始化：滚动到当前时间 ====================

onMounted(async () => {
  await nextTick()
  if (scrollContainer.value) {
    const now = new Date()
    const currentHour = now.getHours()
    // 滚动到当前时间前 2 小时的位置
    const scrollTarget = Math.max(0, (currentHour - START_HOUR - 2)) * SLOT_HEIGHT
    scrollContainer.value.scrollTop = scrollTarget
  }
})
</script>

<style scoped>
/* ===== 周日期列头网格 ===== */
.week-header {
  display: grid;
  grid-template-columns: 56px repeat(7, 1fr);
}

/* ===== 时间网格 ===== */
.week-grid {
  display: grid;
  grid-template-columns: 56px repeat(7, 1fr);
  position: relative;
}

/* ===== 时间刻度列 ===== */
.time-column {
  display: flex;
  flex-direction: column;
}

.time-slot-label {
  height: 60px;
  box-sizing: border-box;
}

/* ===== 每天的事件列 ===== */
.day-column {
  position: relative;
}

.time-slot {
  height: 60px;
  box-sizing: border-box;
}

/* ===== 事件叠加层 ===== */
.events-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}

.event-block {
  pointer-events: auto;
}

/* ===== 时间轴左上角占位 ===== */
.time-gutter {
  width: 56px;
}

.day-header-cell {
  min-width: 0;
}
</style>
