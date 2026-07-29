package api

import (
        "encoding/json"
        "fmt"
        "log"
        "net/http"
        "time"

        "github.com/maritime-swarm/mttr-tracker/internal/models"
        "github.com/maritime-swarm/mttr-tracker/internal/tracker"
)

// Server exposes the MTTR tracker over HTTP.
type Server struct {
        tracker *tracker.Tracker
        mux     *http.ServeMux
}

// NewServer creates and returns a configured HTTP server.
func NewServer(t *tracker.Tracker, port int) *Server {
        s := &Server{
                tracker: t,
                mux:     http.NewServeMux(),
        }
        s.registerRoutes()
        log.Printf("[API] HTTP server starting on :%d", port)
        return s
}

// registerRoutes maps URL paths to handlers.
func (s *Server) registerRoutes() {
        s.mux.HandleFunc("/health", s.handleHealth)
        s.mux.HandleFunc("/api/v1/events", s.handleIngestEvent)
        s.mux.HandleFunc("/api/v1/events/sm", s.handleSMEvent)
        s.mux.HandleFunc("/api/v1/findings/", s.handleGetFindingMTTR)
        s.mux.HandleFunc("/api/v1/mttr/report", s.handleMTTRReport)
        s.mux.HandleFunc("/api/v1/mttr/open", s.handleOpenFindings)
}

// Serve starts the HTTP server on the configured port.
func (s *Server) Serve(port int) error {
        return http.ListenAndServe(fmt.Sprintf(":%d", port), s.mux)
}

// HandlerFunc returns the underlying ServeMux for testing.
func (s *Server) HandlerFunc() http.Handler {
        return s.mux
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
        writeJSON(w, http.StatusOK, map[string]string{"status": "healthy", "service": "mttr-tracker"})
}

func (s *Server) handleIngestEvent(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost {
                writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "POST required"})
                return
        }

        var req models.EventIngestRequest
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON: " + err.Error()})
                return
        }

        if req.FindingID == "" || req.Phase == "" {
                writeJSON(w, http.StatusBadRequest, map[string]string{"error": "finding_id and phase are required"})
                return
        }

        err := s.tracker.RecordEvent(req.FindingID, req.Phase, req.Assignee, req.Metadata)
        if err != nil {
                writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
                return
        }

        writeJSON(w, http.StatusCreated, map[string]string{
                "status":  "recorded",
                "finding": req.FindingID,
                "phase":   req.Phase,
        })
}

func (s *Server) handleGetFindingMTTR(w http.ResponseWriter, r *http.Request) {
        // Extract finding ID from path: /api/v1/findings/{id}
        findingID := r.URL.Path[len("/api/v1/findings/"):]  
        if findingID == "" {
                writeJSON(w, http.StatusBadRequest, map[string]string{"error": "finding_id required"})
                return
        }

        events, mttrHours, err := s.tracker.GetFindingMTTR(findingID)
        if err != nil {
                writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
                return
        }

        writeJSON(w, http.StatusOK, map[string]interface{}{
                "finding_id":  findingID,
                "mttr_hours":  mttrHours,
                "event_count": len(events),
                "events":      events,
        })
}

func (s *Server) handleMTTRReport(w http.ResponseWriter, r *http.Request) {
        var req models.MTTRReportRequest
        fromStr := r.URL.Query().Get("from")
        toStr := r.URL.Query().Get("to")

        if fromStr != "" {
                if t, err := time.Parse(time.RFC3339, fromStr); err == nil {
                        req.From = t
                }
        }
        if toStr != "" {
                if t, err := time.Parse(time.RFC3339, toStr); err == nil {
                        req.To = t
                }
        }
        req.RiskCategory = r.URL.Query().Get("risk_category")

        report, err := s.tracker.CalculateMTTRReport(req)
        if err != nil {
                writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
                return
        }

        writeJSON(w, http.StatusOK, report)
}

func (s *Server) handleOpenFindings(w http.ResponseWriter, r *http.Request) {
        findings, err := s.tracker.GetOpenFindingsMTTR()
        if err != nil {
                writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
                return
        }
        writeJSON(w, http.StatusOK, findings)
}

func writeJSON(w http.ResponseWriter, code int, data interface{}) {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(code)
        json.NewEncoder(w).Encode(data)
}

// handleSMEvent ingests events from the Python state machine callback bridge.
//
// The Python gateway forwards every successful state transition to this
// endpoint via _forward_sm_event_to_mttr(). The payload contains the
// mapped Go phase (via map_go_phase), the finding_id, and transition
// metadata.
//
// This endpoint also validates the phase against the expanded 10-phase
// model and supports the FindingStateToPhase mapping for raw state values.
func (s *Server) handleSMEvent(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost {
                writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "POST required"})
                return
        }

        var req struct {
                FindingID string                 `json:"finding_id"`
                Phase     string                 `json:"phase"`
                Assignee  string                 `json:"assignee,omitempty"`
                Metadata  map[string]interface{} `json:"metadata,omitempty"`
        }

        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON: " + err.Error()})
                return
        }

        if req.FindingID == "" || req.Phase == "" {
                writeJSON(w, http.StatusBadRequest, map[string]string{"error": "finding_id and phase are required"})
                return
        }

        // Resolve phase: try direct match first, then FindingStateToPhase mapping
        phase := req.Phase
        if !isValidPhase(phase) {
                if mapped, ok := models.FindingStateToPhase[phase]; ok {
                        phase = string(mapped)
                } else {
                        writeJSON(w, http.StatusBadRequest, map[string]string{
                                "error": fmt.Sprintf("unknown phase: %s (valid: %v)", phase, models.AllPhases),
                        })
                        return
                }
        }

        err := s.tracker.RecordEvent(req.FindingID, phase, req.Assignee, req.Metadata)
        if err != nil {
                writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
                return
        }

        writeJSON(w, http.StatusCreated, map[string]interface{}{
                "status":          "recorded",
                "finding":         req.FindingID,
                "phase":           phase,
                "source":          "state_machine_bridge",
                "transition_meta": req.Metadata,
        })
}