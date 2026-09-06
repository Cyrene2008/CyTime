<script setup>
defineProps({
  draft: { type: Object, required: true },
  content: { type: Object, required: true }
})

const sources = [
  { id: 'daily', label: '日常励志', description: '内置与用户导入的日常语录', contentKey: 'quotes' },
  { id: 'flameJourney', label: '逐火篇章', description: '关于记忆、爱与共同面对命运的叙事语料', contentKey: 'flameJourneyQuotes' },
  { id: 'university', label: '大学校训', description: '内置常见高校校训，作为本地内容使用', contentKey: 'universityMottos' }
]
</script>

<template>
  <section class="setting-card local-source-panel">
    <div class="setting-card-heading"><FluentIcon icon="document-20-regular" :width="20" /><div><h3>本地内容来源</h3><p>本地内容无需网络，来源可分别启用并参与权重抽取。</p></div></div>
    <div class="quote-source-list">
      <div v-for="source in sources" :key="source.id" class="quote-source-row">
        <FluentIcon icon="document-text-20-regular" :width="20" class="quote-source-icon" />
        <button type="button" class="switch" :class="{ on: draft.quoteLocalSources[source.id]?.enabled }" :aria-pressed="draft.quoteLocalSources[source.id]?.enabled" :aria-label="`启用${source.label}`" @click="draft.quoteLocalSources[source.id].enabled = !draft.quoteLocalSources[source.id].enabled"><i></i></button>
        <div class="quote-source-copy"><strong>{{ source.label }}</strong><small>{{ content[source.contentKey].length }} 条 · {{ source.description }}</small><span class="source-badge">本地 · 已{{ draft.quoteLocalSources[source.id]?.enabled ? '启用' : '停用' }}</span></div>
        <label class="quote-source-weight">权重<input v-model.number="draft.quoteLocalSources[source.id].weight" type="number" min="0" max="9999" /></label>
      </div>
    </div>
  </section>
</template>
