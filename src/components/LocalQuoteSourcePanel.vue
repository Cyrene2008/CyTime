<script setup>
defineProps({
  draft: { type: Object, required: true },
  content: { type: Object, required: true }
})

const emit = defineEmits(['manage'])

const sources = [
  { id: 'daily', label: '日常励志', description: '内置与导入的语录', contentKey: 'quotes', manageable: true },
  { id: 'flameJourney', label: '逐火篇章', description: '逐火篇章精选语录', contentKey: 'flameJourneyQuotes' },
  { id: 'university', label: '大学校训', description: '高校校训集', contentKey: 'universityMottos' }
]
</script>

<template>
  <section class="setting-card local-source-panel">
    <div class="setting-card-heading"><FluentIcon icon="document-20-regular" :width="20" /><div><h3>本地语录</h3><p>可离线使用，分别设置出现比重。</p></div></div>
    <div class="quote-source-list">
      <div v-for="source in sources" :key="source.id" class="quote-source-row">
        <FluentIcon icon="document-text-20-regular" :width="20" class="quote-source-icon" />
        <button type="button" class="switch" :class="{ on: draft.quoteLocalSources[source.id]?.enabled }" :aria-pressed="draft.quoteLocalSources[source.id]?.enabled" :aria-label="`启用${source.label}`" @click="draft.quoteLocalSources[source.id].enabled = !draft.quoteLocalSources[source.id].enabled"><i></i></button>
        <div class="quote-source-copy"><strong>{{ source.label }}</strong><small>{{ content[source.contentKey].length }} 条 · {{ source.description }}</small><span class="source-badge">本地 · 已{{ draft.quoteLocalSources[source.id]?.enabled ? '启用' : '停用' }}</span></div>
        <button v-if="source.manageable" type="button" class="subtle-button quote-manage-button" @click="emit('manage', source.id)">管理语录</button>
        <label class="quote-source-weight">比重<input v-model.number="draft.quoteLocalSources[source.id].weight" type="number" min="0" max="9999" /></label>
      </div>
    </div>
  </section>
</template>
