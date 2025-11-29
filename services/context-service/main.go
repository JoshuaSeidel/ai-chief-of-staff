package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
	"golang.org/x/net/context"
)

// Context represents a context entry
type Context struct {
	ID        int        `json:"id"`
	Category  string     `json:"category"`
	Content   string     `json:"content"`
	Source    string     `json:"source"`
	CreatedAt time.Time  `json:"created_at"`
	IsActive  bool       `json:"is_active"`
	Priority  int        `json:"priority"`
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
}

// ContextQuery represents query parameters
type ContextQuery struct {
	Category   string `json:"category"`
	Source     string `json:"source"`
	Limit      int    `json:"limit"`
	ActiveOnly bool   `json:"active_only"`
}

// ContextResponse represents the API response
type ContextResponse struct {
	Contexts []Context `json:"contexts"`
	Count    int       `json:"count"`
	Cached   bool      `json:"cached"`
}

// HealthResponse represents health check response
type HealthResponse struct {
	Status         string `json:"status"`
	Service        string `json:"service"`
	Version        string `json:"version"`
	DBConnected    bool   `json:"db_connected"`
	RedisConnected bool   `json:"redis_connected"`
}

var (
	db          *sql.DB
	redisClient *redis.Client
	ctx         = context.Background()
)

func main() {
	// Configure structured logging
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)
	log.Println("=== Context Service Starting ===")

	// Initialize database
	log.Println("→ Initializing database connection...")
	if err := initDB(); err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer db.Close()
	log.Println("✓ Database connected")

	// Initialize Redis
	log.Println("→ Initializing Redis connection...")
	initRedis()
	if redisClient != nil {
		log.Println("✓ Redis connected")
	} else {
		log.Println("⚠ Redis not available (caching disabled)")
	}

	// Create router
	r := mux.NewRouter()

	// Routes
	r.HandleFunc("/", rootHandler).Methods("GET")
	r.HandleFunc("/health", healthHandler).Methods("GET")
	r.HandleFunc("/context", getContextHandler).Methods("GET")
	r.HandleFunc("/context/recent", getRecentContextHandler).Methods("GET")
	r.HandleFunc("/context/rolling", getRollingContextHandler).Methods("GET")
	r.HandleFunc("/context/search", searchContextHandler).Methods("POST")

	// Add request logging middleware
	r.Use(loggingMiddleware)

	// Enable CORS
	r.Use(corsMiddleware)

	// Start server
	port := getEnv("PORT", "8005")
	log.Printf("✓ Context Service listening on port %s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatal("Server failed to start:", err)
	}
}

func initDB() error {
	// Check for DATABASE_URL first (standard PostgreSQL connection string)
	databaseURL := getEnv("DATABASE_URL", "")
	if databaseURL != "" {
		// Ensure sslmode=disable is set (PostgreSQL in Docker typically doesn't have SSL enabled)
		// Parse the URL and add sslmode parameter if not present
		if !strings.Contains(databaseURL, "sslmode=") {
			parsedURL, err := url.Parse(databaseURL)
			if err == nil {
				query := parsedURL.Query()
				query.Set("sslmode", "disable")
				parsedURL.RawQuery = query.Encode()
				databaseURL = parsedURL.String()
			} else {
				// If parsing fails, try simple string append
				separator := "?"
				if strings.Contains(databaseURL, "?") {
					separator = "&"
				}
				databaseURL = databaseURL + separator + "sslmode=disable"
			}
		}

		var err error
		db, err = sql.Open("postgres", databaseURL)
		if err != nil {
			return err
		}

		// Test connection
		if err = db.Ping(); err != nil {
			return err
		}

		// Set connection pool settings
		db.SetMaxOpenConns(25)
		db.SetMaxIdleConns(5)
		db.SetConnMaxLifetime(5 * time.Minute)

		log.Println("Connected to PostgreSQL database via DATABASE_URL")
		return nil
	}

	// Fall back to individual environment variables
	dbType := getEnv("DB_TYPE", "postgres")

	var connStr string
	if dbType == "postgres" {
		host := getEnv("POSTGRES_HOST", "aicos-postgres")
		port := getEnv("POSTGRES_PORT", "5432")
		user := getEnv("POSTGRES_USER", "postgres")
		password := getEnv("POSTGRES_PASSWORD", "postgres")
		dbname := getEnv("POSTGRES_DB", "aicos")

		connStr = fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
			host, port, user, password, dbname)
	} else {
		return fmt.Errorf("unsupported DB_TYPE: %s (Go service requires PostgreSQL)", dbType)
	}

	var err error
	db, err = sql.Open("postgres", connStr)
	if err != nil {
		return err
	}

	// Test connection
	if err = db.Ping(); err != nil {
		return err
	}

	// Set connection pool settings
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	log.Println("Connected to PostgreSQL database")
	return nil
}

