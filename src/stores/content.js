import { reactive, watch } from 'vue'
import { defineStore } from 'pinia'

const STORAGE_KEY = 'cytime.content.v1'

const flameJourneyQuotes = [
  '但，即便命运确凿不移，无论它要将世界带向何方，只要我们能够共同面对，那就没什么好害怕的，对吧？',
  '逐火的命路——由我们改写！',
  '让「人」向你证明——自「毁灭」的温床中，也能开出温柔的花。',
  '是我们赢了，「真诚」才是永远的捷径。',
  '因为它不再纯粹。跌落也不是意外，是它向命运发起抗争，以破碎书写故事的结局。',
  '我会许愿，从那伤口中流出的，不是鲜血，而是一滴湿润的眼泪。而它会落下，漾开最初的涟漪。那时人们会看见，倒映在涟漪中的，是一切美丽的事物。',
  '因为世界对我温柔，我就长成温柔的模样。',
  '可就算一切随风逝去，有些事也不会轻易改变。',
  '逐火是从不断失却，走向坚定舍却的旅途。',
  '以爱为始的故事，也一定以爱为终♪',
  '水晶花之所以纯粹，是因为它封闭了自己，孤独绽放。才会在有缺的世界中格外耀眼。',
  '同一颗种子，在不同的土壤里，会开出相似而不同的花。但真正让她美丽的，是世界的每一颗心灵。',
  '所以，如果记忆中的风景模糊了，就伸手去触碰它。',
  '就像每一个共读睡前故事的夜晚，抹去岁月的霜，擦亮回忆的轮廓，让它重新成为心灵的力量。',
  '「记忆」就是这样的。在时间的长河里，它可能会磨损，会消散，但它不会离开。当内心的小角落被唤醒，回忆一定会以更美的形式再度浮现。',
  '每一段回忆，都化作涟漪。',
  '下一页是空白呢，那我们一起写下吧？',
  '扔下多余的烦恼，把笑容和决心一起打包，带向明天♪',
  '我听过这么一种说法：神性是「无瑕的人性」，而人性是「有瑕的神性」……',
  '虔诚的叩问会得到同等重量的回应。',
  '只有诗人知道，故事之外，有多少挣扎和痛苦。',
  '文字脱离了作者的手笔，被他人收入眼中的时候，它承载的意义就不受你我掌控啦。',
  '在「智识」的实验里，在「毁灭」的温床中，它是熵增，是冰冷的真理，罪恶的本能……但在「记忆」和「开拓」笔下……',
  '逐火是从不断失却，走向坚定舍却的旅途。是知晓命运的破碎，仍以破碎拥抱命运，一段渴望被爱，更渴望去爱的旅途。',
  '说不定，我的心中也藏着一个阴谋呢…一个能让每个人都收获幸福的阴谋~',
  '把解读的自由留给每一位翻开它的读者…不觉得这是件很浪漫的事吗？至于这段故事在你我眼中的意义，就让我们把它好好放在心底吧……',
  '这世上没有任何一种语言，一行文字，能托得起这段旅途的重量。既然如此，就不必再囿于细微的字眼……',
  '一篇轰轰烈烈的史诗，要多么华美的语句才能勾勒出它的尾声呢？'
]

