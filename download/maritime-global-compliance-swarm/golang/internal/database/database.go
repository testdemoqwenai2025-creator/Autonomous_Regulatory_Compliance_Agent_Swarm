package database

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	_ "github.com/lib/pq"
	_ "github.com/mattn/go-sqlite3"

	"github.com/maritime-swarm/mttr-tracker/internal/config"
	"github.com/maritime-swarm/mttr-tracker/internal/models"
)

// Store handles all database operations for MTTR telemetry events.
// It is safe for concurrent use (database/sql manages connection pooling).
type Store struct {
	db     *sql.DB
	driver string
}

// New creates a new Store and initialises the schema.
func New(cfg *config.Config) (*Store, error) {
	db, err := sql.Open(cfg.DriverName(), cfg.DSN())
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Connection pool tuning
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	// Verify connectivity
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	store := &Store{db: db, driver: cfg.DBDriver}
	if err := store.initSchema(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to init schema: %w", err)
	}

	log.Printf("[DB] Connected: driver=%s", cfg.DBDriver)
	return store, nil
}

// initSchema creates the mttr_events table if it does not exist.
func (s *Store) initSchema() error {
	var ddl string
	if s.driver == "sqlite" {
		ddl = `
		CREATE TABLE IF NOT EXISTS mttr_events (
			id TEXT PRIMARY KEY,
			finding_id TEXT NOT NULL,
			phase TEXT NOT NULL,
			timestamp DATETIME NOT NULL,
			assignee TEXT,
			duration_seconds REAL,
			metadata TEXT DEFAULT '{}'
		);
		CREATE INDEX IF NOT EXISTS idx_mttr_events_finding ON mttr_events(finding_id);
		CREATE INDEX IF NOT EXISTS idx_mttr_events_phase ON mttr_events(phase);
		CREATE INDEX IF NOT EXISTS idx_mttr_events_timestamp ON mttr_events(timestamp);
		`
	} else {
		ddl = `
		CREATE TABLE IF NOT EXISTS mttr_events (
			id TEXT PRIMARY KEY,
			finding_id TEXT NOT NULL REFERENCES audit_findings(id),
			phase TEXT NOT NULL,
			timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			assignee TEXT,
			duration_seconds DOUBLE PRECISION,
			metadata JSONB DEFAULT '{}'
		);
		CREATE INDEX IF NOT EXISTS idx_mttr_events_finding ON mttr_events(finding_id);
		CREATE INDEX IF NOT EXISTS idx_mttr_events_phase ON mttr_events(phase);
		CREATE INDEX IF NOT EXISTS idx_mttr_events_timestamp ON mttr_events(timestamp);
		`
	}
	_, err := s.db.Exec(ddl)
	return err
}

// IngestEvent inserts a new MTTR tracking event.
func (s *Store) IngestEvent(event *models.MTTRTrackingEvent) error {
	query := `
		INSERT INTO mttr_events (id, finding_id, phase, timestamp, assignee, duration_seconds, metadata)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`
	if s.driver == "postgres" {
		query = strings.ReplaceAll(query, "?", "$1,$2,$3,$4,$5,$6,$7")
	}
	_, err := s.db.Exec(query,
		event.ID, event.FindingID, event.Phase, event.Timestamp,
		event.Assignee, event.DurationSeconds, event.MetadataJSON,
	)
	return err
}

// IngestEventsBatch inserts multiple events in a single transaction.
func (s *Store) IngestEventsBatch(events []*models.MTTRTrackingEvent) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO mttr_events (id, finding_id, phase, timestamp, assignee, duration_seconds, metadata)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, event := range events {
		_, err := stmt.Exec(
			event.ID, event.FindingID, event.Phase, event.Timestamp,
			event.Assignee, event.DurationSeconds, event.MetadataJSON,
		)
		if err != nil {
			return fmt.Errorf("failed to ingest event %s: %w", event.ID, err)
		}
	}
	return tx.Commit()
}

