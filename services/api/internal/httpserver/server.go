package httpserver

import (
	"log"
	"net/http"

	"github.com/irfndi/match-bot/services/api/internal/services"
)

func NewHandler(userSvc *services.UserService, matchSvc *services.MatchService) http.Handler {
	mux := http.NewServeMux()

	registerConnectHandlers(mux, userSvc, matchSvc)

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if _, err := w.Write([]byte(`{"status":"ok"}`)); err != nil {
			log.Printf("health write error: %v", err)
		}
	})

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if _, err := w.Write([]byte(`{"message":"MeetMatch API is running","docs_url":"/docs"}`)); err != nil {
			log.Printf("root write error: %v", err)
		}
	})

	return mux
}