const universityMottos = [
  { text: 'Veritas - 真理', work: '哈佛大学' },
  { text: 'Freiheit, Wahrheit, Gerechtigkeit - 自由、真理、正义', work: '柏林自由大学' },
  { text: 'Lux et Veritas - 光明与真理', work: '耶鲁大学' },
  { text: 'Mens et Manus - 手脑并用', work: '麻省理工学院' },
  { text: 'Fiat Lux - 要有光', work: '加州大学伯克利分校' },
  { text: 'Dominus Illuminatio Mea - 上主乃吾光', work: '牛津大学' },
  { text: 'Hinc lucem et pocula sacra - 此地乃启蒙之所，智识之源', work: '剑桥大学' },
  { text: 'Dei Sub Numine Viget - 因上帝之力而繁荣', work: '普林斯顿大学' },
  { text: 'Crescat scientia; vita excolatur - 益智厚生', work: '芝加哥大学' },
  { text: 'In lumine Tuo videbimus lumen - 借汝之光，得见光明', work: '哥伦比亚大学' },
  { text: 'Leges sine moribus vanae - 法无德不立', work: '宾夕法尼亚大学' },
  { text: 'I would found an institution where any person can find instruction in any study - 我将创立一所院校，让任何人都能在此找到任何学科的指导', work: '康奈尔大学' },
  { text: 'Eruditio et Religio - 知识与信仰', work: '杜克大学' },
  { text: 'In Deo Speramus - 我们寄希望于上帝', work: '布朗大学' },
  { text: 'Vox clamantis in deserto - 广漠大地上对知识的呼唤', work: '达特茅斯学院' },
  { text: 'Scientia imperii decus et tutamen - 科学知识是帝国的至高荣耀和守护者', work: '帝国理工学院' },
  { text: 'Cuncti adsint meritaeque expectent praemia palmae - 让所有应得奖赏的佼佼者齐聚于此', work: '伦敦大学学院' },
  { text: 'Rerum cognoscere causas - 了解万物发生之缘由', work: '伦敦政治经济学院' },
  { text: 'The Learned Can See Twice - 智者不仅能看见，更能洞察', work: '爱丁堡大学' },
  { text: 'Cognitio, sapientia, humanitas - 知识、睿智、人道', work: '曼彻斯特大学' },
  { text: 'Welcome tomorrow - 欢迎明天', work: '苏黎世联邦理工学院' },
  { text: 'Towards a Global Knowledge Enterprise - 致力成为全球知识企业', work: '新加坡国立大学' },
  { text: 'Duty, Honor, Country - 职责、荣誉、国家', work: '西点军校' },
  { text: 'Freely have you received; freely give - 自由地接受；自由地给予', work: '杜尔大学' },
  { text: 'Sidere mens eadem mutato - 物换星移，心智相通', work: '悉尼大学' },
  { text: 'Velut arbor aevo - 像大树一样茁壮成长', work: '多伦多大学' },
  { text: 'Spes Bona - 美好的希望', work: '开普敦大学' },
  { text: 'Boys, be ambitious - 孩子们，树立远大的理想和抱负吧', work: '北海道大学' },
  { text: 'Above all nations is humanity - 人性超越国界', work: '夏威夷大学' },
  { text: '学问独立，培养模范国民', work: '早稻田大学' },
  { text: '진리와 선 - 真理至善', work: '首尔国立大学' },
  { text: '중정홍익 - 中正弘益', work: '高丽大学' },
  { text: 'Fiat Lux - 要有光', work: '加州大学圣巴巴拉分校' },
  { text: 'Seek Wisdom With Courage - 勇毅追寻智慧', work: '西澳大学' },
  { text: 'Sub Cruce Lumen - 十字之下，智慧之光', work: '阿德莱德大学' },
  { text: 'Lux Sit - 愿光明长存', work: '华盛顿大学（西雅图）' },
  { text: 'Artes, Scientia, Veritas - 艺术、科学、真理', work: '密歇根大学安娜堡分校' },
  { text: 'Learning and Labor - 勤学实干', work: '伊利诺伊大学厄巴纳-香槟分校' },
  { text: 'Learning, Virtue, Piety - 博学、修德、向善', work: '波士顿大学' },
  { text: 'Sapientia Vincit Omnia - 智慧胜过一切', work: '阿姆斯特丹大学' },
  { text: 'Domus Mundi - 世界学府', work: '慕尼黑大学' },
  { text: 'Semper Apertus - 永远开放包容', work: '海德堡大学' },
  { text: 'Post Tenebras Lux - 黑暗散去，光明将至', work: '日内瓦大学' },
  { text: 'Quaecumque Vera - 追寻一切真理', work: '阿尔伯塔大学' },
  { text: 'Deus Scientiarum Dominus - 真理为万物主宰', work: '渥太华大学' },
  { text: 'Strenuis Ardua Cedunt - 勤勉之人，难事皆可攻克', work: '南安普顿大学' },
  { text: 'Scientia Crescat - 学识不断增长', work: '利兹大学' },
  { text: 'Rerum Cognoscere Causas - 探明事物本源', work: '谢菲尔德大学' },
  { text: 'Sapientia Urbs Condita - 智慧构筑城邦', work: '诺丁汉大学' },
  { text: 'Ad utrumque - 兼顾学问与民生', work: '隆德大学' },
  { text: 'Vim promovet insitam - 发掘天赋，成就自我', work: '布里斯托大学' },
  { text: 'A Creative Constellation - 创意群星', work: '伦敦艺术大学' },
  { text: 'Forward - 向前', work: '阿斯顿大学' },
  { text: 'Generatim discite cultus - 按学科种类学习', work: '巴斯大学' },
  { text: 'Gwirionedd Undod A Chytgord - 真理、团结与和谐', work: '卡迪夫大学' },
  { text: 'Post nubes, lux - 告别黑暗，拥抱光明', work: '克兰菲尔德大学' },
  { text: 'Fundamenta eius super montibus sanctis - 巍巍圣岭，乃吾基石', work: '杜伦大学' },
  { text: 'Sancte et sapienter - 圣洁与智慧', work: '伦敦国王学院' },
  { text: 'Esse quam videre - 是而非似', work: '伦敦大学皇家霍洛威学院' },
  { text: 'Lucem sequimur - 我们追随光明', work: '埃克塞特大学' },
  { text: 'Gwybod Medr Iachau - 知识能治愈', work: '威尔士大学医学院' },
  { text: '哲学家们只是用不同的方式解释世界，而问题在于改变世界', work: '柏林洪堡大学' },
  { text: '知识永放光芒', work: '科伦坡大学' },
  { text: '追求真理，服务人类', work: '西安大略大学' },
  { text: '世间万物在上帝的怀抱中和谐如一', work: '麦克马斯特大学' },
  { text: '重要的是弄清事物的本质', work: '澳大利亚国立大学' },
  { text: 'Veritas vos liberabit - 真理必叫你们得以自由', work: '加州理工学院' },
  { text: 'Via, Veritas, Vita - 道路、真理、生命', work: '格拉斯哥大学' },
  { text: 'Mens Agitat Molem - 思想驱动一切物质', work: '华威大学' },
  { text: 'Per Ardua Ad Alta - 历经艰难，攀登高峰', work: '伯明翰大学' },
  { text: '自强不息，厚德载物', work: '清华大学' },
  { text: '爱国、进步、民主、科学', work: '北京大学' },
  { text: '博学而笃志，切问而近思', work: '复旦大学' },
  { text: '饮水思源，爱国荣校', work: '上海交通大学' },
  { text: '求是创新', work: '浙江大学' },
  { text: '诚朴雄伟，励学敦行', work: '南京大学' },
  { text: '红专并进，理实交融', work: '中国科学技术大学' },
  { text: '自强弘毅，求是拓新', work: '武汉大学' },
  { text: '实事求是', work: '天津大学' },
  { text: '气有浩然，学无止境', work: '山东大学' },
  { text: '学为人师，行为世范', work: '北京师范大学' },
  { text: '止于至善', work: '东南大学' },
  { text: '忠信笃敬', work: '暨南大学' },
  { text: '严谨求实，团结创新', work: '同济大学' },
  { text: '允公允能，日新月异', work: '南开大学' },
  { text: '规格严格，功夫到家', work: '哈尔滨工业大学' },
  { text: '自强不息，止于至善', work: '厦门大学' },
  { text: '博学审问慎思明辨笃行', work: '中山大学' },
  { text: '实事求是', work: '中国人民大学' },
  { text: '团结勤奋，求实创新', work: '北京理工大学' },
  { text: '兼容并蓄，博学笃行', work: '北京外国语大学' },
  { text: '奉献求实', work: '国防科学技术大学' },
  { text: '敦品励学，爱国爱人', work: '台湾大学' },
  { text: '开物成务，励学利民', work: '香港理工大学' },
  { text: '博文约礼', work: '香港中文大学' },
  { text: '敬业乐群', work: '香港城市大学' },
  { text: '精勤求学，敦笃励志，果毅力行，忠恕任事', work: '西安交通大学' },
  { text: '解民生之多艰，育天下之英才', work: '中国农业大学' },
  { text: '海纳百川，有容乃大', work: '四川大学' },
  { text: '自强不息，知行合一', work: '东北大学' },
  { text: '养天地正气，法古今完人', work: '苏州大学' },
  { text: '明德格物', work: '香港大学' },
  { text: '博学笃行，与时俱进', work: '广东外语外贸大学' },
  { text: '勤奋严谨，求实创新', work: '华东师范大学' },
  { text: '诚毅勤朴', work: '厦门大学（早期校训）' },
  { text: '明德新民，止于至善', work: '河南大学' },
  { text: '博学慎思，明辨笃行', work: '南京大学（历史校训或部分院系）' },
  { text: '博学笃行，自强不息', work: '华南理工大学' },
  { text: '实事求是，艰苦奋斗', work: '延安大学' },
  { text: '明德尚学，求是创新', work: '南京航空航天大学' },
  { text: '厚德博学，追求卓越', work: '武汉理工大学' },
  { text: '崇德尚学，求是创新', work: '长安大学' },
  { text: '博学笃行，盛德日新', work: '中南大学' },
  { text: '知行合一，经世致用', work: '湖南大学' },
  { text: '勤奋求实，艰苦创业', work: '大连理工大学' },
  { text: '严谨治学，严格教学', work: '西安电子科技大学' },
  { text: '团结、勤奋、求实、创新', work: '北京航空航天大学' },
  { text: '厚德博学，止于至善', work: '郑州大学' },
  { text: '勤奋、严谨、求实、创新', work: '中国科学院大学' }
]

