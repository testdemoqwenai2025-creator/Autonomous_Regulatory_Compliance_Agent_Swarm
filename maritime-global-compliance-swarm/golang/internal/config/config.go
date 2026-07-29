package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Config holds all configuration for the MTTR Tracker service.
type Config struct {
	// Database
	DBDriver     string // "sqlite" or "postgres"
	DBHost       string
	DBPort       int
	DBName       string
	DBUser       string
	DBPassword   string
	DBSSLMode    string
	SQLitePath   string

	// Server
	HTTPPort     int
	GRPCPort     int

	// Telemetry
	FlushIntervalSeconds int
	RetentionDays        int

	// Logging
	LogLevel string
}

// Load reads configuration from environment variables with defaults.
func Load() *Config {
	return &Config{
		// Database
		DBDriver:             getEnv("DB_DRIVER", "sqlite"),
		DBHost:               getEnv("DB_HOST", "localhost"),
		DBPort:               getEnvInt("DB_PORT", 5432),
		DBName:               getEnv("DB_NAME", "maritime_compliance"),
		DBUser:               getEnv("DB_USER", "postgres"),
		DBPassword:           getEnv("DB_PASSWORD", ""),
		DBSSLMode:            getEnv("DB_SSL_MODE", "prefer"),
		SQLitePath:           getEnv("SQLITE_PATH", "data/compliance.db"),

		// Server
		HTTPPort:             getEnvInt("MTTR_HTTP_PORT", 8080),
		GRPCPort:             getEnvInt("MTTR_GRPC_PORT", 50051),

		// Telemetry
		FlushIntervalSeconds: getEnvInt("MTTR_FLUSH_INTERVAL", 10),
		RetentionDays:        getEnvInt("MTTR_RETENTION_DAYS", 90),

		// Logging
		LogLevel: getEnv("LOG_LEVEL", "INFO"),
	}
}

// DSN returns the database connection string.
func (c *Config) DSN() string {
	if c.DBDriver == "sqlite" {
		// Ensure parent directory exists
		dir := strings.TrimSuffix(c.SQLitePath, "/compliance.db")
		dir = strings.TrimSuffix(dir, "/compliance.db")
		// Handle both "data/compliance.db" and "data"
		if idx := strings.LastIndex(c.SQLitePath, "/"); idx >= 0 {
			dir = c.SQLitePath[:idx]
		}
		os.MkdirAll(dir, 0755)
		return c.SQLitePath
	}
	return fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		c.DBHost, c.DBPort, c.DBUser, c.DBPassword, c.DBName, c.DBSSLMode,
	)
}

// DriverName returns the SQL driver name for database/sql.
func (c *Config) DriverName() string {
	if c.DBDriver == "sqlite" {
		return "sqlite3"
	}
	return "postgres"
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	i, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return i
}
