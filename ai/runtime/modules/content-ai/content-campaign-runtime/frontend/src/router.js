/**
 * Vue Router 配置
 * 采用嵌套路由结构以实现主应用布局的统一继承
 */
import { createRouter, createWebHistory } from 'vue-router'

// 导入主布局组件
const MainApp = () => import('./MainApp.vue')

// 导入页面组件
const WorkflowPage = () => import('./WorkflowPage.vue')
const CalendarPage = () => import('./CalendarPage.vue')
const PosterPage = () => import('./PosterPage.vue')
const GalleryPage = () => import('./GalleryPage.vue')
const BrandPage = () => import('./BrandPage.vue')
const TemplateCenterPage = () => import('./TemplateCenterPage.vue')
const ProfilePage = () => import('./ProfilePage.vue')
const PlatformPage = () => import('./PlatformPage.vue')
const PromptLibraryPage = () => import('./PromptLibraryPage.vue')
const AdminUsersPage = () => import('./AdminUsersPage.vue')
const VideoPage = () => import('./VideoPage.vue')

const routes = [
  {
    path: '/',
    component: MainApp,
    children: [
      {
        path: '',
        redirect: '/workflow'
      },
      {
        path: 'workflow',
        name: 'workflow',
        component: WorkflowPage
      },
      {
        path: 'calendar',
        name: 'calendar',
        component: CalendarPage
      },
      {
        path: 'poster',
        name: 'poster',
        component: PosterPage
      },
      {
        path: 'gallery',
        name: 'gallery',
        component: GalleryPage
      },
      {
        path: 'brand',
        name: 'brand',
        component: BrandPage
      },
      {
        path: 'template-center',
        name: 'template_center',
        component: TemplateCenterPage
      },
      {
        path: 'profile',
        name: 'profile',
        component: ProfilePage
      },
      {
        path: 'platform/:thread_id?',
        name: 'platform',
        component: PlatformPage
      },
      {
        path: 'prompt-library',
        name: 'prompt_library',
        component: PromptLibraryPage
      },
      {
        path: 'admin/users',
        name: 'admin_users',
        component: AdminUsersPage
      },
      {
        path: 'video',
        name: 'video',
        component: VideoPage
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
