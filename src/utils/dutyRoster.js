import { parseCsvRows, serializeCsv } from './csv.js'

const CSV_HEADERS = ['名单名称', '名单ID', '中文名', '英文名', '性别', '小组名称', '小组英文名', '小组ID', '人员UUID', '白名单']

function decodeRoster(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { return new TextDecoder('gb18030', { fatal: true }).decode(bytes) }
}

function baseName(name) {
  return String(name || '值日名单').replace(/\.[^.]+$/, '') || '值日名单'
}

function extensionOf(name) {
  return String(name || '').split('.').pop()?.toLowerCase() || ''
}

export function normalizeGender(value) {
  const text = String(value || '').normalize('NFKC').trim().toLowerCase()
  if (['女', '女生', 'female', 'f', 'girl'].includes(text)) return 'female'
  if (['男', '男生', 'male', 'm', 'boy'].includes(text)) return 'male'
  return ''
}

function normalizeHeader(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase().replace(/[\s_-]+/g, '')
}

const NAME_KEYS = ['中文名', '姓名', '学生姓名', '学生名字', '学生名称', '学生', '學生姓名', '學生名字', '姓名(中文)', 'fullname', 'studentname', '名字', '名称', 'chinesename', 'studentfullname', 'pupilname', 'name', 'cn']
const EN_KEYS = ['英文名', '英文', 'englishname', 'en', 'english', 'ename']
const GENDER_KEYS = ['性别', '学生性别', '性别(男女)', '性别(男/女)', '性別', '學生性別', 'studentgender', 'gender', 'sex']
const LISTNAME_KEYS = ['名单名称', '名单名', 'listname', '班级', '班级名称', '班級', '班級名稱', 'classname', 'class']

function findColumn(headers, keys) {
  for (const key of keys) {
    const index = headers.indexOf(key)
    if (index >= 0) return index
  }
  return -1
}

function headerAt(rows) {
  return rows.findIndex(row => {
    const keys = row.map(normalizeHeader)
    return findColumn(keys, NAME_KEYS) >= 0 && findColumn(keys, GENDER_KEYS) >= 0
  })
}

function looksLikePairs(rows) {
  return rows.length && rows.every(row => row.length === 2) && rows.some(row => normalizeGender(row[1]))
}

// Some class lists put names under two gender headings, with uneven column lengths.
function splitGenderHeader(row) {
  const headings = row.map(normalizeHeader)
  const male = headings.findIndex(h => ['男生', '男生姓名', '男生名单'].includes(h))
  const female = headings.findIndex(h => ['女生', '女生姓名', '女生名单'].includes(h))
  return male >= 0 && female >= 0 && headings.every((h, i) => !h || i === male || i === female || h === '序号')
    ? { male, female } : null
}

function splitGenderMembers(rows, index, listName) {
  const columns = splitGenderHeader(rows[index])
  const members = []
  const seen = new Set()
  for (const row of rows.slice(index + 1)) {
    if (splitGenderHeader(row)) continue
    for (const [gender, col] of Object.entries(columns)) {
      const name = String(row[col] ?? '').trim()
      if (!name || /^(?:合计|总计)(?:[：:\s]*\d+人?)?$/.test(name)) continue
      if (seen.has(name)) throw new Error(`第 ${row.sourceRow} 行出现重名「${name}」。请在姓名后加学号，或使用姓名、性别、学号三列。`)
      seen.add(name)
      members.push({ name, enName: '', gender })
    }
  }
  if (!members.length) throw new Error('名单中没有可导入的人员')
  return { name: listName, members }
}

function mappingChoice(rows, columns, firstData, sheetName, hint) {
  const dataIndex = rows.findIndex(row => row.sourceRow >= firstData)
  const sample = rows.slice(Math.max(0, dataIndex - 2), Math.max(0, dataIndex - 2) + 8)
  const used = new Set()
  for (const row of rows) row.forEach((value, i) => { if (value !== '') used.add(i) })
  return { choice: {
    kind: 'columns', sheetName, hint, columns, firstData, used: [...used].sort((a, b) => a - b),
    sample: sample.map(row => ({ number: row.sourceRow, cells: Object.fromEntries(
      Object.keys(row).filter(key => /^\d+$/.test(key) && row[key] !== '').map(key => [key, String(row[key]).slice(0, 80)])
    ) }))
  } }
}

