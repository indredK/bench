/**
 * DevtoolsPanel / 开发工具子面板: JSON / Base64 / Hash / UUID / 时间戳 / 正则测试.
 *
 * 从 page.tsx 拆出（planned#9），只负责渲染，所有状态与动作走传入的 controller。
 */
import { useTranslation } from "react-i18next"
import { SettingGroup } from "@/components/ui/setting-group"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  MAX_REGEX_INPUT_LENGTH,
  MAX_REGEX_PATTERN_LENGTH,
} from "@/features/dev-toolbox/services/regex-tester"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { DevToolboxController } from "@/features/dev-toolbox/hooks/useDevToolboxController"

export function DevtoolsPanel({ controller }: { controller: DevToolboxController }) {
  const { t } = useTranslation()
  const {
    applying,
    jsonInput,
    setJsonInput,
    jsonOutput,
    b64Input,
    setB64Input,
    b64Output,
    hashInput,
    setHashInput,
    hashAlgo,
    setHashAlgo,
    hashOutput,
    tsInput,
    setTsInput,
    tsFormat,
    setTsFormat,
    tsOutput,
    uuidOutput,
    regexPattern,
    setRegexPattern,
    regexFlags,
    setRegexFlags,
    regexInput,
    setRegexInput,
    regexReplacement,
    setRegexReplacement,
    regexResult,
    regexTesting,
    schemaInput,
    setSchemaInput,
    schemaResult,
    handleJsonPretty,
    handleJsonMinify,
    handleBase64Encode,
    handleBase64Decode,
    handleHash,
    handleUuid,
    handleTimestamp,
    handleRegexTest,
    handleSchemaValidate,
  } = controller

  return (
    <div className="space-y-4">
      <SettingGroup title={t("systemSettings.devtools.jsonTitle")}>
        <div className="space-y-2 py-2">
          <Textarea
            className="bg-muted h-24 font-mono text-xs"
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder={t("systemSettings.devtools.jsonPlaceholder")}
          />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={applying} onClick={handleJsonPretty}>
              {t("systemSettings.devtools.prettyPrint")}
            </Button>
            <Button variant="outline" size="sm" disabled={applying} onClick={handleJsonMinify}>
              {t("systemSettings.devtools.minify")}
            </Button>
          </div>
          {jsonOutput && (
            <pre className="bg-muted max-h-32 overflow-auto rounded p-2 text-xs">{jsonOutput}</pre>
          )}
        </div>
      </SettingGroup>
      <SettingGroup title={t("systemSettings.devtools.schemaTitle")}>
        <div className="space-y-2 py-2">
          <p className="text-muted-foreground text-xs">
            {t("systemSettings.devtools.schemaDataHint")}
          </p>
          <Textarea
            className="bg-muted h-24 font-mono text-xs"
            value={schemaInput}
            onChange={(e) => setSchemaInput(e.target.value)}
            placeholder={t("systemSettings.devtools.schemaPlaceholder")}
          />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleSchemaValidate}>
              {t("systemSettings.devtools.schemaValidate")}
            </Button>
          </div>
          {schemaResult && !schemaResult.ok && (
            <div className="text-destructive border-destructive/40 bg-destructive/10 rounded border p-2 text-xs">
              {t("systemSettings.devtools.schemaParseError")}: {schemaResult.error}
            </div>
          )}
          {schemaResult && schemaResult.ok && (
            <div className="space-y-2">
              {schemaResult.valid ? (
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  {t("systemSettings.devtools.schemaValid")}
                </p>
              ) : schemaResult.issues.length > 0 ? (
                <p className="text-destructive text-xs font-medium">
                  {t("systemSettings.devtools.schemaInvalid", { n: schemaResult.issues.length })}
                </p>
              ) : null}
              {schemaResult.unsupported.length > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {t("systemSettings.devtools.schemaUnsupported", {
                    keywords: schemaResult.unsupported.join(", "),
                  })}
                </p>
              )}
              {schemaResult.truncated && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {t("systemSettings.devtools.schemaTruncated")}
                </p>
              )}
              {schemaResult.issues.length > 0 && (
                <ul className="bg-muted max-h-40 space-y-1 overflow-auto rounded p-2 text-xs">
                  {schemaResult.issues.map((issue, i) => (
                    <li key={`${issue.path}-${i}`} className="font-mono break-all">
                      <span className="text-muted-foreground">{issue.path || "/"}</span>{" "}
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </SettingGroup>
      <SettingGroup title={t("systemSettings.devtools.base64Title")}>
        <div className="space-y-2 py-2">
          <Input
            value={b64Input}
            onChange={(e) => setB64Input(e.target.value)}
            placeholder={t("systemSettings.devtools.base64Placeholder")}
          />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={applying} onClick={handleBase64Encode}>
              {t("systemSettings.devtools.encode")}
            </Button>
            <Button variant="outline" size="sm" disabled={applying} onClick={handleBase64Decode}>
              {t("systemSettings.devtools.decode")}
            </Button>
          </div>
          {b64Output && (
            <pre className="bg-muted max-h-24 overflow-auto rounded p-2 text-xs">{b64Output}</pre>
          )}
        </div>
      </SettingGroup>
      <SettingGroup title={t("systemSettings.devtools.hashTitle")}>
        <div className="space-y-2 py-2">
          <Input
            value={hashInput}
            onChange={(e) => setHashInput(e.target.value)}
            placeholder={t("systemSettings.devtools.hashPlaceholder")}
          />
          <div className="flex items-center gap-2">
            <Select value={hashAlgo} onValueChange={setHashAlgo}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="md5">MD5</SelectItem>
                <SelectItem value="sha1">SHA1</SelectItem>
                <SelectItem value="sha256">SHA256</SelectItem>
                <SelectItem value="sha384">SHA384</SelectItem>
                <SelectItem value="sha512">SHA512</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={applying} onClick={handleHash}>
              {t("systemSettings.devtools.calculate")}
            </Button>
          </div>
          {hashOutput && (
            <pre className="bg-muted overflow-auto rounded p-2 text-xs">{hashOutput}</pre>
          )}
        </div>
      </SettingGroup>
      <SettingGroup title={t("systemSettings.devtools.uuidTitle")}>
        <div className="flex gap-2 py-2">
          <Button variant="outline" size="sm" disabled={applying} onClick={handleUuid}>
            {t("systemSettings.devtools.generateUuid")}
          </Button>
          {uuidOutput && <code className="bg-muted rounded px-2 py-1 text-xs">{uuidOutput}</code>}
        </div>
      </SettingGroup>
      <SettingGroup title={t("systemSettings.devtools.timestampTitle")}>
        <div className="space-y-2 py-2">
          <Input
            value={tsInput}
            onChange={(e) => setTsInput(e.target.value)}
            placeholder={t("systemSettings.devtools.timestampPlaceholder")}
          />
          <div className="flex items-center gap-2">
            <Select value={tsFormat} onValueChange={setTsFormat}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="datetime">
                  {t("systemSettings.devtools.formatFullDateTime")}
                </SelectItem>
                <SelectItem value="date">{t("systemSettings.devtools.formatDateOnly")}</SelectItem>
                <SelectItem value="time">{t("systemSettings.devtools.formatTimeOnly")}</SelectItem>
                <SelectItem value="iso">{t("systemSettings.devtools.formatIso")}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={applying} onClick={handleTimestamp}>
              {t("systemSettings.devtools.convert")}
            </Button>
          </div>
          {tsOutput && <pre className="bg-muted overflow-auto rounded p-2 text-xs">{tsOutput}</pre>}
        </div>
      </SettingGroup>
      <SettingGroup title={t("systemSettings.devtools.regexTitle")}>
        <div className="space-y-2 py-2">
          <div className="flex gap-2">
            <Input
              className="min-w-0 flex-1 font-mono text-xs"
              value={regexPattern}
              disabled={regexTesting}
              onChange={(e) => setRegexPattern(e.target.value)}
              placeholder={t("systemSettings.devtools.regexPatternPlaceholder")}
            />
            <Input
              className="w-24 shrink-0 font-mono text-xs"
              value={regexFlags}
              disabled={regexTesting}
              onChange={(e) => setRegexFlags(e.target.value)}
              placeholder={t("systemSettings.devtools.regexFlagsPlaceholder")}
              aria-label={t("systemSettings.devtools.regexFlagsLabel")}
            />
          </div>
          <Textarea
            className="bg-muted h-20 font-mono text-xs"
            value={regexInput}
            disabled={regexTesting}
            onChange={(e) => setRegexInput(e.target.value)}
            placeholder={t("systemSettings.devtools.regexInputPlaceholder")}
          />
          <Input
            className="font-mono text-xs"
            value={regexReplacement}
            disabled={regexTesting}
            onChange={(e) => setRegexReplacement(e.target.value)}
            placeholder={t("systemSettings.devtools.regexReplacePlaceholder")}
          />
          <p className="text-muted-foreground text-[11px]">
            {t("systemSettings.devtools.regexSizeHint", {
              patternMax: MAX_REGEX_PATTERN_LENGTH,
              inputMax: MAX_REGEX_INPUT_LENGTH,
            })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={regexTesting}
              aria-busy={regexTesting}
              onClick={handleRegexTest}
            >
              {t(
                regexTesting
                  ? "systemSettings.devtools.regexTesting"
                  : "systemSettings.devtools.regexTest",
              )}
            </Button>
          </div>
          {regexResult && !regexResult.ok && (
            <div className="text-destructive border-destructive/40 bg-destructive/10 rounded border p-2 text-xs">
              {regexResult.code === "TIMEOUT"
                ? t("systemSettings.devtools.regexTimeout")
                : regexResult.code === "WORKER_UNAVAILABLE"
                  ? t("systemSettings.devtools.regexWorkerUnavailable")
                  : regexResult.code === "WORKER_FAILED"
                    ? t("systemSettings.devtools.regexWorkerFailed")
                    : regexResult.code === "PATTERN_TOO_LONG"
                      ? t("systemSettings.devtools.regexPatternTooLong", {
                          max: MAX_REGEX_PATTERN_LENGTH,
                        })
                      : regexResult.code === "INPUT_TOO_LONG"
                        ? t("systemSettings.devtools.regexInputTooLong", {
                            max: MAX_REGEX_INPUT_LENGTH,
                          })
                        : regexResult.code === "REPLACEMENT_TOO_LONG"
                          ? t("systemSettings.devtools.regexReplacementTooLong", {
                              max: MAX_REGEX_INPUT_LENGTH,
                            })
                          : t("systemSettings.devtools.regexInvalidPattern")}
            </div>
          )}
          {regexResult && regexResult.ok && (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs">
                {regexResult.total === 0
                  ? t("systemSettings.devtools.regexNoMatch")
                  : t("systemSettings.devtools.regexMatchCount", { total: regexResult.total })}
                {regexResult.truncated
                  ? ` · ${t("systemSettings.devtools.regexTruncated", { max: regexResult.total })}`
                  : ""}
              </p>
              {regexResult.matches.length > 0 && (
                <ul className="bg-muted max-h-48 space-y-1 overflow-auto rounded p-2 text-xs">
                  {regexResult.matches.map((m, i) => (
                    <li key={`${m.index}-${i}`} className="font-mono break-all">
                      <span className="text-muted-foreground">
                        {i + 1}. {t("systemSettings.devtools.regexIndexLabel", { index: m.index })}
                      </span>{" "}
                      <span className="font-semibold">{m.value}</span>
                      {m.groups.length > 0 && (
                        <span className="text-muted-foreground">
                          {" "}
                          (
                          {m.groups
                            .map((g) => `${g.name ? `${g.name}:` : ""}${g.value ?? ""}`)
                            .join(", ")}
                          )
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {regexResult.replaced !== null && (
                <pre className="bg-muted max-h-32 overflow-auto rounded p-2 text-xs">
                  {regexResult.replaced}
                </pre>
              )}
            </div>
          )}
        </div>
      </SettingGroup>
    </div>
  )
}
