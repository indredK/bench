/**
 * Command parameter placeholders / 命令参数占位符.
 *
 * 卡片命令里的 `{{name}}`（允许 `{{ name }}` 两侧留白）在运行前弹窗填值再替换。
 * 纯函数、可单测；名字白名单字符集避免误吞命令里合法的 `{`/`}`（如 shell brace
 * expansion `cp a{1,2}` 不会被当成占位符）。
 */

const NAME_CHARSET = "[A-Za-z0-9_.-]+"

/** 提取命令里出现的占位符名（去重、保持首次出现顺序）。 */
export function extractParamNames(command: string): string[] {
  const re = new RegExp(`\\{\\{\\s*(${NAME_CHARSET})\\s*\\}\\}`, "g")
  const names: string[] = []
  for (const match of command.matchAll(re)) {
    const name = match[1]
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}

/**
 * 用 values 替换所有占位符。缺失的键原样保留 `{{name}}`（配合上层「全部填满才允许
 * 运行」的门禁，正常流程不会残留；保留原样便于调试，且绝不静默替换成空串）。
 */
export function fillParams(command: string, values: Record<string, string>): string {
  const re = new RegExp(`\\{\\{\\s*(${NAME_CHARSET})\\s*\\}\\}`, "g")
  // 用函数式替换：值里的 `$&`、`$1` 等按字面处理，不会被当作替换模式转义。
  return command.replace(re, (_full, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : `{{${name}}}`,
  )
}