func initRedis() {
	redisURL := getEnv("REDIS_URL", "redis://redis:6379")
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Printf("Warning: Could not parse Redis URL: %v", err)
		return
	}

	redisClient = redis.NewClient(opt)

	// Test connection
	if err := redisClient.Ping(ctx).Err(); err != nil {
		log.Printf("Warning: Could not connect to Redis: %v", err)
		redisClient = nil
	} else {
		log.Println("Connected to Redis")
	}
}

func rootHandler(w http.ResponseWriter, r *http.Request) {
	response := map[string]interface{}{
		"service": "context-service",
		"version": "1.0.0",
		"status":  "running",
	}
	respondJSON(w, http.StatusOK, response)
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	health := HealthResponse{
		Status:         "healthy",
		Service:        "context-service",
		Version:        "1.0.0",
		DBConnected:    db != nil && db.Ping() == nil,
		RedisConnected: false,
	}

	if redisClient != nil {
		if err := redisClient.Ping(ctx).Err(); err == nil {
			health.RedisConnected = true
		}
	}

	if !health.DBConnected {
		health.Status = "unhealthy"
		respondJSON(w, http.StatusServiceUnavailable, health)
		return
	}

	respondJSON(w, http.StatusOK, health)
}

func getContextHandler(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters
	query := ContextQuery{
		Category:   r.URL.Query().Get("category"),
		Source:     r.URL.Query().Get("source"),
		Limit:      getIntParam(r, "limit", 100),
		ActiveOnly: getBoolParam(r, "active_only", true),
	}

	// Check cache
	cacheKey := fmt.Sprintf("context:%s:%s:%d:%v", query.Category, query.Source, query.Limit, query.ActiveOnly)
	if cached, found := getFromCache(cacheKey); found {
		var response ContextResponse
		if err := json.Unmarshal([]byte(cached), &response); err == nil {
			response.Cached = true
			respondJSON(w, http.StatusOK, response)
			return
		}
	}

	// Build SQL query
	sqlQuery := "SELECT id, category, content, source, created_at, is_active, priority, expires_at FROM context WHERE 1=1"
	args := []interface{}{}
	argPos := 1

	if query.Category != "" {
		sqlQuery += fmt.Sprintf(" AND category = $%d", argPos)
		args = append(args, query.Category)
		argPos++
	}

	if query.Source != "" {
		sqlQuery += fmt.Sprintf(" AND source = $%d", argPos)
		args = append(args, query.Source)
		argPos++
	}

	if query.ActiveOnly {
		sqlQuery += " AND is_active = true"
	}

	sqlQuery += " ORDER BY priority DESC, created_at DESC"
	sqlQuery += fmt.Sprintf(" LIMIT $%d", argPos)
	args = append(args, query.Limit)

	// Execute query
	rows, err := db.Query(sqlQuery, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database query failed: "+err.Error())
		return
	}
	defer rows.Close()

	// Parse results
	contexts := []Context{}
	for rows.Next() {
		var c Context
		if err := rows.Scan(&c.ID, &c.Category, &c.Content, &c.Source, &c.CreatedAt, &c.IsActive, &c.Priority, &c.ExpiresAt); err != nil {
			log.Printf("Error scanning row: %v", err)
			continue
		}
		contexts = append(contexts, c)
	}

	response := ContextResponse{
		Contexts: contexts,
		Count:    len(contexts),
		Cached:   false,
	}

	// Cache result
	if jsonData, err := json.Marshal(response); err == nil {
		setCache(cacheKey, string(jsonData), 5*time.Minute)
	}

	respondJSON(w, http.StatusOK, response)
}

func getRecentContextHandler(w http.ResponseWriter, r *http.Request) {
	days := getIntParam(r, "days", 14)
	category := r.URL.Query().Get("category")

	// Check cache
	cacheKey := fmt.Sprintf("recent_context:%d:%s", days, category)
	if cached, found := getFromCache(cacheKey); found {
		var response ContextResponse
		if err := json.Unmarshal([]byte(cached), &response); err == nil {
			response.Cached = true
			respondJSON(w, http.StatusOK, response)
			return
		}
	}

	// Build query
	sqlQuery := `
		SELECT id, category, content, source, created_at, is_active, priority, expires_at 
		FROM context 
		WHERE is_active = true 
		AND created_at >= NOW() - INTERVAL '%d days'
	`
	args := []interface{}{}

	if category != "" {
		sqlQuery += " AND category = $1"
		args = append(args, category)
	}

	sqlQuery += " ORDER BY created_at DESC LIMIT 200"
	sqlQuery = fmt.Sprintf(sqlQuery, days)

	// Execute
	rows, err := db.Query(sqlQuery, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database query failed: "+err.Error())
		return
	}
	defer rows.Close()

	// Parse results
	contexts := []Context{}
	for rows.Next() {
		var c Context
		if err := rows.Scan(&c.ID, &c.Category, &c.Content, &c.Source, &c.CreatedAt, &c.IsActive, &c.Priority, &c.ExpiresAt); err != nil {
			continue
		}
		contexts = append(contexts, c)
	}

	response := ContextResponse{
		Contexts: contexts,
		Count:    len(contexts),
		Cached:   false,
	}

	// Cache
	if jsonData, err := json.Marshal(response); err == nil {
		setCache(cacheKey, string(jsonData), 10*time.Minute)
	}

	respondJSON(w, http.StatusOK, response)
}