function rowsToMembers(all, listName, requireComplete, options = {}) {
  const rows = all.filter(row => row.some(value => String(value ?? '').trim()))
  if (!rows.length) throw new Error('名单内容为空')
  const header = headerAt(rows)
  if (header < 0 && options.interactive && !options.mapping) {
    const split = rows.findIndex(row => splitGenderHeader(row))
    if (split >= 0) return splitGenderMembers(rows, split, listName)
  }
  const h = header < 0 ? 0 : header
  const first = rows[h].map(normalizeHeader)
  const nameIndex = findColumn(first, NAME_KEYS)
  const genderIndex = findColumn(first, GENDER_KEYS)
  const hasHeader = nameIndex >= 0 || genderIndex >= 0 || findColumn(first, EN_KEYS) >= 0
  const pairs = !hasHeader && looksLikePairs(rows)
  let columns = hasHeader ? { name: nameIndex, en: findColumn(first, EN_KEYS), gender: genderIndex, listName: findColumn(first, LISTNAME_KEYS) }
    : { name: 0, en: pairs ? -1 : 1, gender: pairs ? 1 : 2, listName: -1 }
  let dataRows = hasHeader ? rows.slice(h + 1) : rows
  const firstData = dataRows[0]?.sourceRow ?? 1
  const ask = hint => mappingChoice(rows, columns, firstData, options.sheetName || '', hint)
  const mapping = options.mapping
  const duplicate = [NAME_KEYS, GENDER_KEYS].some(keys => first.filter(header => keys.includes(header)).length > 1)
  if (mapping) {
    const { name, gender, extra, start } = mapping
    if (![name, gender].every(n => Number.isInteger(n) && n >= 0) || name === gender ||
      (extra >= 0 && (extra === name || extra === gender)) || !Number.isInteger(start) || start < 1) throw new Error('请检查首行和所选列，每个用途需要不同的列')
    if (Boolean(mapping.male) !== Boolean(mapping.female) || (mapping.male && mapping.male === mapping.female)) throw new Error('自定义性别值需同时填写，且两者应不同')
    columns = { ...columns, name, gender }
    dataRows = rows.filter(row => row.sourceRow >= start)
  } else if (requireComplete) {
    if (options.interactive && (duplicate || (!pairs && (nameIndex < 0 || genderIndex < 0)))) {
      return ask('请确认表格中的姓名列、性别列和第一位同学所在行。')
    }
    if (hasHeader && nameIndex < 0) throw new Error('名单表头缺少姓名列（中文名/姓名）')
    if (hasHeader && genderIndex < 0) throw new Error('清洁名单表头缺少性别列')
    if (duplicate) throw new Error('姓名或性别表头重复，请保留一列')
  }
  if (hasHeader && columns.name < 0) throw new Error('名单表头缺少姓名列')
  if (requireComplete && columns.listName >= 0) {
    const people = dataRows.filter(row => row[columns.name] && !NAME_KEYS.includes(normalizeHeader(row[columns.name])))
    const classes = [...new Set(people.map(row => String(row[columns.listName] ?? '').trim()).filter(Boolean))]
    if (classes.length > 1) {
      if (people.some(row => !String(row[columns.listName] ?? '').trim() && String(row[columns.gender] ?? '').trim())) {
        throw new Error('同一张表含多个班级，部分同学缺少班级名称，请补全')
      }
      if (options.className && classes.includes(options.className)) {
        dataRows = dataRows.filter(row => String(row[columns.listName] ?? '').trim() === options.className)
      } else if (options.interactive) {
        return { choice: { kind: 'class', classes, sheetName: options.sheetName || '' } }
      } else throw new Error('文件中有多个名单名称，请为当前班级单独导入')
    }
  }
  const members = []
  const names = new Set()
  let name = ''
  for (const row of dataRows) {
    let cn = String(row[columns.name] ?? '').trim()
    const raw = String(row[columns.gender] ?? '').trim()
    if (hasHeader && NAME_KEYS.includes(normalizeHeader(cn)) && GENDER_KEYS.includes(normalizeHeader(raw))) continue
    if (!raw && /^(?:合计|总计)(?:[：:\s]*\d+人?)?$/.test(cn)) continue
    if (!cn) {
      if (requireComplete && row.some((value, i) => i !== columns.listName && String(value ?? '').trim())) {
        throw new Error(`第 ${row.sourceRow} 行缺少姓名，请补全后再导入`)
      }
      continue
    }
    const fromRow = String(row[columns.listName] ?? '').trim()
    if (requireComplete && name && fromRow && name !== fromRow) throw new Error('文件中有多个名单名称，请为当前班级单独导入')
    if (!name) name = fromRow
    if (mapping?.extra >= 0) {
      const id = String(row[mapping.extra] ?? '').trim()
      if (!id) throw new Error(`第 ${row.sourceRow} 行的区分列为空`)
      cn += `（${id}）`
    }
    let gender = normalizeGender(raw)
    if (mapping?.male) gender = raw === mapping.male ? 'male' : raw === mapping.female ? 'female' : ''
    if (mapping && !gender) throw new Error(`第 ${row.sourceRow} 行的性别值「${raw}」与所选格式不符，请核对。`)
    if (options.interactive && !mapping && (!gender || names.has(cn))) {
      return ask(!gender ? `第 ${row.sourceRow} 行的性别值需要确认。可填写表中代表男、女的原始值。` : `发现重名「${cn}」。可选学号等稳定的区分列。`)
    }
    names.add(cn)
    members.push({ name: cn, enName: columns.en >= 0 ? String(row[columns.en] ?? '').trim() : '', gender })
  }
  if (!members.length) throw new Error('名单中没有可导入的人员')
  return { name: name || listName || '导入名单', members }
}

