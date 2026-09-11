import { useState, useEffect } from 'react'
import {
  History,
  ShieldCheck,
  AlertTriangle,
  FileDiff,
  X,
  Calendar,
  FileText,
  Copy,
  Check,
  ArrowRight,
} from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

export default function EvidenceHistoryModal({ isOpen, onClose, evidenceId }) {
  const [evidenceData, setEvidenceData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copiedHash, setCopiedHash] = useState(null)
  const [selectedVersions, setSelectedVersions] = useState({ vA: 1, vB: 1 })
  const [diffResult, setDiffResult] = useState(null)
  const [diffLoading, setDiffLoading] = useState(false)

  useEffect(() => {
    if (isOpen && evidenceId) {
      loadHistory()
    } else {
      setEvidenceData(null)
      setDiffResult(null)
    }
  }, [isOpen, evidenceId])

  const loadHistory = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/evidence/${evidenceId}/versions`)
      if (!res.ok) throw new Error(`Could not load evidence records (${res.status})`)
      const data = await res.json()
      setEvidenceData(data)
      if (data.versions?.length > 1) {
        setSelectedVersions({
          vA: 1,
          vB: data.versions[data.versions.length - 1].version_number,
        })
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text)
    setCopiedHash(id)
    setTimeout(() => setCopiedHash(null), 2000)
  }

  const handleFetchDiff = async () => {
    if (!evidenceId || selectedVersions.vA === selectedVersions.vB) return
    setDiffLoading(true)
    try {
      const res = await fetch(
        `${API_BASE}/api/evidence/${evidenceId}/diff/${selectedVersions.vA}/${selectedVersions.vB}`
      )
      if (!res.ok) throw new Error(`Failed to fetch diff (${res.status})`)
      const data = await res.json()
      setDiffResult(data)
    } catch (e) {
      console.error(e)
    } finally {
      setDiffLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card history-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge">
              <History size={18} />
            </div>
            <div>
              <h3 className="modal-title">Evidence Integrity & Provenance Audit</h3>
              <p className="modal-subtitle">
                Immutable version history, SHA-256 integrity digests, and tamper-evident audit trail.
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {loading && (
          <div className="history-loading">Loading immutable evidence ledger...</div>
        )}

        {error && (
          <div className="modal-error-banner">
            <AlertTriangle size={15} />
            <span>{error}</span>
          </div>
        )}

        {evidenceData && (
          <div className="history-body">
            {/* Header info bar */}
            <div className="evidence-provenance-bar">
              <div className="provenance-item">
                <span className="prov-label">Evidence ID</span>
                <span className="prov-val">{evidenceData.evidence_id}</span>
              </div>
              <div className="provenance-item">
                <span className="prov-label">Filename</span>
                <span className="prov-val">{evidenceData.filename}</span>
              </div>
              <div className="provenance-item">
                <span className="prov-label">Total Versions</span>
                <span className="prov-val">{evidenceData.versions?.length || 0}</span>
              </div>
              <div className="provenance-item">
                <span className="prov-label">Algorithm</span>
                <span className="prov-val">SHA-256 (Server Auth)</span>
              </div>
            </div>

            {/* Version Timeline */}
            <h4 className="timeline-heading">Immutable Version Chain</h4>
            <div className="version-timeline-list">
              {evidenceData.versions?.map((ver) => {
                const isV1 = ver.version_number === 1
                const isMatch = ver.integrity_status === 'VERIFIED'

                return (
                  <div key={ver.version_number} className="timeline-node-card">
                    <div className="timeline-node-header">
                      <div className="version-pill-group">
                        <span className="version-tag">
                          Version {ver.version_number} {isV1 && '• (Original Anchor)'}
                        </span>
                        <span
                          className={`status-pill ${
                            isMatch ? 'status-verified' : 'status-modified'
                          }`}
                        >
                          {isMatch ? (
                            <>
                              <ShieldCheck size={12} />
                              <span>VERIFIED</span>
                            </>
                          ) : (
                            <>
                              <AlertTriangle size={12} />
                              <span>MODIFIED</span>
                            </>
                          )}
                        </span>
                      </div>

                      <div className="timestamp-badge">
                        <Calendar size={12} />
                        <span>{new Date(ver.created_at).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="timeline-hash-row">
                      <span className="hash-label">SHA-256:</span>
                      <code className="hash-digest">{ver.sha256}</code>
                      <button
                        className="btn-copy-mini"
                        onClick={() => handleCopy(ver.sha256, ver.version_number)}
                        title="Copy Hash"
                      >
                        {copiedHash === ver.version_number ? (
                          <Check size={11} />
                        ) : (
                          <Copy size={11} />
                        )}
                      </button>
                    </div>

                    <div className="timeline-text-preview">
                      <FileText size={13} className="text-preview-icon" />
                      <p>{ver.text?.slice(0, 150)}...</p>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Version Comparison Selector */}
            {evidenceData.versions?.length > 1 && (
              <div className="version-diff-controls-box">
                <div className="diff-select-row">
                  <span className="diff-select-label">Compare Versions:</span>
                  <select
                    className="diff-dropdown"
                    value={selectedVersions.vA}
                    onChange={(e) =>
                      setSelectedVersions((prev) => ({
                        ...prev,
                        vA: Number(e.target.value),
                      }))
                    }
                  >
                    {evidenceData.versions.map((v) => (
                      <option key={v.version_number} value={v.version_number}>
                        Version {v.version_number}
                      </option>
                    ))}
                  </select>

                  <ArrowRight size={14} />

                  <select
                    className="diff-dropdown"
                    value={selectedVersions.vB}
                    onChange={(e) =>
                      setSelectedVersions((prev) => ({
                        ...prev,
                        vB: Number(e.target.value),
                      }))
                    }
                  >
                    {evidenceData.versions.map((v) => (
                      <option key={v.version_number} value={v.version_number}>
                        Version {v.version_number}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    className="btn-console-primary"
                    onClick={handleFetchDiff}
                    disabled={
                      diffLoading || selectedVersions.vA === selectedVersions.vB
                    }
                  >
                    <FileDiff size={13} />
                    <span>{diffLoading ? 'Comparing...' : 'Compare Versions'}</span>
                  </button>
                </div>

                {diffResult && (
                  <div className="diff-view-scroller history-diff-view">
                    {diffResult.diff_lines?.map((line, idx) => (
                      <div
                        key={idx}
                        className={`diff-line diff-${line.type} ${
                          line.content.startsWith('[PAGE') ? 'diff-page-marker' : ''
                        }`}
                      >
                        <span className="diff-prefix">{line.prefix || ' '}</span>
                        <span className="diff-text">{line.content}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="modal-form-actions">
          <div className="neutral-disclaimer">
            Tamper-evident evidence integrity and provenance.
          </div>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close Audit Ledger
          </button>
        </div>
      </div>
    </div>
  )
}