// GetFindingTimeline retrieves all events for a finding ordered by timestamp.
func (s *Store) GetFindingTimeline(findingID string) ([]models.MTTRTrackingEvent, error) {
	query := `
		SELECT id, finding_id, phase, timestamp, assignee, duration_seconds, metadata
		FROM mttr_events
		WHERE finding_id = ?
		ORDER BY timestamp ASC
	`
	rows, err := s.db.Query(query, findingID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []models.MTTRTrackingEvent
	for rows.Next() {
		var e models.MTTRTrackingEvent
		if err := rows.Scan(&e.ID, &e.FindingID, &e.Phase, &e.Timestamp,
			&e.Assignee, &e.DurationSeconds, &e.MetadataJSON); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, rows.Err()
}

// CalculateMTTR computes MTTR metrics across findings.
func (s *Store) CalculateMTTR(from, to time.Time, riskCategory string) (*models.MTTRCalculation, error) {
	// Find findings that have both 'identified' and 'resolved' phases
	query := `
		WITH finding_times AS (
			SELECT
				f.finding_id,
				MIN(CASE WHEN e.phase = 'identified' THEN e.timestamp END) AS identified_at,
				MAX(CASE WHEN e.phase = 'resolved' THEN e.timestamp END) AS resolved_at
			FROM mttr_events e
			JOIN audit_findings f ON e.finding_id = f.id
			WHERE e.timestamp >= ? AND e.timestamp <= ?
	` + placeholder(1) + `
			GROUP BY f.finding_id
			HAVING MIN(CASE WHEN e.phase = 'identified' THEN e.timestamp END) IS NOT NULL
			   AND MAX(CASE WHEN e.phase = 'resolved' THEN e.timestamp END) IS NOT NULL
		)
		SELECT
			COUNT(*) AS total,
			COALESCE(AVG(EXTRACT(EPOCH FROM (resolved_at - identified_at)) / 3600.0), 0) AS avg_mttr,
			COALESCE(MEDIAN(EXTRACT(EPOCH FROM (resolved_at - identified_at)) / 3600.0), 0) AS median_mttr,
			COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (resolved_at - identified_at)) / 3600.0), 0) AS p95_mttr
		FROM finding_times
	`

	// For SQLite, use a simpler query
	if s.driver == "sqlite" {
		query = `
			WITH finding_times AS (
				SELECT
					e.finding_id,
					MIN(CASE WHEN e.phase = 'identified' THEN e.timestamp END) AS identified_at,
					MAX(CASE WHEN e.phase = 'resolved' THEN e.timestamp END) AS resolved_at
				FROM mttr_events e
				WHERE e.timestamp >= ? AND e.timestamp <= ?
				GROUP BY e.finding_id
				HAVING identified_at IS NOT NULL AND resolved_at IS NOT NULL
			)
			SELECT
				COUNT(*) AS total,
				COALESCE(AVG((julianday(resolved_at) - julianday(identified_at)) * 24.0), 0) AS avg_mttr,
				COALESCE(AVG((julianday(resolved_at) - julianday(identified_at)) * 24.0), 0) AS median_mttr,
				COALESCE(AVG((julianday(resolved_at) - julianday(identified_at)) * 24.0), 0) AS p95_mttr
			FROM finding_times
		`
	}

	args := []interface{}{from, to}
	if riskCategory != "" {
		args = append(args, riskCategory)
	}

	row := s.db.QueryRow(query, args...)
	var calc models.MTTRCalculation
	err := row.Scan(
		&calc.TotalFindings,
		&calc.AvgMTTRHours,
		&calc.MedianMTTRHours,
		&calc.P95MTTRHours,
	)
	if err != nil {
		return nil, err
	}
	calc.ResolvedFindings = calc.TotalFindings
	calc.CalculatedAt = time.Now().UTC()
	return &calc, nil
}

// GetOpenFindingsMTTR returns per-finding MTTR data for findings currently open.
func (s *Store) GetOpenFindingsMTTR() ([]models.FindingMTTR, error) {
	query := `
		SELECT
			e.finding_id,
			f.risk_category,
			f.severity,
			MIN(CASE WHEN e.phase = 'identified' THEN e.timestamp END) AS identified_at,
			MAX(CASE WHEN e.phase = 'resolved' THEN e.timestamp END) AS resolved_at,
			CASE
				WHEN MAX(CASE WHEN e.phase = 'resolved' THEN e.timestamp END) IS NOT NULL
				THEN (julianday(MAX(CASE WHEN e.phase = 'resolved' THEN e.timestamp END)) -
					  julianday(MIN(CASE WHEN e.phase = 'identified' THEN e.timestamp END))) * 24.0
				ELSE 0
			END AS mttr_hours,
			(SELECT phase FROM mttr_events e2 WHERE e2.finding_id = e.finding_id
			 ORDER BY e2.timestamp DESC LIMIT 1) AS current_phase,
			COUNT(*) AS phase_count
		FROM mttr_events e
		LEFT JOIN audit_findings f ON e.finding_id = f.id
		GROUP BY e.finding_id
		ORDER BY identified_at ASC
	`

	rows, err := s.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []models.FindingMTTR
	for rows.Next() {
		var f models.FindingMTTR
		if err := rows.Scan(&f.FindingID, &f.RiskCategory, &f.Severity,
			&f.IdentifiedAt, &f.ResolvedAt, &f.MTTRHours, &f.CurrentPhase, &f.PhaseCount); err != nil {
			return nil, err
		}
		results = append(results, f)
	}
	return results, rows.Err()
}

// PurgeOldEvents removes events older than the retention period.
func (s *Store) PurgeOldEvents(retentionDays int) (int64, error) {
	cutoff := time.Now().UTC().AddDate(0, 0, -retentionDays)
	result, err := s.db.Exec(
		`DELETE FROM mttr_events WHERE timestamp < ?`,
		cutoff,
	)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

// Close closes the underlying database connection.
func (s *Store) Close() error {
	return s.db.Close()
}

func placeholder(n int) string {
	if n == 1 {
		return " AND f.risk_category = ?"
	}
	return ""
}