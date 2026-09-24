# Graph The Case

### Connect the clues. Reveal the network.

**AI-Powered Criminal Network Analysis System**

[Problem Statement ID: 26189]
[Ministry of Home Affairs / NCRB]

---

## 📌 Overview

**Graph The Case** is an AI-powered investigation and criminal network analysis platform designed to help investigators transform fragmented crime-related information into a connected, visual, and evidence-grounded network.

Modern investigations can involve large amounts of information distributed across FIRs, communication records, financial information, surveillance reports, intelligence reports, and other sources. Manually identifying relationships across such information can be time-consuming and may cause important connections to be overlooked.

Graph The Case addresses this challenge by combining:

- **Natural Language Processing**
- **Generative AI**
- **Structured data extraction**
- **Graph databases**
- **Interactive graph visualization**
- **Evidence provenance**
- **Tamper-evident hashing**
- **Human-in-the-loop prioritization**

The system converts source information into a connected graph where investigators can explore entities, relationships, evidence, and priorities from a single investigation workspace.

---

## 🎯 Problem Statement

### Problem Statement ID

**26189**

### Problem Statement Title

**AI-Powered Criminal Network Analysis System**

### Background

Modern criminal activities are increasingly organized and interconnected. Criminals may operate through networks involving associates, intermediaries, financial channels, communication links, locations, and events.

Law enforcement agencies may collect large amounts of information from sources such as:

- FIRs and police reports
- Call Detail Records (CDRs)
- Financial transaction records
- Surveillance reports
- Social media intelligence
- Criminal history databases
- Intelligence agency reports

However, this information is often fragmented, unstructured, and distributed across different systems. Manual analysis can be slow, labor-intensive, and may result in important connections being missed.

### Objective

The objective is to develop an AI-powered system capable of analyzing crime and intelligence-related information to uncover relationships among:

- Individuals
- Organizations
- Locations
- Vehicles
- Communication identifiers
- Financial entities
- Events
- Other relevant entities

The system should assist investigators by providing connected, visual, and analytical insights.

---

## 💡 Our Solution

### Graph The Case

Graph The Case transforms investigation data into an **evidence-grounded knowledge graph**.

Instead of treating every document as an isolated case, the system extracts entities and explicit relationships and represents them as a connected network.

### Core workflow

```text
Investigation Source
        │
        ▼
   Text Input
        │
        ▼
 Evidence Integrity
    SHA-256 Hash
        │
        ▼
     Gemini AI
        │
        ▼
Entity & Relationship Extraction
        │
        ▼
 Pydantic Validation
        │
        ▼
      Neo4j
  Graph Database
        │
        ▼
 Interactive Graph
        │
        ├──────────────► Entity Details
        │
        ├──────────────► Evidence / Provenance
        │
        ├──────────────► Network Summary
        │
        └──────────────► Investigator Priority
```

---

## 🔍 Key Features

### 1. AI-Powered Entity Extraction

The system uses Gemini to extract structured information from investigation text.

Supported entity categories include:

- Person
- Organization
- Location
- Vehicle
- Phone
- Financial Account
- Project
- Court
- Legal Section
- Event
- Case

The extracted information is converted into a structured `FIRAnalysis` representation.

---

### 2. Relationship Mapping

The system identifies explicit relationships described in the source material.

Examples:

```text
Person
   │
   └── partner_of ──► Organization
```

```text
Person
   │
   └── associated_with ──► Person
```

```text
Organization
   │
   └── located_at ──► Location
```

Relationships preserve their original context rather than being treated as unexplained graph connections.

---

### 3. Evidence-Grounded Analysis

A major design principle of Graph The Case is:

> **AI extracts information, but the backend validates the evidence.**

Each accepted entity or relationship is expected to retain:

- Evidence ID
- Source page
- Evidence snippet
- Relationship status
- Source context

The system uses strict validation to reject extracted evidence when the cited evidence cannot be verified against the supplied source text.

This helps prevent unsupported AI-generated relationships from entering the graph.

---

### 4. Interactive Investigation Graph

Graph data is stored in **Neo4j** and displayed through an interactive graph interface.

Users can:

- Zoom
- Pan
- Drag nodes
- Select entities
- Inspect relationships
- Search entities
- View graph connections
- Reset the graph view

The graph visually represents how entities are connected within an investigation.

---

### 5. Case Network Summary

