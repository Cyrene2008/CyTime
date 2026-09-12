<script setup>
import { quoteSourceOptions } from '../services/quotes'

defineProps({
  draft: { type: Object, required: true }
})

const emit = defineEmits(['configure'])

const sources = Object.entries(quoteSourceOptions).map(([id, option]) => ({ id, ...option }))
</script>

<template>
  <section class="setting-card quote-source-panel">
    <div class="setting-card-heading"><FluentIcon icon="cloud-20-regular" :width="20" /><div><h3>云端来源</h3><p>可同时启用多个来源，按各自权重随机抽取。</p></div></div>
    <div class="setting-row quote-cloud-toggle"><div><h3>在线语录</h3><p>关闭后仅从本地内容中抽取。</p></div><button type="button" class="switch" :class="{ on: draft.quoteCloudEnabled }" :aria-pressed="draft.quoteCloudEnabled" @click="draft.quoteCloudEnabled = !draft.quoteCloudEnabled"><i></i></button></div>
    <div class="quote-source-list">
      <div v-for="source in sources" :key="source.id" class="quote-source-row">
        <button type="button" class="switch" :class="{ on: draft.quoteSources[source.id]?.enabled }" :aria-pressed="draft.quoteSources[source.id]?.enabled" :aria-label="`启用${source.label}`" @click="draft.quoteSources[source.id].enabled = !draft.quoteSources[source.id].enabled"><i></i></button>
        <div class="quote-source-copy"><strong>{{ source.label }}</strong><small>{{ source.description }}</small><span class="source-badge">在线 · {{ source.language }} · 已{{ draft.quoteSources[source.id]?.enabled ? '启用' : '停用' }}</span></div>
        <button v-if="source.id === 'cytime'" type="button" class="source-config-button" aria-label="配置 CyQuote 昔言分类" @click="emit('configure', source.id)"><FluentIcon icon="settings-16-regular" :width="15" /></button>
        <label class="quote-source-weight">权重<input v-model.number="draft.quoteSources[source.id].weight" type="number" min="0" max="9999" /></label>
      </div>
    </div>
  </section>
</template>