const defaultContent = {
  importantDays: [
    { id: 'gaokao-2027', name: '2027 高考', date: '2027-06-07', recurring: false }
  ],
  quotes: [
    '因为有悔，所以披星戴月；因为有梦，所以奋不顾身。',
    '凡是过去，皆为序章；把握现在，才有未来。',
    '每一个不曾起舞的日子，都是对生命的辜负。',
    '慢慢来，比较快。把今天能做的事做好。',
    '学如逆水行舟，不进则退。',
    '不积跬步，无以至千里；不积小流，无以成江海。',
    '宝剑锋从磨砺出，梅花香自苦寒来。',
    '路虽远，行则将至；事虽难，做则必成。',
    '盛年不重来，一日难再晨。及时当勉励，岁月不待人。',
    '纸上得来终觉浅，绝知此事要躬行。',
    '黑发不知勤学早，白首方悔读书迟。',
    '志之所趋，无远弗届；穷山距海，不能限也。',
    '不经一番寒彻骨，怎得梅花扑鼻香。',
    '长风破浪会有时，直挂云帆济沧海。',
    '千淘万漉虽辛苦，吹尽狂沙始到金。',
    '山重水复疑无路，柳暗花明又一村。',
    '合抱之木，生于毫末；九层之台，起于累土。',
    '知不足，然后能自反也；知困，然后能自强也。',
    '博观而约取，厚积而薄发。',
    '凡事预则立，不预则废。',
    '锲而不舍，金石可镂。'
  ],
  quoteMetadata: {
    '凡是过去，皆为序章；把握现在，才有未来。': { work: '《暴风雨》' },
    '每一个不曾起舞的日子，都是对生命的辜负。': { author: '尼采' },
    '学如逆水行舟，不进则退。': { work: '《增广贤文》' },
    '不积跬步，无以至千里；不积小流，无以成江海。': { author: '荀子', work: '《劝学》' },
    '路虽远，行则将至；事虽难，做则必成。': { author: '荀子', work: '《修身》' },
    '盛年不重来，一日难再晨。及时当勉励，岁月不待人。': { author: '陶渊明', work: '《杂诗》' },
    '纸上得来终觉浅，绝知此事要躬行。': { author: '陆游', work: '《冬夜读书示子聿》' },
    '黑发不知勤学早，白首方悔读书迟。': { author: '颜真卿', work: '《劝学诗》' },
    '锲而不舍，金石可镂。': { author: '荀子', work: '《劝学》' }
  },
  flameJourneyQuotes,
  universityMottos,
  schedule: [],
  homework: []
}

