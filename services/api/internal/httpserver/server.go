package httpserver

import (
	"net/http"

	"github.com/irfndi/match-bot/services/api/internal/services"
)

func NewHandler(userSvc *services.UserService, matchSvc *services.MatchService) http.Handler {
	mux := http.NewServeMux()

	registerConnectHandlers(mux, userSvc, matchSvc)

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"message":"MeetMatch API is running","docs_url":"/docs"}`))
	})

	return mux
}
