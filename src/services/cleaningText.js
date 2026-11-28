import { checkRules, dayNames, job, weekOrder } from './cleaningRules.js'

const tasks = ['扫地', '拖地', '擦黑板', '抹', '擦桌子', '抹桌子', '擦窗户', '擦窗', '倒垃圾', '清空垃圾桶', '整理讲台', '擦讲台', '摆桌椅', '整理桌椅', '扫走廊', '拖走廊', '浇花', '清洗拖把']
const dayToken = '[一二三四五六日天1-7]'
const dayPrefix = '(?:星期|礼拜|周)?'
const digit = '零一二三四五六七八九'
const example = '周一至周五晚上：扫地2人，拖地1人（仅男生）'

function dayNumber(value) {
  if (/^[1-7]$/.test(value)) return Number(value) % 7
  return dayNames.indexOf(value === '天' ? '日' : value)
}

function parseDays(text) {
  if (['每天', '每日', '天天'].includes(text)) return [...weekOrder]
  if (['工作日', '每个工作日'].includes(text)) return weekOrder.slice(0, 5)
  if (['周末', '每周末', '双休日'].includes(text)) return [6, 0]
  const result = new Set()
  const fragments = text.replace(/^每(?=周|星期|礼拜)/, '').split(/[、和及,]/u)
  for (const part of fragments) {
    const m = part.match(new RegExp('^' + dayPrefix + '(' + dayToken + ')(?:[到至~～-]' + dayPrefix + '(' + dayToken + '))?$'))
    if (!m) throw new Error(`未识别星期「${text}」。可写“工作日”或“周一、周三”。`)
    const last = dayNumber(m[2] || m[1])
    for (let d = dayNumber(m[1]); ; d = (d + 1) % 7) {
      result.add(d)
      if (d === last) break
    }
  }
  return weekOrder.filter(d => result.has(d))
}

function people(value) {
  const s = value.replace(/两/g, '二')
  if (/^\d+$/.test(s)) return Number(s)
  if (s.length === 1 && digit.includes(s)) return digit.indexOf(s)
  const m = s.match(/^([一二三四五六七八九]?)十([一二三四五六七八九]?)$/)
  if (m) return (m[1] ? digit.indexOf(m[1]) : 1) * 10 + (m[2] ? digit.indexOf(m[2]) : 0)
  throw new Error(`未识别人数「${value}」`)
}

function parseJob(text) {
  // Bring common spoken placement of the eligibility qualifier into the same grammar.
  const token = text.replace(/^([0-9零一二两三四五六七八九十]+)(?:名|个)?(男生|女生)(.+)$/, '$1人$3($2)')
    .replace(/^(男生|女生)(?:负责)?(.+)$/, '$2($1)')
    .replace(/由(男生|女生)(?:负责)?$/, '($1)')
  const match = token.match(/^(.*?)(?:\((?:仅限|仅|限)?(男生|女生|男|女|不限)\))?$/)
  const number = '([0-9零一二两三四五六七八九十]+)'
  const name = '(' + tasks.join('|') + ')'
  const before = match[1].match(new RegExp('^' + number + '(?:个|名)?人?' + name + '$'))
  const after = match[1].match(new RegExp('^' + name + number + '(?:个|名)?人?$'))
  if (!before && !after) throw new Error(`未能确定「${text}」的岗位和人数。可写“扫地2人”；自定义岗位可在表单中添加。`)
  const gender = match[2]?.startsWith('男') ? 'male' : match[2]?.startsWith('女') ? 'female' : 'any'
  return job(before ? before[2] : after[1], people(before ? before[1] : after[2]), gender)
}

export function parseCleaningText(input) {
  const rules = []
  const limits = []
  const text = String(input || '').normalize('NFKC').replace(/[ \t]+/g, '')
    .replace(/,(?=(?:每天|每日|工作日|周末|每?周[一二三四五六日天][上下早晚中]|[男女]生不))/g, '\n')
  for (const line of text.split(/[\r\n;。]+/).filter(Boolean)) {
    if (/^(?:做完|值日后|清洁后)?休息(?:六|6)(?:个自然日|天)$/.test(line)) continue
    const limit = line.match(/^(男生|女生)(?:不负责|不安排|不做|不)(.+)$/)
    if (limit) {
      for (const raw of limit[2].replace(/也不/g, '、不').split(/[,、和及]/)) {
        const name = raw.replace(/^(?:不负责|不做|不)/, '')
        if (!tasks.includes(name)) throw new Error(`未识别限制中的岗位「${name}」`)
        limits.push({ name, gender: limit[1] === '女生' ? 'male' : 'female' })
      }
      continue
    }
    const m = line.match(/^(.+?)(早上|早晨|上午|中午|下午|傍晚|晚间|晚上)(?:大扫除|日常清洁|清洁)?[:：]?(?:额外|再)?(?:安排|加排)?(.+)$/)
    if (!m) throw new Error(`未能完整识别「${line}」。例如“${example}”。所有班次共用六天休息期。`)
    const time = ({ 早晨: '早上', 傍晚: '晚上', 晚间: '晚上' })[m[2]] || m[2]
    // Expand “扫地、拖地各两人” only when the complete group is unambiguous.
    const grouped = new RegExp('((?:' + tasks.join('|') + ')(?:[、和及](?:' + tasks.join('|') + '))+)' +
      '各([0-9零一二两三四五六七八九十]+(?:个|名)?人(?:\\((?:仅限|仅|限)?(?:男生|女生|男|女|不限)\\))?)', 'g')
    const expanded = m[3].replace(grouped, (_, list, count) => list.split(/[、和及]/).map(name => name + count).join(','))
    const jobs = expanded.split(/[,、和及]/).map(parseJob)
    rules.push({ title: '', days: parseDays(m[1]), time, jobs })
  }
  for (const limit of limits) {
    const matches = rules.flatMap(rule => rule.jobs).filter(role => role.name === limit.name)
    if (!matches.length) throw new Error(`限制中提到「${limit.name}」，请先写出对应班次和人数`)
    for (const role of matches) {
      if (role.gender !== 'any' && role.gender !== limit.gender) throw new Error(`「${role.name}」的参与范围冲突`)
      role.gender = limit.gender
    }
  }
  checkRules(rules)
  return rules
}
