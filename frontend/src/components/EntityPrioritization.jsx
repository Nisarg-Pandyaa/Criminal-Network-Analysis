import { useState, useMemo } from 'react'
import {
  User,
  Phone,
  Car,
  Building2,
  MapPin,
  HelpCircle,
  Network,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Search,
  Filter,
  Flame,
  FileText,
  Zap,
  GripVertical,
  RotateCcw,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react'

export const ENTITY_CONFIG = {
  PERSON: {
    label: 'Person',
    icon: User,
    color: '#38BDF8', // Sky Blue
    bg: 'rgba(56, 189, 248, 0.12)',
    border: 'rgba(56, 189, 248, 0.35)',
  },
  PHONE: {
    label: 'Phone / Comms',
    icon: Phone,
    color: '#34D399', // Emerald
    bg: 'rgba(52, 211, 153, 0.12)',
    border: 'rgba(52, 211, 153, 0.35)',
  },
  VEHICLE: {
    label: 'Vehicle',
    icon: Car,
    color: '#FBBF24', // Amber
    bg: 'rgba(251, 191, 36, 0.12)',
    border: 'rgba(251, 191, 36, 0.35)',
  },
  ORG: {
    label: 'Organization',
    icon: Building2,
    color: '#A78BFA', // Purple
    bg: 'rgba(167, 139, 250, 0.12)',
    border: 'rgba(167, 139, 250, 0.35)',
  },
  LOCATION: {
    label: 'Location',
    icon: MapPin,
    color: '#F87171', // Coral/Rose
    bg: 'rgba(248, 113, 113, 0.12)',
    border: 'rgba(248, 113, 113, 0.35)',
  },
  UNKNOWN: {
    label: 'Entity',
    icon: HelpCircle,
    color: '#94A3B8',
    bg: 'rgba(148, 163, 184, 0.12)',
    border: 'rgba(148, 163, 184, 0.35)',
  },
}

export function getEntityConfig(label) {
  return ENTITY_CONFIG[label?.toUpperCase()] || ENTITY_CONFIG.UNKNOWN
}

export default function EntityPrioritization({
  aiRankings = [],
  manualRankings = [],
  manuallyPrioritizedEntities = [],
  priorityMode = 'ai', // 'ai' | 'manual'
  selectedEntityId = null,
  onSelectEntity,
  onOpenDoc,
  onReorderPriority,
  onResetToAI,
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedType, setSelectedType] = useState('ALL')
  const [expandedEntityId, setExpandedEntityId] = useState(null)

  // Drag-and-drop state
  const [draggedIndex, setDraggedIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const [dropPosition, setDropPosition] = useState(null) // 'above' | 'below'

  // Determine active ranking list
  const currentRankings = useMemo(() => {
    if (priorityMode === 'manual' && manualRankings?.length > 0) {
      return manualRankings
    }
    return aiRankings || []
  }, [priorityMode, manualRankings, aiRankings])

  // AI rank lookup map to compare manual vs original AI rank
  const aiRankMap = useMemo(() => {
    const map = {}
    ;(aiRankings || []).forEach((item, index) => {
      map[item.id] = index + 1
    })
    return map
  }, [aiRankings])

  // Set of explicitly manually prioritized entity IDs for O(1) lookup
  const manualSet = useMemo(() => {
    return new Set(manuallyPrioritizedEntities || [])
  }, [manuallyPrioritizedEntities])

  // Maximum connections across all nodes for progress bar normalization
  const maxConnections = useMemo(() => {
    return Math.max(1, ...currentRankings.map((r) => r.connection_count || 0))
  }, [currentRankings])

  // Filter rankings by search term and type
  const filteredRankings = useMemo(() => {
    return currentRankings.filter((entity) => {
      const matchesSearch =
        entity.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entity.id?.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesType =
        selectedType === 'ALL' || entity.label === selectedType
      return matchesSearch && matchesType
    })
  }, [currentRankings, searchTerm, selectedType])

  const typeCounts = useMemo(() => {
    const counts = { ALL: currentRankings.length }
    for (const r of currentRankings) {
      counts[r.label] = (counts[r.label] || 0) + 1
    }
    return counts
  }, [currentRankings])

  const toggleExpand = (id, e) => {
    e.stopPropagation()
    setExpandedEntityId((prev) => (prev === id ? null : id))
  }

  const handleEntityClick = (id) => {
    if (onSelectEntity) {
      onSelectEntity(id)
    }
    setExpandedEntityId((prev) => (prev === id ? null : id))
  }

  // --- Drag & Drop Handlers ---
  const handleDragStart = (e, index) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedIndex === null || draggedIndex === index) return

    const rect = e.currentTarget.getBoundingClientRect()
    const offset = e.clientY - rect.top
    const isAbove = offset < rect.height / 2

    setDragOverIndex(index)
    setDropPosition(isAbove ? 'above' : 'below')
  }

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverIndex(null)
      setDropPosition(null)
    }
  }

  const handleDrop = (e, targetIndex) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null)
      setDragOverIndex(null)
      setDropPosition(null)
      return
    }

    // Reorder full ranking array
    const newItems = [...currentRankings]
    const [movedItem] = newItems.splice(draggedIndex, 1)

    let insertIndex = targetIndex
    if (dropPosition === 'below' && draggedIndex < targetIndex) {
      insertIndex = targetIndex
    } else if (dropPosition === 'below' && draggedIndex > targetIndex) {
      insertIndex = targetIndex + 1
    } else if (dropPosition === 'above' && draggedIndex < targetIndex) {
      insertIndex = targetIndex - 1
    }

    insertIndex = Math.max(0, Math.min(insertIndex, newItems.length))
    newItems.splice(insertIndex, 0, movedItem)

    // Re-assign display rank indices
    const updatedWithRanks = newItems.map((item, idx) => ({
      ...item,
      rank: idx + 1,
    }))

    const auditEntry = {
      entity_id: movedItem.id,
      old_rank: draggedIndex + 1,
      new_rank: insertIndex + 1,
      timestamp: new Date().toISOString(),
      action: 'manual_priority_change',
    }

    if (onReorderPriority) {
      // Pass updated list, the moved item's stable ID, and audit entry
      onReorderPriority(updatedWithRanks, movedItem.id, auditEntry)
    }

    setDraggedIndex(null)
    setDragOverIndex(null)
    setDropPosition(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
    setDropPosition(null)
  }

  return (
    <div className="prioritization-container">
      {/* Header section with badge & explanation */}
      <div className="prioritization-header">
        <div className="prioritization-title-row">
          <div className="title-with-badge">
            <div className="icon-pulse-wrapper">
              <Crosshair className="header-icon pulse-icon" size={20} />
            </div>
            <div>
              <div className="title-mode-row">
                <h2 className="section-title">Whom to Investigate First</h2>
                {/* Mode Indicator Pill */}
                <div
                  className={`priority-mode-badge ${
                    priorityMode === 'manual' ? 'mode-manual' : 'mode-ai'
                  }`}
                  title={
                    priorityMode === 'manual'
                      ? 'Investigator-ordered priority list (drag to reorder)'
                      : 'AI and connection degree-based priority ranking'
                  }
                >
                  {priorityMode === 'manual' ? (
                    <>
                      <SlidersHorizontal size={12} />
                      <span>Investigator Priority ({manuallyPrioritizedEntities?.length || 0} Manually Prioritized)</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={12} />
                      <span>AI Priority (Automated)</span>
                    </>
                  )}
                </div>
              </div>
              <p className="section-subtitle">
                Target Prioritization Matrix • Drag cards to manually set investigator focus
              </p>
            </div>
          </div>

          <div className="header-actions-right">
            {priorityMode === 'manual' && onResetToAI && (
              <button
                type="button"
                className="btn-reset-ai-priority"
                onClick={onResetToAI}
                title="Discard manual priority ordering, clear all manual highlights, and restore exact original AI ranking"
              >
                <RotateCcw size={13} />
                <span>Reset to AI Priority</span>
              </button>
            )}

            <div className="target-summary-pill">
              <Zap size={14} className="accent-glow-icon" />
              <span>
                Top Focus Target:{' '}
                <strong className="highlight-text">
                  {currentRankings[0]?.name || 'N/A'}
                </strong>{' '}
                ({currentRankings[0]?.connection_count || 0} links)
              </span>
            </div>
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="controls-toolbar">
          <div className="search-input-wrapper">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              placeholder="Search focus entity name, alias, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <button className="clear-search-btn" onClick={() => setSearchTerm('')}>
                ×
              </button>
            )}
          </div>

          <div className="filter-sort-group">
            {/* Entity Type Filter Tabs */}
            <div className="type-filter-tabs">
              <button
                className={`type-tab ${selectedType === 'ALL' ? 'active' : ''}`}
                onClick={() => setSelectedType('ALL')}
              >
                All ({typeCounts.ALL || 0})
              </button>
              {['PERSON', 'PHONE', 'VEHICLE', 'ORG', 'LOCATION'].map((type) => {
                const count = typeCounts[type] || 0
                if (count === 0) return null
                const config = getEntityConfig(type)
                const Icon = config.icon
                return (
                  <button
                    key={type}
                    className={`type-tab ${selectedType === type ? 'active' : ''}`}
                    onClick={() => setSelectedType(type)}
                    style={
                      selectedType === type
                        ? {
                            borderColor: config.color,
                            color: config.color,
                            backgroundColor: config.bg,
                          }
                        : {}
                    }
                  >
                    <Icon size={12} className="tab-type-icon" />
                    <span>{config.label.split('/')[0]}</span>
                    <span className="type-count-badge">{count}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Target Prioritization List with Drag and Drop */}
      <div className="prioritization-list-wrapper">
        {filteredRankings.length === 0 ? (
          <div className="empty-results-state">
            <Filter size={32} className="empty-icon" />
            <p>No entities match the selected search/filter criteria.</p>
          </div>
        ) : (
          <div className="prioritization-cards-list">
            {filteredRankings.map((entity, index) => {
              const isSelected = selectedEntityId === entity.id
              const isExpanded = expandedEntityId === entity.id
              const isDragging = draggedIndex === index
              const isDragOver = dragOverIndex === index
              const config = getEntityConfig(entity.label)
              const Icon = config.icon
              const connectionPercent = Math.round(
                (entity.connection_count / maxConnections) * 100
              )
              const originalAiRank = aiRankMap[entity.id]
              const currentDisplayRank = entity.rank || index + 1
              
              // CRITICAL: Highlighting belongs ONLY to entities that were explicitly manually dragged/prioritized!
              const isManuallyPrioritized =
                priorityMode === 'manual' && manualSet.has(entity.id)

              return (
                <div
                  key={entity.id}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`prioritization-card ${isSelected ? 'selected' : ''} ${
                    entity.is_key_connector ? 'is-bridge' : ''
                  } ${isManuallyPrioritized ? 'is-manually-prioritized' : ''} ${
                    isDragging ? 'is-dragging' : ''
                  } ${
                    isDragOver && dropPosition ? `drop-target-${dropPosition}` : ''
                  } priority-${entity.priority_color || 'blue'}`}
                  onClick={() => handleEntityClick(entity.id)}
                >
                  {/* Top row: Drag Handle, Rank, Avatar/Badge, Name, Priority Tag, Connection Count */}
                  <div className="card-primary-row">
                    {/* Drag Handle */}
                    <div
                      className="drag-handle-wrapper"
                      title="Drag to reorder investigator priority"
                    >
                      <GripVertical size={16} className="drag-handle-icon" />
                    </div>

                    <div className="rank-indicator">
                      <span className="rank-hash">#</span>
                      <span className="rank-number">{currentDisplayRank}</span>
                      {currentDisplayRank <= 3 && (
                        <span className={`priority-code-pill p-${currentDisplayRank}`}>
                          P{currentDisplayRank}
                        </span>
                      )}
                    </div>

                    <div
                      className="entity-avatar-badge"
                      style={{
                        backgroundColor: config.bg,
                        borderColor: config.border,
                        color: config.color,
                      }}
                    >
                      <Icon size={18} />
                    </div>

                    <div className="entity-main-info">
                      <div className="entity-name-row">
                        <span className="entity-name-text">{entity.name}</span>
                        <span
                          className="entity-type-tag"
                          style={{
                            color: config.color,
                            borderColor: config.border,
                            backgroundColor: config.bg,
                          }}
                        >
                          {entity.label}
                        </span>

                        {entity.is_key_connector && (
                          <span className="badge-critical-bridge">
                            <Flame size={12} />
                            Key Bridge
                          </span>
                        )}

                        <span
                          className={`priority-status-pill priority-pill-${
                            entity.priority_color || 'blue'
                          }`}
                        >
                          {entity.priority_level}
                        </span>

                        {isManuallyPrioritized && (
                          <span
                            className="badge-manual-focus"
                            title={`Manually prioritized by investigator (Original AI Rank: #${originalAiRank || 'N/A'})`}
                          >
                            Investigator Focus
                          </span>
                        )}
                      </div>

                      <div className="entity-reason-text">
                        {entity.investigation_reason}
                      </div>
                    </div>

                    {/* Connection Count & Gauge */}
                    <div className="connection-metric-cell">
                      <div className="connection-count-value">
                        <Network size={15} className="conn-icon" />
                        <span className="conn-num">{entity.connection_count}</span>
                        <span className="conn-label">
                          {entity.connection_count === 1 ? 'Connection' : 'Connections'}
                        </span>
                      </div>

                      {/* Connection strength bar */}
                      <div
                        className="connection-bar-track"
                        title={`${connectionPercent}% connectivity ratio`}
                      >
                        <div
                          className="connection-bar-fill"
                          style={{
                            width: `${connectionPercent}%`,
                            backgroundColor:
                              entity.priority_color === 'red'
                                ? '#EF4444'
                                : entity.priority_color === 'orange'
                                ? '#F59E0B'
                                : '#38BDF8',
                          }}
                        />
                      </div>
                    </div>

                    {/* Actions button */}
                    <div className="card-actions">
                      <button
                        type="button"
                        className="btn-focus-target"
                        title="Focus and highlight in graph"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (onSelectEntity) onSelectEntity(entity.id)
                        }}
                      >
                        <Crosshair size={14} />
                        <span>Focus</span>
                      </button>

                      <button
                        type="button"
                        className="btn-expand-toggle"
                        onClick={(e) => toggleExpand(entity.id, e)}
                        title={
                          isExpanded
                            ? 'Collapse connection details'
                            : 'View connected entities'
                        }
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Connection Details Drawer */}
                  {isExpanded && (
                    <div
                      className="card-expanded-drawer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="drawer-header">
                        <div className="drawer-title">
                          <Network size={14} />
                          <span>
                            Directly Connected Entities (
                            {entity.connected_entities?.length || 0})
                          </span>
                        </div>
                        <div className="drawer-metrics">
                          <span>
                            Betweenness:{' '}
                            <strong>{(entity.betweenness || 0).toFixed(4)}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            PageRank:{' '}
                            <strong>{(entity.pagerank || 0).toFixed(4)}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Documents:{' '}
                            <strong>{entity.doc_ids?.join(', ') || 'N/A'}</strong>
                          </span>
                        </div>
                      </div>

                      {entity.connected_entities &&
                      entity.connected_entities.length > 0 ? (
                        <div className="connected-entities-grid">
                          {entity.connected_entities.map((conn) => {
                            const connConfig = getEntityConfig(conn.label)
                            const ConnIcon = connConfig.icon

                            return (
                              <div
                                key={conn.id}
                                className="neighbor-entity-chip"
                                onClick={() => {
                                  if (onSelectEntity) onSelectEntity(conn.id)
                                }}
                              >
                                <div
                                  className="neighbor-icon-wrapper"
                                  style={{
                                    backgroundColor: connConfig.bg,
                                    borderColor: connConfig.border,
                                    color: connConfig.color,
                                  }}
                                >
                                  <ConnIcon size={13} />
                                </div>
                                <div className="neighbor-info">
                                  <span className="neighbor-name">{conn.name}</span>
                                  <span className="neighbor-meta">
                                    {conn.label} • {conn.weight} co-occurrence
                                    {conn.weight > 1 ? 's' : ''}
                                  </span>
                                </div>
                                {conn.shared_docs &&
                                  conn.shared_docs.length > 0 &&
                                  onOpenDoc && (
                                    <div className="neighbor-docs-tags">
                                      {conn.shared_docs.map((doc) => (
                                        <button
                                          key={doc}
                                          className="doc-mini-tag"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            onOpenDoc(doc)
                                          }}
                                          title={`Jump to ${doc}`}
                                        >
                                          <FileText size={10} />
                                          {doc}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="no-neighbors-text">
                          This entity is isolated or has no direct connections in the current case documents.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
