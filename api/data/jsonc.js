// 轻量 JSONC 解析：支持 // 行注释与 /* 块注释，字符串内注释不会被移除。
export function parseJsonc(text) {
  let result = ''
  let inString = false
  let inLineComment = false
  let inBlockComment = false
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (inLineComment) {
      if (char === '\n') { inLineComment = false; result += char }
      continue
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') { inBlockComment = false; index += 1 }
      continue
    }
    if (inString) {
      result += char
      if (escaped) { escaped = false; continue }
      if (char === '\\') { escaped = true; continue }
      if (char === '"') inString = false
      continue
    }
    if (char === '"') { inString = true; result += char; continue }
    if (char === '/' && next === '/') { inLineComment = true; index += 1; continue }
    if (char === '/' && next === '*') { inBlockComment = true; index += 1; continue }
    result += char
  }
  return JSON.parse(result)
}
