import React, { useEffect, useState } from 'react'
import type { AppState } from '@shared/ipc'
import { actions } from '../../state/store'
import { ModalShell } from './ModalShell'
import { RemoteSection } from './SettingsModal'

export function PairingModal({
  state,
  onClose
}: {
  state: AppState | null
  onClose: () => void
}): JSX.Element {
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    void actions
      .remoteStatus()
      .then((r) => setQr(r.qr ?? null))
      .catch(() => undefined)
  }, [state?.remote.state])

  return (
    <ModalShell title="Phone Remote Pairing" onClose={onClose} wide>
      <div className="pairing-layout">
        <div className="pairing-left">
          <RemoteSection state={state} />
        </div>
        <div className="pairing-right">
          <div className="qr-hero">
            {qr ? (
              <img src={qr} alt="Pairing QR code" />
            ) : (
              <div className="qr-placeholder">Start the remote to generate a QR code</div>
            )}
            <p className="faint" style={{ textAlign: 'center', marginBottom: 0 }}>
              Scan to connect — or type the URL and pairing code on the phone. Codes expire after
              10 minutes; the phone is a controller, never a second screen.
            </p>
          </div>
        </div>
      </div>
    </ModalShell>
  )
}
