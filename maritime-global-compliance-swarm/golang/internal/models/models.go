package models

import (
        "time"
)

// EventPhase represents the lifecycle phase of a risk finding.
// Extends the original 5-phase model to align with the Python
// FindingState state machine (10 states).
type EventPhase string

const (
        PhaseIdentified   EventPhase = "identified"
        PhaseTriaged     EventPhase = "triaged"
        PhaseAssigned    EventPhase = "assigned"
        PhaseInProgress  EventPhase = "in_progress"
        PhaseResolved    EventPhase = "resolved"
        PhaseVerified    EventPhase = "verified"
        PhaseEscalated   EventPhase = "escalated"
        PhaseRiskAccepted EventPhase = "risk_accepted"
        PhaseClosed      EventPhase = "closed"
        PhaseFalsePositive EventPhase = "false_positive"
)

// AllPhases defines the canonical phase progression.
// Includes both legacy phases (for backward compat) and new
// state-machine-aligned phases.
var AllPhases = []EventPhase{
        PhaseIdentified,
        PhaseTriaged,
        PhaseAssigned,
        PhaseInProgress,
        PhaseResolved,
        PhaseVerified,
        PhaseEscalated,
        PhaseRiskAccepted,
        PhaseClosed,
        PhaseFalsePositive,
}

// FindingStateToPhase maps Python FindingState values to Go EventPhase values.
// This is the Go-side equivalent of FindingStateMachine.map_go_phase() in Python.
var FindingStateToPhase = map[string]EventPhase{
        "detected":            PhaseIdentified,
        "triaged":             PhaseTriaged,
        "assigned":             PhaseAssigned,
        "in_remediation":       PhaseInProgress,
        "awaiting_verification": PhaseResolved,
        "verified":             PhaseVerified,
        "escalated":            PhaseEscalated,
        "risk_accepted":        PhaseRiskAccepted,
        "closed":               PhaseClosed,
        "false_positive":       PhaseFalsePositive,
}

// MTTRTrackingEvent represents a telemetry event in the lifecycle
// of a risk finding from identification to resolution.
// Maps to the Python mttr_events table.
type MTTRTrackingEvent struct {
        ID               string    `json:"id" db:"id"`
        FindingID        string    `json:"finding_id" db:"finding_id"`
        Phase            string    `json:"phase" db:"phase"`
        Timestamp        time.Time `json:"timestamp" db:"timestamp"`
        Assignee         *string   `json:"assignee,omitempty" db:"assignee"`
        DurationSeconds  *float64  `json:"duration_seconds,omitempty" db:"duration_seconds"`
        MetadataJSON     string    `json:"metadata" db:"metadata"`
}

// MTTRCalculation holds computed MTTR metrics for a set of findings.
type MTTRCalculation struct {
        RiskCategory      string    `json:"risk_category"`
        TotalFindings     int       `json:"total_findings"`
        ResolvedFindings  int       `json:"resolved_findings"`
        AvgMTTRHours      float64   `json:"avg_mttr_hours"`
        MedianMTTRHours   float64   `json:"median_mttr_hours"`
        P95MTTRHours      float64   `json:"p95_mttr_hours"`
        FastestResolution float64   `json:"fastest_resolution_hours"`
        SlowestResolution float64   `json:"slowest_resolution_hours"`
        CalculatedAt      time.Time `json:"calculated_at"`
}

// EventIngestRequest is the payload for ingesting a new telemetry event.
type EventIngestRequest struct {
        FindingID string                 `json:"finding_id" validate:"required"`
        Phase     string                 `json:"phase" validate:"required"`
        Assignee  string                 `json:"assignee,omitempty"`
        Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

// MTTRReportRequest specifies the scope for an MTTR report.
type MTTRReportRequest struct {
        RiskCategory string    `json:"risk_category,omitempty"`
        From        time.Time `json:"from,omitempty"`
        To          time.Time `json:"to,omitempty"`
}

// FindingMTTR holds the MTTR breakdown for a single finding.
type FindingMTTR struct {
        FindingID       string  `json:"finding_id"`
        RiskCategory    string  `json:"risk_category"`
        Severity        string  `json:"severity"`
        IdentifiedAt    string  `json:"identified_at"`
        ResolvedAt      string  `json:"resolved_at,omitempty"`
        MTTRHours       float64 `json:"mttr_hours,omitempty"`
        CurrentPhase    string  `json:"current_phase"`
        PhaseCount      int     `json:"phase_count"`
}