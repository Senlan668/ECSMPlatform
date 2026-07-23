<template>
  <section class="flex-1 p-8 overflow-y-auto bg-slate-50 w-full h-full flex flex-col" data-purpose="content-calendar">
    <div class="mb-8 flex items-end justify-between shrink-0">
      <div>
        <h1 class="text-2xl font-bold text-slate-900">内容日历管理</h1>
        <p class="text-slate-500 mt-1">智能排期与节点运营规划</p>
      </div>
      <div class="flex items-center space-x-2 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
        <button 
          class="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="viewMode === 'month' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'"
          @click="viewMode = 'month'"
        >月视图</button>
        <button 
          class="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="viewMode === 'week' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'"
          @click="viewMode = 'week'"
        >周视图</button>
        <div class="w-px h-6 bg-slate-200 mx-1"></div>
        <button class="px-4 py-2 rounded-lg text-sm font-medium text-blue-600 hover:bg-blue-50 flex items-center space-x-1" @click="showPlanGenerator = true">
          <span>🤖</span>
          <span>AI 一键排期</span>
        </button>
      </div>
    </div>

    <!-- 主体：日历区域 + 侧边栏 -->
    <div class="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
      <!-- 左侧：日历区域 -->
      <div class="flex-1 min-w-0 flex flex-col h-full">
        <div class="mb-4 flex items-center justify-between shrink-0">
          <div class="flex items-center space-x-4">
            <h2 class="text-xl font-bold text-slate-800">{{ currentYear }}年 {{ currentMonth }}月</h2>
            <div class="flex space-x-1">
              <button class="p-1.5 hover:bg-white border border-transparent hover:border-slate-200 rounded-lg transition-all" @click="prevMonth">
                <svg class="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                </svg>
              </button>
              <button class="p-1.5 hover:bg-white border border-transparent hover:border-slate-200 rounded-lg transition-all" @click="nextMonth">
                <svg class="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                </svg>
              </button>
            </div>
          </div>
          <button class="text-sm font-medium text-blue-600 hover:underline" @click="resetToToday">回到今天</button>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 min-h-0 overflow-hidden flex flex-col">
          <MonthCalendar 
            v-if="viewMode === 'month'"
            :year="currentYear"
            :month="currentMonth"
            :events="events"
            @edit-event="handleEditEvent"
            @day-click="handleDayClick"
            class="flex-1 overflow-y-auto"
          />
          <WeekCalendar
            v-else
            :year="currentYear"
            :month="currentMonth"
            :events="events"
            @edit-event="handleEditEvent"
            @day-click="handleDayClick"
            @week-change="handleWeekChange"
            class="flex-1 overflow-hidden"
          />
        </div>
      </div>

      <!-- 右侧：热点提醒与统计 -->
      <aside class="w-80 shrink-0 flex flex-col gap-6 overflow-y-auto h-full" data-purpose="right-sidebar">
        <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div class="flex items-center space-x-2 mb-6">
            <span class="text-xl">📌</span>
            <h3 class="text-lg font-bold text-slate-800">近期热点提醒</h3>
          </div>
          <HotspotPanel :hotspots="upcomingHotspots" />
        </div>

        <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div class="flex items-center space-x-2 mb-6">
            <span class="text-xl">📊</span>
            <h3 class="text-lg font-bold text-slate-800">内容矩阵分布</h3>
          </div>
          <ContentMatrix :stats="stats.by_type" :total="stats.total" />
        </div>
      </aside>
    </div>
    
    <!-- 弹窗：AI排期 -->
    <PlanGenerator 
      v-model="showPlanGenerator" 
      :year="currentYear"
      :month="currentMonth"
      @plan-generated="loadMonthData" 
    />
    
    <!-- 弹窗：内容详情编辑 -->
    <EventDetail 
      v-model="showEventDetail"
      :event="currentEditingEvent"
      @save="saveEvent"
      @delete="deleteEvent"
      @create-content="handleCreateContent"
    />
  </section>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'

import MonthCalendar from './components/calendar/MonthCalendar.vue'
import WeekCalendar from './components/calendar/WeekCalendar.vue'
import HotspotPanel from './components/calendar/HotspotPanel.vue'
import ContentMatrix from './components/calendar/ContentMatrix.vue'
import PlanGenerator from './components/calendar/PlanGenerator.vue'
import EventDetail from './components/calendar/EventDetail.vue'

