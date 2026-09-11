import { useState, useEffect } from 'react'
import {
  AlertTriangle,
  FileDiff,
  CheckCircle2,
  X,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
  Copy,
  Check,
  FileText,
} from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

export default function EvidenceIntegrityModal({
  isOpen,
  onClose,
  verificationData,
  onConfirmMapAnyway,
  loading,
}) {
  const [showDiff, setShowDiff] = useState(false)
  const [diffData, setDiffData] = useState(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [copiedField, setCopiedField] = useState(null)

  useEffect(() => {
    if (!isOpen) {
      setShowDiff(false)
      setDiffData(null)
    }
  }, [isOpen])

  if (!isOpen || !verificationData) return null

  const {
    evidence_id,
    filename,
    original_sha256,
    current_sha256,
    original_version = 1,
    current_version = 2,
    modified_text,
  } = verificationData

  const handleCopy = (text, fieldName) => {
    navigator.clipboard.writeText(text)
    setCopiedField(fieldName)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const loadDiff = async () => {
    setDiffLoading(true)
    setShowDiff(true)
    try {
      // First try fetching diff between versions if available
      const res = await fetch(
        `${API_BASE}/api/evidence/${evidence_id}/diff/${original_version}/${current_version}`
      )
      if (res.ok) {
        const data = await res.json()
        setDiffData(data)
      } else {
        // If current version is not committed yet, compute client/server comparison view
        const linesOrig = (verificationData.original_text || '').split('\n')
        const linesMod = (modified_text || '').split('\n')

        // Simple line representation
        const syntheticDiffLines = []
        const maxLen = Math.max(linesOrig.length, linesMod.length)
        for (let i = 0; i < maxLen; i++) {
          const orig = linesOrig[i]
          const mod = linesMod[i]
          if (orig === mod) {
            syntheticDiffLines.push({ type: 'unchanged', prefix: ' ', content: orig || '' })
          } else {
            if (orig !== undefined) {
              syntheticDiffLines.push({ type: 'removed', prefix: '-', content: orig })
            }
            if (mod !== undefined) {
              syntheticDiffLines.push({ type: 'added', prefix: '+', content: mod })
            }
          }
        }
        setDiffData({
          evidence_id,
          version_a: original_version,
          version_b: current_version,
          diff_lines: syntheticDiffLines,
        })
      }
    } catch (e) {
      console.error('Failed to load diff', e)
    } finally {
      setDiffLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal-card tamper-modal-card ${showDiff ? 'expanded-diff' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with clear neutral warning */}
        <div className="modal-header tamper-warning-header">
          <div className="modal-title-group">
            <div className="tamper-icon-badge">
              <AlertTriangle size={22} className="tamper-alert-icon" />
            </div>
            <div>
              <h3 className="modal-title">Source document has been tampered with since it was originally mapped.</h3>
              <p className="modal-subtitle tamper-subtext">
                The source document was modified after the original hash was recorded.
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Tamper Evidence Breakdown */}
        <div className="tamper-body">
          <div className="tamper-grid">
            {/* Evidence ID & File */}
            <div className="tamper-metric-card">
              <span className="tamper-label">Evidence Identifier</span>
              <div className="tamper-val-row">
                <code className="tamper-code">{evidence_id}</code>
                <span className="tamper-filename">({filename || 'FIR_document.txt'})</span>
              </div>
            </div>

            {/* Version Transition */}
            <div className="tamper-metric-card">
              <span className="tamper-label">Version Progression</span>
              <div className="version-transition-row">
                <span className="version-badge v-original">Version {original_version}</span>
                <ArrowRight size={14} className="version-arrow" />
                <span className="version-badge v-new">Version {current_version} (Proposed)</span>
              </div>
            </div>

            {/* Original Immutable Hash */}
            <div className="tamper-metric-card full-width">
              <div className="hash-header-row">
                <span className="tamper-label">
                  Original SHA-256 Hash (Version {original_version} — Immutable)
                </span>
                <button
                  className="btn-copy-hash"
                  onClick={() => handleCopy(original_sha256, 'original')}
                  title="Copy SHA-256"
                >
                  {copiedField === 'original' ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedField === 'original' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div className="hash-box original-hash">
                <code>{original_sha256}</code>
              </div>
            </div>

            {/* Current Modified Hash */}
            <div className="tamper-metric-card full-width">
              <div className="hash-header-row">
                <span className="tamper-label">
                  Current SHA-256 Hash (Version {current_version} — Modified Text)
                </span>
                <button
                  className="btn-copy-hash"
                  onClick={() => handleCopy(current_sha256, 'current')}
                  title="Copy SHA-256"
                >
                  {copiedField === 'current' ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedField === 'current' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div className="hash-box current-hash">
                <code>{current_sha256}</code>
              </div>
            </div>
          </div>

          {/* Diff Section */}
          {showDiff && (
            <div className="diff-container-section">
              <div className="diff-header-bar">
                <div className="diff-title-left">
                  <FileDiff size={16} />
                  <span>Text Diff: Version {original_version} vs Version {current_version}</span>
                </div>
                <span className="diff-legend">
                  <span className="legend-tag tag-removed">- Original text</span>
                  <span className="legend-tag tag-added">+ Modified text</span>
                </span>
              </div>

              {diffLoading ? (
                <div className="diff-loading">Generating exact-line diff...</div>
              ) : diffData?.diff_lines?.length ? (
                <div className="diff-view-scroller">
                  {diffData.diff_lines.map((line, idx) => {
                    const isPageMarker =
                      line.content.startsWith('[PAGE') ||
                      line.content.startsWith('PAGE ') ||
                      line.content.startsWith('--- Page')

                    return (
                      <div
                        key={idx}
                        className={`diff-line diff-${line.type} ${
                          isPageMarker ? 'diff-page-marker' : ''
                        }`}
                      >
                        <span className="diff-prefix">{line.prefix || ' '}</span>
                        <span className="diff-text">{line.content}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="diff-view-empty">No textual differences found.</div>
              )}
            </div>
          )}

          {/* Graph Safety Notice */}
          <div className="graph-safety-callout">
            <ShieldCheck size={16} className="safety-shield-icon" />
            <span>
              <strong>Graph Safety Protected:</strong> The criminal network graph has not been modified.
              To apply updates, explicit analyst confirmation is required.
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="modal-form-actions tamper-actions-footer">
          <button
            type="button"
            className="btn-secondary btn-diff-toggle"
            onClick={showDiff ? () => setShowDiff(false) : loadDiff}
          >
            <FileDiff size={14} />
            <span>{showDiff ? 'Hide Changes' : 'View Changes'}</span>
          </button>

          <div className="action-buttons-right">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary btn-map-anyway"
              onClick={onConfirmMapAnyway}
              disabled={loading}
            >
              <CheckCircle2 size={14} />
              <span>{loading ? 'Mapping...' : 'Map Anyway'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
