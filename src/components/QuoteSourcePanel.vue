<script setup>
import { quoteApiEndpoints, quoteApiOrder } from '../services/quoteEndpoints'

defineProps({
  draft: { type: Object, required: true }
})

const emit = defineEmits(['configure'])

const endpointOptions = quoteApiEndpoints.map(({ id, label }) => ({ value: id, label }))
const names = Object.fromEntries(quoteApiEndpoints.map(({ id, label }) => [id, label]))
</script>

<template>
  <section class="setting-card quote-source-panel">
    <div class="setting-card-heading"><FluentIcon icon="cloud-20-regular" :width="20" /><div><h3>在线语录</h3><p>打开后，在线语录会和本地语录一起轮换。</p></div></div>
    <div class="setting-row quote-cloud-toggle">
      <div><h3>使用在线语录</h3><p>无法连接时会改用本地语录。</p></div>
      <button type="button" class="switch" aria-label="使用在线语录" :class="{ on: draft.quoteCloudEnabled }" :aria-pressed="draft.quoteCloudEnabled" @click="draft.quoteCloudEnabled = !draft.quoteCloudEnabled"><i></i></button>
    </div>
    <div class="setting-row online-source-options">
      <div>
        <h3>优先服务</h3>
        <p>尝试顺序：{{ quoteApiOrder(draft.quoteApiEndpoint).map(id => names[id]).join(' → ') }}</p>
      </div>
      <FluentSelect v-model="draft.quoteApiEndpoint" :options="endpointOptions" aria-label="在线语录优先服务" />
    </div>
    <div class="setting-row online-source-options">
      <div><h3>语录分类</h3><p>选定喜欢的内容，留空则轮换全部分类。</p></div>
      <button type="button" class="subtle-button" @click="emit('configure')">设置分类</button>
    </div>
  </section>
</template>

<style scoped>
.online-source-options { flex-wrap: wrap; }
.online-source-options .subtle-button { white-space: nowrap; }
</style>