function jsonToRoster(value, fallback, requireComplete) {
  const list = Array.isArray(value) ? { name: fallback, names: value } : value
  const rows = Array.isArray(list?.names) ? list.names : Array.isArray(list?.members) ? list.members : Array.isArray(list) ? list : null
  if (!rows) throw new Error('JSON 中未识别到人员名单')
  const members = rows.map((row, index) => {
    if (typeof row === 'string') return row.trim() ? { name: row.trim(), enName: '', gender: '' } : null
    if (!row || typeof row !== 'object') {
      if (requireComplete && row != null) throw new Error(`第 ${index + 1} 条人员记录格式有误`)
      return null
    }
    const cn = String(row.cn ?? row.name ?? row.中文名 ?? row.姓名 ?? '').trim()
    if (!cn) {
      if (requireComplete && (row.gender || row.sex || row.性别)) throw new Error(`第 ${index + 1} 条人员记录缺少姓名`)
      return null
    }
    return {
      name: cn,
      enName: String(row.en ?? row.enName ?? row.英文名 ?? row.english ?? '').trim(),
      gender: normalizeGender(row.gender ?? row.sex ?? row.性别)
    }
  }).filter(Boolean)
  if (!members.length) throw new Error('JSON 名单中没有可导入的人员')
  return { name: String(list.name || fallback), members }
}

function parseRosterText(text, name, requireComplete, options, extension) {
  const normalized = String(text || '').replace(/^\uFEFF/, '').trim()
  if (!normalized) throw new Error('文件内容为空')
  if (normalized.startsWith('{') || normalized.startsWith('[')) {
    return jsonToRoster(JSON.parse(normalized), name, requireComplete)
  }
  // Excel may include a separator directive. Preserve quoted commas and tabs inside cells.
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/)
  const directive = lines[0].match(/^sep=([,;\t])$/i)
  const data = directive ? lines.slice(1).join('\n') : lines.join('\n')
  let delimiter = directive?.[1] || (extension === 'tsv' ? '\t' : ',')
  if (!directive && extension !== 'tsv') {
    const firstLines = lines.slice(0, 20)
    // Prefer an identifiable header, including one below a title.
    const candidates = [',', '\t', ';'].map(sep => {
      let rows = []
      try { rows = parseCsvRows(firstLines.join('\n'), sep) } catch { /* The sample may end inside a quoted cell. */ }
      const widths = new Map()
      for (const row of rows) if (row.length > 1) widths.set(row.length, (widths.get(row.length) || 0) + 1)
      return { sep, header: headerAt(rows) >= 0 || rows.some(splitGenderHeader), pairs: rows.some(row => looksLikePairs([row])), consistent: Math.max(0, ...widths.values()) }
    })
    candidates.sort((a, b) => Number(b.header) - Number(a.header) || Number(b.pairs) - Number(a.pairs) || b.consistent - a.consistent)
    delimiter = candidates[0].sep
  }
  const rows = parseCsvRows(data, delimiter, true)
  rows.forEach((row, i) => { row.sourceRow = i + 1 + Number(Boolean(directive)) })
  return rowsToMembers(rows, name, requireComplete, options)
}

export const workbookFile = name => /\.(xlsx|xls|xlsm|xlsb|ods)$/i.test(name)

