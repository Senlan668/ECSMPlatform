<template>
  <div class="flex flex-col h-full bg-white">
    <div class="calendar-grid bg-slate-50 border-b border-slate-200 shrink-0">
      <div v-for="day in ['周一', '周二', '周三', '周四', '周五', '周六', '周日']" :key="day" class="py-3 text-center text-xs font-bold text-slate-500 uppercase">
        {{ day }}
      </div>
    </div>
    <div class="calendar-grid flex-1 border-l border-slate-100">
      <div 
        v-for="(dayObj, index) in calendarDays" 
        :key="index" 
        class="calendar-cell p-2 border-r border-b border-slate-100 flex flex-col transition-colors group"
        :class="{ 
          'bg-slate-50/50': !dayObj.currentMonth,
          'bg-blue-50/20': isToday(dayObj),
          'hover:bg-slate-50 cursor-pointer': dayObj.currentMonth
        }"
        @click="handleDayClick(dayObj)"
      >
        <div v-if="dayObj.day" class="mb-2">
          <span v-if="isToday(dayObj)" class="flex flex-col items-center">
            <span class="flex items-center justify-center w-7 h-7 bg-blue-600 text-white text-sm font-bold rounded-full">{{ dayObj.day }}</span>
            <span class="text-[10px] text-blue-600 font-bold mt-1">今天</span>
          </span>
          <span v-else class="text-sm font-semibold text-slate-400 block">{{ dayObj.day }}</span>
        </div>
        
        <div class="flex flex-col gap-1 overflow-y-auto">
          <EventCard 
            v-for="e in getEventsForDay(dayObj)" 
            :key="e.id" 
            :event="e" 
            @select="onEventSelect"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import EventCard from './EventCard.vue'

const props = defineProps({
  year: { type: Number, required: true },
  month: { type: Number, required: true },
  events: { type: Array, default: () => [] }
})

const emit = defineEmits(['edit-event', 'day-click'])

// 计算日历网格（42个格子：6行7列，保证完整展示）
const calendarDays = computed(() => {
  const result = []
  const firstDay = new Date(props.year, props.month - 1, 1)
  const lastDay = new Date(props.year, props.month, 0)
  
  const daysInMonth = lastDay.getDate()
  let startingDayOfWeek = firstDay.getDay()
  if (startingDayOfWeek === 0) startingDayOfWeek = 7 // 将周日设为7
  
  // 填充上个月的空白格子
  for (let i = 1; i < startingDayOfWeek; i++) {
    result.push({ day: null, currentMonth: false })
  }
  
  // 填充本月的格子
  for (let i = 1; i <= daysInMonth; i++) {
    result.push({ 
      day: i, 
      currentMonth: true,
      dateString: `${props.year}-${String(props.month).padStart(2,'0')}-${String(i).padStart(2,'0')}`
    })
  }
  
  // 填充下个月的空白格子，直到满足 42 个格子 (6行)
  const remaining = 42 - result.length
  for (let i = 0; i < remaining; i++) {
    result.push({ day: null, currentMonth: false })
  }
  
  return result
})

function getEventsForDay(dayObj) {
  if (!dayObj.currentMonth) return []
  return props.events.filter(e => e.scheduled_date === dayObj.dateString)
}

function onEventSelect(eventData) {
  emit('edit-event', eventData)
}

function handleDayClick(dayObj) {
  if (dayObj.currentMonth) {
    emit('day-click', dayObj)
  }
}

function isToday(dayObj) {
  if (!dayObj.currentMonth) return false
  const today = new Date()
  return props.year === today.getFullYear() && 
         props.month === today.getMonth() + 1 && 
         dayObj.day === today.getDate()
}
</script>

<style scoped>
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}
.calendar-grid.flex-1 {
  grid-auto-rows: minmax(100px, 1fr);
}
.calendar-cell {
  min-height: 100px;
}
</style>
