package migrate

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

var versionPattern = regexp.MustCompile(`^[0-9][0-9_]*[a-zA-Z0-9_]+$`)

func validateVersion(version string) error {
	if !versionPattern.MatchString(version) {
		return fmt.Errorf("invalid migration version %q: must match pattern like 000001_init_schema", version)
	}
	return nil
}

func validateName(name string) error {
	if strings.Contains(name, "/") || strings.Contains(name, "\\") || strings.Contains(name, "..") {
		return fmt.Errorf("invalid migration filename %q", name)
	}
	return nil
}

func Up(db *sql.DB, migrationsDir string) error {
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)`); err != nil {
		return fmt.Errorf("create schema_migrations table: %w", err)
	}

	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		return fmt.Errorf("read migrations dir %s: %w", migrationsDir, err)
	}

	var files []string
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".up.sql") {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)

	for _, name := range files {
		if err := validateName(name); err != nil {
			return err
		}
		version := strings.TrimSuffix(name, ".up.sql")
		if err := validateVersion(version); err != nil {
			return err
		}

		var exists int
		if err := db.QueryRow("SELECT COUNT(*) FROM schema_migrations WHERE version = $1", version).Scan(&exists); err != nil {
			return fmt.Errorf("check migration %s: %w", version, err)
		}
		if exists > 0 {
			continue
		}

		content, err := os.ReadFile(filepath.Join(migrationsDir, name))
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}
		sql := strings.TrimSpace(string(content))
		if sql == "" {
			return fmt.Errorf("migration %s is empty", name)
		}

		tx, err := db.Begin()
		if err != nil {
			return fmt.Errorf("begin tx for %s: %w", version, err)
		}

		if _, err := tx.Exec(sql); err != nil {
			if rbErr := tx.Rollback(); rbErr != nil {
				return fmt.Errorf("apply migration %s: %w (rollback: %v)", version, err, rbErr)
			}
			return fmt.Errorf("apply migration %s: %w", version, err)
		}

		if _, err := tx.Exec("INSERT INTO schema_migrations (version) VALUES ($1)", version); err != nil {
			if rbErr := tx.Rollback(); rbErr != nil {
				return fmt.Errorf("record migration %s: %w (rollback: %v)", version, err, rbErr)
			}
			return fmt.Errorf("record migration %s: %w", version, err)
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %s: %w", version, err)
		}
	}

	return nil
}