function readContent() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    const universityMottos = defaultContent.universityMottos
    return {
      importantDays: Array.isArray(saved.importantDays) ? saved.importantDays : [...defaultContent.importantDays],
      quotes: Array.isArray(saved.quotes) && saved.quotes.length ? saved.quotes : [...defaultContent.quotes],
      quoteMetadata: { ...defaultContent.quoteMetadata, ...(saved.quoteMetadata && typeof saved.quoteMetadata === 'object' ? saved.quoteMetadata : {}) },
      flameJourneyQuotes: Array.isArray(saved.flameJourneyQuotes) && saved.flameJourneyQuotes.length ? saved.flameJourneyQuotes : [...defaultContent.flameJourneyQuotes],
      universityMottos,
      schedule: Array.isArray(saved.schedule) ? saved.schedule : [],
      homework: Array.isArray(saved.homework) ? saved.homework : []
    }
  } catch {
    return structuredClone(defaultContent)
  }
}

const id = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

export const useContentStore = defineStore('content', () => {
  const content = reactive(readContent())

  function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(content)) }
  function addImportantDay(name, date, recurring = false) {
    if (!name || !date) return
    content.importantDays.push({ id: id('day'), name, date, recurring })
    persist()
  }
  function removeImportantDay(item) {
    content.importantDays = content.importantDays.filter(day => day.id !== item.id)
    persist()
  }
  function addQuote(value, metadata = {}) {
    const quote = String(typeof value === 'object' ? value?.text : value || '').trim()
    if (!quote || content.quotes.includes(quote)) return
    content.quotes.push(quote)
    if (metadata.author || metadata.work) content.quoteMetadata[quote] = { author: metadata.author || '', work: metadata.work || '' }
    persist()
  }
  function addQuotes(values) {
    values.filter(Boolean).forEach(value => {
      const quote = typeof value === 'object' ? String(value.text || '').trim() : String(value).trim()
      if (!quote || content.quotes.includes(quote)) return
      content.quotes.push(quote)
      if (value.author || value.work) content.quoteMetadata[quote] = { author: value.author || '', work: value.work || '' }
    })
    persist()
  }
  function removeQuote(quote) {
    if (content.quotes.length <= 1) return
    content.quotes = content.quotes.filter(item => item !== quote)
    delete content.quoteMetadata[quote]
    persist()
  }
  function addLesson(lesson) {
    content.schedule.push({ id: id('lesson'), ...lesson })
    persist()
  }
  function updateLesson(lesson, patch) {
    Object.assign(lesson, patch)
    persist()
  }
  function removeLesson(lesson) {
    content.schedule = content.schedule.filter(item => item.id !== lesson.id)
    persist()
  }
  function addHomework(item) {
    if (!item.content?.trim()) return
    content.homework.push({ id: id('homework'), subject: item.subject || '其他', content: item.content.trim(), dueAt: item.dueAt || '', completed: false, createdAt: Date.now() })
    persist()
  }
  function updateHomework(item, patch) {
    if (!patch.content?.trim()) return
    Object.assign(item, { subject: patch.subject || '其他', content: patch.content.trim() })
    persist()
  }
  function removeHomework(item) {
    content.homework = content.homework.filter(entry => entry.id !== item.id)
    persist()
  }

  watch(content, persist, { deep: true })
  return { content, addImportantDay, removeImportantDay, addQuote, addQuotes, removeQuote, addLesson, updateLesson, removeLesson, addHomework, updateHomework, removeHomework }
})
