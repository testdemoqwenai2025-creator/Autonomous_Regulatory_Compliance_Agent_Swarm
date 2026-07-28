package tracker

import (
        "encoding/json"
        "fmt"
        "log"
        "sync"
        "time"

        "github.com/google/uuid"

        "github.com/maritime-swarm/mttr-tracker/internal/config"
        "github.com/maritime-swarm/mttr-tracker/internal/database"
        "github.com/maritime-swarm/mttr-tracker/internal/models"
)

// Tracker is the core MTTR tracking engine. It buffers incoming
// telemetry events and flushes them to the database in batches
// to maximise write throughput.
type Tracker struct {
        store    *database.Store
        cfg      *config.Config
        buffer   []*models.MTTRTrackingEvent
        mu       sync.Mutex
        flushSig chan struct{}
        done     chan struct{}
        wg       sync.WaitGroup
}

// New creates a new Tracker and starts the background flush goroutine.
func New(cfg *config.Config, store *database.Store) *Tracker {
        t := &Tracker{
                store:    store,
                cfg:      cfg,
                buffer:   make([]*models.MTTRTrackingEvent, 0, 1000),
                flushSig: make(chan struct{}, 1),
                done:     make(chan struct{}),
        }
        t.wg.Add(1)
        go t.flushLoop()
        log.Println("[Tracker] MTTR tracker started")
        return t
}

// RecordEvent creates and buffers a new telemetry event for a finding phase transition.
func (t *Tracker) RecordEvent(findingID, phase, assignee string, metadata map[string]interface{}) error {
        if !isValidPhase(phase) {
                return fmt.Errorf("invalid phase: %s", phase)
        }

        // Calculate duration from previous phase if available
        event := &models.MTTRTrackingEvent{
                ID:           uuid.New().String(),
                FindingID:    findingID,
                Phase:        phase,
                Timestamp:    time.Now().UTC(),
                Assignee:     nilIfEmpty(assignee),
        }

        if assignee != "" {
                event.Assignee = &assignee
        }

        if metadata != nil {
                metaBytes, err := json.Marshal(metadata)
                if err == nil {
                        event.MetadataJSON = string(metaBytes)
                }
        }

        // Look up previous event for this finding to compute duration
        previousDuration := t.computePhaseDuration(findingID)
        if previousDuration > 0 {
                event.DurationSeconds = &previousDuration
        }

        t.mu.Lock()
        t.buffer = append(t.buffer, event)
        t.mu.Unlock()

        log.Printf("[Tracker] Event recorded: finding=%s phase=%s", findingID, phase)
        return nil
}

// RecordEventDirect ingests an event immediately without buffering.
// Use for low-volume or critical events that must be persisted at once.
func (t *Tracker) RecordEventDirect(event *models.MTTRTrackingEvent) error {
        return t.store.IngestEvent(event)
}

// GetFindingMTTR returns the full timeline and computed MTTR for a finding.
func (t *Tracker) GetFindingMTTR(findingID string) ([]models.MTTRTrackingEvent, float64, error) {
        events, err := t.store.GetFindingTimeline(findingID)
        if err != nil {
                return nil, 0, err
        }
        mttrHours := computeMTTRHours(events)
        return events, mttrHours, nil
}

// CalculateMTTRReport computes aggregate MTTR metrics.
func (t *Tracker) CalculateMTTRReport(req models.MTTRReportRequest) (*models.MTTRCalculation, error) {
        from := req.From
        to := req.To
        if from.IsZero() {
                from = time.Now().UTC().AddDate(0, 0, -30)
        }
        if to.IsZero() {
                to = time.Now().UTC()
        }
        return t.store.CalculateMTTR(from, to, req.RiskCategory)
}

// Flush forces an immediate buffer flush to the database.
func (t *Tracker) Flush() error {
        return t.flush()
}

// GetOpenFindingsMTTR returns per-finding MTTR for open findings.
func (t *Tracker) GetOpenFindingsMTTR() ([]models.FindingMTTR, error) {
        return t.store.GetOpenFindingsMTTR()
}

// Stop gracefully shuts down the tracker, flushing remaining events.
func (t *Tracker) Stop() {
        log.Println("[Tracker] Shutting down...")
        close(t.done)
        t.wg.Wait()
        t.Flush()
        log.Println("[Tracker] Stopped")
}

// PurgeOldEvents removes events beyond the retention period.
func (t *Tracker) PurgeOldEvents() (int64, error) {
        return t.store.PurgeOldEvents(t.cfg.RetentionDays)
}

// flushLoop runs in the background, flushing the buffer at configured intervals.
func (t *Tracker) flushLoop() {
        defer t.wg.Done()
        ticker := time.NewTicker(time.Duration(t.cfg.FlushIntervalSeconds) * time.Second)
        defer ticker.Stop()

        for {
                select {
                case <-ticker.C:
                        if err := t.flush(); err != nil {
                                log.Printf("[Tracker] Flush error: %v", err)
                        }
                case <-t.flushSig:
                        if err := t.flush(); err != nil {
                                log.Printf("[Tracker] Flush error: %v", err)
                        }
                case <-t.done:
                        return
                }
        }
}

// flush drains the buffer and writes all events to the database.
func (t *Tracker) flush() error {
        t.mu.Lock()
        if len(t.buffer) == 0 {
                t.mu.Unlock()
                return nil
        }
        events := make([]*models.MTTRTrackingEvent, len(t.buffer))
        copy(events, t.buffer)
        t.buffer = t.buffer[:0]
        t.mu.Unlock()

        log.Printf("[Tracker] Flushing %d event(s)...", len(events))
        err := t.store.IngestEventsBatch(events)
        if err != nil {
                // Re-queue failed events
                t.mu.Lock()
                t.buffer = append(events, t.buffer...)
                t.mu.Unlock()
                return err
        }

        log.Printf("[Tracker] Flushed %d event(s)", len(events))
        return nil
}

// computePhaseDuration looks at previous events for this finding to compute
// the time spent in the previous phase.
func (t *Tracker) computePhaseDuration(findingID string) float64 {
        events, err := t.store.GetFindingTimeline(findingID)
        if err != nil || len(events) == 0 {
                return 0
        }
        lastEvent := events[len(events)-1]
        return time.Since(lastEvent.Timestamp).Seconds()
}

func computeMTTRHours(events []models.MTTRTrackingEvent) float64 {
        var identified, resolved time.Time
        for _, e := range events {
                if e.Phase == "identified" {
                        identified = e.Timestamp
                }
                if e.Phase == "resolved" {
                        resolved = e.Timestamp
                }
        }
        if identified.IsZero() || resolved.IsZero() {
                return 0
        }
        return resolved.Sub(identified).Hours()
}

func isValidPhase(phase string) bool {
        for _, p := range models.AllPhases {
                if string(p) == phase {
                        return true
                }
        }
        return false
}

func nilIfEmpty(s string) *string {
        if s == "" {
                return nil
        }
        return &s
}