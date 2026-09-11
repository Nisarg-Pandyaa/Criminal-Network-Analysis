import { useEffect, useRef, useState, useMemo } from 'react'
import cytoscape from 'cytoscape'
import cola from 'cytoscape-cola'
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  Layers,
  Camera,
  Flame,
  Info,
  User,
  Phone,
  Car,
  Building2,
  MapPin,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react'
import { ENTITY_CONFIG } from './EntityPrioritization.jsx'

cytoscape.use(cola)

const NODE_COLORS = {
  PERSON: '#38BDF8', // Cyan/Sky
  PHONE: '#34D399', // Emerald
  VEHICLE: '#FBBF24', // Amber
  LOCATION: '#F87171', // Coral/Red
  ORG: '#A78BFA', // Purple
  UNKNOWN: '#94A3B8', // Slate
}

export default function GraphView({
  graph,
  analytics,
  selectedEntityId,
  activePriorityRankings = [],
  priorityMode = 'ai',
  onSelectEntity,
}) {
  const containerRef = useRef(null)
  const cyRef = useRef(null)
  const [layoutName, setLayoutName] = useState('cola')
  const [hoveredNode, setHoveredNode] = useState(null)

  // Map entity ID -> priority rank (1, 2, 3...)
  const priorityMap = useMemo(() => {
    const map = {}
    ;(activePriorityRankings || []).forEach((item, idx) => {
      map[item.id] = {
        rank: idx + 1,
        code: `P${idx + 1}`,
      }
    })
    return map
  }, [activePriorityRankings])

  // Initialize and update Cytoscape Graph
  useEffect(() => {
    if (!containerRef.current || !graph) return

    const centrality = analytics?.centrality || {}
    const connectors = new Set(analytics?.key_connectors || [])
    const maxBetweenness = Math.max(
      0.0001,
      ...Object.values(centrality).map((c) => c.betweenness || 0)
    )

    // Build Cytoscape elements with priority badges
    const elements = [
      ...graph.nodes.map((n) => {
        const score = centrality[n.id]?.betweenness || 0
        const nbrs = graph.edges.filter(
          (e) => e.source === n.id || e.target === n.id
        )
        const connCount = nbrs.length
        const isConn = connectors.has(n.id)
        const priorityInfo = priorityMap[n.id]
        const pRank = priorityInfo?.rank || 999
        const isTopPriority = pRank <= 3

        let displayLabel = n.name
        if (pRank === 1) displayLabel = `[P1] ${n.name}`
        else if (pRank === 2) displayLabel = `[P2] ${n.name}`
        else if (pRank === 3) displayLabel = `[P3] ${n.name}`

        // Priority ring border color
        let borderColor = 'rgba(255, 255, 255, 0.3)'
        let borderWidth = 1.5
        if (pRank === 1) {
          borderColor = '#F59E0B' // Gold/Amber glow
          borderWidth = 4.5
        } else if (pRank === 2) {
          borderColor = '#38BDF8' // Sky blue glow
          borderWidth = 3.5
        } else if (pRank === 3) {
          borderColor = '#A78BFA' // Purple glow
          borderWidth = 3.0
        } else if (isConn) {
          borderColor = '#EF4444'
          borderWidth = 3.0
        }

        return {
          data: {
            id: n.id,
            rawName: n.name,
            label: displayLabel,
            entityLabel: n.label,
            isConnector: isConn,
            priorityRank: pRank,
            priorityCode: priorityInfo?.code || null,
            isTopPriority,
            connectionCount: connCount,
            betweenness: score,
            borderColor,
            borderWidth,
            size:
              (isTopPriority ? 38 : 32) +
              Math.min(36, connCount * 6 + (score / maxBetweenness) * 20),
          },
        }
      }),
      ...graph.edges.map((e, i) => ({
        data: {
          id: `e_${e.source}_${e.target}_${i}`,
          source: e.source,
          target: e.target,
          weight: e.weight || 1,
          sharedDocs: e.shared_docs || [],
        },
      })),
    ]

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': (ele) =>
              NODE_COLORS[ele.data('entityLabel')] || '#94A3B8',
            width: 'data(size)',
            height: 'data(size)',
            label: 'data(label)',
            'font-family': 'Plus Jakarta Sans, Inter, sans-serif',
            'font-size': (ele) => (ele.data('isTopPriority') ? 12 : 11),
            'font-weight': (ele) => (ele.data('isTopPriority') ? 700 : 600),
            color: '#E2E8F0',
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'text-wrap': 'wrap',
            'text-max-width': '120px',
            'text-background-color': 'rgba(11, 15, 25, 0.85)',
            'text-background-opacity': 0.85,
            'text-background-padding': '3px',
            'text-background-shape': 'roundrectangle',
            'border-width': 'data(borderWidth)',
            'border-color': 'data(borderColor)',
            'border-style': 'solid',
            'transition-property':
              'background-color, border-color, border-width, opacity, width, height',
            'transition-duration': '0.2s',
          },
        },
        {
          selector: 'edge',
          style: {
            width: (ele) => Math.min(6, 1.5 + ele.data('weight') * 1.5),
            'line-color': 'rgba(148, 163, 184, 0.35)',
            'curve-style': 'bezier',
            opacity: 0.6,
            'transition-property': 'line-color, width, opacity',
            'transition-duration': '0.2s',
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 4.5,
            'border-color': '#38BDF8',
            'border-opacity': 1,
            'shadow-blur': 18,
            'shadow-color': '#38BDF8',
            'shadow-opacity': 0.85,
          },
        },
      ],
      layout: getLayoutOptions(layoutName),
      minZoom: 0.3,
      maxZoom: 3.0,
      wheelSensitivity: 0.3,
    })

    // Node click handler
    cy.on('tap', 'node', (evt) => {
      const node = evt.target
      if (onSelectEntity) {
        onSelectEntity(node.id())
      }
    })

    // Background click (clear selection)
    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        if (onSelectEntity) {
          onSelectEntity(null)
        }
      }
    })

    // Node hover tooltips
    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target
      setHoveredNode({
        id: node.id(),
        name: node.data('rawName'),
        label: node.data('entityLabel'),
        priorityCode: node.data('priorityCode'),
        priorityRank: node.data('priorityRank'),
        connections: node.data('connectionCount'),
        betweenness: node.data('betweenness'),
        isConnector: node.data('isConnector'),
        x: evt.renderedPosition.x,
        y: evt.renderedPosition.y,
      })
    })

    cy.on('mouseout', 'node', () => {
      setHoveredNode(null)
    })

    cyRef.current = cy
    return () => cy.destroy()
  }, [graph, analytics, priorityMap])

  // Handle selected entity highlight effect
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    if (!selectedEntityId) {
      // Reset all nodes and edges to default opacity
      cy.batch(() => {
        cy.nodes().style({ opacity: 1 })
        cy.edges().style({ opacity: 0.6, 'line-color': 'rgba(148, 163, 184, 0.35)' })
      })
      return
    }

    const targetNode = cy.$id(selectedEntityId)
    if (targetNode.length === 0) return

    const connectedEdges = targetNode.connectedEdges()
    const connectedNodes = connectedEdges.connectedNodes()

    cy.batch(() => {
      // Dim unselected elements
      cy.elements().style({ opacity: 0.15 })

      // Highlight target node
      targetNode.style({
        opacity: 1,
        'border-width': 4.5,
        'border-color': '#38BDF8',
      })

      // Highlight connected edges
      connectedEdges.style({
        opacity: 1,
        'line-color': '#38BDF8',
        width: 3.5,
      })

      // Highlight connected neighbor nodes
      connectedNodes.style({
        opacity: 1,
        'border-width': 2.5,
      })
    })

    // Animate camera pan to the selected node
    cy.animate(
      {
        center: { eles: targetNode },
        zoom: Math.max(cy.zoom(), 1.1),
      },
      { duration: 400 }
    )
  }, [selectedEntityId])

  // Handle Layout Switch
  const changeLayout = (newLayout) => {
    setLayoutName(newLayout)
    if (cyRef.current) {
      const layout = cyRef.current.layout(getLayoutOptions(newLayout))
      layout.run()
    }
  }

  const handleZoomIn = () => {
    if (cyRef.current) cyRef.current.zoom(cyRef.current.zoom() * 1.3)
  }

  const handleZoomOut = () => {
    if (cyRef.current) cyRef.current.zoom(cyRef.current.zoom() * 0.75)
  }

  const handleFit = () => {
    if (cyRef.current) cyRef.current.fit(undefined, 35)
  }

  const handleExportPNG = () => {
    if (!cyRef.current) return
    const png = cyRef.current.png({ full: true, bg: '#0B0F19', scale: 2 })
    const link = document.createElement('a')
    link.download = `criminal-network-${Date.now()}.png`
    link.href = png
    link.click()
  }

  return (
    <div className="graph-wrapper-card">
      {/* Visualizer Top Bar */}
      <div className="graph-top-bar">
        <div className="graph-title-group">
          <Layers size={16} className="graph-header-icon" />
          <span className="graph-title-text">Intelligence Network Topology</span>
          <span className="nodes-count-tag">
            {graph?.nodes?.length || 0} Nodes • {graph?.edges?.length || 0} Links
          </span>
          <span
            className={`graph-priority-mode-tag ${
              priorityMode === 'manual' ? 'tag-manual' : 'tag-ai'
            }`}
          >
            {priorityMode === 'manual' ? 'Manual Focus Active' : 'AI Focus Active'}
          </span>
        </div>

        {/* Graph Action Controls */}
        <div className="graph-toolbar">
          <div className="layout-switcher">
            <select
              value={layoutName}
              onChange={(e) => changeLayout(e.target.value)}
              className="layout-select"
              title="Change Graph Layout"
            >
              <option value="cola">Force-Directed (Cola)</option>
              <option value="concentric">Concentric (Centrality)</option>
              <option value="circle">Circular Network</option>
              <option value="breadthfirst">Hierarchical Tree</option>
              <option value="grid">Orthogonal Grid</option>
            </select>
          </div>

          <div className="graph-buttons-group">
            <button
              className="tool-btn"
              onClick={handleZoomIn}
              title="Zoom In"
            >
              <ZoomIn size={15} />
            </button>
            <button
              className="tool-btn"
              onClick={handleZoomOut}
              title="Zoom Out"
            >
              <ZoomOut size={15} />
            </button>
            <button
              className="tool-btn"
              onClick={handleFit}
              title="Fit to Screen"
            >
              <Maximize2 size={15} />
            </button>
            <button
              className="tool-btn"
              onClick={() => changeLayout(layoutName)}
              title="Relayout Graph"
            >
              <RefreshCw size={15} />
            </button>
            <button
              className="tool-btn"
              onClick={handleExportPNG}
              title="Export Snapshot PNG"
            >
              <Camera size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Canvas */}
      <div className="graph-canvas-container">
        <div ref={containerRef} className="graph-canvas" />

        {/* Hover Tooltip Overlay */}
        {hoveredNode && (
          <div
            className="graph-hover-tooltip"
            style={{
              left: Math.min(hoveredNode.x + 15, 600),
              top: Math.max(hoveredNode.y - 40, 20),
            }}
          >
            <div className="tooltip-header">
              <span
                className="tooltip-type-badge"
                style={{
                  color: NODE_COLORS[hoveredNode.label] || '#94A3B8',
                }}
              >
                {hoveredNode.label}
              </span>

              {hoveredNode.priorityRank <= 3 && (
                <span className={`tooltip-priority-badge p-${hoveredNode.priorityRank}`}>
                  Focus Rank #{hoveredNode.priorityRank} (P{hoveredNode.priorityRank})
                </span>
              )}

              {hoveredNode.isConnector && (
                <span className="tooltip-bridge-badge">
                  <Flame size={11} /> Critical Bridge
                </span>
              )}
            </div>
            <div className="tooltip-name">{hoveredNode.name}</div>
            <div className="tooltip-stats">
              <span>Links: <strong>{hoveredNode.connections}</strong></span>
              <span>•</span>
              <span>Betweenness: <strong>{hoveredNode.betweenness.toFixed(3)}</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* Legend Footer Bar */}
      <div className="graph-legend-bar">
        <span className="legend-label">
          <Info size={13} /> Legend:
        </span>
        <div className="legend-items">
          <span className="legend-chip">
            <span className="dot dot-person" /> Person
          </span>
          <span className="legend-chip">
            <span className="dot dot-phone" /> Phone / Comms
          </span>
          <span className="legend-chip">
            <span className="dot dot-vehicle" /> Vehicle
          </span>
          <span className="legend-chip">
            <span className="dot dot-org" /> Organization
          </span>
          <span className="legend-chip">
            <span className="dot dot-loc" /> Location
          </span>
          <span className="legend-chip">
            <span className="dot dot-p1" />
            <span style={{ color: '#F59E0B', fontWeight: 700 }}>Gold Ring: P1 Focus</span>
          </span>
          <span className="legend-chip">
            <span className="dot dot-bridge" />
            <Flame size={11} color="#EF4444" /> Red Ring: Key Connector
          </span>
        </div>
      </div>
    </div>
  )
}

function getLayoutOptions(name) {
  switch (name) {
    case 'concentric':
      return {
        name: 'concentric',
        concentric: (node) => node.data('connectionCount') || 1,
        levelWidth: () => 2,
        animate: true,
        animationDuration: 600,
        padding: 30,
      }
    case 'circle':
      return {
        name: 'circle',
        animate: true,
        animationDuration: 600,
        padding: 30,
      }
    case 'breadthfirst':
      return {
        name: 'breadthfirst',
        directed: false,
        animate: true,
        animationDuration: 600,
        padding: 30,
      }
    case 'grid':
      return {
        name: 'grid',
        animate: true,
        animationDuration: 600,
        padding: 30,
      }
    case 'cola':
    default:
      return {
        name: 'cola',
        animate: true,
        randomize: false,
        maxSimulationTime: 1800,
        nodeSpacing: 45,
        edgeLength: 120,
        padding: 35,
      }
  }
}
