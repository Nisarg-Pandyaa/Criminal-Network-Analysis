import { useState } from 'react'
import { FileEdit, Play, X, Sparkles, BookOpen, AlertCircle, ShieldCheck } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

const SAMPLE_TEMPLATES = {
  narcotics: {
    name: 'Narcotics Distribution Ring',
    docs: {
      case_narco_01: `[PAGE 1]\nSurveillance report: Operative Marcus Cole was observed meeting Tariq Vance at the Blue Moon Lounge on Elm Street.\n[PAGE 2]\nCole handed a silver briefcase to Vance before departing in a dark blue sedan (Plate: NY-7890-AB).`,
      case_narco_02: `[PAGE 1]\nWiretap intercept: Tariq Vance placed a call to phone 555-0199 registered to Elena Rostova.\n[PAGE 2]\nVance confirmed shipment delivery and requested financial clearance from Apex Holdings LLC.`,
      case_narco_03: `[PAGE 1]\nFinancial audit: Apex Holdings LLC transferred $250,000 to an offshore account managed by Marcus Cole. Elena Rostova was listed as the signatory on the transaction.`,
    },
  },
  cybercrime: {
    name: 'Syndicate Cyber Breach & Extortion',
    docs: {
      case_cyber_01: `[PAGE 1]\nForensics memo: Threat actor identified as 'CipherZero' accessed CoreTech Servers from IP proxy routed through Zurich.\n[PAGE 2]\nDigital artifacts link the intrusion to handles used by Dmitry Volkov.`,
      case_cyber_02: `[PAGE 1]\nIncident report: Dmitry Volkov coordinated cryptocurrency wash using wallet 0x98A4B... alongside broker Sarah Jenkins at Nexus Capital.`,
      case_cyber_03: `[PAGE 1]\nFederal warrant: Sarah Jenkins intercepted at JFK Airport with hardware tokens belonging to CipherZero. Logs revealed direct communications with Dmitry Volkov.`,
    },
  },
}

export default function CustomCaseModal({
  isOpen,
  onClose,
  onSubmit,
  onTamperDetected,
  loading,
}) {
  const [docs, setDocs] = useState({
    case_doc_01: '',
    case_doc_02: '',
  })
  const [error, setError] = useState(null)
  const [checkingIntegrity, setCheckingIntegrity] = useState(false)

  if (!isOpen) return null

  const handleDocChange = (id, text) => {
    setDocs((prev) => ({ ...prev, [id]: text }))
  }

  const handleRenameDoc = (oldId, newId) => {
    if (!newId || newId === oldId) return
    setDocs((prev) => {
      const updated = {}
      for (const [k, v] of Object.entries(prev)) {
        if (k === oldId) {
          updated[newId] = v
        } else {
          updated[k] = v
        }
      }
      return updated
    })
  }

  const addDocField = () => {
    const nextId = `case_doc_${String(Object.keys(docs).length + 1).padStart(2, '0')}`
    setDocs((prev) => ({ ...prev, [nextId]: '' }))
  }

  const removeDocField = (id) => {
    if (Object.keys(docs).length <= 1) return
    const newDocs = { ...docs }
    delete newDocs[id]
    setDocs(newDocs)
  }

  const loadTemplate = (templateKey) => {
    const template = SAMPLE_TEMPLATES[templateKey]
    if (template) {
      setDocs(template.docs)
      setError(null)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    // Validate that at least one document has content
    const nonEmptyDocs = {}
    for (const [key, text] of Object.entries(docs)) {
      if (text.trim()) {
        nonEmptyDocs[key] = text
      }
    }

    if (Object.keys(nonEmptyDocs).length === 0) {
      setError('Please provide text in at least one document.')
      return
    }

    setError(null)
    setCheckingIntegrity(true)

    try {
      // Pre-verify each document with the backend evidence registry
      for (const [docId, text] of Object.entries(nonEmptyDocs)) {
        try {
          const verifyRes = await fetch(`${API_BASE}/api/evidence/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              evidence_id: docId,
              text,
              filename: `${docId}.txt`,
            }),
          })

          if (verifyRes.ok) {
            const result = await verifyRes.json()
            if (!result.match) {
              // Hash mismatch detected! Fetch original version text for diff
              let origText = ''
              try {
                const origRes = await fetch(`${API_BASE}/api/evidence/${docId}`)
                if (origRes.ok) {
                  const origData = await origRes.json()
                  origText = origData.versions?.[0]?.text || ''
                }
              } catch (_) {}

              setCheckingIntegrity(false)
              if (onTamperDetected) {
                onTamperDetected({
                  evidence_id: docId,
                  filename: `${docId}.txt`,
                  original_sha256: result.original_sha256,
                  current_sha256: result.current_sha256,
                  original_version: result.original_version,
                  current_version: result.current_version,
                  original_text: origText,
                  modified_text: text,
                  allDocs: nonEmptyDocs,
                })
                return
              }
            }
          }
        } catch (_) {
          // New document not yet registered in store - will be registered automatically on pipeline run
        }
      }

      // If all docs verified or newly registered, proceed to run pipeline
      onSubmit(nonEmptyDocs)
    } catch (err) {
      setError(err.message || 'Error checking evidence integrity')
    } finally {
      setCheckingIntegrity(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge">
              <FileEdit size={18} />
            </div>
            <div>
              <h3 className="modal-title">Analyze Custom Case Documents</h3>
              <p className="modal-subtitle">
                Paste raw investigative reports, transcripts, or witness statements with tamper-evident integrity.
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Template Quick Loader */}
        <div className="template-bar">
          <span className="template-label">
            <BookOpen size={13} /> Preset Templates:
          </span>
          {Object.entries(SAMPLE_TEMPLATES).map(([key, item]) => (
            <button
              key={key}
              type="button"
              className="template-btn"
              onClick={() => loadTemplate(key)}
            >
              <Sparkles size={12} />
              {item.name}
            </button>
          ))}
        </div>

        {error && (
          <div className="modal-error-banner">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="doc-inputs-container">
            {Object.entries(docs).map(([id, text], index) => (
              <div key={id} className="doc-input-box">
                <div className="doc-input-header">
                  <div className="doc-title-input-wrapper">
                    <span className="doc-label">Doc #{index + 1}:</span>
                    <input
                      type="text"
                      className="doc-id-input"
                      value={id}
                      onChange={(e) => handleRenameDoc(id, e.target.value)}
                      title="Evidence Identifier"
                    />
                  </div>
                  {Object.keys(docs).length > 1 && (
                    <button
                      type="button"
                      className="doc-remove-btn"
                      onClick={() => removeDocField(id)}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <textarea
                  className="doc-textarea"
                  placeholder={`[PAGE 1]\nEnter raw police report, surveillance log, or statement...\nExample: "Officer witnessed Marcus Cole meeting Tariq Vance at the Blue Moon Lounge..."`}
                  rows={4}
                  value={text}
                  onChange={(e) => handleDocChange(id, e.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="modal-form-actions">
            <button
              type="button"
              className="btn-add-doc"
              onClick={addDocField}
            >
              + Add Another Document
            </button>

            <div className="action-buttons-right">
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
                disabled={loading || checkingIntegrity}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary btn-run-analysis"
                disabled={loading || checkingIntegrity}
              >
                <Play size={14} />
                <span>
                  {checkingIntegrity
                    ? 'Verifying Integrity...'
                    : loading
                    ? 'Running Analysis Pipeline...'
                    : 'Run Pipeline & Build Graph'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
