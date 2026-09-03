/**
 * Language switch behavior test / 中英文切换行为测试 (A1-6):
 *   zh↔en 切换后三栏标签、错误文案（经 translateError）、空态文案即时更新，
 *   且不残留旧语言；长文本落在 truncate 容器内不破版。
 */
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { I18nextProvider } from "react-i18next"
import i18n from "@/i18n/config"
import { StationColumn } from "@/features/account-manager/components/StationColumn"
import { AccountColumn } from "@/features/account-manager/components/AccountColumn"
import { DetailColumn } from "@/features/account-manager/components/DetailColumn"
import { describeRegionError, makeRegionError } from "@/features/account-manager/errors"
import {
  DEFAULT_LOGIN_DETECTION,
  type RelayStation,
  type StationAccount,
} from "@/lib/tauri/types/account-manager"

const noop = () => undefined

const station: RelayStation = {
  id: "station-1",
  remark: "示例站点",
  website: "https://example.com",
  createdAt: "2026-07-14 08:00",
  loginDetection: DEFAULT_LOGIN_DETECTION,
  authProfile: null,
}

const longRemarkStation: RelayStation = {
  ...station,
  id: "station-long",
  remark:
    "超长站点名称用于验证单行截断与省略号行为不会因为中英文切换而破版 overflow truncation check",
}

const account: StationAccount = {
  id: "account-1",
  stationId: station.id,
  username: "alice",
  notes: "",
  phone: null,
  tgAccount: null,
  linkedAccount: null,
  inviteLink: null,
  loginMethods: [],
  status: "ready",
  lastLoginAt: null,
  lastRefreshedAt: null,
  createdAt: "2026-07-14 08:00",
  hasPassword: false,
}

const LONG_USERNAME_ACCOUNT: StationAccount = {
  ...account,
  id: "account-long",
  username: "a-very-long-username-for-truncation-check-超长用户名-0123456789",
}

function renderColumns(stations: RelayStation[] = [station], accounts = [account]) {
  return render(
    <I18nextProvider i18n={i18n}>
      <div className="flex">
        <StationColumn
          stations={stations}
          selectedId={stations[0]?.id ?? ""}
          countByStation={{ [stations[0]?.id ?? ""]: accounts.length }}
          onSelect={noop}
          onAdd={noop}
          onEdit={noop}
          onDelete={noop}
          onReorder={noop}
          reorderDisabled={false}
          onRefreshAll={noop}
          refreshingAll={false}
          onImportData={noop}
          onExportData={noop}
          importingData={false}
          exportingData={false}
          onQuickLogin={noop}
        />
        <AccountColumn
          station={stations[0] ?? null}
          accounts={accounts}
          selectedId={accounts[0]?.id ?? ""}
          openingId={null}
          refreshingIds={new Set()}
          refreshingStationIds={new Set()}
          refreshingAll={false}
          justRefreshedIds={new Set()}
          onSelect={noop}
          onAdd={noop}
          onLogin={noop}
          onRefresh={noop}
          onRefreshStation={noop}
          onEdit={noop}
          onDelete={noop}
          onReorder={noop}
          reorderDisabled={false}
        />
        <DetailColumn
          station={stations[0] ?? null}
          account={accounts[0] ?? null}
          onOpenWebsite={noop}
          onRedetectProfile={noop}
          onRevealPassword={async () => ""}
          onCopyPassword={async () => undefined}
          onProbeStrategyChange={noop}
        />
      </div>
    </I18nextProvider>,
  )
}

beforeAll(async () => {
  await i18n.changeLanguage("zh")
})

afterEach(() => {
  cleanup()
})

describe("account-manager language switch (A1-6)", () => {
  it("updates the three column titles, empty states and error copy immediately on zh→en", async () => {
    renderColumns([station], [])

    expect(screen.getByText("站点列表 (1)")).toBeTruthy()
    expect(screen.getByText("账号列表 (0)")).toBeTruthy()
    expect(screen.getByText("暂无账号")).toBeTruthy()
    expect(screen.getByText("点击右上角「添加账号」为当前站点新增账号。")).toBeTruthy()

    await i18n.changeLanguage("en")

    expect(screen.getByText("Station List (1)")).toBeTruthy()
    expect(screen.getByText("Accounts (0)")).toBeTruthy()
    expect(screen.getByText("No accounts yet")).toBeTruthy()
    expect(
      screen.getByText('Click "Add Account" to create one under the selected gateway.'),
    ).toBeTruthy()
    expect(screen.queryByText("站点列表 (1)")).toBeNull()
    expect(screen.queryByText("暂无账号")).toBeNull()

    await i18n.changeLanguage("zh")
    expect(screen.getByText("站点列表 (1)")).toBeTruthy()
  })

  it("translates structured errors via translateError in the current language", async () => {
    expect(
      describeRegionError(
        i18n.t.bind(i18n),
        makeRegionError(
          { code: "IO_ERROR", message: "fs" },
          "accountManager.errors.refreshAccount",
        ),
      ),
    ).toBe("文件系统操作出错。")

    await i18n.changeLanguage("en")
    expect(
      describeRegionError(
        i18n.t.bind(i18n),
        makeRegionError(
          { code: "IO_ERROR", message: "fs" },
          "accountManager.errors.refreshAccount",
        ),
      ),
    ).toBe("A file system error occurred.")

    await i18n.changeLanguage("zh")
  })

  it("keeps long station/account text inside truncate containers in both languages", async () => {
    renderColumns([longRemarkStation], [LONG_USERNAME_ACCOUNT])

    // dnd-kit 会渲染 aria 克隆，文本可能出现多次；断言所有实例都在 truncate 容器内
    for (const remark of screen.getAllByText(longRemarkStation.remark)) {
      expect(remark.className).toContain("truncate")
    }
    for (const username of screen.getAllByText(LONG_USERNAME_ACCOUNT.username)) {
      expect(username.className).toContain("truncate")
    }

    await i18n.changeLanguage("en")
    for (const remark of screen.getAllByText(longRemarkStation.remark)) {
      expect(remark.className).toContain("truncate")
    }
    for (const username of screen.getAllByText(LONG_USERNAME_ACCOUNT.username)) {
      expect(username.className).toContain("truncate")
    }
    await i18n.changeLanguage("zh")
  })
})