// Read populated cells only. A formatting-only used range can span a whole worksheet.
function sheetRows(sheet, XLSX) {
  const rows = new Map()
  for (const address of Object.keys(sheet || {})) {
    if (address.startsWith('!')) continue
    const cell = sheet[address]
    if (cell.v == null || cell.v === '') continue
    const { r, c } = XLSX.utils.decode_cell(address)
    const row = rows.get(r) || []
    row.sourceRow = r + 1
    row[c] = XLSX.utils.format_cell(cell)
    rows.set(r, row)
  }
  const sorted = [...rows.values()].sort((a, b) => a.sourceRow - b.sourceRow)
  const h = headerAt(sorted)
  const classCol = h < 0 ? -1 : findColumn(sorted[h].map(normalizeHeader), LISTNAME_KEYS)
  // A vertically merged class cell applies only to its explicitly merged rows.
  const merges = (sheet?.['!merges'] || []).filter(m => m.s.c === classCol && m.e.c === classCol && m.e.r > m.s.r).sort((a,b) => a.s.r - b.s.r)
  let index = 0
  for (const row of sorted) {
    const r = row.sourceRow - 1
    while (index < merges.length && merges[index].e.r < r) index++
    const merge = merges[index]
    if (merge && r > merge.s.r && !row[classCol]) row[classCol] = rows.get(merge.s.r)?.[classCol] || ''
  }
  return sorted
}

export async function parseRosterFile(name, input, options = {}) {
  const { requireComplete = false, interactive = false } = options
  const extension = extensionOf(name)
  const bytes = input instanceof Uint8Array ? input : input instanceof ArrayBuffer ? new Uint8Array(input) : null
  if (workbookFile(name)) {
    if (!bytes) throw new Error('工作簿读取失败')
    const XLSX = await import('xlsx')
    const read = extra => XLSX.read(bytes, { type: 'array', cellDates: false, ...extra })
    const names = read({ bookSheets: true }).SheetNames
    if (!names.length) throw new Error('工作簿中没有工作表')
    let sheetName = options.sheetName || names[0]
    if (interactive && !options.sheetName && names.length > 1) {
      const sample = read({ sheetRows: 40 })
      const visible = names.filter((n, i) => !sample.Workbook?.Sheets?.[i]?.Hidden)
      if (!visible.length) throw new Error('工作簿中没有可见工作表')
      const candidates = visible.filter(n => {
        const rows = sheetRows(sample.Sheets[n], XLSX)
        return headerAt(rows) >= 0 || looksLikePairs(rows) || rows.some(splitGenderHeader)
      })
      if (visible.length === 1) sheetName = visible[0]
      else if (candidates.length === 1 && visible.every(n => n === candidates[0] || /^(?:封面|说明|使用说明|填表说明|目录|cover|instructions)$/i.test(n))) sheetName = candidates[0]
      else return { choice: { kind: 'sheet', sheets: visible, sheetName: candidates[0] || visible[0] } }
    }
    if (!names.includes(sheetName)) throw new Error('所选工作表不存在')
    const workbook = read({ sheets: names.indexOf(sheetName) })
    return rowsToMembers(sheetRows(workbook.Sheets[sheetName], XLSX), baseName(name), requireComplete, { ...options, sheetName })
  }
  const text = bytes ? decodeRoster(bytes) : String(input ?? '')
  return parseRosterText(text, baseName(name), requireComplete, options, extension)
}

export function serializeRosterFile(members, format = 'csv', listName = '值日名单') {
  if (format === 'json') {
    return JSON.stringify({
      name: listName,
      groups: [],
      names: members.map(member => ({
        id: member.uuid || '',
        cn: member.name,
        en: member.enName || '',
        gender: normalizeGender(member.gender),
        groupId: '',
        isWhiteList: false
      }))
    }, null, 2)
  }
  const rows = [CSV_HEADERS]
  for (const member of members) {
    rows.push([listName, '', member.name, member.enName || '', member.gender === 'female' ? '女' : member.gender === 'male' ? '男' : '', '', '', '', member.uuid || '', ''])
  }
  return serializeCsv(rows)
}

let collator
function pinyinCollator() {
  if (!collator) {
    try { collator = new Intl.Collator('zh-Hans-u-co-pinyin') } catch { collator = new Intl.Collator('zh') }
  }
  return collator
}

export function sortMembersPinyin(members) {
  const compare = pinyinCollator()
  return [...members].sort((a, b) => compare.compare(a.name, b.name) || a.name.localeCompare(b.name))
}