The system provides a human-readable explanation of what the graph represents.

Instead of requiring an investigator to interpret every edge manually, the system can explain relationships such as:

> Person A is connected to Organization B through a stated partnership.

The summary can focus on:

- Overall investigation network
- Selected entity
- Selected relationship

The explanation is grounded in validated graph information and its associated evidence.

---

### 6. Human-in-the-Loop Priority

Graph The Case does not force investigators to rely entirely on automated prioritization.

The system supports:

**AI Priority** — An initial priority order generated from the available network analysis.

**Investigator Priority** — An investigator can manually drag entities into a preferred priority order based on their domain knowledge and understanding of the investigation.

The original AI priority remains preserved.

```text
AI Priority
     │
     ▼
Investigator manually reorders
     │
     ▼
Manual Priority
```

Manually prioritized entities receive a distinct visual highlight in the priority interface.

**Reset to AI Priority** — A dedicated reset option restores:

- Original AI ordering
- Original visual styling
- Original priority state
- Removal of manual-priority highlighting

Manual priority represents **investigator focus**, not guilt or criminality.

---

## 🔐 Evidence Integrity

Evidence integrity is a core component of Graph The Case.

For each source document, the backend generates a **SHA-256 hash** from the original submitted content.

```text
Original Evidence
       │
       ▼
    SHA-256
       │
       ▼
Original Hash
```

The original hash is treated as an immutable anchor for the evidence.

If a later version differs:

```text
Original Hash:  ABC123...
Current Hash:   XYZ789...
Status:         MODIFIED
```

The system can identify that the submitted source differs from the originally recorded source.

### Versioning

Evidence versions can be represented as:

```text
Version 1 ── SHA-256: A
Version 2 ── SHA-256: B
Version 3 ── SHA-256: C
```

The original Version 1 hash remains unchanged.

> **Important:** A hash mismatch indicates that the source differs from the originally recorded version. It does not by itself identify who changed the source.

---

## 🧾 Evidence Provenance

Graph relationships are designed to remain traceable back to their source.

```text
Graph Entity
     │
     ▼
Relationship
     │
     ▼
Evidence ID
     │
     ▼
Source Page / Location
     │
     ▼
Supporting Evidence
```

This allows an investigator to ask:

> **Why is this entity or relationship present in the graph?**

and trace it back to the supporting source material.

---

## 🧠 Architecture

```text
                  GRAPH THE CASE
                         │
                         ▼
                 Investigation Input
                         │
                         ▼
                  FastAPI Backend
                         │
             ┌───────────┴───────────┐
             │                       │
             ▼                       ▼
       Evidence Integrity       Text Processing
          SHA-256                    │
             │                       ▼
             │                  Gemini AI
             │                       │
             │                       ▼
             │               Structured Extraction
             │                       │
             └───────────────┬───────┘
                             ▼
                      Pydantic Validation
                             │
                             ▼
                           Neo4j
                      Graph Database
                             │
                             ▼
                    React Frontend
                             │
            ┌────────────────┼────────────────┐
            ▼                ▼                ▼
        Graph View       Priority        Case Summary
            │
            ▼
      Entity Details
            │
            ▼
        Provenance
```

---

## 🛠️ Technology Stack

| Technology         | Purpose                                                |
| ------------------ | ------------------------------------------------------- |
| **Python**          | Backend and processing logic                           |
| **FastAPI**         | REST API and backend services                          |
| **Google Gemini**   | AI/NLP entity and relationship extraction               |
| **Pydantic**        | Structured output validation                            |
| **PyMuPDF**         | PDF processing component / legacy extraction pipeline   |
| **SHA-256**         | Evidence integrity and tamper detection                 |
| **Neo4j**           | Graph database                                          |
| **Cypher**          | Graph queries                                           |
| **React**           | Frontend application                                    |
| **Vite**            | Frontend development/build tooling                      |
| **Cytoscape.js**    | Interactive graph visualization                         |
| **Python pytest**   | Backend testing                                          |

---

## 🔄 Data Flow

```text
Source Document / Investigation Text
                    │
                    ▼
             Evidence Registration
                    │
                    ▼
               SHA-256 Hash
                    │
                    ▼
             Text Processing
                    │
                    ▼
               Gemini AI
                    │
                    ▼
        Entities + Relationships
                    │
                    ▼
          Pydantic Validation
                    │
                    ▼
              Neo4j Graph
                    │
                    ▼
         Interactive Investigation
                    │
         ┌──────────┼──────────┐
         ▼          ▼          ▼
       Graph     Priority    Summary
         │
         ▼
      Evidence
     Provenance
```

