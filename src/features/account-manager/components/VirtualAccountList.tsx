import { useRef, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"

import { ScrollableArea } from "@/components/common/ScrollableArea"
import type { StationAccount } from "@/lib/tauri/types/account-manager"

const ESTIMATED_ACCOUNT_ROW_HEIGHT = 112

export function VirtualAccountList({
  accounts,
  renderAccount,
}: {
  accounts: StationAccount[]
  renderAccount: (account: StationAccount) => ReactNode
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: accounts.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => accounts[index]?.id ?? index,
    estimateSize: () => ESTIMATED_ACCOUNT_ROW_HEIGHT,
    overscan: 6,
    initialRect: { width: 480, height: 600 },
  })

  return (
    <ScrollableArea
      ref={scrollRef}
      wrapperClassName="h-full"
      className="h-full p-3"
      data-virtual-account-list
      data-total-count={accounts.length}
    >
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const account = accounts[virtualRow.index]
          if (!account) return null
          return (
            <div
              key={account.id}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              data-account-id={account.id}
              className="absolute top-0 left-0 w-full pb-2"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              {renderAccount(account)}
            </div>
          )
        })}
      </div>
    </ScrollableArea>
  )
}
