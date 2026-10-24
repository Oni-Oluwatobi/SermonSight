import React from 'react'
import type { AppState } from '@shared/ipc'
import { ScriptureSearch } from '../ScriptureSearch'
import { BookIcon } from '../icons/DesignIcons'
import { ModalShell } from './ModalShell'

export function SearchModal({
  state,
  onClose
}: {
  state: AppState | null
  onClose: () => void
}): JSX.Element {
  return (
    <ModalShell
      title="Scripture Search"
      subtitle="Find a passage. Keep the message moving."
      icon={<BookIcon />}
      onClose={onClose}
      wide
      className="search-modal"
    >
      <ScriptureSearch state={state} />
    </ModalShell>
  )
}