import { 
  getCalendarEvents, 
  getUpcomingHotspots,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  createContentFromEvent
} from './api.js'

const emit = defineEmits(['start-workflow'])

const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth() + 1)
const viewMode = ref('month')

// 弹窗状态
const showPlanGenerator = ref(false)
const showEventDetail = ref(false)
const currentEditingEvent = ref(null)

// 数据
const events = ref([])
const stats = ref({ total: 0, by_type: {}, by_status: {} })
const upcomingHotspots = ref([])

function prevMonth() {
  if (currentMonth.value === 1) {
    currentMonth.value = 12
    currentYear.value--
  } else {
    currentMonth.value--
  }
}

function nextMonth() {
  if (currentMonth.value === 12) {
    currentMonth.value = 1
    currentYear.value++
  } else {
    currentMonth.value++
  }
}

// 监听月份切换，重新加载数据
watch([currentYear, currentMonth], () => {
  loadMonthData()
})

function resetToToday() {
  const today = new Date()
  currentYear.value = today.getFullYear()
  currentMonth.value = today.getMonth() + 1
}

async function loadMonthData() {
  try {
    const res = await getCalendarEvents(currentYear.value, currentMonth.value)
    events.value = res.events
    stats.value = res.stats || { total: 0, by_type: {}, by_status: {} }
    
    // 加载近期热点 (传入当前月 1 号往后看整月)
    const hotRes = await getUpcomingHotspots(currentMonth.value, 1, 30)
    upcomingHotspots.value = hotRes.hotspots
  } catch (error) {
    console.error('Failed to load calendar data', error)
  }
}

// 周视图切换周时，如果跨月则额外加载数据
async function handleWeekChange(weekInfo) {
  currentYear.value = weekInfo.year
  currentMonth.value = weekInfo.month
  if (weekInfo.year !== weekInfo.endYear || weekInfo.month !== weekInfo.endMonth) {
    try {
      const extraRes = await getCalendarEvents(weekInfo.endYear, weekInfo.endMonth)
      const existingIds = new Set(events.value.map(e => e.id))
      const newEvents = extraRes.events.filter(e => !existingIds.has(e.id))
      events.value = [...events.value, ...newEvents]
    } catch (error) {
      console.error('Failed to load extra month data', error)
    }
  }
}

// 点击某一天新建内容（兼容月视图和周视图）
function handleDayClick(dayObj) {
  // 周视图传入 dateString，月视图需要拼接
  const dateStr = dayObj.dateString || `${currentYear.value}-${String(currentMonth.value).padStart(2,'0')}-${String(dayObj.day).padStart(2,'0')}`
  currentEditingEvent.value = {
    scheduled_date: dateStr,
    scheduled_time: dayObj.suggestedTime || '12:00',
    content_type: 'education',
    platform: ['xiaohongshu']
  }
  showEventDetail.value = true
}

// 编辑已有内容
function handleEditEvent(event) {
  currentEditingEvent.value = { ...event }
  showEventDetail.value = true
}

// 保存内容
async function saveEvent(eventData) {
  try {
    if (eventData.id) {
      // update
      await updateCalendarEvent(eventData.id, eventData)
    } else {
      // create
      await createCalendarEvent(eventData)
    }
    showEventDetail.value = false
    loadMonthData()
  } catch (error) {
    alert(`保存失败: ${error.response?.data?.detail || error.message}`)
  }
}

async function deleteEvent(eventId) {
  if (!confirm('确定删除该内容安排？')) return
  try {
    await deleteCalendarEvent(eventId)
    showEventDetail.value = false
    loadMonthData()
  } catch (error) {
    alert(`删除失败: ${error.response?.data?.detail || error.message}`)
  }
}

async function handleCreateContent(eventId) {
  try {
    const res = await createContentFromEvent(eventId)
    showEventDetail.value = false
    // 将参数传递给外层，切换到 workflow 页面并自动填入
    emit('start-workflow', res.workflow_params)
  } catch (error) {
    alert(`推送创作失败: ${error.response?.data?.detail || error.message}`)
  }
}

onMounted(() => {
  loadMonthData()
})
</script>

<style scoped>
/* 使用 Tailwind CSS，不再需要大量自定义 CSS */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
}
::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
