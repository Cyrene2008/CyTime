<script setup>
import { onMounted, ref } from 'vue'
import { COPYRIGHT, FILING_NAME, FILING_URL } from '../../src/config/branding.js'

const quote = ref(null)
const state = ref('loading')
const version = __APP_VERSION__
const buildId = __BUILD_ID__

async function refresh() {
  state.value = 'loading'
  try {
    const response = await fetch('/api/v1/quote?format=json', { cache: 'no-store' })
    if (!response.ok) throw new Error(String(response.status))
    quote.value = await response.json()
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}

onMounted(refresh)
</script>

<template>
  <main class="landing">
    <header class="landing-brand">
      <span class="landing-mark"><FluentIcon icon="book-open-20-regular" :width="24" /></span>
      <div>
        <h1>CyQuote 昔言</h1>
        <p>内容安全的语录库</p>
      </div>
    </header>
    <p class="landing-lead">由 Cyrene2008 维护，逐条筛选；把值得被认真对待的文字，带进课堂与自习时光。点击卡片即可换一句。</p>

    <FluentCard class="landing-quote" role="button" tabindex="0" @click="refresh" @keydown.enter="refresh" @keydown.space.prevent="refresh">
      <template v-if="state === 'ready' && quote">
        <p class="landing-quote-text">{{ quote.value }}</p>
        <div class="landing-quote-meta">
          <span>{{ [quote.author, quote.from].filter(Boolean).join(' · ') }}</span>
          <span>{{ (quote.category || []).join(' / ') }}</span>
        </div>
        <p class="landing-quote-hint">♪ 点击换一句</p>
      </template>
      <template v-else-if="state === 'error'">
        <p class="landing-quote-text">暂时无法获取语录，请稍后再试。</p>
        <p class="landing-quote-hint">点击重试</p>
      </template>
      <p v-else class="landing-quote-text">正在获取语录…</p>
    </FluentCard>

    <nav class="landing-actions" aria-label="相关链接">
      <FluentHyperlinkButton class="landing-action" href="https://time.cyrene.hk/" target="_blank"><FluentIcon icon="clock-20-regular" :width="17" /><span>返回时钟</span></FluentHyperlinkButton>
      <FluentHyperlinkButton class="landing-action" href="https://github.com/Cyrene2008/CyTime" target="_blank"><FluentIcon icon="code-20-regular" :width="17" /><span>前往仓库</span></FluentHyperlinkButton>
      <FluentHyperlinkButton class="landing-action" href="https://cyrene.hk" target="_blank"><FluentIcon icon="person-20-regular" :width="17" /><span>作者首页</span></FluentHyperlinkButton>
      <FluentHyperlinkButton class="landing-action" href="https://star.cyrene.hk" target="_blank"><FluentIcon icon="people-community-20-regular" :width="17" /><span>组织首页</span></FluentHyperlinkButton>
    </nav>

    <h2 class="landing-heading">如何调用</h2>
    <div class="landing-code">
      <pre>GET https://time.cyrene.hk/api/v1/quote?format=json
GET https://time.cyrene.hk/api/v1/quote?format=json&amp;category=崩铁
GET https://time.cyrene.hk/api/v1/quote?format=json&amp;category=崩铁,原神
GET https://time.cyrene.hk/api/v1/quote/categories</pre>
      <pre>{
  "value": "……",
  "author": "CyTime",
  "from": "逐火篇章",
  "category": ["崩铁"],
  "source": "CyQuote"
}</pre>
    </div>

    <footer class="landing-footer">
      <p>CyQuote 昔言 · v{{ version }}<span v-if="buildId"> (build {{ buildId }})</span> · {{ COPYRIGHT }}</p>
      <p v-if="FILING_NAME"><a :href="FILING_URL" target="_blank" rel="noreferrer">{{ FILING_NAME }}</a></p>
    </footer>
  </main>
</template>
