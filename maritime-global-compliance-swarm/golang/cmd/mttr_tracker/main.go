package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/maritime-swarm/mttr-tracker/internal/config"
	"github.com/maritime-swarm/mttr-tracker/internal/database"
	"github.com/maritime-swarm/mttr-tracker/internal/tracker"
	"github.com/maritime-swarm/mttr-tracker/pkg/api"
)

func main() {
	// CLI flags
	var (
		showVersion = flag.Bool("version", false, "Print version and exit")
		initDB     = flag.Bool("init-db", false, "Initialise database schema and exit")
		purge      = flag.Bool("purge", false, "Purge events beyond retention period")
	)
	flag.Parse()

	if *showVersion {
		fmt.Println("mttr-tracker v1.0.0")
		os.Exit(0)
	}

	// Load configuration
	cfg := config.Load()
	log.Printf("[Main] Starting MTTR Tracker (driver=%s)", cfg.DBDriver)

	// Connect to database
	store, err := database.New(cfg)
	if err != nil {
		log.Fatalf("[Main] Failed to connect to database: %v", err)
	}
	defer store.Close()

	if *initDB {
		log.Println("[Main] Schema initialised.")
		return
	}

	// Create tracker with background flush
	trk := tracker.New(cfg, store)
	defer trk.Stop()

	// Handle purge command
	if *purge {
		deleted, err := trk.PurgeOldEvents()
		if err != nil {
			log.Fatalf("[Main] Purge failed: %v", err)
		}
		log.Printf("[Main] Purged %d old event(s) (retention=%d days)", deleted, cfg.RetentionDays)
		return
	}

	// Start HTTP API
	srv := api.NewServer(trk, cfg.HTTPPort)

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("[Main] Received shutdown signal")
		trk.Stop()
		os.Exit(0)
	}()

	log.Printf("[Main] MTTR Tracker ready on :%d", cfg.HTTPPort)
	if err := srv.Serve(cfg.HTTPPort); err != nil {
		log.Fatalf("[Main] Server error: %v", err)
	}
}
