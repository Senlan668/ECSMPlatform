<template>
  <!--
    App.vue - 路由壳组件
    仅负责承载 <router-view>，所有实际 UI 在 MainApp.vue 及其子组件中
  -->
  <router-view />
</template>

<script setup>
/**
 * 根组件 — 仅作为 Vue Router 的挂载点。
 * 具体的页面布局、侧边栏、认证等逻辑全部在 MainApp.vue 里。
 */
</script>