---

## 🧪 Validation Philosophy

Graph The Case follows a simple architectural principle:

```text
Gemini
"What does the source say?"

        ↓

Pydantic / Backend
"Is the extracted information valid and grounded?"

        ↓

Neo4j
"How are the validated entities connected?"

        ↓

Frontend
"How can the investigator understand and explore those connections?"
```

The system does **not** treat an AI prediction as proof.

In particular, the application does not automatically label a person as:

- Criminal
- Guilty
- Offender
- Dangerous

Relationships marked as **alleged** remain explicitly identified as alleged.

---

## 👮 Human-in-the-Loop Investigation

Graph The Case is designed as an **AI-assisted investigation platform**, not an autonomous decision-maker.

AI can help:

- Extract entities
- Structure information
- Connect explicit relationships
- Organize the investigation graph
- Generate graph-grounded explanations
- Provide an initial network-based priority

Investigators retain the ability to:

- Inspect evidence
- Review provenance
- Select entities
- Manually prioritize entities
- Override the AI priority for their investigation workflow

---

## 📂 Project Structure

```text
Graph-The-Case/
│
├── backend/
│   ├── app/
│   │   ├── analytics.py
│   │   ├── data_generator.py
│   │   ├── evidence.py
│   │   ├── extraction.py
│   │   ├── graph_builder.py
│   │   ├── main.py
│   │   ├── priority.py
│   │   └── resolution.py
│   │
│   ├── dummy_data/
│   ├── sample_data/
│   ├── requirements.txt
│   └── tests/
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
│
├── README.md
└── .gitignore
```

---

## 🚀 Current Capabilities

The current prototype includes:

- Text-based investigation input
- AI-powered structured extraction
- Entity and relationship mapping
- Evidence-grounded validation
- Neo4j graph persistence
- Interactive graph visualization
- Entity details and provenance
- Case Network Summary
- AI-generated priority
- Investigator-controlled manual priority
- Reset-to-AI priority
- SHA-256 evidence integrity
- Immutable original hash protection
- Evidence versioning
- Source comparison/diff functionality

---

## 🔒 Security & Privacy Principles

Graph The Case is designed around several principles:

- Evidence is hashed server-side.
- Client-provided hashes are not treated as authoritative.
- Original evidence hashes are protected from modification.
- Evidence provenance is preserved.
- AI-generated information is validated before entering the graph.
- Allegations are kept distinct from confirmed source statements.
- Secrets such as API keys and database credentials are not exposed to the frontend.
- Synthetic or authorized data should be used during development and demonstration.

---

## ⚠️ Limitations

This project is a prototype for research, demonstration, and hackathon purposes.

It should not be interpreted as an autonomous criminal-justice decision system.

A cryptographic hash can detect that submitted content differs from a previously recorded version, but a hash alone does not establish:

- who changed the content
- why it was changed
- whether the change was authorized

Likewise, graph connectivity does not establish guilt or criminal responsibility.

The current system is intended to assist human investigators by organizing and visualizing information.

---

## 👥 Team

### Team Members

- **[Nisarg Pandya](https://github.com/Nisarg-Pandyaa)**
- **[Teammate 1]**()
- **[Teammate 2]**()
- **[Anjali Bhalala](https://github.com/anjalibhalala)**
- **[Teammate 4]**()
- **[Teammate 5]**()

---

## 🏆 Hackathon Context

This project was developed for the problem statement:

> **Problem Statement ID 26189 — AI-Powered Criminal Network Analysis System**

The goal is to demonstrate how AI, NLP, graph databases, and evidence-aware investigation workflows can be combined to help investigators understand complex networks more efficiently.

---

## 📜 Disclaimer

Graph The Case is an AI-assisted analytical prototype.

Its outputs are intended to support human review and investigation. The system does not independently determine guilt, criminal responsibility, or legal conclusions.

Relationships marked as **alleged** must remain understood as allegations from the source material and not as established facts.

---

## ⭐ Project Vision

> **Connect the clues. Reveal the network.**

Graph The Case aims to turn fragmented investigation information into a connected, explainable, and evidence-grounded investigation workspace — combining machine intelligence with human investigative judgment.
