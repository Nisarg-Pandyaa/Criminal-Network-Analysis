import { useState, useMemo, useEffect } from 'react'
import GraphView from './components/GraphView.jsx'
import EntityPrioritization, { getEntityConfig } from './components/EntityPrioritization.jsx'
import CustomCaseModal from './components/CustomCaseModal.jsx'
import EvidenceIntegrityModal from './components/EvidenceIntegrityModal.jsx'
import EvidenceHistoryModal from './components/EvidenceHistoryModal.jsx'
import {
  Shield,
  Activity,
  Flame,
  Network,
  Users,
  FileText,
  Sliders,
  Sparkles,
  Database,
  PlusCircle,
  Download,
  AlertTriangle,
  FolderOpen,
  Eye,
  CheckCircle2,
  Share2,
  History,
  ShieldCheck,
  Lock,
  FileCode,
  SlidersHorizontal,
} from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

export default function App() {
  const [caseData, setCaseData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [complexity, setComplexity] = useState(2)
  const [activeDoc, setActiveDoc] = useState(null)
  const [selectedEntityId, setSelectedEntityId] = useState(null)
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false)
  const [caseSource, setCaseSource] = useState('none') // 'sample' | 'ai' | 'custom'

  // Tamper detection & Evidence Provenance state
  const [tamperData, setTamperData] = useState(null)
  const [isTamperModalOpen, setIsTamperModalOpen] = useState(false)
  const [historyEvidenceId, setHistoryEvidenceId] = useState(null)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)

  // Human-in-the-Loop Entity Priority state
  const [priorityMode, setPriorityMode] = useState('ai') // 'ai' | 'manual'
  const [manualPriority, setManualPriority] = useState([])
  const [manuallyPrioritizedEntities, setManuallyPrioritizedEntities] = useState([])

  // Unique identifier for the current case session
  const currentCaseId = useMemo(() => {
    if (!caseData?.documents) return 'current_case'
    const docKeys = Object.keys(caseData.documents)
    return docKeys.sort().join('_') || 'current_case'
  }, [caseData])

  // AI-computed baseline priority (Immutable baseline)
  const aiPriorityRankings = useMemo(() => {
    return caseData?.analytics?.entity_rankings || []
  }, [caseData])

  // Active priority rankings (Manual priority overrides visual order if active)
  const activePriorityRankings = useMemo(() => {
    if (priorityMode === 'manual' && manualPriority?.length > 0) {
      return manualPriority
    }
    return aiPriorityRankings
  }, [priorityMode, manualPriority, aiPriorityRankings])

  // Sync / fetch case priority when case data loads
  useEffect(() => {
    if (!caseData) {
      setPriorityMode('ai')
      setManualPriority([])
      setManuallyPrioritizedEntities([])
      return
    }

    async function fetchCasePriority() {
      try {
        const res = await fetch(`${API_BASE}/api/priority/${encodeURIComponent(currentCaseId)}`)
        if (res.ok) {
          const data = await res.json()
          if (data.priority_mode === 'manual' && data.manual_order?.length > 0) {
            // Reconstruct manual rankings based on saved ID order
            const aiList = caseData.analytics?.entity_rankings || []
            const idMap = {}
            aiList.forEach((e) => {
              idMap[e.id] = e
            })

            const reconstructed = []
            data.manual_order.forEach((id, idx) => {
              if (idMap[id]) {
                reconstructed.push({
                  ...idMap[id],
                  rank: idx + 1,
                })
              }
            })

            // Add any newly discovered entities not in manual order
            aiList.forEach((e) => {
              if (!data.manual_order.includes(e.id)) {
                reconstructed.push({
                  ...e,
                  rank: reconstructed.length + 1,
                })
              }
            })

            setManualPriority(reconstructed)
            setManuallyPrioritizedEntities(data.manually_prioritized_entities || [])
            setPriorityMode('manual')
            return
          }
        }
      } catch (_) {}

      // Default to AI
      setPriorityMode('ai')
      setManualPriority([])
      setManuallyPrioritizedEntities([])
    }

    fetchCasePriority()
  }, [currentCaseId, caseData])

  // Handler for investigator manual reordering
  const handleReorderPriority = async (newRankings, draggedEntityId, auditEntry) => {
    const updatedManualIds = Array.from(
      new Set([...manuallyPrioritizedEntities, draggedEntityId])
    )
    setManuallyPrioritizedEntities(updatedManualIds)
    setManualPriority(newRankings)
    setPriorityMode('manual')

    try {
      await fetch(`${API_BASE}/api/priority/${encodeURIComponent(currentCaseId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manual_order: newRankings.map((r) => r.id),
          manually_prioritized_entities: updatedManualIds,
          audit_entry: auditEntry,
        }),
      })
    } catch (e) {
      console.error('Failed to persist manual priority', e)
    }
  }

  // Handler to Reset to AI Priority (discards manual ordering & clears all manual highlights)
  const handleResetToAI = async () => {
    setPriorityMode('ai')
    setManualPriority([])
    setManuallyPrioritizedEntities([])

    try {
      await fetch(`${API_BASE}/api/priority/${encodeURIComponent(currentCaseId)}`, {
        method: 'DELETE',
      })
    } catch (e) {
      console.error('Failed to reset priority on server', e)
    }
  }

  // Overall case integrity status computed from evidence items
  const caseIntegrityStatus = useMemo(() => {
    if (!caseData?.evidence_integrity) return 'VERIFIED'
    const records = Object.values(caseData.evidence_integrity)
    if (records.length === 0) return 'VERIFIED'
    const anyModified = records.some((r) => r.integrity_status === 'MODIFIED')
    return anyModified ? 'MODIFIED' : 'VERIFIED'
  }, [caseData])

  // Load standard bundled sample case
  async function loadSampleCase() {
    setLoading(true)
    setError(null)
    setSelectedEntityId(null)
    try {
      const res = await fetch(`${API_BASE}/sample-case`)
      if (!res.ok) throw new Error(`Backend returned ${res.status}`)
      const data = await res.json()
      setCaseData(data)
      setCaseSource('sample')
      const firstDoc = Object.keys(data.documents || {})[0]
      setActiveDoc(firstDoc || null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Generate new AI case via Gemini
  async function generateNewCase() {
    setLoading(true)
    setError(null)
    setSelectedEntityId(null)
    try {
      const res = await fetch(`${API_BASE}/generate-case`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          num_docs: 3,
          num_entities: 4 + complexity,
          complexity,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Backend returned ${res.status}`)
      }
      const data = await res.json()
      setCaseData(data)
      setCaseSource('ai')
      const firstDoc = Object.keys(data.documents || {})[0]
      setActiveDoc(firstDoc || null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Run custom case from raw documents
  async function handleCustomCaseSubmit(customDocs) {
    setLoading(true)
    setError(null)
    setSelectedEntityId(null)
    try {
      const res = await fetch(`${API_BASE}/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documents: customDocs }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Backend returned ${res.status}`)
      }
      const data = await res.json()
      setCaseData(data)
      setCaseSource('custom')
      setIsCustomModalOpen(false)
      const firstDoc = Object.keys(data.documents || {})[0]
      setActiveDoc(firstDoc || null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Tamper warning trigger
  function handleTamperDetected(tamperPayload) {
    setIsCustomModalOpen(false)
    setTamperData(tamperPayload)
    setIsTamperModalOpen(true)
  }

  // Explicit confirmation: Map Anyway
  async function handleMapAnyway() {
    if (!tamperData) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/evidence/remap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evidence_id: tamperData.evidence_id,
          text: tamperData.modified_text,
          filename: tamperData.filename,
          all_documents: tamperData.allDocs,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Backend returned ${res.status}`)
      }
      const data = await res.json()
      setCaseData(data.pipeline)
      setCaseSource('custom')
      setIsTamperModalOpen(false)
      setTamperData(null)
      const firstDoc = Object.keys(data.pipeline?.documents || {})[0]
      setActiveDoc(firstDoc || null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Cancel Tamper Remapping
  function handleCancelTamper() {
    setIsTamperModalOpen(false)
    setTamperData(null)
  }

  // Open History Audit Modal for active document
  function openEvidenceHistory(docId) {
    const evdId = caseData?.evidence_integrity?.[docId]?.evidence_id || docId
    setHistoryEvidenceId(evdId)
    setIsHistoryModalOpen(true)
  }

  // Quick lookup dictionary: entity ID -> Entity Object
  const entityMap = useMemo(() => {
    if (!caseData?.canonical_entities) return {}
    const map = {}
    for (const c of caseData.canonical_entities) {
      map[c.id] = c
    }
    return map
  }, [caseData])

  // Top Target based on active priority ranking
  const topTarget = useMemo(() => {
    if (!activePriorityRankings?.length) return null
    return activePriorityRankings[0]
  }, [activePriorityRankings])

  // Active document evidence metadata
  const activeDocIntegrity = useMemo(() => {
    if (!caseData?.evidence_integrity || !activeDoc) return null
    return caseData.evidence_integrity[activeDoc]
  }, [caseData, activeDoc])

  // Highlight entities in document text
  const highlightedDocText = useMemo(() => {
    if (!caseData || !activeDoc || !caseData.documents[activeDoc]) return null
    const text = caseData.documents[activeDoc]
    const rawEntities = (caseData.entities || []).filter(
      (e) => e.doc_id === activeDoc
    )

    if (rawEntities.length === 0) return <span>{text}</span>

    const pattern = new RegExp(
      rawEntities
        .map((e) => e.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .filter((val, idx, arr) => arr.indexOf(val) === idx && val.trim().length > 1)
        .join('|'),
      'gi'
    )

    const parts = []
    let lastIndex = 0
    let match

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index))
      }
      const matchText = match[0]
      const matchingRaw = rawEntities.find(
        (e) => e.text.toLowerCase() === matchText.toLowerCase()
      )
      const label = matchingRaw?.label || 'UNKNOWN'
      const cfg = getEntityConfig(label)

      const canonEntity = caseData.canonical_entities?.find((c) =>
        c.aliases?.some((a) => a.toLowerCase() === matchText.toLowerCase()) ||
        c.display_name.toLowerCase() === matchText.toLowerCase()
      )

      parts.push(
        <mark
          key={`${match.index}-${matchText}`}
          className="entity-text-highlight"
          style={{
            backgroundColor: cfg.bg,
            color: cfg.color,
            borderColor: cfg.border,
          }}
          onClick={() => {
            if (canonEntity) setSelectedEntityId(canonEntity.id)
          }}
          title={`Entity: ${matchText} (${label}) - Click to focus`}
        >
          {matchText}
        </mark>
      )
      lastIndex = pattern.lastIndex
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex))
    }

    return parts
  }, [caseData, activeDoc])

  return (
    <div className="intelligence-app">
      {/* Top Intelligence Console Navigation */}
      <header className="console-header">
        <div className="header-left">
          <div className="brand-logo-badge">
            <Shield size={22} className="shield-glow" />
          </div>
          <div className="brand-titles">
            <div className="brand-name-row">
              <h1 className="brand-title">CASEWEB</h1>
              <span className="version-pill">INTEL v2.0</span>
              <span className="status-live-indicator">
                <span className="live-pulse-dot" />
                ACTIVE SESSION
              </span>

              {/* Global Evidence Integrity Status Badge */}
              {caseData && (
                <div
                  className={`evidence-status-pill ${
                    caseIntegrityStatus === 'VERIFIED' ? 'pill-verified' : 'pill-modified'
                  }`}
                  title={
                    caseIntegrityStatus === 'VERIFIED'
                      ? 'Tamper-Evident SHA-256 Integrity Verified'
                      : 'Source document modified after initial registration'
                  }
                >
                  {caseIntegrityStatus === 'VERIFIED' ? (
                    <>
                      <ShieldCheck size={13} className="integrity-icon" />
                      <span>✓ VERIFIED — Source unchanged</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={13} className="integrity-icon" />
                      <span>⚠ MODIFIED — Source hash mismatch</span>
                    </>
                  )}
                </div>
              )}
            </div>
            <p className="brand-tagline">
              Automated Criminal Network Extraction, Centrality Analysis & Investigator-Controlled Priority
            </p>
          </div>
        </div>

        {/* Global Action Toolbar */}
        <div className="header-actions">
          <button
            className="btn-console-secondary"
            onClick={loadSampleCase}
            disabled={loading}
          >
            <Database size={15} />
            <span>Load Sample Case</span>
          </button>

          <button
            className="btn-console-secondary"
            onClick={() => setIsCustomModalOpen(true)}
            disabled={loading}
          >
            <PlusCircle size={15} />
            <span>Custom Case Text</span>
          </button>

          {caseData && activeDoc && (
            <button
              className="btn-console-secondary btn-provenance"
              onClick={() => openEvidenceHistory(activeDoc)}
              title="Inspect Immutable Version History"
            >
              <History size={15} />
              <span>Evidence Audit</span>
            </button>
          )}

          <div className="ai-gen-group">
            <div className="complexity-dial-wrapper">
              <Sliders size={13} />
              <label htmlFor="comp-select">Complexity: Lvl {complexity}</label>
              <input
                id="comp-select"
                type="range"
                min="1"
                max="5"
                value={complexity}
                onChange={(e) => setComplexity(Number(e.target.value))}
                className="complexity-slider"
                title={`Level ${complexity}: ${4 + complexity} entities`}
              />
            </div>

            <button
              className="btn-console-primary"
              onClick={generateNewCase}
              disabled={loading}
            >
              <Sparkles size={15} />
              <span>{loading ? 'Analyzing...' : 'Generate AI Case'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Error Alert Banner */}
      {error && (
        <div className="console-banner-error">
          <AlertTriangle size={18} />
          <div>
            <strong>Network Operation Alert:</strong> {error}.
          </div>
        </div>
      )}

      {/* Initial Empty State */}
      {!caseData && !loading && (
        <div className="console-empty-state">
          <div className="empty-icon-card">
            <Network size={54} className="empty-hero-icon" />
          </div>
          <h2 className="empty-state-title">No Criminal Network Dossier Loaded</h2>
          <p className="empty-state-text">
            Extract suspect graphs, uncover hidden intermediaries, and customize investigator priority
            with human-in-the-loop drag-and-drop focus reordering.
          </p>
          <div className="empty-action-buttons">
            <button className="btn-console-primary large" onClick={loadSampleCase}>
              <Database size={18} />
              <span>Load Bundled Crime Sample</span>
            </button>
            <button
              className="btn-console-secondary large"
              onClick={() => setIsCustomModalOpen(true)}
            >
              <PlusCircle size={18} />
              <span>Paste Custom Police Reports</span>
            </button>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="console-loading-state">
          <div className="loading-spinner-ring" />
          <h3>Executing Entity Resolution & Network Analytics Pipeline...</h3>
          <p>Computing SHA-256 Hashes • Extracting Named Entities • Computing Priority</p>
        </div>
      )}

      {/* Active Dossier Dashboard */}
      {caseData && !loading && (
        <main className="dashboard-content">
          {/* Metrics & Target Intelligence Strip */}
          <section className="intelligence-metrics-strip">
            <div className="metric-tile">
              <div className="metric-header">
                <span className="metric-title">Total Entities</span>
                <Users size={16} className="metric-icon blue" />
              </div>
              <div className="metric-value">
                {caseData.graph?.nodes?.length || 0}
              </div>
              <div className="metric-footer">Extracted & Resolved</div>
            </div>

            <div className="metric-tile">
              <div className="metric-header">
                <span className="metric-title">Network Connections</span>
                <Network size={16} className="metric-icon emerald" />
              </div>
              <div className="metric-value">
                {caseData.graph?.edges?.length || 0}
              </div>
              <div className="metric-footer">Sentence Co-occurrences</div>
            </div>

            <div className="metric-tile">
              <div className="metric-header">
                <span className="metric-title">Key Network Bridges</span>
                <Flame size={16} className="metric-icon red" />
              </div>
              <div className="metric-value">
                {caseData.analytics?.key_connectors?.length || 0}
              </div>
              <div className="metric-footer">Articulation Points</div>
            </div>

            <div className="metric-tile">
              <div className="metric-header">
                <span className="metric-title">Sub-Clusters / Cells</span>
                <Activity size={16} className="metric-icon purple" />
              </div>
              <div className="metric-value">
                {caseData.analytics?.num_communities || 0}
              </div>
              <div className="metric-footer">Louvain Communities</div>
            </div>

            <div className="metric-tile highlight-tile">
              <div className="metric-header">
                <span className="metric-title">#1 Focus Entity</span>
                <Shield size={16} className="metric-icon amber" />
              </div>
              <div className="metric-value top-target-name">
                {topTarget?.name || 'N/A'}
              </div>
              <div className="metric-footer top-target-sub">
                {topTarget?.connection_count || 0} direct links • {priorityMode === 'manual' ? 'Investigator P1' : (topTarget?.priority_level || 'N/A')}
              </div>
            </div>
          </section>

          {/* Upper Deck: Graph Visualizer & Intelligence Insights */}
          <div className="upper-deck-grid">
            {/* Left: Cytoscape Network Visualizer */}
            <div className="visualizer-container-col">
              <GraphView
                graph={caseData.graph}
                analytics={caseData.analytics}
                selectedEntityId={selectedEntityId}
                activePriorityRankings={activePriorityRankings}
                manuallyPrioritizedEntities={manuallyPrioritizedEntities}
                priorityMode={priorityMode}
                onSelectEntity={(id) => setSelectedEntityId(id)}
              />
            </div>

            {/* Right: Quick Intelligence Insights */}
            <aside className="intelligence-insights-sidebar">
              <div className="insights-card">
                <div className="insights-header">
                  <Flame size={17} className="red-glow-icon" />
                  <h3>Key Bridge Intermediaries</h3>
                </div>
                <p className="insights-desc">
                  Nodes whose removal fragments the criminal network (Articulation Points).
                </p>
                {caseData.analytics.key_connectors.length === 0 ? (
                  <div className="no-data-notice">No critical single-point bridges detected.</div>
                ) : (
                  <div className="bridges-list">
                    {caseData.analytics.key_connectors.map((id) => {
                      const entity = entityMap[id] || { display_name: id, label: 'ENTITY' }
                      const cfg = getEntityConfig(entity.label)
                      const Icon = cfg.icon
                      const isSel = selectedEntityId === id

                      return (
                        <div
                          key={id}
                          className={`bridge-item-chip ${isSel ? 'active' : ''}`}
                          onClick={() => setSelectedEntityId(id)}
                        >
                          <div
                            className="bridge-chip-icon"
                            style={{ color: cfg.color, backgroundColor: cfg.bg }}
                          >
                            <Icon size={13} />
                          </div>
                          <div className="bridge-chip-info">
                            <span className="bridge-chip-name">{entity.display_name}</span>
                            <span className="bridge-chip-type">{entity.label}</span>
                          </div>
                          <button className="chip-focus-btn" title="Focus in graph">
                            <Eye size={12} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Communities / Cells */}
              <div className="insights-card">
                <div className="insights-header">
                  <Activity size={17} className="purple-glow-icon" />
                  <h3>Detected Cells / Clusters</h3>
                </div>
                <div className="clusters-breakdown">
                  <div className="clusters-count-badge">
                    {caseData.analytics.num_communities} distinct sub-networks identified
                  </div>
                  <div className="clusters-pills-row">
                    {Array.from(
                      new Set(Object.values(caseData.analytics.communities || {}))
                    ).map((commId) => {
                      const members = Object.entries(caseData.analytics.communities || {})
                        .filter(([_, c]) => c === commId)
                        .map(([nId]) => entityMap[nId]?.display_name || nId)

                      return (
                        <div key={commId} className="cluster-summary-card">
                          <div className="cluster-header">
                            <span className="cluster-dot" />
                            <strong>Cluster #{Number(commId) + 1}</strong>
                            <span className="cluster-size">({members.length} entities)</span>
                          </div>
                          <div className="cluster-members">
                            {members.slice(0, 3).join(', ')}
                            {members.length > 3 ? ` +${members.length - 3} more` : ''}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </aside>
          </div>

          {/* Centerpiece Feature: Dedicated Human-in-the-Loop Entity Prioritization */}
          <section className="prioritization-main-section">
            <EntityPrioritization
              aiRankings={aiPriorityRankings}
              manualRankings={manualPriority}
              manuallyPrioritizedEntities={manuallyPrioritizedEntities}
              priorityMode={priorityMode}
              selectedEntityId={selectedEntityId}
              onSelectEntity={(id) => setSelectedEntityId(id)}
              onOpenDoc={(docId) => setActiveDoc(docId)}
              onReorderPriority={handleReorderPriority}
              onResetToAI={handleResetToAI}
            />
          </section>

          {/* Lower Deck: Case Documents Explorer with Tamper Provenance */}
          <section className="documents-explorer-card">
            <div className="documents-header-row">
              <div className="documents-title-group">
                <FileText size={18} className="doc-icon-blue" />
                <div>
                  <h3 className="doc-section-title">Case Documents & Evidence Repository</h3>
                  <p className="doc-section-subtitle">
                    Raw reports analyzed by the pipeline. Tamper-evident SHA-256 provenance tracked.
                  </p>
                </div>
              </div>

              {/* Document Tab Switcher */}
              <div className="documents-tab-bar">
                {Object.keys(caseData.documents || {}).map((docId) => {
                  const integrity = caseData.evidence_integrity?.[docId]
                  const isModified = integrity?.integrity_status === 'MODIFIED'

                  return (
                    <button
                      key={docId}
                      className={`doc-pill-tab ${docId === activeDoc ? 'active' : ''}`}
                      onClick={() => setActiveDoc(docId)}
                    >
                      <FolderOpen size={13} />
                      <span>{docId}</span>
                      {integrity && (
                        <span
                          className={`doc-integrity-dot ${
                            isModified ? 'dot-modified' : 'dot-verified'
                          }`}
                          title={
                            isModified
                              ? 'Modified version'
                              : `Version ${integrity.version} Verified`
                          }
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Document Evidence Metadata Strip */}
            {activeDocIntegrity && (
              <div className="doc-evidence-metadata-banner">
                <div className="evd-meta-item">
                  <span className="evd-meta-label">Evidence ID:</span>
                  <code className="evd-meta-val">{activeDocIntegrity.evidence_id}</code>
                </div>
                <div className="evd-meta-item">
                  <span className="evd-meta-label">Version:</span>
                  <span className="evd-version-tag">
                    Version {activeDocIntegrity.version}
                  </span>
                </div>
                <div className="evd-meta-item sha-item">
                  <span className="evd-meta-label">SHA-256 Digest:</span>
                  <code className="evd-hash-code">{activeDocIntegrity.sha256}</code>
                </div>
                <button
                  type="button"
                  className="btn-inspect-history"
                  onClick={() => openEvidenceHistory(activeDoc)}
                >
                  <History size={12} />
                  <span>Audit Trail</span>
                </button>
              </div>
            )}

            {/* Document Text Display */}
            <div className="document-body-container">
              {activeDoc && caseData.documents[activeDoc] ? (
                <div className="doc-text-rendered">
                  {highlightedDocText}
                </div>
              ) : (
                <p className="no-doc-selected">Select a case document from the tabs above to view contents.</p>
              )}
            </div>
          </section>
        </main>
      )}

      {/* Custom Case Input Modal */}
      <CustomCaseModal
        isOpen={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        onSubmit={handleCustomCaseSubmit}
        onTamperDetected={handleTamperDetected}
        loading={loading}
      />

      {/* Tamper Warning & Diff Modal */}
      <EvidenceIntegrityModal
        isOpen={isTamperModalOpen}
        onClose={handleCancelTamper}
        verificationData={tamperData}
        onConfirmMapAnyway={handleMapAnyway}
        loading={loading}
      />

      {/* Evidence History & Audit Trail Modal */}
      <EvidenceHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        evidenceId={historyEvidenceId}
      />
    </div>
  )
}
