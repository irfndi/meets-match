module github.com/irfndi/match-bot/services/api

go 1.25.5

require (
	github.com/getsentry/sentry-go v0.27.0
	github.com/gofiber/fiber/v2 v2.52.10
	github.com/google/uuid v1.6.0
	github.com/irfndi/match-bot/packages/contracts v0.0.0
	github.com/lib/pq v1.10.9
	github.com/redis/go-redis/v9 v9.17.2
	golang.org/x/sync v0.19.0
	google.golang.org/grpc v1.77.0
	google.golang.org/protobuf v1.36.11
)

require (
	github.com/andybalholm/brotli v1.2.0 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/clipperhouse/stringish v0.1.1 // indirect
	github.com/clipperhouse/uax29/v2 v2.3.0 // indirect
	github.com/dgryski/go-rendezvous v0.0.0-20200823014737-9f7001d12a5f // indirect
	github.com/klauspost/compress v1.18.2 // indirect
	github.com/mattn/go-colorable v0.1.14 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/mattn/go-runewidth v0.0.19 // indirect
	github.com/valyala/bytebufferpool v1.0.0 // indirect
	github.com/valyala/fasthttp v1.68.0 // indirect
	golang.org/x/net v0.48.0 // indirect
	golang.org/x/sys v0.39.0 // indirect
	golang.org/x/text v0.32.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20251213004720-97cd9d5aeac2 // indirect
)

replace github.com/irfndi/match-bot/packages/contracts => ../../packages/contracts