func getRollingContextHandler(w http.ResponseWriter, r *http.Request) {
	// Get rolling 2-week context window
	sqlQuery := `
		SELECT id, category, content, source, created_at, is_active, priority, expires_at 
		FROM context 
		WHERE is_active = true 
		AND created_at >= NOW() - INTERVAL '14 days'
		AND (expires_at IS NULL OR expires_at > NOW())
		ORDER BY priority DESC, created_at DESC 
		LIMIT 500
	`

	rows, err := db.Query(sqlQuery)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database query failed: "+err.Error())
		return
	}
	defer rows.Close()

	contexts := []Context{}
	for rows.Next() {
		var c Context
		if err := rows.Scan(&c.ID, &c.Category, &c.Content, &c.Source, &c.CreatedAt, &c.IsActive, &c.Priority, &c.ExpiresAt); err != nil {
			continue
		}
		contexts = append(contexts, c)
	}

	response := ContextResponse{
		Contexts: contexts,
		Count:    len(contexts),
		Cached:   false,
	}

	respondJSON(w, http.StatusOK, response)
}

func searchContextHandler(w http.ResponseWriter, r *http.Request) {
	var searchReq struct {
		Query    string `json:"query"`
		Category string `json:"category"`
		Limit    int    `json:"limit"`
	}

	if err := json.NewDecoder(r.Body).Decode(&searchReq); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if searchReq.Limit == 0 {
		searchReq.Limit = 50
	}

	// Simple text search (can be enhanced with full-text search)
	sqlQuery := `
		SELECT id, category, content, source, created_at, is_active, priority, expires_at 
		FROM context 
		WHERE is_active = true 
		AND content ILIKE $1
	`
	args := []interface{}{"%" + searchReq.Query + "%"}
	argPos := 2

	if searchReq.Category != "" {
		sqlQuery += fmt.Sprintf(" AND category = $%d", argPos)
		args = append(args, searchReq.Category)
		argPos++
	}

	sqlQuery += fmt.Sprintf(" ORDER BY priority DESC, created_at DESC LIMIT $%d", argPos)
	args = append(args, searchReq.Limit)

	rows, err := db.Query(sqlQuery, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Search failed: "+err.Error())
		return
	}
	defer rows.Close()

	contexts := []Context{}
	for rows.Next() {
		var c Context
		if err := rows.Scan(&c.ID, &c.Category, &c.Content, &c.Source, &c.CreatedAt, &c.IsActive, &c.Priority, &c.ExpiresAt); err != nil {
			continue
		}
		contexts = append(contexts, c)
	}

	response := ContextResponse{
		Contexts: contexts,
		Count:    len(contexts),
		Cached:   false,
	}

	respondJSON(w, http.StatusOK, response)
}

// Helper functions

func getFromCache(key string) (string, bool) {
	if redisClient == nil {
		return "", false
	}

	val, err := redisClient.Get(ctx, key).Result()
	if err != nil {
		return "", false
	}

	return val, true
}

func setCache(key string, value string, ttl time.Duration) {
	if redisClient == nil {
		return
	}

	if err := redisClient.Set(ctx, key, value, ttl).Err(); err != nil {
		log.Printf("Cache set error: %v", err)
	}
}

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}

// Logging middleware to track all requests
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		// Log incoming request
		log.Printf("→ %s %s", r.Method, r.URL.Path)

		// Create a response writer wrapper to capture status code
		wrapped := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}

		// Call the next handler
		next.ServeHTTP(wrapped, r)

		// Log response with timing
		duration := time.Since(start)
		log.Printf("← %s %s [%d] %.3fms", r.Method, r.URL.Path, wrapped.statusCode, float64(duration.Microseconds())/1000.0)
	})
}

// Response writer wrapper to capture status code
type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getIntParam(r *http.Request, param string, defaultValue int) int {
	if value := r.URL.Query().Get(param); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func getBoolParam(r *http.Request, param string, defaultValue bool) bool {
	if value := r.URL.Query().Get(param); value != "" {
		if boolValue, err := strconv.ParseBool(value); err == nil {
			return boolValue
		}
	}
	return defaultValue
}
