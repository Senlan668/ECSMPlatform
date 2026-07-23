<template>
  <div class="password-card">
    <h3>登录安全</h3>
    
    <div class="form-container">
      <div class="form-group">
        <label>旧密码</label>
        <input type="password" v-model="form.oldPassword" class="input" placeholder="请输入当前密码" />
      </div>

      <div class="form-group">
        <label>新密码</label>
        <input type="password" v-model="form.newPassword" class="input" placeholder="不少于6位" />
      </div>

      <div class="form-group">
        <label>确认新密码</label>
        <input type="password" v-model="form.confirmPassword" class="input" placeholder="再次输入新密码" />
      </div>
      
      <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
      <p v-if="successMsg" class="success-msg">{{ successMsg }}</p>

      <div class="actions">
        <button class="btn btn-primary" @click="handleSubmit" :disabled="isLoading || !isValid">
          {{ isLoading ? '提交中...' : '修改密码' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const emit = defineEmits(['change-password'])

const form = ref({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const isLoading = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

const isValid = computed(() => {
  return form.value.oldPassword.length > 0 && 
         form.value.newPassword.length >= 6 && 
         form.value.newPassword === form.value.confirmPassword
})

function handleSubmit() {
  errorMsg.value = ''
  successMsg.value = ''
  
  if (form.value.newPassword !== form.value.confirmPassword) {
    errorMsg.value = '两次输入的新密码不一致'
    return
  }
  
  emit('change-password', {
    old_password: form.value.oldPassword,
    new_password: form.value.newPassword
  }, (err) => {
    // Callback style hook for the parent
    if (err) {
      errorMsg.value = err
    } else {
      successMsg.value = '密码修改成功，请重新登录'
      form.value.oldPassword = ''
      form.value.newPassword = ''
      form.value.confirmPassword = ''
    }
  })
}
</script>

<style scoped>
.password-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.05);
}

h3 {
  margin: 0 0 20px 0;
  font-size: 16px;
  color: #303133;
  border-left: 4px solid #f56c6c;
  padding-left: 10px;
}

.form-container {
  max-width: 400px;
}

.form-group {
  margin-bottom: 20px;
}

label {
  display: block;
  font-size: 14px;
  color: #606266;
  margin-bottom: 8px;
}

.input {
  width: 100%;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  padding: 10px 14px;
  font-size: 14px;
  transition: border-color 0.2s;
}

.input:focus {
  outline: none;
  border-color: #409eff;
}

.error-msg {
  color: #f56c6c;
  font-size: 13px;
  margin: 0 0 16px 0;
}

.success-msg {
  color: #67c23a;
  font-size: 13px;
  margin: 0 0 16px 0;
}

.actions {
  margin-top: 10px;
}

.btn {
  padding: 10px 24px;
  border-radius: 6px;
  font-size: 14px;
  border: none;
  cursor: pointer;
  width: 100%;
}

.btn-primary {
  background: #f56c6c;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #f78989;
}

.btn-primary:disabled {
  background: #fab6b6;
  cursor: not-allowed;
}
</style>
